// packages/web/src/content/architecture.ts
// Architecture page content. Edit prose here, layout in routes/architecture.tsx.

export interface CodeBlock {
  language: string;
  code: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ContentBlock {
  type: "prose" | "code" | "table" | "callout" | "diagram";
  text?: string;
  code?: CodeBlock;
  table?: TableData;
}

export interface Section {
  id: string;
  title: string;
  subtitle?: string;
  blocks: ContentBlock[];
}

export interface SectionGroup {
  id: string;
  label: string;
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export const pageTitle = "Architecture";
export const pageSubtitle =
  "How RegBridge ingests, stores, and serves regulatory intelligence across six data sources and 32 tables.";

export const heroStats = [
  { value: "32", label: "tables" },
  { value: "700K+", label: "rows" },
  { value: "6", label: "sources" },
  { value: "9", label: "API endpoints" },
  { value: "9", label: "MCP tools" },
];

// ---------------------------------------------------------------------------
// Grouped sections
// ---------------------------------------------------------------------------

export const sectionGroups: SectionGroup[] = [
  // =========================================================================
  // GROUP 1: Data & Ingestion
  // =========================================================================
  {
    id: "data",
    label: "Data & Ingestion",
    sections: [
      {
        id: "overview",
        title: "Overview",
        blocks: [
          {
            type: "prose",
            text: `RegBridge is a regulatory intelligence platform for EU crop protection data. It ingests public data from six sources (three official APIs, one government scraper, one open dataset, and one CSV archive), normalises it into a single Neon Postgres database, and serves it through two consumption layers: a Cmd+K command palette for deterministic human lookup, and an MCP server for LLM agent reasoning. Both consumers read from the same typed API surface. The MCP server calls zero AI APIs; the LLM runs on the user's side.`,
          },
          {
            type: "prose",
            text: `The system is a TypeScript monorepo deployed as three Cloudflare Workers and a set of local ingestion scripts. Six packages define the dependency graph: packages/db owns the Kysely connection, table types, and all nine query functions. packages/api wraps those functions in Effect HttpApi handlers with runtime-validated schemas and Scalar docs. packages/api-client exports plain TypeScript response types and thin typed fetch functions that any consumer can use. packages/web is a TanStack Start application that calls api-client through a Cloudflare Service Binding. packages/mcp is a 9-tool MCP server that calls the same api-client functions through the same binding pattern. packages/ingestion contains standalone Bun scripts that import from packages/db directly without going through the API.`,
          },
          {
            type: "prose",
            text: `The key architectural constraint: only the API Worker holds database credentials. The Web Worker and MCP Worker reach the database exclusively through the API via Cloudflare Service Bindings, which are zero-latency internal calls that never touch the public internet. Ingestion scripts hold DATABASE_URL but run locally or in CI, never as deployed Workers. This means a prompt-injected MCP tool handler cannot access the database directly, cannot run arbitrary SQL, and cannot bypass the API's input validation.`,
          },
          {
            type: "diagram",
            text: "overview-diagram",
          },
          {
            type: "prose",
            text: `**The serverFn flow.** When a user presses Cmd+K in the browser, the keystroke triggers a TanStack Query call to a createServerFn. TanStack Start serializes this as a POST to /_serverFn/ on the same Worker origin. The server function runs on the Web Worker's V8 isolate, calls a typed function from packages/api-client (e.g. paletteSearch(fetcher, query)), which calls env.API.fetch() through the Service Binding. The API Worker runs the Effect handler, calls the Kysely query function from packages/db, and returns the response back through the same chain. The browser never talks to the API Worker directly.`,
          },
        ],
      },

      {
        id: "sources",
        title: "Six sources, five patterns, one contract",
        subtitle:
          "Every table traces back to a specific public data source. No data is generated, estimated, or inferred.",
        blocks: [
          {
            type: "table",
            table: {
              headers: [
                "Source",
                "Type",
                "Tables",
                "Total rows",
                "Wall time",
                "Sync",
              ],
              rows: [
                [
                  "EU Pesticides API v3.0",
                  "Paginated REST API",
                  "8",
                  "504,292",
                  "~50 min",
                  "Weekly",
                ],
                [
                  "EU Pesticides Database",
                  "Single-GET JSON",
                  "2",
                  "8,067",
                  "~97s",
                  "Weekly",
                ],
                [
                  "Ireland PCS Register",
                  "HTML scrape (ASP.NET)",
                  "3",
                  "10,766",
                  "~6.3 min",
                  "Monthly",
                ],
                [
                  "France ANSES e-PHY",
                  "ZIP → CSV parse",
                  "9",
                  "191,325",
                  "~68s",
                  "Weekly",
                ],
                [
                  "EFSA OpenFoodTox 3.0",
                  "XLSX → sheet parse",
                  "8",
                  "183,194",
                  "~75s",
                  "Monthly",
                ],
                [
                  "EUR-Lex Regulations",
                  "Skipped in v1",
                  "1",
                  "0",
                  "n/a",
                  "v2",
                ],
              ],
            },
          },
          {
            type: "prose",
            text: `Six ingestion scripts. Five distinct integration patterns: paginated API with deduplication, single-fetch JSON array, sequential HTML scrape with authentication token chaining, automated file download with freshness detection, and structured spreadsheet parsing. No two sources work the same way.`,
          },
          {
            type: "prose",
            text: `The "intentionally skipped" row is worth noting. EUR-Lex regulation texts were in the original spec. During implementation, three findings killed the plan: the regulatory user wants to click through to EUR-Lex directly (it's the authoritative source they cite), full text in the LLM context has no v1 use case (the MRL value already answers "is this compliant"), and EUR-Lex lazy-loads its content via JavaScript, making simple fetch() useless. The regulation URLs are served as-is from existing EU API data. No new ingestion, no new table, no lost functionality.`,
          },
        ],
      },

      {
        id: "patterns",
        title: "Batch over HTTP, probe before you build",
        subtitle:
          "Four patterns recur across all six ingestion scripts.",
        blocks: [
          {
            type: "prose",
            text: `**Batch sizing over Neon's HTTP dialect.** Kysely's kysely-neon dialect sends every .execute() call as a separate HTTP request to Neon's serverless Postgres endpoint, each at ~50-100ms latency. One row per INSERT means one HTTP roundtrip per row. The France e-PHY script originally used BATCH_SIZE=50, taking 22 minutes to insert 191K rows. Switching to BATCH_SIZE=1000 brought that to 68 seconds, a 17x improvement for a one-line constant change. The bottleneck was never Postgres. It was HTTP roundtrips.`,
          },
          {
            type: "prose",
            text: `**Probe-first for undocumented endpoints.** The EU Pesticides Database Angular backend has no API documentation. Before writing the substance documents ingestion script, a throwaway probe script tested three concurrency levels (5, 10, 20) against 50 substance IDs, measuring wall time, failure rate, and per-request latency. Result: zero failures at all levels, flat latency curves, concurrency 20 selected. Five minutes of probing saved an hour of debugging.`,
          },
          {
            type: "prose",
            text: `**text everywhere, never varchar(N).** The original migration used varchar(20) for French product fields like gamme_usage and dose_unite. The actual data contained values like "Amateur / emploi autorisé dans les jardins" (43 characters). This lesson was learned three separate times before becoming a hard rule: every external string column uses text, no exceptions.`,
          },
          {
            type: "prose",
            text: `**Full-replace for national data, upsert for EU data.** EU active substances get upserted (ON CONFLICT DO UPDATE) because the 1,482-row dataset changes incrementally, with a few status updates per week. Ireland and France data get full-replaced (DELETE all, then INSERT fresh) because their source APIs don't expose change deltas, and the datasets are small enough that truncate-and-reload is faster than diffing.`,
          },
        ],
      },

      {
        id: "ireland",
        title: "Reverse-engineering a token chain",
        subtitle:
          "The Ireland PCS register sits behind ASP.NET anti-forgery tokens. There is no API.",
        blocks: [
          {
            type: "prose",
            text: `Each product requires a POST request with three authentication values: a .AspNetCore.Antiforgery session cookie, an InternalIdentifier hidden input, and a __RequestVerificationToken that rotates with every response. The token for request N+1 is embedded in the HTML response of request N. This is sequential by design: you cannot skip ahead, and you cannot parallelize a single session.`,
          },
          {
            type: "prose",
            text: `The naive approach is one session, 1,286 sequential requests, ~6.4 minutes. The discovery: the server allows multiple independent sessions from the same IP. Each session gets its own cookie, its own InternalIdentifier, and its own rotating token. They don't interfere. Three parallel sessions, each processing a third of the product list, cut wall time to 4.7 minutes while keeping per-request politeness at 300ms delays.`,
          },
          {
            type: "code",
            code: {
              language: "text",
              code: `Session A: products 1-429    → own cookie, own token chain
Session B: products 430-858  → own cookie, own token chain
Session C: products 859-1286 → own cookie, own token chain`,
            },
          },
          {
            type: "prose",
            text: `If a request fails mid-chain, the session re-initialises: a fresh GET request fetches a new cookie and token, then retries the failed product. Up to two retries per product before marking as failed. In production runs across all 1,286 products, zero retries have been needed.`,
          },
        ],
      },

      {
        id: "france",
        title: "Automated pipeline, manual data",
        subtitle:
          "France's ANSES e-PHY data arrives as a ZIP archive of eight semicolon-delimited CSV files, published weekly on data.gouv.fr.",
        blocks: [
          {
            type: "code",
            code: {
              language: "text",
              code: `data.gouv.fr API → check last_modified → download ZIP → unzip → parse 8 CSVs → insert 9 tables`,
            },
          },
          {
            type: "prose",
            text: `The script calls the data.gouv.fr dataset API, finds the UTF-8 ZIP resource, compares its last_modified timestamp against the stored source_version in sync_log, and skips if unchanged. A --force flag bypasses the freshness check for re-ingestion.`,
          },
          {
            type: "prose",
            text: `**Substance parsing from pipe-delimited strings.** The produits_utf8.csv file embeds substance formulations as a single pipe-delimited field: "diméthoate (Dimethoate) 400.0 g/L | quinmérac (Quinmerac) 60.0 g/L". Each product's substance string is parsed via regex into the fr_product_substances child table, extracting French name, English name (parenthesized), concentration value, and unit. 22,172 substance rows extracted from 15,129 products.`,
          },
          {
            type: "callout",
            text: `**Smart apostrophe mismatch.** The CSV header uses \u2019 (U+2019, right single quotation mark) in "Etat d\u2019autorisation". The ingestion code looked up the field with ' (U+0027, straight apostrophe). Result: 14,051 products with null authorization status, silently. The fix is Unicode normalization in the CSV header parser. This is the kind of bug that passes every code review and every test that doesn't run against real data.`,
          },
          {
            type: "prose",
            text: `**No foreign keys between France tables.** fr_all_uses (81K rows) references AMM numbers that don't exist in fr_products (15K rows), mostly withdrawn products with historical usage records. The FK constraints were dropped by design, not by accident. The query contract compensates: every query that touches fr_all_uses must LEFT JOIN to fr_products and surface a three-state product_status.`,
          },
        ],
      },

      {
        id: "residue",
        title: "Pre-compute at ingestion, not at runtime",
        subtitle:
          "The MRL compliance check needs a substance → residue → MRL join chain. The first link is broken by design.",
        blocks: [
          {
            type: "prose",
            text: `eu_active_substances.pesticide_residue_linked is a free-text field from the EU API describing which residue definition a substance falls under. eu_pesticide_residues.residue_name is the canonical name in the residue table. These two text fields don't match cleanly.`,
          },
          {
            type: "table",
            table: {
              headers: [
                "Pattern",
                "PRL text example",
                "Residue name example",
                "Count",
              ],
              rows: [
                ["Exact match", "Silthiofam", "Silthiofam", "~264"],
                [
                  "Trailing footnote",
                  "Acetamiprid",
                  "Acetamiprid (F)",
                  "~261",
                ],
                [
                  "Different parenthetical",
                  "Chlorantraniliprole (DPX E-2Y45)",
                  "Chlorantraniliprole(F)",
                  "7",
                ],
                [
                  "Completely different name",
                  "Copper compounds (Copper)",
                  "Total copper",
                  "8",
                ],
                [
                  "Default MRL",
                  "Default MRL of 0.01 mg/kg...",
                  "n/a",
                  "714",
                ],
              ],
            },
          },
          {
            type: "prose",
            text: `The decision: pre-compute at ingestion time. A resolved_residue_id integer column on eu_active_substances stores the clean FK to eu_pesticide_residues.residue_id. A five-step resolution waterfall runs once per sync against ~540 substances that have specific residue definitions. Three manual overrides handle the unmatchable cases: Copper compounds → Total copper, Fosetyl-Al → Fosetyl, Dazomet → Methylisothiocyanate.`,
          },
          {
            type: "callout",
            text: `After resolution: 100% of substances with specific residue definitions have a clean integer FK. The runtime MRL query is a simple indexed join with no text matching, no waterfall, no heuristics. The complexity lives in ingestion, where it runs once against known data, not in queries, where it would run thousands of times against unknown inputs.`,
          },
        ],
      },

      {
        id: "datamodel",
        title: "32 tables, three tiers, four join types",
        subtitle:
          "Every table belongs to one of three regulatory tiers. Cross-tier joins happen at the substance level.",
        blocks: [
          {
            type: "prose",
            text: `The database follows a principle: store as the source gives it. Each API response or CSV file maps to its own table. There is no shared national_products table forcing Ireland and France into the same schema. The two countries have different regulatory structures, different data fields, and different product classification systems. Forcing them into one schema would mean dropping columns or inventing nulls for fields that only exist in one country.`,
          },
          {
            type: "prose",
            text: `**Tier 1: EU-wide data.** Active substances, MRLs, residue definitions, commodities, country authorizations, emergency authorizations, substance documents. eu_active_substances is the hub that every other tier connects to.`,
          },
          {
            type: "prose",
            text: `**Tier 2: EFSA OpenFoodTox.** Toxicological reference values (ADI, ARfD, AOEL), genotoxicity conclusions, metabolites, EFSA dossier metadata. Connected via CAS number text match with ~70% coverage.`,
          },
          {
            type: "prose",
            text: `**Tier 3: National products.** Ireland (3 tables) and France (10 tables). Connected via substance name matching: case-insensitive exact for Ireland, ILIKE parenthesized English name pattern for France.`,
          },
          {
            type: "diagram",
            text: "relationship-diagram",
          },
          {
            type: "prose",
            text: `**Four join types, each with different reliability.** Integer FK joins (solid lines) are exact and indexed, they never fail. CAS number text matches (dashed blue) have ~70% coverage because not all substances have CAS numbers allocated. Name ILIKE matches (dotted orange) are fuzzy and approximate; a safener like Cloquintocet-mexyl exists in French product formulations but returns a 404 in the EU substance database. JSONB containment (dash-dot green) is used for emergency authorizations where active_substance_ids is a JSON array.`,
          },
        ],
      },

      {
        id: "freshness",
        title: "Every response carries its age",
        subtitle:
          "Regulatory data changes. The system needs to know, and communicate, how fresh its data is.",
        blocks: [
          {
            type: "table",
            table: {
              headers: ["Source", "Frequency", "Trigger", "Duration"],
              rows: [
                [
                  "EU Active Substances",
                  "Weekly",
                  "Scheduled",
                  "~1 min",
                ],
                ["EU MRLs", "Weekly", "Scheduled", "~50 min"],
                ["EU Emergency Auth", "Weekly", "Scheduled", "~46s"],
                ["EU Substance Docs", "Weekly", "Scheduled", "~52s"],
                ["Ireland PCS", "Monthly", "Scheduled", "~6.3 min"],
                [
                  "France e-PHY",
                  "Weekly",
                  "last_modified check",
                  "~68s",
                ],
                [
                  "OpenFoodTox",
                  "Monthly",
                  "Zenodo version check",
                  "~75s",
                ],
              ],
            },
          },
          {
            type: "prose",
            text: `Every data table carries a last_synced_at timestamp. Every API response includes a data_as_of field. Every MCP tool response includes source attribution and a staleness disclaimer. The chain is: ingestion writes last_synced_at, the query reads it, the API returns data_as_of, the MCP tool includes it, and the LLM communicates freshness to the user. If data_as_of is older than 14 days, the response includes a staleness warning.`,
          },
          {
            type: "prose",
            text: `Ingestion scripts are self-contained Bun CLI jobs. Production scheduling uses an external compute trigger because the ingestion workloads (particularly EU MRLs at 488K rows and OpenFoodTox at 21.5 MB in-memory parse) exceed Cloudflare Workers' 128 MB memory ceiling. The Workers platform serves requests. A separate compute environment processes data. They share nothing except the Neon connection string.`,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // GROUP 2: Query & API
  // =========================================================================
  {
    id: "api",
    label: "Query & API",
    sections: [
      {
        id: "querylayer",
        title: "Nine functions, two consumers",
        subtitle:
          "The query layer is the spine of the system. Every consumer reads from the same functions.",
        blocks: [
          {
            type: "prose",
            text: `The query layer exists as pure Kysely functions in packages/api/src/queries/. Each function takes typed parameters, runs SQL through Kysely's query builder, and returns a plain object. No Effect, no HTTP, no framework coupling. This makes them consumable two ways: directly via import (by any package in the monorepo), and over HTTP via the Effect HttpApi layer (by anything outside it).`,
          },
          {
            type: "table",
            table: {
              headers: ["Function", "Purpose", "Tables touched"],
              rows: [
                [
                  "resolveSubstance",
                  "Any identifier → canonical substance",
                  "eu_active_substances",
                ],
                [
                  "paletteSearch",
                  "Cmd+K unified search across all entity types",
                  "4 parallel query groups",
                ],
                [
                  "getSubstanceProfile",
                  "Full 13-table cross-tier regulatory profile",
                  "13 tables via Promise.all",
                ],
                [
                  "searchProducts",
                  "Filtered product search across IE and FR",
                  "ie_products, fr_products + children",
                ],
                [
                  "getProductDetail",
                  "Single product with all child tables",
                  "Product + 2-7 children by country",
                ],
                [
                  "getCompanyProfile",
                  "Auth holder portfolio aggregation",
                  "Products + substances + functions",
                ],
                [
                  "checkMrlCompliance",
                  "Substance + commodity → MRL lookup",
                  "4-table join chain",
                ],
                [
                  "exploreTable",
                  "Generic table query with dynamic filters",
                  "Any of 32 whitelisted tables",
                ],
                [
                  "exploreSchema",
                  "Column discovery for any table",
                  "information_schema",
                ],
              ],
            },
          },
          {
            type: "prose",
            text: `The palette frontend and the MCP tools call the same functions. The palette adds match_field and match_type metadata for client-side band ordering. The MCP tools add data_as_of and source attribution for LLM reasoning. The functions themselves don't know who's calling; they return data, and the consumer adds context.`,
          },
        ],
      },

      {
        id: "apiclient",
        title: "Two type systems, one boundary each",
        subtitle:
          "Why types live in two packages, and what packages/api-client does.",
        blocks: [
          {
            type: "prose",
            text: `The monorepo has types in two places. packages/db/src/types.ts contains Kysely table types: EuActiveSubstancesTable has 45 columns matching the exact Postgres schema, with Insertable and Selectable variants. These types are the contract between the application and the database. Only packages/api and packages/ingestion need them because only they talk to the database.`,
          },
          {
            type: "prose",
            text: `packages/api-client/src/types.ts contains API response types. These describe what consumers receive: SubstanceProfile is a 13-field enriched object assembled from 13 different tables, not a single table row. MrlCheckResponse has nested commodity_results with inherited_from_parent and parent_name fields that don't exist in any database table. These are the contract between the API and its consumers. packages/web and packages/mcp import from here.`,
          },
          {
            type: "code",
            code: {
              language: "text",
              code: `packages/db/src/types.ts         → database boundary (Kysely table types)
  ↳ imported by: packages/api, packages/ingestion

packages/api-client/src/types.ts → HTTP boundary (API response types)
  ↳ imported by: packages/web, packages/mcp`,
            },
          },
          {
            type: "prose",
            text: `Merging them would couple the database schema to the API response shape, meaning a column rename in Postgres would break the frontend. The api-client types insulate consumers from database changes. The Effect handler in packages/api is the translation layer between the two.`,
          },
          {
            type: "prose",
            text: `**The fetch functions.** packages/api-client also exports thin typed functions that both web and mcp import. Before api-client existed, the MCP server had a raw callApi(env, "/api/substances/Glyphosate") function that constructed paths manually, and the web had separate apiFetch calls doing the same thing. Now both import getSubstanceProfile(fetcher, "Glyphosate") and get back a typed SubstanceProfile. Each function takes a Cloudflare Fetcher (the Service Binding) as its first argument, so there's no hardcoded URL and no environment variable for the API host.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// packages/api-client/src/index.ts
import type { SubstanceProfile } from "./types";

export async function getSubstanceProfile(
  fetcher: Fetcher,
  identifier: string
): Promise<SubstanceProfile> {
  const res = await fetcher.fetch(
    new Request(\`https://internal/api/substances/\${identifier}\`, {
      headers: { "x-api-key": process.env.API_KEY! },
    })
  );
  if (!res.ok) throw new Error(\`API \${res.status}\`);
  return res.json();
}

// Used identically by both consumers:
// Web:  getSubstanceProfile(env.API, identifier)
// MCP:  getSubstanceProfile(env.API, identifier)`,
            },
          },
        ],
      },

      {
        id: "agentdriven",
        title: "Agent-driven over rigid endpoints",
        subtitle:
          "Why a fixed opportunity screener was killed in favor of generic table exploration.",
        blocks: [
          {
            type: "prose",
            text: `The original API spec included a /api/substances/opportunities endpoint with hardcoded filter params: expires_within_months, min_countries, max_competitors, genotox_clear, adi_allocated. This would encode one analyst's mental model of what makes a good opportunity. The moment the client wants a different filter combination (candidate for substitution, emergency auth recurrence, competitor trends), the endpoint needs modification.`,
          },
          {
            type: "prose",
            text: `The replacement is the agent-driven approach using exploreTable + exploreSchema. The LLM agent composes its own screening flow: call exploreSchema to discover column names and types, then exploreTable with whatever filters match the user's natural language question, then getSubstanceProfile for deep dives on interesting hits. Any filter combination works without code changes.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// Agent workflow: "substances expiring before 2027 with emergency auths in Italy"
// Step 1: discover columns
explore_schema("eu_active_substances")
// Step 2: filter scan
explore_table("eu_active_substances", {
  status: "Approved",
  expiry_dt__lt: "2027-01-01"
})
// Step 3: cross-reference with emergency auths
explore_table("eu_emergency_authorisations", {
  country__eq: "Italy"
})
// Step 4: deep dive on matches
get_substance_profile("Prothioconazole")`,
            },
          },
          {
            type: "prose",
            text: `exploreTable supports 11 filter operators via Django-style double-underscore syntax: eq, neq, lt, lte, gt, gte, ilike, like, is, not, in. Column names are validated against information_schema before use. Values are parameterized via Kysely sql template literals. No raw user input enters the query string.`,
          },
        ],
      },

      {
        id: "httpapi",
        title: "Typed contracts at the boundary",
        subtitle:
          "The Effect HttpApi layer: 6 groups, 9 endpoints, runtime-validated responses.",
        blocks: [
          {
            type: "prose",
            text: `The HTTP API exists for consumers that can't share code directly: MCP agents calling from Claude, external tools, humans browsing the Scalar docs. The API is the typed contract for everything outside the monorepo.`,
          },
          {
            type: "table",
            table: {
              headers: ["Group", "Endpoint", "Path"],
              rows: [
                ["health", "check", "GET /health"],
                ["search", "paletteSearch", "GET /api/search"],
                [
                  "substances",
                  "getProfile",
                  "GET /api/substances/:identifier",
                ],
                ["products", "searchProducts", "GET /api/products"],
                [
                  "products",
                  "getProductDetail",
                  "GET /api/products/:country/:id",
                ],
                ["mrls", "checkCompliance", "GET /api/mrls/check"],
                [
                  "companies",
                  "getProfile",
                  "GET /api/companies/:name",
                ],
                ["tables", "listTables", "GET /api/tables"],
                [
                  "tables",
                  "exploreTable",
                  "GET /api/tables/:tableName",
                ],
                [
                  "tables",
                  "exploreSchema",
                  "GET /api/tables/:tableName/schema",
                ],
              ],
            },
          },
          {
            type: "prose",
            text: `**All GET, no POST.** Every endpoint is GET because the API is a pure read layer. Data enters the database exclusively through batch ingestion scripts. The MRL compliance check might feel like a POST (you're "submitting" a substance and commodity) but it's semantically a read: querying existing MRL data against a value. GET is correct: safe, idempotent, cacheable.`,
          },
          {
            type: "prose",
            text: `**Runtime response validation.** Unlike most REST frameworks that only validate inputs, Effect HttpApi validates the handler's return value against the success schema before serializing to JSON. Any mismatch between what Kysely returns and what the schema declares becomes a 500 HttpApiDecodeError in development, not a silent shape error in production. This caught a real issue: Neon's HTTP dialect returns JavaScript Date objects and string-encoded numerics where TypeScript interfaces declare string and number. The fix is JSON.parse(JSON.stringify(result)) in the handler. JSON.stringify calls .toISOString() on Dates, producing the strings the schema expects.`,
          },
          {
            type: "prose",
            text: `**Scalar docs auto-generated.** Effect Schema definitions produce an OpenAPI spec at /docs/openapi.json, rendered by Scalar at /docs. No manual documentation. Every endpoint, every param, every response shape is derived from the same schema types the handlers use at runtime.`,
          },
        ],
      },

      {
        id: "gateway",
        title: "Error 1042 and the single-gateway decision",
        subtitle:
          "A Cloudflare platform constraint revealed the correct architecture.",
        blocks: [
          {
            type: "prose",
            text: `The initial plan had TanStack Start calling Kysely directly via server functions, colocated in the same monorepo, sharing packages/db, no HTTP hop. The Effect HttpApi existed for external consumers only (MCP agents, Scalar docs). Two consumers, two paths to the same data.`,
          },
          {
            type: "prose",
            text: `Then the MCP server deployment revealed a platform constraint: Cloudflare Workers cannot fetch other Workers on the same account via public URL. The MCP Worker calling fetch("https://regbridge-api.activeintel.workers.dev/...") returned Error 1042. The request doesn't route through normal DNS/CDN; Cloudflare tries internal routing and fails. This is documented behavior, not a bug.`,
          },
          {
            type: "prose",
            text: `**The solution: Service Bindings.** A Cloudflare primitive that lets one Worker call another via an injected Fetcher object. Zero latency, no public internet, no DNS. The hostname in new Request() is ignored; routing happens by service name configured in wrangler.toml.`,
          },
          {
            type: "code",
            code: {
              language: "toml",
              code: `# packages/mcp/wrangler.toml
[[services]]
binding = "API"
service = "regbridge-api"`,
            },
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// MCP tool handler: calls API via Service Binding
interface Env {
  API: Fetcher;   // injected by Cloudflare, not a URL string
  API_KEY: string;
}

async function callApi(env: Env, path: string) {
  // hostname is ignored, routing is by service name
  const res = await env.API.fetch(
    new Request(\`https://internal\${path}\`, {
      headers: { "x-api-key": env.API_KEY },
    })
  );
  return res.json();
}`,
            },
          },
          {
            type: "prose",
            text: `This changed the architecture. If the MCP server must go through the API via Service Binding (because it doesn't hold the database connection string), then the security model becomes clear: **only the API Worker holds database credentials.** Everything else reaches data through the API. One gateway, one validation boundary, one place to enforce rate limits and audit access.`,
          },
          {
            type: "callout",
            text: `All three consumers now route through the API Worker via Service Bindings. The MCP Worker and the TanStack Start Worker both use the same pattern: an injected Fetcher binding that calls the API internally with zero network latency. Only the API Worker holds DATABASE_URL. One gateway, zero credential sprawl.`,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // GROUP 3: Frontend
  // =========================================================================
  {
    id: "frontend",
    label: "Frontend",
    sections: [
      {
        id: "palette",
        title: "The palette is a dispatcher",
        subtitle:
          "Determinism over relevance. The palette tells you what exists, not what's important.",
        blocks: [
          {
            type: "prose",
            text: `The command palette is the only entry point into RegBridge. There is no search bar, no browse page, no navigation menu for entity types. The user presses Cmd+K, types a query, and the palette dispatches them to the right entity. This design follows a specific philosophy: the palette is an input device, not a search engine.`,
          },
          {
            type: "prose",
            text: `**Input detection routes to the right query path.** Before any database query fires, the palette classifies the input and sends it down the optimal path. A CAS number pattern goes to substance exact lookup. A 4-5 digit number goes to Ireland PCS product lookup. A 7-digit number goes to French AMM product lookup. Anything else fires four parallel queries: substances, IE products, FR products, and companies.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// Input classification runs before any DB call
const CAS_RE = /^\\d{1,7}-\\d{2}-\\d$/;
const PCS_RE = /^\\d{4,5}$/;
const AMM_RE = /^\\d{7}$/;

if (CAS_RE.test(query))  return substanceExactLookup(query);
if (PCS_RE.test(query))  return ieProductLookup(query);
if (AMM_RE.test(query))  return frProductLookup(query);
return parallelSearch(query); // 4 query groups in Promise.all`,
            },
          },
          {
            type: "prose",
            text: `**Banded scoring, not weighted sums.** Results are ranked in strict bands: exact match > prefix match > fuzzy match. A match in a higher band can never lose to a match in a lower band, regardless of other signals. Within a band, approved substances rank above non-approved, then shortest name wins (tightest match). The API returns match_type and match_field metadata with each result, and the client uses these to assign bands deterministically.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// Client-side band ordering, deterministic, no ties
const BAND_ORDER: Record<string, number> = {
  exact_id: 0, exact_cas: 0, exact_number: 0,
  exact_name: 1,
  prefix: 2,
  fuzzy: 3,
};

results.sort((a, b) => {
  const bandA = BAND_ORDER[a.match_type] ?? 99;
  const bandB = BAND_ORDER[b.match_type] ?? 99;
  if (bandA !== bandB) return bandA - bandB;
  // Within same band: approved first, then shortest name
  // No cross-band ties possible
});`,
            },
          },
          {
            type: "prose",
            text: `**Prefetch on highlight, not on Enter.** When the user arrows down to a substance result, the palette fires the full substance profile API call in the background via TanStack Query's prefetchQuery. By the time they press Enter, the 13-table cross-tier profile is already in the query cache. The detail page renders instantly with no loading spinner, no skeleton screen. The perceived latency is zero.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// CommandPalette.tsx: prefetch fires on highlight change
useEffect(() => {
  const highlighted = results[highlightedIndex];
  if (highlighted?.type === "substance") {
    // Fire profile query in background, cache warms silently
    queryClient.prefetchQuery({
      queryKey: qk.substance(highlighted.entity.identifier),
      queryFn: () => fetchSubstanceProfile(highlighted.entity.identifier),
      staleTime: 30_000,
    });
  }
}, [highlightedIndex]);

// When user presses Enter → navigate to /substances/$identifier
// TanStack Query finds data already in cache → instant render`,
            },
          },
          {
            type: "prose",
            text: `The palette handles keyboard navigation (arrow keys to move, Enter to select, Esc to close) with 300ms debounce on typing. On mobile, a search icon button replaces the Cmd+K hint. The first result is auto-highlighted with a green left border, so pressing Enter without arrowing selects the top match. This works because banding guarantees the top match is always the best match.`,
          },
        ],
      },

      {
        id: "substanceprofile",
        title: "Substance profile: 13 tables in one view",
        subtitle:
          "The click-through from the palette. A full regulatory dossier assembled from three data tiers in parallel.",
        blocks: [
          {
            type: "prose",
            text: `When the user selects a substance, getSubstanceProfile fires a 13-table cross-tier query via three parallel tiers in Promise.all. The EU tier runs 5 parallel queries (categories, countries, documents, group members, emergency auths). The OFT tier runs a 2-step sequential CAS chain then 4 parallel child queries (tox values, genotoxicity, metabolites, dossiers). The national products tier runs 2 parallel queries (IE and FR). Total: ~15 queries across ~4 sequential roundtrips.`,
          },
          {
            type: "code",
            code: {
              language: "typescript",
              code: `// getSubstanceProfile: three tiers in parallel
const [euData, oftData, nationalData] = await Promise.all([
  // Tier 1: EU (5 parallel queries on as_id)
  Promise.all([
    getCategories(asId), getCountries(asId),
    getDocuments(asId), getGroupMembers(asId),
    getEmergencyAuths(asId),
  ]),
  // Tier 2: OFT (CAS chain → 4 parallel children)
  getOftData(casNumber),
  // Tier 3: National (2 parallel name matches)
  Promise.all([
    getIeProducts(substanceName),
    getFrProducts(substanceName),
  ]),
]);`,
            },
          },
          {
            type: "prose",
            text: `**Section ordering by decision importance.** The UI renders sections in the order a regulatory affairs analyst would evaluate them: toxicology first (go/no-go on safety), then Irish products (competitive landscape), French products (market size), emergency authorizations (demand signals), member state authorizations (market scope), documents (EFSA opinions), legislation (legal basis). Alphabetical ordering would bury the most decision-relevant data.`,
          },
          {
            type: "prose",
            text: `**Data quality drives UI decisions.** Metabolite sections hide entirely when all names are null (Prothioconazole has 13 metabolite rows, all with null names, and showing 13 blank rows helps nobody). Genotoxicity conclusions are parsed from semicolon-delimited strings into clean Negative/Positive/No data values. DOI identifiers are converted to clickable https://doi.org/ links. Empty sections don't render at all.`,
          },
        ],
      },

      {
        id: "deployment",
        title: "Three Workers, one database",
        subtitle:
          "The production deployment topology and the communication paths between services.",
        blocks: [
          {
            type: "code",
            code: {
              language: "text",
              code: `GitHub (monorepo)
├── packages/db        → shared types + Kysely connection (never deployed alone)
├── packages/api       → Cloudflare Worker (Effect HttpApi + Scalar docs)
├── packages/mcp       → Cloudflare Worker (MCP Streamable HTTP, 9 tools)
├── packages/web       → Cloudflare Worker (TanStack Start, Cmd+K palette)
└── packages/ingestion → runs locally / CI (Bun data sync scripts)

Communication paths:
  Web → API   : Cloudflare Service Binding (zero latency, internal)
  MCP → API   : Cloudflare Service Binding (zero latency, internal)
  API → DB    : Kysely via Neon HTTP dialect
  External → API  : Public URL + x-api-key header
  External → MCP  : Public URL at /mcp (Streamable HTTP transport)
  External → Docs : Public URL at /docs (Scalar, no auth)`,
            },
          },
          {
            type: "prose",
            text: `**Security model.** Only the API Worker holds the DATABASE_URL secret. The MCP Worker holds only an API_KEY for Service Binding calls. If an MCP tool handler is prompt-injected, the worst it can do is make authorized API calls. It cannot access the database directly, cannot run arbitrary SQL, cannot bypass the API's input validation. The API enforces all validation at a single boundary.`,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Flat section list for sidebar navigation
// ---------------------------------------------------------------------------

export const allSections = sectionGroups.flatMap((g) => g.sections);
