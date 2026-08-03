/**
 * substance-profile.ts
 *
 * Full substance profile query — the click-through from the palette substance card.
 * Takes any identifier (as_id, CAS, name). Resolves via resolveSubstance(),
 * then fires 3 parallel query tiers (EU, OFT, national products) to build
 * the complete regulatory profile.
 *
 * Location: packages/api/src/queries/substance-profile.ts
 */

import { db, sql } from "../connection";
import { resolveSubstance } from "./resolve-substance";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface SubstanceProfile {
  identity: {
    as_id: number;
    name: string;
    cas_number: string | null;
    status: string | null;
    expiry_dt: string | null;
    approval_dt: string | null;
    candidate_for_substitution: boolean | null;
    candidate_for_substitution_type: string | null;
    is_microorganism: boolean | null;
    low_risk: boolean | null;
    basic_substance: boolean | null;
    rms: string | null;
    corms: string | null;
  };

  categories: Array<{ code: string; name: string | null }>;

  countries: Array<{
    country_code: string;
    country_name: string | null;
  }>;
  country_count: number;

  tox_eu: {
    adi: ToxEuValue;
    arfd: ToxEuValue;
    aoel: ToxEuValue;
    aaoel: ToxEuValue;
  };

  tox_oft: Array<{
    endpoint_type: string | null;
    value_lower: number | null;
    value_upper: number | null;
    unit: string | null;
    assessment_body: string | null;
    critical_endpoint: string | null;
    justification: string | null;
    not_allocated: boolean | null;
    population: string | null;
  }>;

  genotoxicity: {
    conclusion: string | null;
    in_vitro_link: string | null;
    in_vivo_link: string | null;
  };

  metabolites: Array<{
    name: string | null;
    uuid: string | null;
    remarks: string | null;
  }>;

  documents: Array<{
    filename: string | null;
    document_type: string | null;
    description: string | null;
    source_url: string | null;
  }>;

  dossiers: Array<{
    efsa_question_number: string | null;
    output_title: string | null;
    doi: string | null;
    evaluation_date: string | null;
    output_type: string | null;
    docs: Array<{
      document_type: string | null;
      document_subtype: string | null;
    }>;
  }>;

  emergency_auths: Array<{
    id: number;
    country_code: string | null;
    country_name: string | null;
    valid_from: string | null;
    valid_until: string | null;
    auth_holder: string | null;
    trade_names: unknown;
    crop_eppo_names: unknown;
  }>;
  emergency_auth_count: number;

  ie_products: Array<{
    product_name: string | null;
    pcs_number: string | null;
    auth_holder: string | null;
    substances: string | null;
    crops: string | null;
  }>;
  ie_product_count: number;

  fr_products: Array<{
    product_name: string | null;
    amm_number: string;
    titulaire: string | null;
    etat_autorisation: string | null;
    substances: string | null;
    fonctions: string | null;
  }>;
  fr_product_count: number;

  group: {
    is_group: boolean;
    part_of_group: boolean;
    group_id: number | null;
    members: Array<{ as_id: number; name: string | null }>;
  };

  legislation: {
    active: string | null;
    residue_linked: string | null;
    mrl_webpage: string | null;
  };

  data_as_of: string | null;
}

interface ToxEuValue {
  value: string | null;
  source: string | null;
  remark: string | null;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function getSubstanceProfile(
  input: string,
): Promise<SubstanceProfile | null> {
  // Step 1: resolve input to canonical substance
  const resolved = await resolveSubstance(input);
  if (!resolved) return null;

  const asId = resolved.as_id;
  const casNumber = resolved.cas_number;

  // Step 2: fetch the full row from eu_active_substances (needed for
  // identity fields, tox_eu, legislation — cheap PK lookup)
  const core = await db
    .selectFrom("eu_active_substances")
    .selectAll()
    .where("as_id", "=", asId)
    .executeTakeFirst();

  if (!core) return null;

  // Step 3: fire all independent queries in parallel across 3 tiers
  const [
    categories,
    countries,
    documents,
    groupMembers,
    emergencyAuths,
    oftChain,
    ieProducts,
    frProducts,
  ] = await Promise.all([
    // --- EU tier ---
    fetchCategories(asId),
    fetchCountries(asId),
    fetchDocuments(asId),
    fetchGroupMembers(
      asId,
      core.is_group ?? false,
      core.part_of_group_id,
    ),
    fetchEmergencyAuths(asId),

    // --- OFT tier (CAS-based chain) ---
    fetchOftData(casNumber),

    // --- National products tier ---
    fetchIeProducts(core.name),
    fetchFrProducts(core.name),
  ]);

  // Step 4: assemble response
  const profile: SubstanceProfile = {
    identity: {
      as_id: core.as_id,
      name: core.name,
      cas_number: core.cas_number,
      status: core.status,
      expiry_dt: core.expiry_dt,
      approval_dt: core.approval_dt,
      candidate_for_substitution: core.candidate_for_substitution,
      candidate_for_substitution_type:
        core.candidate_for_substitution_type,
      is_microorganism: core.is_microorganism,
      low_risk: core.low_risk,
      basic_substance: core.basic_substance,
      rms: core.rms,
      corms: core.corms,
    },

    categories: categories.map((c) => ({
      code: c.category_code,
      name: c.category_name,
    })),

    countries,
    country_count: countries.length,

    tox_eu: {
      adi: {
        value: core.tox_value_adi,
        source: core.tox_source_adi,
        remark: core.tox_remark_adi,
      },
      arfd: {
        value: core.tox_value_arfd,
        source: core.tox_source_arfd,
        remark: core.tox_remark_arfd,
      },
      aoel: {
        value: core.tox_value_aoel,
        source: core.tox_source_aoel,
        remark: core.tox_remark_aoel,
      },
      aaoel: {
        value: core.tox_value_aaoel,
        source: core.tox_source_aaoel,
        remark: core.tox_remark_aaoel,
      },
    },

    tox_oft: oftChain.toxRefValues,
    genotoxicity: oftChain.genotoxicity,
    metabolites: oftChain.metabolites,
    dossiers: oftChain.dossiers,

    documents: documents.map((d) => ({
      filename: d.filename,
      document_type: d.document_type,
      description: d.description,
      source_url: d.source_url,
    })),

    emergency_auths: emergencyAuths,
    emergency_auth_count: emergencyAuths.length,

    ie_products: ieProducts.products,
    ie_product_count: ieProducts.count,

    fr_products: frProducts.products,
    fr_product_count: frProducts.count,

    group: {
      is_group: core.is_group ?? false,
      part_of_group: core.part_of_group ?? false,
      group_id: core.part_of_group_id,
      members: groupMembers,
    },

    legislation: {
      active: core.legislations_actives,
      residue_linked: core.pest_res_linked_legislation,
      mrl_webpage: core.pest_res_mrl_webpage,
    },

    data_as_of: core.last_synced_at
      ? new Date(
          core.last_synced_at as unknown as string,
        ).toISOString()
      : null,
  };

  return profile;
}

// ---------------------------------------------------------------------------
// EU tier queries
// ---------------------------------------------------------------------------

async function fetchCategories(asId: number) {
  return db
    .selectFrom("eu_substance_categories")
    .select(["category_code", "category_name"])
    .where("as_id", "=", asId)
    .execute();
}

async function fetchCountries(asId: number) {
  return db
    .selectFrom("eu_country_authorizations as eca")
    .innerJoin("countries as c", "c.country_code", "eca.country_code")
    .select(["eca.country_code", "c.country_name"])
    .where("eca.as_id", "=", asId)
    .orderBy("c.country_name")
    .execute();
}

async function fetchDocuments(asId: number) {
  return db
    .selectFrom("eu_substance_documents")
    .select([
      "filename",
      "document_type",
      "description",
      "source_url",
    ])
    .where("as_id", "=", asId)
    .execute();
}

async function fetchGroupMembers(
  asId: number,
  isGroup: boolean,
  partOfGroupId: number | null | undefined,
): Promise<Array<{ as_id: number; name: string | null }>> {
  if (isGroup) {
    const rows = await db
      .selectFrom("eu_substance_group_members")
      .select(["member_as_id as as_id", "member_name as name"])
      .where("group_as_id", "=", asId)
      .execute();
    return rows as Array<{ as_id: number; name: string | null }>;
  }

  if (partOfGroupId) {
    const rows = await db
      .selectFrom("eu_substance_group_members")
      .select(["member_as_id as as_id", "member_name as name"])
      .where("group_as_id", "=", partOfGroupId)
      .execute();
    return rows as Array<{ as_id: number; name: string | null }>;
  }

  return [];
}

async function fetchEmergencyAuths(asId: number) {
  const rows = await db
    .selectFrom("eu_emergency_authorisations")
    .select([
      "id",
      "country_code",
      "country_name",
      "valid_from",
      "valid_until",
      "auth_holder",
      "trade_names",
      "crop_eppo_names",
    ])
    .where(
      sql<boolean>`active_substance_ids @> ${JSON.stringify([asId])}::jsonb`,
    )
    .orderBy("valid_from", "desc")
    .execute();

  return rows.map((r) => ({
    id: r.id,
    country_code: r.country_code,
    country_name: r.country_name,
    valid_from: r.valid_from,
    valid_until: r.valid_until,
    auth_holder: r.auth_holder,
    trade_names: r.trade_names,
    crop_eppo_names: r.crop_eppo_names,
  }));
}

// ---------------------------------------------------------------------------
// OFT tier queries (CAS → ref_substance → substance → children)
// ---------------------------------------------------------------------------

interface OftData {
  toxRefValues: SubstanceProfile["tox_oft"];
  genotoxicity: SubstanceProfile["genotoxicity"];
  metabolites: SubstanceProfile["metabolites"];
  dossiers: SubstanceProfile["dossiers"];
}

async function fetchOftData(
  casNumber: string | null,
): Promise<OftData> {
  const empty: OftData = {
    toxRefValues: [],
    genotoxicity: {
      conclusion: null,
      in_vitro_link: null,
      in_vivo_link: null,
    },
    metabolites: [],
    dossiers: [],
  };

  if (
    !casNumber ||
    casNumber === "No CAS allocated" ||
    casNumber === "See note"
  ) {
    return empty;
  }

  // Step 1: CAS → reference substance UUID
  const refSub = await db
    .selectFrom("oft_reference_substances")
    .select("uuid")
    .where("cas_number", "=", casNumber)
    .executeTakeFirst();

  if (!refSub) return empty;

  // Step 2: reference substance UUID → substance UUID
  const oftSub = await db
    .selectFrom("oft_substances")
    .select("uuid")
    .where("ref_substance_uuid", "=", refSub.uuid)
    .executeTakeFirst();

  if (!oftSub) return empty;

  const substanceUuid = oftSub.uuid;

  // Step 3: fire all OFT child queries in parallel
  const [toxRefValues, endpointSummaries, metabolites, dossiers] =
    await Promise.all([
      // Tox reference values (ADI, ARfD, AOEL from OFT)
      db
        .selectFrom("oft_tox_ref_values")
        .select([
          "endpoint_type",
          "value_lower",
          "value_upper",
          "unit",
          "assessment_body",
          "critical_endpoint",
          "justification",
          "not_allocated",
          "population",
        ])
        .where("substance_uuid", "=", substanceUuid)
        .execute(),

      // Endpoint summaries (genotoxicity) — real data is in key_information,
      // NOT the formal genotox_in_vitro/genotox_in_vivo fields (mostly null in OFT 3.0)
      db
        .selectFrom("oft_endpoint_summaries")
        .select([
          "key_information",
          "genotox_in_vitro_study_link",
          "genotox_in_vivo_study_link",
        ])
        .where("substance_uuid", "=", substanceUuid)
        .where("definition", "=", "ENDPOINT_SUMMARY.GeneticToxicity")
        .execute(),

      // Metabolites
      db
        .selectFrom("oft_metabolites as m")
        .leftJoin(
          "oft_reference_substances as rs",
          "rs.uuid",
          "m.metabolite_substance_uuid",
        )
        .select([
          "rs.reference_substance_name as name",
          "m.metabolite_uuid as uuid",
          "m.remarks",
        ])
        .where("m.parent_substance_uuid", "=", substanceUuid)
        .execute(),

      // Dossiers + their docs
      fetchOftDossiers(substanceUuid),
    ]);

  // Build genotoxicity conclusion from key_information field
  // (formal genotox_in_vitro/genotox_in_vivo fields are mostly null in OFT 3.0)
  let genotoxConclusion: string | null = null;
  let inVitroLink: string | null = null;
  let inVivoLink: string | null = null;

  if (endpointSummaries.length > 0) {
    const conclusions = endpointSummaries
      .map((r) => r.key_information)
      .filter(Boolean);
    genotoxConclusion =
      conclusions.length > 0 ? conclusions.join("; ") : null;
    inVitroLink =
      endpointSummaries.find((r) => r.genotox_in_vitro_study_link)
        ?.genotox_in_vitro_study_link ?? null;
    inVivoLink =
      endpointSummaries.find((r) => r.genotox_in_vivo_study_link)
        ?.genotox_in_vivo_study_link ?? null;
  }

  return {
    toxRefValues,
    genotoxicity: {
      conclusion: genotoxConclusion,
      in_vitro_link: inVitroLink,
      in_vivo_link: inVivoLink,
    },
    metabolites: metabolites.map((m) => ({
      name: m.name,
      uuid: m.uuid,
      remarks: m.remarks,
    })),
    dossiers,
  };
}

async function fetchOftDossiers(
  substanceUuid: string,
): Promise<SubstanceProfile["dossiers"]> {
  const dossiers = await db
    .selectFrom("oft_dossiers")
    .select([
      "uuid",
      "efsa_question_number",
      "output_title",
      "doi",
      "evaluation_date",
      "output_type",
    ])
    .where("substance_uuid", "=", substanceUuid)
    .orderBy("evaluation_date", "desc")
    .execute();

  if (dossiers.length === 0) return [];

  // Batch-fetch all docs for all dossiers in one query
  const dossierUuids = dossiers.map((d) => d.uuid);
  const allDocs = await db
    .selectFrom("oft_dossier_docs")
    .select(["dossier_uuid", "document_type", "document_subtype"])
    .where("dossier_uuid", "in", dossierUuids)
    .execute();

  // Group docs by dossier UUID
  const docsByDossier = new Map<
    string,
    Array<{
      document_type: string | null;
      document_subtype: string | null;
    }>
  >();
  for (const doc of allDocs) {
    if (!doc.dossier_uuid) continue;
    const existing = docsByDossier.get(doc.dossier_uuid) ?? [];
    existing.push({
      document_type: doc.document_type,
      document_subtype: doc.document_subtype,
    });
    docsByDossier.set(doc.dossier_uuid, existing);
  }

  return dossiers.map((d) => ({
    efsa_question_number: d.efsa_question_number,
    output_title: d.output_title,
    doi: d.doi,
    evaluation_date: d.evaluation_date,
    output_type: d.output_type,
    docs: docsByDossier.get(d.uuid) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// National products tier
// ---------------------------------------------------------------------------

interface IeProductResult {
  products: SubstanceProfile["ie_products"];
  count: number;
}

async function fetchIeProducts(
  substanceName: string,
): Promise<IeProductResult> {
  const rows = await db
    .selectFrom("ie_product_substances as ips")
    .innerJoin("ie_products as ip", "ip.product_id", "ips.product_id")
    .leftJoin(
      "ie_product_crops as ipc",
      "ipc.product_id",
      "ip.product_id",
    )
    .select([
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
      "ip.product_id",
    ])
    .select(
      sql<string>`string_agg(DISTINCT ips.substance_name, ', ')`.as(
        "substances",
      ),
    )
    .select(
      sql<string>`string_agg(DISTINCT ipc.crop_name, ', ')`.as(
        "crops",
      ),
    )
    .where(
      sql`LOWER(ips.substance_name)`,
      "=",
      substanceName.toLowerCase(),
    )
    .groupBy([
      "ip.product_id",
      "ip.product_name",
      "ip.pcs_number",
      "ip.auth_holder",
    ])
    .execute();

  if (rows.length === 0) return { products: [], count: 0 };

  // Get ALL substances per matched product (the join above only shows
  // the matched substance; multi-substance products need a second query)
  const productIds = rows.map((r) => r.product_id);
  const allSubstances = await db
    .selectFrom("ie_product_substances")
    .select(["product_id", "substance_name"])
    .where("product_id", "in", productIds)
    .execute();

  const substancesByProduct = new Map<number, string[]>();
  for (const s of allSubstances) {
    const existing = substancesByProduct.get(s.product_id) ?? [];
    existing.push(s.substance_name);
    substancesByProduct.set(s.product_id, existing);
  }

  const products = rows.map((r) => ({
    product_name: r.product_name,
    pcs_number: r.pcs_number,
    auth_holder: r.auth_holder,
    substances: (substancesByProduct.get(r.product_id) ?? []).join(
      ", ",
    ),
    crops: r.crops,
  }));

  return { products, count: products.length };
}

interface FrProductResult {
  products: SubstanceProfile["fr_products"];
  count: number;
}

async function fetchFrProducts(
  substanceName: string,
): Promise<FrProductResult> {
  const rows = await db
    .selectFrom("fr_product_substances as fps")
    .innerJoin("fr_products as fp", "fp.amm_number", "fps.amm_number")
    .select([
      "fp.product_name",
      "fp.amm_number",
      "fp.titulaire",
      "fp.etat_autorisation",
      "fp.fonctions",
    ])
    .select(
      sql<string>`string_agg(DISTINCT fps.substance_name, ', ')`.as(
        "substances",
      ),
    )
    .where(
      sql<boolean>`fps.substance_name ILIKE '%(' || ${substanceName} || ')%'`,
    )
    .where("fp.type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ])
    .groupBy([
      "fp.amm_number",
      "fp.product_name",
      "fp.titulaire",
      "fp.etat_autorisation",
      "fp.fonctions",
    ])
    .execute();

  if (rows.length === 0) return { products: [], count: 0 };

  // Get ALL substances per matched product
  const ammNumbers = rows.map((r) => r.amm_number);
  const allSubstances = await db
    .selectFrom("fr_product_substances")
    .select(["amm_number", "substance_name"])
    .where("amm_number", "in", ammNumbers)
    .execute();

  const substancesByAmm = new Map<string, string[]>();
  for (const s of allSubstances) {
    const existing = substancesByAmm.get(s.amm_number) ?? [];
    existing.push(s.substance_name);
    substancesByAmm.set(s.amm_number, existing);
  }

  const products = rows.map((r) => ({
    product_name: r.product_name,
    amm_number: r.amm_number,
    titulaire: r.titulaire,
    etat_autorisation: r.etat_autorisation,
    substances: (substancesByAmm.get(r.amm_number) ?? []).join(", "),
    fonctions: r.fonctions,
  }));

  return { products, count: products.length };
}
