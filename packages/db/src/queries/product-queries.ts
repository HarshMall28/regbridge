/**
 * product-queries.ts
 *
 * Product search and product detail query functions.
 *
 * searchProducts() — filtered search across IE and/or FR products
 * getProductDetail() — single product with all child tables
 *
 * Location: packages/api/src/queries/product-queries.ts
 */

import { db, sql } from "../connection";

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface ProductSearchParams {
  substance?: string;
  country?: "ie" | "fr" | "both";
  auth_holder?: string;
  status?: "active" | "withdrawn";
  crop?: string;
  limit?: number;
  offset?: number;
}

export interface ProductSearchResult {
  country: "ie" | "fr";
  product_name: string | null;
  product_id: string; // pcs_number (IE) or amm_number (FR)
  auth_holder: string | null;
  status: string | null;
  substances: string | null;
  fonctions: string | null;
}

export interface ProductSearchResponse {
  results: ProductSearchResult[];
  total_ie: number;
  total_fr: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Detail types
// ---------------------------------------------------------------------------

export interface IeProductDetail {
  country: "ie";
  product_name: string | null;
  pcs_number: string | null;
  auth_holder: string | null;
  marketing_company: string | null;
  product_type: string | null;
  function_name: string | null;
  user_type: string | null;
  substances: Array<{
    substance_name: string;
    concentration: string | null;
  }>;
  crops: string[];
  data_as_of: string | null;
}

export interface FrProductDetail {
  country: "fr";
  product_name: string | null;
  amm_number: string;
  type_produit: string | null;
  titulaire: string | null;
  type_commercial: string | null;
  gamme_usage: string | null;
  mentions_autorisees: string | null;
  restrictions_usage: string | null;
  restrictions_usage_libelle: string | null;
  fonctions: string | null;
  formulations: string | null;
  etat_autorisation: string | null;
  date_retrait: string | null;
  date_premiere_autorisation: string | null;
  amm_reference: string | null;
  nom_produit_reference: string | null;
  substances: Array<{
    substance_name: string;
    concentration: string | null;
  }>;
  authorized_uses: Array<{
    identifiant_usage: string | null;
    identifiant_usage_lib_court: string | null;
    etat_usage: string | null;
    dose_retenue: number | null;
    dose_unite: string | null;
    stade_cultural_min: string | null;
    stade_cultural_max: string | null;
    delai_recolte_jour: number | null;
    nombre_max_application: number | null;
    condition_emploi: string | null;
    znt_aquatique_m: number | null;
    znt_arthropodes_m: number | null;
    date_decision: string | null;
  }>;
  all_uses_count: number;
  hazard_classes: Array<{
    libelle_court: string | null;
    libelle_long: string | null;
  }>;
  conditions_of_use: Array<{
    categorie: string | null;
    condition_libelle: string | null;
  }>;
  risk_phrases: Array<{
    libelle_court: string | null;
    libelle_long: string | null;
  }>;
  parallel_trade: Array<{
    permis_number: string | null;
    etat_autorisation: string | null;
    detenteur_pcp: string | null;
    nom_produit_importe: string | null;
    etat_membre_origine: string | null;
  }>;
  data_as_of: string | null;
}

export type ProductDetail = IeProductDetail | FrProductDetail;

// ---------------------------------------------------------------------------
// Product search
// ---------------------------------------------------------------------------

export async function searchProducts(
  params: ProductSearchParams,
): Promise<ProductSearchResponse> {
  const country = params.country ?? "both";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const iePromise =
    country === "fr"
      ? Promise.resolve({
          results: [] as ProductSearchResult[],
          total: 0,
        })
      : searchIeProducts(params, limit, offset);

  const frPromise =
    country === "ie"
      ? Promise.resolve({
          results: [] as ProductSearchResult[],
          total: 0,
        })
      : searchFrProducts(params, limit, offset);

  const [ie, fr] = await Promise.all([iePromise, frPromise]);

  // When searching both countries, interleave results
  let results: ProductSearchResult[];
  if (country === "both") {
    results = [...ie.results, ...fr.results]
      .sort((a, b) =>
        (a.product_name ?? "").localeCompare(b.product_name ?? ""),
      )
      .slice(0, limit);
  } else {
    results = country === "ie" ? ie.results : fr.results;
  }

  return {
    results,
    total_ie: ie.total,
    total_fr: fr.total,
    limit,
    offset,
  };
}

async function searchIeProducts(
  params: ProductSearchParams,
  limit: number,
  offset: number,
): Promise<{ results: ProductSearchResult[]; total: number }> {
  // IE products are all authorized — withdrawn filter returns empty
  if (params.status === "withdrawn") {
    return { results: [], total: 0 };
  }

  let query = db
    .selectFrom("ie_products as ip")
    .select([
      "ip.product_id",
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
      "ip.function_name",
    ]);

  // Substance filter
  if (params.substance) {
    query = query
      .innerJoin(
        "ie_product_substances as ips",
        "ips.product_id",
        "ip.product_id",
      )
      .where(
        sql<boolean>`LOWER(ips.substance_name) = LOWER(${params.substance})`,
      ) as typeof query;
  }

  // Auth holder filter
  if (params.auth_holder) {
    query = query.where(
      sql<boolean>`ip.auth_holder ILIKE '%' || ${params.auth_holder} || '%'`,
    );
  }

  // Crop filter
  if (params.crop) {
    query = query.where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM ie_product_crops ipc
        WHERE ipc.product_id = ip.product_id
        AND ipc.crop_name ILIKE '%' || ${params.crop} || '%'
      )`,
    );
  }

  // Count total — separate query to avoid subquery alias issues with raw SQL
  let countQ = db
    .selectFrom("ie_products as ip")
    .select(
      sql<number>`count(DISTINCT ip.product_id)::int`.as("total"),
    );

  if (params.substance) {
    countQ = countQ
      .innerJoin(
        "ie_product_substances as ips",
        "ips.product_id",
        "ip.product_id",
      )
      .where(
        sql<boolean>`LOWER(ips.substance_name) = LOWER(${params.substance})`,
      ) as typeof countQ;
  }
  if (params.auth_holder) {
    countQ = countQ.where(
      sql<boolean>`ip.auth_holder ILIKE '%' || ${params.auth_holder} || '%'`,
    );
  }
  if (params.crop) {
    countQ = countQ.where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM ie_product_crops ipc
        WHERE ipc.product_id = ip.product_id
        AND ipc.crop_name ILIKE '%' || ${params.crop} || '%'
      )`,
    );
  }

  const countResult = await countQ.executeTakeFirst();
  const total = countResult?.total ?? 0;

  // Fetch paginated results
  const rows = await query
    .orderBy("ip.product_name")
    .limit(limit)
    .offset(offset)
    .execute();

  // Batch-fetch substances for all results
  const productIds = rows.map((r) => r.product_id);
  const substances =
    productIds.length > 0
      ? await db
          .selectFrom("ie_product_substances")
          .select(["product_id", "substance_name"])
          .where("product_id", "in", productIds)
          .execute()
      : [];

  const substancesByProduct = new Map<number, string[]>();
  for (const s of substances) {
    const existing = substancesByProduct.get(s.product_id) ?? [];
    existing.push(s.substance_name);
    substancesByProduct.set(s.product_id, existing);
  }

  const results: ProductSearchResult[] = rows.map((r) => ({
    country: "ie" as const,
    product_name: r.product_name,
    product_id: r.pcs_number ?? String(r.product_id),
    auth_holder: r.auth_holder,
    status: "Authorized",
    substances: (substancesByProduct.get(r.product_id) ?? []).join(
      ", ",
    ),
    fonctions: r.function_name,
  }));

  return { results, total };
}

async function searchFrProducts(
  params: ProductSearchParams,
  limit: number,
  offset: number,
): Promise<{ results: ProductSearchResult[]; total: number }> {
  let query = db
    .selectFrom("fr_products as fp")
    .select([
      "fp.amm_number",
      "fp.product_name",
      "fp.titulaire",
      "fp.etat_autorisation",
      "fp.fonctions",
    ])
    // Filter out MFSC fertilizers
    .where("fp.type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ]);

  // Substance filter
  if (params.substance) {
    query = query
      .innerJoin(
        "fr_product_substances as fps",
        "fps.amm_number",
        "fp.amm_number",
      )
      .where(
        sql<boolean>`fps.substance_name ILIKE '%(' || ${params.substance} || ')%'`,
      ) as typeof query;
  }

  // Auth holder filter
  if (params.auth_holder) {
    query = query.where(
      sql<boolean>`fp.titulaire ILIKE '%' || ${params.auth_holder} || '%'`,
    );
  }

  // Status filter
  if (params.status === "active") {
    query = query.where("fp.etat_autorisation", "=", "AUTORISE");
  } else if (params.status === "withdrawn") {
    query = query.where("fp.etat_autorisation", "=", "RETIRE");
  }

  // Count total — separate query to avoid subquery alias issues with raw SQL
  let countQ = db
    .selectFrom("fr_products as fp")
    .select(sql<number>`count(*)::int`.as("total"))
    .where("fp.type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ]);

  if (params.substance) {
    countQ = countQ
      .innerJoin(
        "fr_product_substances as fps",
        "fps.amm_number",
        "fp.amm_number",
      )
      .where(
        sql<boolean>`fps.substance_name ILIKE '%(' || ${params.substance} || ')%'`,
      ) as typeof countQ;
  }
  if (params.auth_holder) {
    countQ = countQ.where(
      sql<boolean>`fp.titulaire ILIKE '%' || ${params.auth_holder} || '%'`,
    );
  }
  if (params.status === "active") {
    countQ = countQ.where("fp.etat_autorisation", "=", "AUTORISE");
  } else if (params.status === "withdrawn") {
    countQ = countQ.where("fp.etat_autorisation", "=", "RETIRE");
  }

  const countResult = await countQ.executeTakeFirst();
  const total = countResult?.total ?? 0;

  // Fetch paginated results
  const rows = await query
    .orderBy("fp.product_name")
    .limit(limit)
    .offset(offset)
    .execute();

  // Batch-fetch substances for all results
  const ammNumbers = rows.map((r) => r.amm_number);
  const substances =
    ammNumbers.length > 0
      ? await db
          .selectFrom("fr_product_substances")
          .select(["amm_number", "substance_name"])
          .where("amm_number", "in", ammNumbers)
          .execute()
      : [];

  const substancesByAmm = new Map<string, string[]>();
  for (const s of substances) {
    const existing = substancesByAmm.get(s.amm_number) ?? [];
    existing.push(s.substance_name);
    substancesByAmm.set(s.amm_number, existing);
  }

  const results: ProductSearchResult[] = rows.map((r) => ({
    country: "fr" as const,
    product_name: r.product_name,
    product_id: r.amm_number,
    auth_holder: r.titulaire,
    status: r.etat_autorisation,
    substances: (substancesByAmm.get(r.amm_number) ?? []).join(", "),
    fonctions: r.fonctions,
  }));

  return { results, total };
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

export async function getProductDetail(
  country: "ie" | "fr",
  id: string,
): Promise<ProductDetail | null> {
  if (country === "ie") {
    return getIeProductDetail(id);
  }
  return getFrProductDetail(id);
}

async function getIeProductDetail(
  pcsNumber: string,
): Promise<IeProductDetail | null> {
  const product = await db
    .selectFrom("ie_products")
    .selectAll()
    .where("pcs_number", "=", pcsNumber)
    .executeTakeFirst();

  if (!product) return null;

  const [substances, crops] = await Promise.all([
    db
      .selectFrom("ie_product_substances")
      .select(["substance_name", "concentration"])
      .where("product_id", "=", product.product_id)
      .execute(),
    db
      .selectFrom("ie_product_crops")
      .select("crop_name")
      .where("product_id", "=", product.product_id)
      .orderBy("crop_name")
      .execute(),
  ]);

  return {
    country: "ie",
    product_name: product.product_name,
    pcs_number: product.pcs_number,
    auth_holder: product.auth_holder,
    marketing_company: product.marketing_company,
    product_type: product.product_type,
    function_name: product.function_name,
    user_type: product.user_type,
    substances: substances.map((s) => ({
      substance_name: s.substance_name,
      concentration: s.concentration,
    })),
    crops: crops.map((c) => c.crop_name),
    data_as_of: product.last_synced_at
      ? new Date(
          product.last_synced_at as unknown as string,
        ).toISOString()
      : null,
  };
}

async function getFrProductDetail(
  ammNumber: string,
): Promise<FrProductDetail | null> {
  const product = await db
    .selectFrom("fr_products")
    .selectAll()
    .where("amm_number", "=", ammNumber)
    .executeTakeFirst();

  if (!product) return null;

  // Fire all child table queries in parallel — all join on amm_number
  const [
    substances,
    authorizedUses,
    allUsesCount,
    hazardClasses,
    conditionsOfUse,
    riskPhrases,
    parallelTrade,
  ] = await Promise.all([
    db
      .selectFrom("fr_product_substances")
      .select(["substance_name", "concentration"])
      .where("amm_number", "=", ammNumber)
      .execute(),

    db
      .selectFrom("fr_authorized_uses")
      .select([
        "identifiant_usage",
        "identifiant_usage_lib_court",
        "etat_usage",
        "dose_retenue",
        "dose_unite",
        "stade_cultural_min",
        "stade_cultural_max",
        "delai_recolte_jour",
        "nombre_max_application",
        "condition_emploi",
        "znt_aquatique_m",
        "znt_arthropodes_m",
        "date_decision",
      ])
      .where("amm_number", "=", ammNumber)
      .orderBy("identifiant_usage")
      .execute(),

    // Count only for fr_all_uses (81K rows — don't fetch all rows)
    db
      .selectFrom("fr_all_uses")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("amm_number", "=", ammNumber)
      .executeTakeFirst(),

    db
      .selectFrom("fr_hazard_classes")
      .select(["libelle_court", "libelle_long"])
      .where("amm_number", "=", ammNumber)
      .execute(),

    db
      .selectFrom("fr_conditions_of_use")
      .select(["categorie", "condition_libelle"])
      .where("amm_number", "=", ammNumber)
      .orderBy("categorie")
      .execute(),

    db
      .selectFrom("fr_risk_phrases")
      .select(["libelle_court", "libelle_long"])
      .where("amm_number", "=", ammNumber)
      .execute(),

    // Parallel trade: joins on amm_reference_francais, not amm_number
    db
      .selectFrom("fr_parallel_trade")
      .select([
        "permis_number",
        "etat_autorisation",
        "detenteur_pcp",
        "nom_produit_importe",
        "etat_membre_origine",
      ])
      .where("amm_reference_francais", "=", ammNumber)
      .execute(),
  ]);

  return {
    country: "fr",
    product_name: product.product_name,
    amm_number: product.amm_number,
    type_produit: product.type_produit,
    titulaire: product.titulaire,
    type_commercial: product.type_commercial,
    gamme_usage: product.gamme_usage,
    mentions_autorisees: product.mentions_autorisees,
    restrictions_usage: product.restrictions_usage,
    restrictions_usage_libelle: product.restrictions_usage_libelle,
    fonctions: product.fonctions,
    formulations: product.formulations,
    etat_autorisation: product.etat_autorisation,
    date_retrait: product.date_retrait,
    date_premiere_autorisation: product.date_premiere_autorisation,
    amm_reference: product.amm_reference,
    nom_produit_reference: product.nom_produit_reference,
    substances: substances.map((s) => ({
      substance_name: s.substance_name,
      concentration: s.concentration,
    })),
    authorized_uses: authorizedUses.map((u) => ({
      identifiant_usage: u.identifiant_usage,
      identifiant_usage_lib_court: u.identifiant_usage_lib_court,
      etat_usage: u.etat_usage,
      dose_retenue: u.dose_retenue,
      dose_unite: u.dose_unite,
      stade_cultural_min: u.stade_cultural_min,
      stade_cultural_max: u.stade_cultural_max,
      delai_recolte_jour: u.delai_recolte_jour,
      nombre_max_application: u.nombre_max_application,
      condition_emploi: u.condition_emploi,
      znt_aquatique_m: u.znt_aquatique_m,
      znt_arthropodes_m: u.znt_arthropodes_m,
      date_decision: u.date_decision,
    })),
    all_uses_count: allUsesCount?.count ?? 0,
    hazard_classes: hazardClasses.map((h) => ({
      libelle_court: h.libelle_court,
      libelle_long: h.libelle_long,
    })),
    conditions_of_use: conditionsOfUse.map((c) => ({
      categorie: c.categorie,
      condition_libelle: c.condition_libelle,
    })),
    risk_phrases: riskPhrases.map((r) => ({
      libelle_court: r.libelle_court,
      libelle_long: r.libelle_long,
    })),
    parallel_trade: parallelTrade.map((p) => ({
      permis_number: p.permis_number,
      etat_autorisation: p.etat_autorisation,
      detenteur_pcp: p.detenteur_pcp,
      nom_produit_importe: p.nom_produit_importe,
      etat_membre_origine: p.etat_membre_origine,
    })),
    data_as_of: product.last_synced_at
      ? new Date(
          product.last_synced_at as unknown as string,
        ).toISOString()
      : null,
  };
}
