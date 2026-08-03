/**
 * RegBridge — EU Pesticides API v3.0 Ingestion
 *
 * Ingests 5 datasets into Neon Postgres:
 *   1. countries (seed from Angular backend reference-data)
 *   2. eu_active_substances + eu_country_authorizations + eu_substance_categories
 *   3. eu_pesticide_residues
 *   4. eu_commodities
 *   5. eu_mrls
 *
 * Run from monorepo root:
 *   bun run --env-file .env packages/ingestion/src/eu-api.ts
 */

import { db, sql } from "@regbridge/db";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE =
  "https://api.datalake.sante.service.ec.europa.eu/sante/pesticides";
const API_VERSION = "v3.0";
const COUNTRIES_URL =
  "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/ppp/backend/reference-data?key=eu_countries";

// ─── Generic paginated fetcher ────────────────────────────────────────────────

interface PaginatedResponse<T> {
  value: T[];
  nextLink?: string;
}

async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
  label: string,
): Promise<T[]> {
  const qs = new URLSearchParams({
    format: "json",
    "api-version": API_VERSION,
    ...params,
  });
  let url: string | null = `${BASE}/${endpoint}?${qs}`;
  const all: T[] = [];
  let page = 0;

  while (url) {
    page++;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `${label} page ${page} failed (${res.status}): ${body}`,
      );
    }
    const data: PaginatedResponse<T> = await res.json();
    all.push(...data.value);
    url = data.nextLink ?? null;

    if (page % 10 === 0) {
      console.log(
        `  ${label}: ${all.length} records (page ${page})…`,
      );
    }
  }

  console.log(
    `  ${label}: ${all.length} records total (${page} pages)`,
  );
  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "AT, BE, BG, CY, EL" → ["AT","BE","BG","CY","GR"]
 *
 * EU convention uses "EL" for Greece, but our countries table (from the
 * reference-data endpoint) uses ISO "GR". We map on the way in so the
 * FK to countries.country_code doesn't break.
 */
const COUNTRY_CODE_MAP: Record<string, string> = { EL: "GR" };

function parseCountryCodes(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length === 2)
    .map((c) => COUNTRY_CODE_MAP[c] ?? c);
}

/**
 * Parse "IN - Insecticide" → { code: "IN", name: "Insecticide" }
 * or "FU - Fungicide" → { code: "FU", name: "Fungicide" }
 */
function parseCategory(
  raw: string | null,
): { code: string; name: string } | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/^([A-Z]{2})\s*-\s*(.+)$/);
  if (!match) return null;
  return { code: match[1], name: match[2].trim() };
}

/** "Yes" → true, anything else → false */
function yesNo(val: string | null | undefined): boolean {
  return val?.trim()?.toLowerCase() === "yes";
}

/** Parse dd/MM/yyyy → ISO date string, or null */
function parseEUDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// ─── Task 1: Seed countries ──────────────────────────────────────────────────

async function seedCountries(): Promise<number> {
  console.log("\n[1/5] Seeding countries…");

  const res = await fetch(COUNTRIES_URL, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok)
    throw new Error(`Countries fetch failed: ${res.status}`);

  const data: { value: string; description: string }[] =
    await res.json();
  console.log(`  Fetched ${data.length} countries`);

  for (const c of data) {
    await db
      .insertInto("countries")
      .values({
        country_code: c.value,
        country_name: c.description,
      })
      .onConflict((oc) =>
        oc
          .column("country_code")
          .doUpdateSet({ country_name: c.description }),
      )
      .execute();
  }

  console.log(`  ✓ ${data.length} countries upserted`);
  return data.length;
}

// ─── Task 2: Active substances + country authorizations + categories ─────────

interface APIActiveSubstance {
  substance_id: number;
  substance_name: string;
  cas_number: string | null;
  substance_status: string | null;
  approval_date: string | null;
  expiry_date: string | null;
  risk_assessment: string | null;
  substance_category: string | null;
  as_is_group: string | null;
  as_micro_org: string | null;
  rms: string | null;
  corms: string | null;
  remark: string | null;
  legislations_old: string | null;
  legislations_actives: string | null;
  tox_value_adi: string | null;
  tox_source_adi: string | null;
  tox_remark_adi: string | null;
  tox_value_arfd: string | null;
  tox_sourc_earfd: string | null; // API typo
  tox_source_earfd: string | null; // duplicate field
  tox_remark_arfd: string | null;
  tox_value_aoel: string | null;
  tox_source_aoel: string | null;
  tox_remark_aoel: string | null;
  tox_value_aaoel: string | null;
  tox_source_aaoel: string | null;
  tox_remark_aaoel: string | null;
  tox_value_other: string | null;
  tox_source_other: string | null;
  tox_remark_other: string | null;
  authorisations_at_nat_level: string | null;
  classification_reg_1272: string | null;
  basic_substance: string | null;
  low_risk_active_substance: string | null;
  candidate_for_substitution: string | null;
  candidate_for_substitution_type: string | null;
  active_substance_part_of_group: string | null;
  active_substance_part_of_group_id: number | null;
  as_member_id: number | null;
  as_member_name: string | null;
  pesticide_residue_linked: string | null;
  pest_res_linked_annex: string | null;
  pest_res_linked_legislation: string | null;
  pest_res_linked_legislation_url: string | null;
  pest_res_mrl_webpage: string | null;
}

async function ingestActiveSubstances(): Promise<number> {
  console.log("\n[2/5] Ingesting active substances…");

  const rows = await fetchAllPages<APIActiveSubstance>(
    "active-substances",
    {},
    "active-substances",
  );

  // The flat file has 1:N cardinality — the same substance_id appears on
  // multiple rows when it has multiple categories, multiple
  // pesticide_residue_linked records, or multiple group members.
  // We need to:
  //   a) Deduplicate for the main eu_active_substances upsert (take first occurrence)
  //   b) Collect ALL unique categories per substance → eu_substance_categories
  //   c) Collect ALL unique country codes per substance → eu_country_authorizations

  const substanceMap = new Map<
    number,
    {
      first: APIActiveSubstance;
      categories: Set<string>;
      countryCodes: Set<string>;
      groupMembers: Set<string>; // "member_as_id|member_name"
    }
  >();

  for (const row of rows) {
    const id = row.substance_id;
    if (!substanceMap.has(id)) {
      substanceMap.set(id, {
        first: row,
        categories: new Set(),
        countryCodes: new Set(),
        groupMembers: new Set(),
      });
    }
    const entry = substanceMap.get(id)!;

    // Collect categories
    const cat = parseCategory(row.substance_category);
    if (cat) entry.categories.add(`${cat.code}|${cat.name}`);

    // Collect country codes — they're the same across all rows for a substance,
    // but we parse once from any non-null occurrence
    if (row.authorisations_at_nat_level) {
      for (const code of parseCountryCodes(
        row.authorisations_at_nat_level,
      )) {
        entry.countryCodes.add(code);
      }
    }

    // Collect group members (1:N — each row may carry a different member)
    if (row.as_member_id != null) {
      entry.groupMembers.add(
        `${row.as_member_id}|${row.as_member_name ?? ""}`,
      );
    }
  }

  console.log(`  Unique substances: ${substanceMap.size}`);

  // ── Helper: build substance row from API record ──
  const now = new Date();
  function substanceRow(asId: number, r: APIActiveSubstance) {
    const toxSourceArfd =
      r.tox_source_earfd ?? r.tox_sourc_earfd ?? null;
    return {
      as_id: asId,
      name: r.substance_name,
      cas_number: r.cas_number,
      status: r.substance_status,
      approval_dt: parseEUDate(r.approval_date),
      expiry_dt: parseEUDate(r.expiry_date),
      risk_assessment: r.risk_assessment,
      is_microorganism: yesNo(r.as_micro_org),
      rms: r.rms,
      corms: r.corms,
      remark: r.remark,
      legislations_old: r.legislations_old,
      legislations_actives: r.legislations_actives,
      tox_value_adi: r.tox_value_adi,
      tox_source_adi: r.tox_source_adi,
      tox_remark_adi: r.tox_remark_adi,
      tox_value_arfd: r.tox_value_arfd,
      tox_source_arfd: toxSourceArfd,
      tox_remark_arfd: r.tox_remark_arfd,
      tox_value_aoel: r.tox_value_aoel,
      tox_source_aoel: r.tox_source_aoel,
      tox_remark_aoel: r.tox_remark_aoel,
      tox_value_aaoel: r.tox_value_aaoel,
      tox_source_aaoel: r.tox_source_aaoel,
      tox_remark_aaoel: r.tox_remark_aaoel,
      tox_value_other: r.tox_value_other,
      tox_source_other: r.tox_source_other,
      tox_remark_other: r.tox_remark_other,
      authorisations_at_nat_level: r.authorisations_at_nat_level,
      classification_reg_1272: r.classification_reg_1272,
      basic_substance: yesNo(r.basic_substance),
      low_risk: yesNo(r.low_risk_active_substance),
      candidate_for_substitution: yesNo(r.candidate_for_substitution),
      candidate_for_substitution_type:
        r.candidate_for_substitution_type,
      part_of_group: yesNo(r.active_substance_part_of_group),
      part_of_group_id: r.active_substance_part_of_group_id,
      is_group: yesNo(r.as_is_group),
      pesticide_residue_linked:
        r.pesticide_residue_linked?.trim() ?? null,
      pest_res_linked_annex: r.pest_res_linked_annex,
      pest_res_linked_legislation: r.pest_res_linked_legislation,
      pest_res_linked_legislation_url:
        r.pest_res_linked_legislation_url,
      pest_res_mrl_webpage: r.pest_res_mrl_webpage,
      last_synced_at: now,
    };
  }

  // ── Upsert substances in batches ──
  // Kysely ON CONFLICT with batch values works — one SQL statement per batch.
  const substanceEntries = [...substanceMap.entries()];
  const BATCH = 50;
  let substanceCount = 0;

  for (let i = 0; i < substanceEntries.length; i += BATCH) {
    const batch = substanceEntries.slice(i, i + BATCH);
    const values = batch.map(([asId, { first }]) =>
      substanceRow(asId, first),
    );

    await db
      .insertInto("eu_active_substances")
      .values(values)
      .onConflict((oc) =>
        oc.column("as_id").doUpdateSet((eb) => ({
          name: eb.ref("excluded.name"),
          cas_number: eb.ref("excluded.cas_number"),
          status: eb.ref("excluded.status"),
          approval_dt: eb.ref("excluded.approval_dt"),
          expiry_dt: eb.ref("excluded.expiry_dt"),
          risk_assessment: eb.ref("excluded.risk_assessment"),
          is_microorganism: eb.ref("excluded.is_microorganism"),
          rms: eb.ref("excluded.rms"),
          corms: eb.ref("excluded.corms"),
          remark: eb.ref("excluded.remark"),
          legislations_old: eb.ref("excluded.legislations_old"),
          legislations_actives: eb.ref(
            "excluded.legislations_actives",
          ),
          tox_value_adi: eb.ref("excluded.tox_value_adi"),
          tox_source_adi: eb.ref("excluded.tox_source_adi"),
          tox_remark_adi: eb.ref("excluded.tox_remark_adi"),
          tox_value_arfd: eb.ref("excluded.tox_value_arfd"),
          tox_source_arfd: eb.ref("excluded.tox_source_arfd"),
          tox_remark_arfd: eb.ref("excluded.tox_remark_arfd"),
          tox_value_aoel: eb.ref("excluded.tox_value_aoel"),
          tox_source_aoel: eb.ref("excluded.tox_source_aoel"),
          tox_remark_aoel: eb.ref("excluded.tox_remark_aoel"),
          tox_value_aaoel: eb.ref("excluded.tox_value_aaoel"),
          tox_source_aaoel: eb.ref("excluded.tox_source_aaoel"),
          tox_remark_aaoel: eb.ref("excluded.tox_remark_aaoel"),
          tox_value_other: eb.ref("excluded.tox_value_other"),
          tox_source_other: eb.ref("excluded.tox_source_other"),
          tox_remark_other: eb.ref("excluded.tox_remark_other"),
          authorisations_at_nat_level: eb.ref(
            "excluded.authorisations_at_nat_level",
          ),
          classification_reg_1272: eb.ref(
            "excluded.classification_reg_1272",
          ),
          basic_substance: eb.ref("excluded.basic_substance"),
          low_risk: eb.ref("excluded.low_risk"),
          candidate_for_substitution: eb.ref(
            "excluded.candidate_for_substitution",
          ),
          candidate_for_substitution_type: eb.ref(
            "excluded.candidate_for_substitution_type",
          ),
          part_of_group: eb.ref("excluded.part_of_group"),
          part_of_group_id: eb.ref("excluded.part_of_group_id"),
          is_group: eb.ref("excluded.is_group"),
          pesticide_residue_linked: eb.ref(
            "excluded.pesticide_residue_linked",
          ),
          pest_res_linked_annex: eb.ref(
            "excluded.pest_res_linked_annex",
          ),
          pest_res_linked_legislation: eb.ref(
            "excluded.pest_res_linked_legislation",
          ),
          pest_res_linked_legislation_url: eb.ref(
            "excluded.pest_res_linked_legislation_url",
          ),
          pest_res_mrl_webpage: eb.ref(
            "excluded.pest_res_mrl_webpage",
          ),
          last_synced_at: eb.ref("excluded.last_synced_at"),
        })),
      )
      .execute();

    substanceCount += batch.length;
    if (
      substanceCount % 500 === 0 ||
      i + BATCH >= substanceEntries.length
    ) {
      console.log(
        `  Substances: ${substanceCount}/${substanceMap.size}…`,
      );
    }
  }
  console.log(`  ✓ ${substanceCount} substances upserted`);

  // ── Country authorizations: DELETE all + batch INSERT ──
  // Since we're doing full replace, skip ON CONFLICT — plain batch insert is faster.
  console.log("  Inserting country authorizations…");
  await sql`DELETE FROM eu_country_authorizations`.execute(db);
  const countryAuthRows: { as_id: number; country_code: string }[] =
    [];
  for (const [asId, { countryCodes }] of substanceMap) {
    for (const code of countryCodes) {
      countryAuthRows.push({ as_id: asId, country_code: code });
    }
  }
  for (let i = 0; i < countryAuthRows.length; i += BATCH) {
    const batch = countryAuthRows.slice(i, i + BATCH);
    await db
      .insertInto("eu_country_authorizations")
      .values(batch)
      .execute();
  }
  console.log(
    `  ✓ ${countryAuthRows.length} country authorizations inserted`,
  );

  // ── Substance categories: DELETE all + batch INSERT ──
  console.log("  Inserting substance categories…");
  await sql`DELETE FROM eu_substance_categories`.execute(db);
  const categoryRows: {
    as_id: number;
    category_code: string;
    category_name: string;
  }[] = [];
  for (const [asId, { categories }] of substanceMap) {
    for (const catStr of categories) {
      const [code, name] = catStr.split("|");
      categoryRows.push({
        as_id: asId,
        category_code: code,
        category_name: name,
      });
    }
  }
  for (let i = 0; i < categoryRows.length; i += BATCH) {
    const batch = categoryRows.slice(i, i + BATCH);
    await db
      .insertInto("eu_substance_categories")
      .values(batch)
      .execute();
  }
  console.log(
    `  ✓ ${categoryRows.length} substance categories inserted`,
  );

  // ── Group members: DELETE all + batch INSERT ──
  console.log("  Inserting group members…");
  await sql`DELETE FROM eu_substance_group_members`.execute(db);
  const memberRows: {
    group_as_id: number;
    member_as_id: number;
    member_name: string | null;
  }[] = [];
  for (const [asId, { groupMembers }] of substanceMap) {
    for (const memberStr of groupMembers) {
      const pipeIdx = memberStr.indexOf("|");
      const memberId = Number(memberStr.slice(0, pipeIdx));
      const memberName = memberStr.slice(pipeIdx + 1) || null;
      memberRows.push({
        group_as_id: asId,
        member_as_id: memberId,
        member_name: memberName,
      });
    }
  }
  for (let i = 0; i < memberRows.length; i += BATCH) {
    const batch = memberRows.slice(i, i + BATCH);
    await db
      .insertInto("eu_substance_group_members")
      .values(batch)
      .execute();
  }
  console.log(`  ✓ ${memberRows.length} group members inserted`);

  return substanceCount;
}

// ─── Task 3: Pesticide residues ──────────────────────────────────────────────

interface APIPesticideResidue {
  pesticide_residue_id: number;
  pesticide_residue_name: string;
  pesticide_residue_lg: string;
  pesticide_residue_footnote_code: string | null;
  pesticide_residue_footnote_def: string | null;
  pesticide_residue_footnote_txt: string | null;
  pesticide_residue_version_nbr: number | null;
  original_pesticide_residue_id: number | null;
}

async function ingestResidues(): Promise<number> {
  console.log("\n[3/5] Ingesting pesticide residues (EN)…");

  const rows = await fetchAllPages<APIPesticideResidue>(
    "pesticide-residues",
    { pesticide_residue_lg: "EN" },
    "pesticide-residues",
  );

  // Deduplicate by residue_id — the API returns multiple rows per residue
  // when it has multiple footnote codes (e.g. (F) fat-soluble + (R) different
  // residue definition). 51 of 679 residues have this. We concatenate footnotes.
  const residueMap = new Map<
    number,
    {
      first: APIPesticideResidue;
      footnoteCodes: Set<string>;
      footnoteDefs: Set<string>;
    }
  >();

  for (const r of rows) {
    const id = Math.round(r.pesticide_residue_id);
    if (!residueMap.has(id)) {
      residueMap.set(id, {
        first: r,
        footnoteCodes: new Set(),
        footnoteDefs: new Set(),
      });
    }
    const entry = residueMap.get(id)!;
    if (r.pesticide_residue_footnote_code)
      entry.footnoteCodes.add(r.pesticide_residue_footnote_code);
    if (r.pesticide_residue_footnote_def)
      entry.footnoteDefs.add(r.pesticide_residue_footnote_def);
  }

  console.log(
    `  Unique residues: ${residueMap.size} (from ${rows.length} rows)`,
  );

  const BATCH = 50;
  let count = 0;
  const entries = [...residueMap.entries()];

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const values = batch.map(
      ([id, { first: r, footnoteCodes, footnoteDefs }]) => ({
        residue_id: id,
        residue_name: r.pesticide_residue_name,
        language: r.pesticide_residue_lg,
        footnote_code: [...footnoteCodes].join("; ") || null,
        footnote_def: [...footnoteDefs].join("; ") || null,
        footnote_txt: r.pesticide_residue_footnote_txt,
        version_nbr:
          r.pesticide_residue_version_nbr != null
            ? Math.round(r.pesticide_residue_version_nbr)
            : null,
        original_residue_id:
          r.original_pesticide_residue_id != null
            ? Math.round(r.original_pesticide_residue_id)
            : null,
      }),
    );

    await db
      .insertInto("eu_pesticide_residues")
      .values(values)
      .onConflict((oc) =>
        oc.column("residue_id").doUpdateSet((eb) => ({
          residue_name: eb.ref("excluded.residue_name"),
          language: eb.ref("excluded.language"),
          footnote_code: eb.ref("excluded.footnote_code"),
          footnote_def: eb.ref("excluded.footnote_def"),
          footnote_txt: eb.ref("excluded.footnote_txt"),
          version_nbr: eb.ref("excluded.version_nbr"),
          original_residue_id: eb.ref("excluded.original_residue_id"),
        })),
      )
      .execute();

    count += batch.length;
    if (count % 200 === 0) {
      console.log(`  Residues: ${count}/${residueMap.size}…`);
    }
  }

  console.log(`  ✓ ${count} residues upserted`);
  return count;
}

// ─── Task 4: Commodities (food products) ─────────────────────────────────────

interface APICommodity {
  language: string;
  product_id: number;
  product_parent_id: number | null;
  product_code: string;
  product_type_id: number;
  product_name: string;
  product_scientific_names: string | null;
  product_synonym_names: string | null;
}

async function ingestCommodities(): Promise<number> {
  console.log("\n[4/5] Ingesting commodities (EN)…");

  const rows = await fetchAllPages<APICommodity>(
    "pesticide-residues-products",
    { language: "EN" },
    "commodities",
  );

  const BATCH = 50;
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map((r) => ({
      commodity_id: r.product_id,
      parent_id: r.product_parent_id,
      product_code: r.product_code,
      product_type_id: r.product_type_id,
      product_name: r.product_name,
      scientific_names: r.product_scientific_names,
      synonym_names: r.product_synonym_names,
    }));

    await db
      .insertInto("eu_commodities")
      .values(values)
      .onConflict((oc) =>
        oc.column("commodity_id").doUpdateSet((eb) => ({
          parent_id: eb.ref("excluded.parent_id"),
          product_code: eb.ref("excluded.product_code"),
          product_type_id: eb.ref("excluded.product_type_id"),
          product_name: eb.ref("excluded.product_name"),
          scientific_names: eb.ref("excluded.scientific_names"),
          synonym_names: eb.ref("excluded.synonym_names"),
        })),
      )
      .execute();

    count += batch.length;
    if (count % 200 === 0) {
      console.log(`  Commodities: ${count}/${rows.length}…`);
    }
  }

  console.log(`  ✓ ${count} commodities upserted`);
  return count;
}

// ─── Task 5: MRL values ─────────────────────────────────────────────────────

interface APIMRL {
  pesticide_residue_id: number;
  included_in_annex: string | null;
  regulation_number: string | null;
  regulation_url: string | null;
  voted_date: string | null;
  entry_into_force_date: string | null;
  application_date: string | null;
  product_id: number;
  applicability: number;
  applicability_text: string | null;
  mrl_value: string | null;
  mrl_value_only: string | number | null;
  mrl_lod: string | null;
  footnote_text: string | null;
  current_version_number: number | null;
  original_pesticide_residue_id: number | null;
  next_version_number: number | null;
  next_pesticide_residue_id: number | null;
}

async function ingestMRLs(): Promise<number> {
  console.log("\n[5/5] Ingesting MRL values…");

  console.log("  Truncating eu_mrls for full replace…");
  await sql`TRUNCATE TABLE eu_mrls RESTART IDENTITY`.execute(db);

  // Pipeline: fetch page N+1 while inserting page N.
  // This overlaps network latency with DB write latency, roughly halving wall time.
  const qs = new URLSearchParams({
    format: "json",
    "api-version": API_VERSION,
  });
  let nextUrl: string | null =
    `${BASE}/pesticide-residues-mrls?${qs}`;
  let count = 0;
  let pageNum = 0;
  const startTime = Date.now();

  // Kick off first fetch
  let pendingFetch: Promise<{
    data: PaginatedResponse<APIMRL>;
    pageNum: number;
  }> | null = nextUrl ? fetchMRLPage(nextUrl, 1) : null;

  while (pendingFetch) {
    const { data, pageNum: currentPage } = await pendingFetch;
    pageNum = currentPage;
    const rows = data.value;
    nextUrl = data.nextLink ?? null;

    // Start fetching next page immediately (don't wait for insert)
    const nextFetch = nextUrl
      ? fetchMRLPage(nextUrl, currentPage + 1)
      : null;

    // Insert current page while next page is being fetched
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        residue_id: r.pesticide_residue_id,
        commodity_id: r.product_id,
        included_in_annex: r.included_in_annex,
        regulation_number: r.regulation_number,
        regulation_url: r.regulation_url,
        voted_date: r.voted_date,
        entry_into_force_date: r.entry_into_force_date,
        application_date: r.application_date,
        applicability: r.applicability,
        applicability_text: r.applicability_text,
        mrl_value: r.mrl_value,
        mrl_value_only:
          r.mrl_value_only != null ? Number(r.mrl_value_only) : null,
        mrl_lod: r.mrl_lod,
        footnote_text: r.footnote_text,
        current_version_number: r.current_version_number,
        original_pesticide_residue_id:
          r.original_pesticide_residue_id,
        next_version_number: r.next_version_number,
        next_pesticide_residue_id: r.next_pesticide_residue_id,
      }));

      await db.insertInto("eu_mrls").values(values).execute();
      count += rows.length;
    }

    if (pageNum % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = count / elapsed;
      console.log(
        `  MRLs: ${count} records (page ${pageNum}, ${rate.toFixed(0)} rec/s)…`,
      );
    }

    pendingFetch = nextFetch;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `  ✓ ${count} MRL records inserted (${pageNum} pages, ${elapsed}s)`,
  );
  return count;
}

async function fetchMRLPage(
  url: string,
  pageNum: number,
): Promise<{ data: PaginatedResponse<APIMRL>; pageNum: number }> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `MRL page ${pageNum} failed (${res.status}): ${body}`,
    );
  }
  const data: PaginatedResponse<APIMRL> = await res.json();
  return { data, pageNum };
}

// ─── Sync log ────────────────────────────────────────────────────────────────

async function logSync(
  sourceName: string,
  recordCount: number,
  sourceVersion: string = API_VERSION,
): Promise<void> {
  await db
    .insertInto("sync_log")
    .values({
      source_name: sourceName,
      source_version: sourceVersion,
      record_count: recordCount,
      synced_at: new Date(),
    })
    .execute();
}

// ─── Task 3.5: Resolve pesticide_residue_linked → residue_id ─────────────────
//
// Populates eu_active_substances.resolved_residue_id by matching the
// pesticide_residue_linked text to eu_pesticide_residues.residue_name.
//
// Five-step waterfall, each step only touches rows not yet resolved:
//   1. Exact text match
//   2. Case-insensitive prefix (catches footnote markers like (F), (R), (A))
//   3. Substance name contained in residue name (single match only)
//   4. prl_overrides reference table (manually verified edge cases)
//
// Must run AFTER both eu_active_substances and eu_pesticide_residues are populated.

async function resolveResidueLinks(): Promise<void> {
  console.log(
    "\n[3.5] Resolving pesticide_residue_linked → residue_id…",
  );

  // Reset all resolved_residue_id to null before re-resolving.
  // This ensures stale mappings from previous syncs don't persist
  // if the EU API changes a substance's pesticide_residue_linked value.
  await sql`
    UPDATE eu_active_substances
    SET resolved_residue_id = NULL
    WHERE resolved_residue_id IS NOT NULL
  `.execute(db);

  // Step 1: Exact match
  const step1 = await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = epr.residue_id
    FROM eu_pesticide_residues epr
    WHERE epr.residue_name = eas.pesticide_residue_linked
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND eas.resolved_residue_id IS NULL
  `.execute(db);
  console.log(
    `  Step 1 (exact match): ${step1.numAffectedRows} resolved`,
  );

  // Step 2: ILIKE prefix (catches footnote markers)
  const step2 = await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = epr.residue_id
    FROM eu_pesticide_residues epr
    WHERE epr.residue_name ILIKE eas.pesticide_residue_linked || '%'
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND eas.resolved_residue_id IS NULL
  `.execute(db);
  console.log(
    `  Step 2 (ILIKE prefix): ${step2.numAffectedRows} resolved`,
  );

  // Step 3: Substance name contained in residue name (single match only)
  const step3 = await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = (
      SELECT epr.residue_id FROM eu_pesticide_residues epr
      WHERE epr.residue_name ILIKE '%' || eas.name || '%'
      LIMIT 1
    )
    WHERE eas.resolved_residue_id IS NULL
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND (
        SELECT COUNT(*) FROM eu_pesticide_residues epr
        WHERE epr.residue_name ILIKE '%' || eas.name || '%'
      ) = 1
  `.execute(db);
  console.log(
    `  Step 3 (name search): ${step3.numAffectedRows} resolved`,
  );

  // Step 4: prl_overrides table (manually verified edge cases)
  const step4 = await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = po.resolved_residue_id
    FROM prl_overrides po
    WHERE eas.pesticide_residue_linked = po.prl_text
      AND eas.resolved_residue_id IS NULL
  `.execute(db);
  console.log(
    `  Step 4 (overrides): ${step4.numAffectedRows} resolved`,
  );

  // Summary
  const summary = await sql<{
    mrl_type: string;
    count: string;
  }>`
    SELECT
      CASE
        WHEN pesticide_residue_linked IS NULL THEN 'no_residue_link'
        WHEN pesticide_residue_linked LIKE 'Default%' THEN 'default'
        WHEN resolved_residue_id IS NOT NULL THEN 'specific'
        ELSE 'unresolved'
      END AS mrl_type,
      COUNT(*)::text AS count
    FROM eu_active_substances
    GROUP BY 1
    ORDER BY 2 DESC
  `.execute(db);

  console.log("  Resolution summary:");
  for (const row of summary.rows) {
    console.log(`    ${row.mrl_type}: ${row.count}`);
  }

  // Alert if any unresolved remain
  const unresolved = summary.rows.find(
    (r) => r.mrl_type === "unresolved",
  );
  if (unresolved && Number(unresolved.count) > 0) {
    console.warn(
      `  ⚠ ${unresolved.count} substances have unresolved residue links. Run:`,
    );
    console.warn(
      `    SELECT as_id, name, pesticide_residue_linked FROM eu_active_substances`,
    );
    console.warn(
      `    WHERE resolved_residue_id IS NULL AND pesticide_residue_linked NOT LIKE 'Default%'`,
    );
    console.warn(`    AND pesticide_residue_linked IS NOT NULL;`);
  }

  console.log("  ✓ Residue link resolution complete");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log("RegBridge EU Pesticides API v3.0 Ingestion");
  console.log("==========================================");

  try {
    // 1. Countries
    const countryCount = await seedCountries();
    await logSync("EU_COUNTRIES", countryCount, "reference-data");

    // 2. Active substances (+ country authorizations + categories)
    const substanceCount = await ingestActiveSubstances();
    await logSync("EU_ACTIVE_SUBSTANCES", substanceCount);

    // 3. Pesticide residues
    const residueCount = await ingestResidues();
    await logSync("EU_PESTICIDE_RESIDUES", residueCount);

    // 3.5 Resolve pesticide_residue_linked → residue_id
    // (needs both eu_active_substances and eu_pesticide_residues populated)
    await resolveResidueLinks();

    // 4. Commodities
    const commodityCount = await ingestCommodities();
    await logSync("EU_COMMODITIES", commodityCount);

    // 5. MRL values
    const mrlCount = await ingestMRLs();
    await logSync("EU_MRLS", mrlCount);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✓ All done in ${elapsed}s`);
    console.log(
      `  Countries: ${countryCount} | Substances: ${substanceCount} | Residues: ${residueCount} | Commodities: ${commodityCount} | MRLs: ${mrlCount}`,
    );
  } catch (err) {
    console.error("\n✗ Ingestion failed:", err);
    process.exit(1);
  }
}

main();
