import { db, sql } from "@regbridge/db";
import { resolveSubstance } from "./resolve-substance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultType = "substance" | "product" | "company";
export type MatchType =
  | "exact_id"
  | "exact_cas"
  | "exact_name"
  | "exact_number"
  | "prefix"
  | "fuzzy";
export type MatchField =
  | "as_id"
  | "cas_number"
  | "name"
  | "product_name"
  | "pcs_number"
  | "amm_number"
  | "auth_holder"
  | "alias";

export interface SubstanceResult {
  type: "substance";
  match_field: MatchField;
  match_type: MatchType;
  entity: {
    as_id: number;
    name: string;
    cas_number: string | null;
    status: string | null;
    expiry_dt: string | null;
    candidate_for_substitution: boolean | null;
    category: string | null;
    country_count: number;
  };
}

export interface ProductResult {
  type: "product";
  match_field: MatchField;
  match_type: MatchType;
  entity: {
    product_name: string;
    country: "IE" | "FR";
    identifier: string;
    auth_holder: string | null;
    status: string | null;
    substances: string[];
  };
}

export interface CompanyResult {
  type: "company";
  match_field: MatchField;
  match_type: MatchType;
  entity: {
    company_name: string;
    ie_product_count: number;
    fr_product_count: number;
  };
}

export type SearchResult =
  | SubstanceResult
  | ProductResult
  | CompanyResult;

// Input detection patterns
const CAS_REGEX = /^\d{2,7}-\d{2}-\d$/;
const PCS_REGEX = /^\d{4,5}$/;
const AMM_REGEX = /^\d{7}$/;

// ---------------------------------------------------------------------------
// Main palette search
// ---------------------------------------------------------------------------

export async function paletteSearch(
  query: string,
  limit: number = 10,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // CAS number → substance only
  if (CAS_REGEX.test(q)) {
    return searchByCas(q);
  }

  // PCS number → IE product exact lookup
  if (PCS_REGEX.test(q)) {
    const results = await searchByPcs(q);
    if (q.length === 4) {
      const ammResults = await searchByAmmPrefix(q);
      return [...results, ...ammResults].slice(0, limit);
    }
    return results;
  }

  // AMM number → FR product exact lookup
  if (AMM_REGEX.test(q)) {
    return searchByAmm(q);
  }

  // Text query → ALL four queries in parallel (single DB call each)
  const [substances, ieProducts, frProducts, companies] =
    await Promise.all([
      searchSubstancesSingleQuery(q, Math.ceil(limit / 2)),
      searchIeProducts(q, Math.ceil(limit / 4)),
      searchFrProducts(q, Math.ceil(limit / 4)),
      searchCompanies(q, 3),
    ]);

  return [
    ...substances,
    ...ieProducts,
    ...frProducts,
    ...companies,
  ].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Substance search — ONE query using UNION ALL, ONE batch enrichment
// ---------------------------------------------------------------------------

async function searchSubstancesSingleQuery(
  query: string,
  limit: number,
): Promise<SubstanceResult[]> {
  const q = query.toLowerCase();

  // Single query: exact name UNION prefix UNION fuzzy, with match_type tagged
  const rows = await db.executeQuery<{
    as_id: number;
    name: string;
    cas_number: string | null;
    status: string | null;
    expiry_dt: string | null;
    candidate_for_substitution: boolean | null;
    match_type: string;
    rank: number;
  }>(
    sql`
      (
        SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
               'exact_name' as match_type, 0 as rank
        FROM eu_active_substances
        WHERE LOWER(name) = ${q}
        LIMIT 1
      )
      UNION ALL
      (
        SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
               'prefix' as match_type,
               CASE WHEN status = 'Approved' THEN 0 ELSE 1 END as rank
        FROM eu_active_substances
        WHERE LOWER(name) LIKE ${q + "%"}
          AND LOWER(name) != ${q}
        ORDER BY rank, LENGTH(name)
        LIMIT ${limit}
      )
      UNION ALL
      (
        SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
               'fuzzy' as match_type, 2 as rank
        FROM eu_active_substances
        WHERE similarity(name, ${query}) > 0.3
          AND LOWER(name) NOT LIKE ${q + "%"}
        ORDER BY similarity(name, ${query}) DESC
        LIMIT ${limit}
      )
      LIMIT ${limit}
    `.compile(db),
  );

  if (rows.rows.length === 0) return [];

  // Batch enrichment: one query for all categories, one for all country counts
  const asIds = rows.rows.map((r) => r.as_id);

  const [categories, countryCounts] = await Promise.all([
    db
      .selectFrom("eu_substance_categories")
      .select(["as_id", "category_name"])
      .where("as_id", "in", asIds)
      .execute(),
    db
      .selectFrom("eu_country_authorizations")
      .select(["as_id", sql<number>`COUNT(*)`.as("count")])
      .where("as_id", "in", asIds)
      .groupBy("as_id")
      .execute(),
  ]);

  // Build lookup maps
  const categoryMap = new Map<number, string>();
  for (const c of categories) {
    if (!categoryMap.has(c.as_id)) {
      categoryMap.set(c.as_id, c.category_name ?? "");
    }
  }

  const countMap = new Map<number, number>();
  for (const c of countryCounts) {
    countMap.set(c.as_id, Number(c.count));
  }

  // Deduplicate by as_id (exact could also appear in prefix results)
  const seen = new Set<number>();
  const results: SubstanceResult[] = [];

  for (const r of rows.rows) {
    if (seen.has(r.as_id)) continue;
    seen.add(r.as_id);

    results.push({
      type: "substance",
      match_field: "name",
      match_type: r.match_type as MatchType,
      entity: {
        as_id: r.as_id,
        name: r.name,
        cas_number: r.cas_number,
        status: r.status,
        expiry_dt: r.expiry_dt,
        candidate_for_substitution: r.candidate_for_substitution,
        category: categoryMap.get(r.as_id) ?? null,
        country_count: countMap.get(r.as_id) ?? 0,
      },
    });
  }

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// IE Product search
// ---------------------------------------------------------------------------

async function searchIeProducts(
  query: string,
  limit: number,
): Promise<ProductResult[]> {
  const q = query.toLowerCase();

  const rows = await db
    .selectFrom("ie_products as ip")
    .leftJoin(
      "ie_product_substances as ips",
      "ip.product_id",
      "ips.product_id",
    )
    .select([
      "ip.product_id",
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
      sql<string>`string_agg(ips.substance_name, ', ')`.as(
        "substances_agg",
      ),
      sql<number>`similarity(ip.product_name, ${query})`.as("sim"),
    ])
    .where((eb) =>
      eb.or([
        eb(sql`LOWER(ip.product_name)`, "like", `${q}%`),
        eb(sql`similarity(ip.product_name, ${query})`, ">", 0.35),
      ]),
    )
    .groupBy([
      "ip.product_id",
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
    ])
    .orderBy(
      sql`CASE WHEN LOWER(ip.product_name) = ${q} THEN 0
           WHEN LOWER(ip.product_name) LIKE ${q + "%"} THEN 1
           ELSE 2 END`,
      "asc",
    )
    .orderBy("sim", "desc")
    .limit(limit)
    .execute();

  return rows.map((r) => {
    const nameLower = (r.product_name ?? "").toLowerCase();
    let matchType: MatchType;
    if (nameLower === q) matchType = "exact_name";
    else if (nameLower.startsWith(q)) matchType = "prefix";
    else matchType = "fuzzy";

    return {
      type: "product" as const,
      match_field: "product_name" as MatchField,
      match_type: matchType,
      entity: {
        product_name: r.product_name ?? "",
        country: "IE" as const,
        identifier: r.pcs_number ?? "",
        auth_holder: r.auth_holder,
        status: "Authorised",
        substances: r.substances_agg
          ? r.substances_agg.split(", ")
          : [],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// FR Product search (PPP only)
// ---------------------------------------------------------------------------

async function searchFrProducts(
  query: string,
  limit: number,
): Promise<ProductResult[]> {
  const q = query.toLowerCase();

  const rows = await db
    .selectFrom("fr_products as fp")
    .leftJoin(
      "fr_product_substances as fps",
      "fp.amm_number",
      "fps.amm_number",
    )
    .select([
      "fp.amm_number",
      "fp.product_name",
      "fp.titulaire",
      "fp.etat_autorisation",
      sql<string>`string_agg(fps.substance_name, ', ')`.as(
        "substances_agg",
      ),
      sql<number>`similarity(fp.product_name, ${query})`.as("sim"),
    ])
    .where("fp.type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ])
    .where((eb) =>
      eb.or([
        eb(sql`LOWER(fp.product_name)`, "like", `${q}%`),
        eb(sql`similarity(fp.product_name, ${query})`, ">", 0.35),
      ]),
    )
    .groupBy([
      "fp.amm_number",
      "fp.product_name",
      "fp.titulaire",
      "fp.etat_autorisation",
    ])
    .orderBy(
      sql`CASE WHEN LOWER(fp.product_name) = ${q} THEN 0
           WHEN LOWER(fp.product_name) LIKE ${q + "%"} THEN 1
           ELSE 2 END`,
      "asc",
    )
    .orderBy("sim", "desc")
    .limit(limit)
    .execute();

  return rows.map((r) => {
    const nameLower = (r.product_name ?? "").toLowerCase();
    let matchType: MatchType;
    if (nameLower === q) matchType = "exact_name";
    else if (nameLower.startsWith(q)) matchType = "prefix";
    else matchType = "fuzzy";

    return {
      type: "product" as const,
      match_field: "product_name" as MatchField,
      match_type: matchType,
      entity: {
        product_name: r.product_name ?? "",
        country: "FR" as const,
        identifier: r.amm_number ?? "",
        auth_holder: r.titulaire,
        status: r.etat_autorisation,
        substances: r.substances_agg
          ? r.substances_agg.split(", ")
          : [],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Company search
// ---------------------------------------------------------------------------

async function searchCompanies(
  query: string,
  limit: number,
): Promise<CompanyResult[]> {
  const q = query.toLowerCase();

  const [ieCompanies, frCompanies] = await Promise.all([
    db
      .selectFrom("ie_products")
      .select([
        "auth_holder",
        sql<number>`COUNT(*)`.as("product_count"),
        sql<number>`similarity(auth_holder, ${query})`.as("sim"),
      ])
      .where((eb) =>
        eb.or([
          eb(sql`LOWER(auth_holder)`, "like", `${q}%`),
          eb(sql`similarity(auth_holder, ${query})`, ">", 0.4),
        ]),
      )
      .groupBy("auth_holder")
      .orderBy("sim", "desc")
      .limit(limit * 2)
      .execute(),

    db
      .selectFrom("fr_products")
      .select([
        "titulaire",
        sql<number>`COUNT(*)`.as("product_count"),
        sql<number>`similarity(titulaire, ${query})`.as("sim"),
      ])
      .where("type_produit", "in", [
        "PPP",
        "ADJUVANT",
        "PRODUIT-MIXTE",
        "MELANGE",
      ])
      .where((eb) =>
        eb.or([
          eb(sql`LOWER(titulaire)`, "like", `${q}%`),
          eb(sql`similarity(titulaire, ${query})`, ">", 0.4),
        ]),
      )
      .groupBy("titulaire")
      .orderBy("sim", "desc")
      .limit(limit * 2)
      .execute(),
  ]);

  // Merge by normalized company name
  const companyMap = new Map<
    string,
    {
      displayName: string;
      ie: number;
      fr: number;
      bestSim: number;
    }
  >();

  for (const row of ieCompanies) {
    const name = row.auth_holder ?? "";
    const key = normalizeCompanyName(name);
    const existing = companyMap.get(key);
    if (existing) {
      existing.ie += Number(row.product_count);
      existing.bestSim = Math.max(existing.bestSim, Number(row.sim));
    } else {
      companyMap.set(key, {
        displayName: name,
        ie: Number(row.product_count),
        fr: 0,
        bestSim: Number(row.sim),
      });
    }
  }

  for (const row of frCompanies) {
    const name = row.titulaire ?? "";
    const key = normalizeCompanyName(name);
    const existing = companyMap.get(key);
    if (existing) {
      existing.fr += Number(row.product_count);
      existing.bestSim = Math.max(existing.bestSim, Number(row.sim));
    } else {
      companyMap.set(key, {
        displayName: name,
        ie: 0,
        fr: Number(row.product_count),
        bestSim: Number(row.sim),
      });
    }
  }

  const sorted = [...companyMap.values()]
    .sort((a, b) => b.bestSim - a.bestSim)
    .slice(0, limit);

  return sorted.map((data) => ({
    type: "company" as const,
    match_field: "auth_holder" as MatchField,
    match_type: data.displayName.toLowerCase().startsWith(q)
      ? ("prefix" as MatchType)
      : ("fuzzy" as MatchType),
    entity: {
      company_name: data.displayName,
      ie_product_count: data.ie,
      fr_product_count: data.fr,
    },
  }));
}

/**
 * Normalize company names for merging.
 * "Life Scientific Limited" and "LIFE SCIENTIFIC LTD" → same key.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(limited|ltd|s\.?a\.?s\.?|s\.?a\.?|gmbh|co\.?\s*kg|b\.?v\.?|s\.?r\.?l\.?|s\.?p\.?a\.?|plc|inc|corp)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Exact identifier lookups
// ---------------------------------------------------------------------------

async function searchByCas(cas: string): Promise<SubstanceResult[]> {
  const row = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
    ])
    .where("cas_number", "=", cas)
    .executeTakeFirst();

  if (!row) return [];

  const [categories, countryCounts] = await Promise.all([
    db
      .selectFrom("eu_substance_categories")
      .select("category_name")
      .where("as_id", "=", row.as_id)
      .executeTakeFirst(),
    db
      .selectFrom("eu_country_authorizations")
      .select(sql<number>`COUNT(*)`.as("count"))
      .where("as_id", "=", row.as_id)
      .executeTakeFirst(),
  ]);

  return [
    {
      type: "substance",
      match_field: "cas_number",
      match_type: "exact_cas",
      entity: {
        ...row,
        category: categories?.category_name ?? null,
        country_count: Number(countryCounts?.count ?? 0),
      },
    },
  ];
}

async function searchByPcs(pcs: string): Promise<ProductResult[]> {
  const padded = pcs.padStart(5, "0");

  const row = await db
    .selectFrom("ie_products as ip")
    .leftJoin(
      "ie_product_substances as ips",
      "ip.product_id",
      "ips.product_id",
    )
    .select([
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
      sql<string>`string_agg(ips.substance_name, ', ')`.as(
        "substances_agg",
      ),
    ])
    .where((eb) =>
      eb.or([
        eb("ip.pcs_number", "=", pcs),
        eb("ip.pcs_number", "=", padded),
      ]),
    )
    .groupBy(["ip.product_name", "ip.pcs_number", "ip.auth_holder"])
    .executeTakeFirst();

  if (!row) return [];

  return [
    {
      type: "product",
      match_field: "pcs_number",
      match_type: "exact_number",
      entity: {
        product_name: row.product_name ?? "",
        country: "IE",
        identifier: row.pcs_number ?? "",
        auth_holder: row.auth_holder,
        status: "Authorised",
        substances: row.substances_agg
          ? row.substances_agg.split(", ")
          : [],
      },
    },
  ];
}

async function searchByAmm(amm: string): Promise<ProductResult[]> {
  const row = await db
    .selectFrom("fr_products as fp")
    .leftJoin(
      "fr_product_substances as fps",
      "fp.amm_number",
      "fps.amm_number",
    )
    .select([
      "fp.product_name",
      "fp.amm_number",
      "fp.titulaire",
      "fp.etat_autorisation",
      sql<string>`string_agg(fps.substance_name, ', ')`.as(
        "substances_agg",
      ),
    ])
    .where("fp.amm_number", "=", amm)
    .groupBy([
      "fp.product_name",
      "fp.amm_number",
      "fp.titulaire",
      "fp.etat_autorisation",
    ])
    .executeTakeFirst();

  if (!row) return [];

  return [
    {
      type: "product",
      match_field: "amm_number",
      match_type: "exact_number",
      entity: {
        product_name: row.product_name ?? "",
        country: "FR",
        identifier: row.amm_number ?? "",
        auth_holder: row.titulaire,
        status: row.etat_autorisation,
        substances: row.substances_agg
          ? row.substances_agg.split(", ")
          : [],
      },
    },
  ];
}

async function searchByAmmPrefix(
  prefix: string,
): Promise<ProductResult[]> {
  const rows = await db
    .selectFrom("fr_products as fp")
    .leftJoin(
      "fr_product_substances as fps",
      "fp.amm_number",
      "fps.amm_number",
    )
    .select([
      "fp.product_name",
      "fp.amm_number",
      "fp.titulaire",
      "fp.etat_autorisation",
      sql<string>`string_agg(fps.substance_name, ', ')`.as(
        "substances_agg",
      ),
    ])
    .where("fp.amm_number", "like", `${prefix}%`)
    .where("fp.type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ])
    .groupBy([
      "fp.product_name",
      "fp.amm_number",
      "fp.titulaire",
      "fp.etat_autorisation",
    ])
    .limit(3)
    .execute();

  return rows.map((r) => ({
    type: "product" as const,
    match_field: "amm_number" as MatchField,
    match_type: "prefix" as MatchType,
    entity: {
      product_name: r.product_name ?? "",
      country: "FR" as const,
      identifier: r.amm_number ?? "",
      auth_holder: r.titulaire,
      status: r.etat_autorisation,
      substances: r.substances_agg
        ? r.substances_agg.split(", ")
        : [],
    },
  }));
}
