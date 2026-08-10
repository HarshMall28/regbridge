# Architecture

How RegBridge ingests, stores, and serves regulatory intelligence across six data sources and 32 tables.

32 tables · 700K+ rows · 6 sources · 9 API endpoints · 9 MCP tools · $0 infrastructure

---

## Overview

RegBridge is a regulatory intelligence platform for EU crop protection data. It ingests public data from six sources — three official APIs, one government scraper, one open dataset, and one CSV archive — normalises it into a single Neon Postgres database, and serves it through two consumption layers: a Cmd+K command palette for deterministic human lookup, and an MCP server for LLM agent reasoning. Both consumers read from the same typed API surface. The MCP server calls zero AI APIs — the LLM runs on the user's side.

[Pipeline diagram placeholder — built last]

---

## Six sources, five patterns, one contract

Every table in RegBridge traces back to a specific public data source. No data is generated, estimated, or inferred — everything is fetched, parsed, and stored as the source provides it. Each source has its own ingestion script, its own sync frequency, and its own failure modes. The table below is the complete inventory.

### Source inventory

| Source | Type | Endpoint / URL | Tables | Total rows | Wall time | Sync |
|--------|------|---------------|--------|------------|-----------|------|
| EU Pesticides API v3.0 | Paginated REST API | `api.datalake.sante.service.ec.europa.eu` | 8 | 504,292 | ~50 min | Weekly |
| EU Pesticides Database | Single-GET JSON | `ec.europa.eu/.../backend/authorisations` | 2 | 8,067 | ~97s | Weekly |
| Ireland PCS Register | HTML scrape (ASP.NET) | `pcs.agriculture.gov.ie` | 3 | 10,766 | ~6.3 min | Monthly |
| France ANSES e-PHY | ZIP download → CSV parse | `data.gouv.fr` API → static ZIP | 9 | 191,325 | ~68s | Weekly |
| EFSA OpenFoodTox 3.0 | XLSX download → sheet parse | `zenodo.org/records/19388272` | 8 | 183,194 | ~75s | Monthly |
| EUR-Lex Regulations | Intentionally skipped | — | 1 (empty) | 0 | — | v2 |

Six ingestion scripts. Five distinct integration patterns: paginated API with deduplication, single-fetch JSON array, sequential HTML scrape with authentication token chaining, automated file download with freshness detection, and structured spreadsheet parsing. No two sources work the same way.

The "intentionally skipped" row is worth noting. EUR-Lex regulation texts were in the original spec. During implementation, three findings killed the plan: the regulatory user wants to click through to EUR-Lex directly (it's the authoritative source they cite), full text in the LLM context has no v1 use case (the MRL value already answers "is this compliant"), and EUR-Lex lazy-loads its content via JavaScript, making simple fetch() useless. The regulation URLs are served as-is from existing EU API data. No new ingestion, no new table, no lost functionality. The table exists in the schema, empty, reserved for v2 RAG.

---

## Batch over HTTP, probe before you build

Four patterns recur across all six ingestion scripts. They aren't obvious choices — each was learned the hard way at least once.

**Batch sizing over Neon's HTTP dialect.** Kysely's `kysely-neon` dialect sends every `.execute()` call as a separate HTTP request to Neon's serverless Postgres endpoint, each at ~50-100ms latency. One row per INSERT means one HTTP roundtrip per row. The France e-PHY script originally used `BATCH_SIZE=50`, taking 22 minutes to insert 191K rows. Switching to `BATCH_SIZE=1000` brought that to 68 seconds — a 17x improvement for a one-line constant change. The bottleneck was never Postgres. It was HTTP roundtrips.

**Probe-first for undocumented endpoints.** The EU Pesticides Database Angular backend has no API documentation. Before writing the substance documents ingestion script, a throwaway probe script tested three concurrency levels (5, 10, 20) against 50 substance IDs, measuring wall time, failure rate, and per-request latency. Result: zero failures at all levels, flat latency curves, concurrency 20 selected. Without the probe, the ingestion script would have assumed concurrency 5 (conservative but 4x slower) and the response shape would have been wrong (`payload.documents`, not a top-level array). Five minutes of probing saved an hour of debugging.

**`text` everywhere, never `varchar(N)`.** The original migration used `varchar(20)` for French product fields like `gamme_usage` and `dose_unite`. The actual data contained values like `"Amateur / emploi autorisé dans les jardins"` (43 characters) and `"VOIR PARTICULARITES D'EMPLOI"` (28 characters). This lesson was learned three separate times — in Chat 2 (EU API field overflows), Chat 3 (document type overflows), and Chat 5 (France field overflows) — before becoming a hard rule: every external string column uses `text`, no exceptions. The schema document can note expected lengths. The database column stays permissive.

**Full-replace for national data, upsert for EU data.** EU active substances get upserted (`ON CONFLICT DO UPDATE`) because the 1,482-row dataset changes incrementally — a few status updates per week. Ireland and France data get full-replaced (`DELETE all → INSERT fresh`) because their source APIs don't expose change deltas, and the datasets are small enough (10K and 191K rows respectively) that truncate-and-reload is faster than diffing.

---

## Reverse-engineering a token chain

The Ireland PCS register is an ASP.NET MVC application that serves product data behind anti-forgery tokens. There is no API. Each product requires a POST request with three authentication values: a `.AspNetCore.Antiforgery` session cookie, an `InternalIdentifier` hidden input, and a `__RequestVerificationToken` that rotates with every response. The token for request N+1 is embedded in the HTML response of request N. Sequential by design — you cannot skip ahead, and you cannot parallelize a single session.

The naive approach is one session, 1,286 sequential requests, ~6.4 minutes. The discovery: the server allows multiple independent sessions from the same IP. Each session gets its own cookie, its own `InternalIdentifier`, and its own rotating token. They don't interfere. Three parallel sessions, each processing a third of the product list, cut wall time to 4.7 minutes while keeping per-request politeness at 300ms delays.

```
Session A: products 1-429    → own cookie, own token chain
Session B: products 430-858  → own cookie, own token chain
Session C: products 859-1286 → own cookie, own token chain
```

If a request fails mid-chain (network error, token invalidation), the session re-initialises: a fresh GET request fetches a new cookie and token, then retries the failed product. Up to two retries per product before marking as failed. In production runs across all 1,286 products, zero retries have been needed.

The HTML parsing uses no external dependencies — regex-based extraction against three consistent `<table class="table table-bordered">` structures per product page. Each product yields three tables: product info (7 key-value rows), substances with concentrations, and approved crops. Table identification is by header content (`"Product Name"`, `"Active Substance"`, `"Crops"`), which has been stable across all observed responses.

---

## Automated pipeline, manual data

France's ANSES e-PHY data arrives as a ZIP archive of eight semicolon-delimited CSV files, published weekly on data.gouv.fr. The ingestion script is fully automated — no manual download step.

```
data.gouv.fr API → check last_modified → download ZIP → unzip → parse 8 CSVs → insert 9 tables
```

The script calls the data.gouv.fr dataset API, finds the UTF-8 ZIP resource, compares its `last_modified` timestamp against the stored `source_version` in `sync_log`, and skips if unchanged. A `--force` flag bypasses the freshness check for re-ingestion. After download and unzip, each CSV is parsed with a simple `line.split(";")` — no external CSV parser needed, because all eight files are perfectly consistent: no quoted fields, no embedded semicolons, no multi-line records.

The interesting engineering is in the data, not the plumbing.

**Substance parsing from pipe-delimited strings.** The `produits_utf8.csv` file embeds substance formulations as a single pipe-delimited field: `"diméthoate (Dimethoate) 400.0 g/L | quinmérac (Quinmerac) 60.0 g/L"`. Each product's substance string is parsed via regex into the `fr_product_substances` child table — extracting French name, English name (parenthesized), concentration value, and unit. The raw string is also kept on `fr_products.substances_actives_raw` for auditability. 22,172 substance rows extracted from 15,129 products.

**Smart apostrophe mismatch.** The CSV header for authorization status uses `'` (U+2019, right single quotation mark) in `Etat d'autorisation`. The ingestion code originally looked up `r["Etat d'autorisation"]` with `'` (U+0027, straight apostrophe). Result: 14,051 products with `null` authorization status, silently. The fix is Unicode normalization in the CSV header parser — all smart quotes replaced with straight quotes at parse time. This is the kind of bug that passes every code review and every test that doesn't run against real data.

**No foreign keys between France tables.** `fr_all_uses` (81K rows) references AMM numbers that don't exist in `fr_products` (15K rows) — withdrawn products with historical usage records, plus leading-space mismatches in some identifiers. The FK constraints were dropped by design, not by accident. The query contract compensates: every query that touches `fr_all_uses` must LEFT JOIN to `fr_products` and surface a three-state `product_status`: ACTIVE, WITHDRAWN, or REMOVED_FROM_REGISTRY (for orphan AMM numbers where the LEFT JOIN returns null).

---

## Pre-compute at ingestion, not at runtime

The MRL compliance check needs a join chain: substance → residue definition → MRL value → commodity. The problem is the first link. `eu_active_substances.pesticide_residue_linked` is a free-text field from the EU API describing which residue definition a substance falls under. `eu_pesticide_residues.residue_name` is the canonical name in the residue table. These two text fields don't match cleanly.

Five distinct failure patterns exist in the 1,482 substances:

| Pattern | Example PRL text | Example residue_name | Count |
|---------|-----------------|---------------------|-------|
| Exact match | Silthiofam | Silthiofam | ~264 |
| Trailing footnote | Acetamiprid | Acetamiprid (F) | ~261 |
| Different parenthetical | Chlorantraniliprole (DPX E-2Y45) | Chlorantraniliprole(F) | 7 |
| Completely different name | Copper compounds (Copper) | Total copper | 8 |
| Default MRL (no specific residue) | Default MRL of 0.01 mg/kg... | — | 714 |

The original plan was a runtime waterfall: try exact match, then prefix, then fuzzy, then give up. Four text-matching steps on every MRL query. The problems: it adds latency, it could produce different results on different calls if data changes mid-request, and the heuristic steps risk silent false matches for future substances.

The decision: pre-compute at ingestion time. A `resolved_residue_id` integer column on `eu_active_substances` stores the clean FK to `eu_pesticide_residues.residue_id`. A five-step resolution waterfall runs once per sync against ~540 substances that have specific residue definitions:

1. Exact match: `residue_name = pesticide_residue_linked`
2. Prefix match: `residue_name ILIKE prl || '%'` (catches footnote markers)
3. Substance name search: `residue_name ILIKE '%' || name || '%'` with single-match guard
4. Override table: `prl_overrides` — three manually verified mappings for unmatchable cases
5. Anything unresolved: logged with investigation query

The three overrides are static reference data: Copper compounds → Total copper, Fosetyl-Al → Fosetyl, Dazomet → Methylisothiocyanate. These are cases where no algorithm connects the two names — it's domain knowledge. The `prl_overrides` table has 3 rows and grows roughly once per year when the EU API adds a new substance with an unmatchable residue description.

After resolution: 100% of substances with specific residue definitions have a clean integer FK. The runtime MRL query is a simple indexed join — no text matching, no waterfall, no heuristics. The complexity lives in ingestion, where it runs once against known data, not in queries, where it would run thousands of times against unknown inputs.

---

## Every response carries its age

Regulatory data changes. EU substances get new approval dates, MRL values shift when regulations update, French products get authorised or withdrawn. The system needs to know — and communicate — how fresh its data is.

### Sync frequency

| Source | Frequency | Trigger | Duration |
|--------|-----------|---------|----------|
| EU Active Substances | Weekly | Cron schedule | ~1 min |
| EU MRLs | Weekly | Cron schedule | ~50 min |
| EU Emergency Auth | Weekly | Cron schedule | ~46s |
| EU Substance Docs | Weekly | Cron schedule | ~52s |
| Ireland PCS | Monthly | Cron schedule | ~6.3 min |
| France e-PHY | Weekly | data.gouv.fr `last_modified` check | ~68s |
| OpenFoodTox | Monthly | Zenodo API version check | ~75s |

### The freshness contract

Every data table carries a `last_synced_at` timestamp. Every API response includes a `data_as_of` field derived from `MAX(last_synced_at)` on the queried tables. Every MCP tool response includes `source` attribution and a disclaimer that the data is not legally authoritative. The chain is: ingestion writes `last_synced_at` → query reads it → API returns `data_as_of` → MCP tool includes it → the LLM communicates freshness to the user.

If `data_as_of` is older than 14 days, the response includes a staleness warning. The user — or the agent — can decide whether to trust the result.

### Production sync

Ingestion scripts run as Bun CLI jobs. They are self-contained: each script fetches, transforms, and loads in a single run, logging results to `sync_log` with row counts, duration, and error state. The scripts are designed for scheduled execution — the France script checks `last_modified` before downloading, the OpenFoodTox script checks the Zenodo API for a new version number, and any script can be re-run with `--force` to bypass freshness checks.

The ingestion workloads — particularly EU MRLs at 488K rows and 50-minute runtime, and OpenFoodTox at 21.5 MB in-memory XLSX parse — exceed Cloudflare Workers' 128 MB memory limit and 10,000 subrequest cap. Production scheduling uses an external compute trigger (GitHub Actions scheduled workflow or equivalent cron) calling the Bun scripts directly. The Workers platform serves requests. A separate compute environment processes data. They share nothing except the Neon connection string.
