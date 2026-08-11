// ---------------------------------------------------------------------------
// Consolidated types for RegBridge web app
// Replaces: api.ts, api-company.ts, api-products.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Search types (from api.ts)
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: string;
  match_field: string;
  match_type: string;
  entity: any;
}

// ---------------------------------------------------------------------------
// Substance Profile types (from api.ts)
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
  categories: { code: string; name: string | null }[];
  countries: { country_code: string; country_name: string | null }[];
  country_count: number;
  tox_eu: {
    adi: ToxValue;
    arfd: ToxValue;
    aoel: ToxValue;
    aaoel: ToxValue;
  };
  tox_oft: ToxOftEntry[];
  genotoxicity: {
    conclusion: string | null;
    in_vitro_link: string | null;
    in_vivo_link: string | null;
  };
  metabolites: {
    name: string | null;
    uuid: string | null;
    remarks: string | null;
  }[];
  documents: {
    filename: string | null;
    document_type: string | null;
    description: string | null;
    source_url: string | null;
  }[];
  dossiers: {
    efsa_question_number: string | null;
    output_title: string | null;
    doi: string | null;
    evaluation_date: string | null;
    output_type: string | null;
    docs: {
      document_type: string | null;
      document_subtype: string | null;
    }[];
  }[];
  emergency_auths: EmergencyAuth[];
  emergency_auth_count: number;
  ie_products: IeProduct[];
  ie_product_count: number;
  fr_products: FrProduct[];
  fr_product_count: number;
  group: {
    is_group: boolean;
    part_of_group: boolean;
    group_id: number | null;
    members: { as_id: number; name: string | null }[];
  };
  legislation: {
    active: string | null;
    residue_linked: string | null;
    mrl_webpage: string | null;
  };
  data_as_of: string | null;
}

export interface ToxValue {
  value: string | null;
  source: string | null;
  remark: string | null;
}

export interface ToxOftEntry {
  endpoint_type: string | null;
  value_lower: number | null;
  value_upper: number | null;
  unit: string | null;
  assessment_body: string | null;
  critical_endpoint: string | null;
  justification: string | null;
  not_allocated: boolean | null;
  population: string | null;
}

export interface EmergencyAuth {
  id: number;
  country_code: string | null;
  country_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  auth_holder: string | null;
  trade_names: any;
  crop_eppo_names: any;
}

export interface IeProduct {
  product_name: string | null;
  pcs_number: string | null;
  auth_holder: string | null;
  substances: string | null;
  crops: string | null;
}

export interface FrProduct {
  product_name: string | null;
  amm_number: string;
  titulaire: string | null;
  etat_autorisation: string | null;
  substances: string | null;
  fonctions: string | null;
}

export interface ProductSearchResponse {
  results: {
    country: string;
    product_name: string | null;
    product_id: string;
    auth_holder: string | null;
    status: string | null;
    substances: string | null;
    fonctions: string | null;
  }[];
  total_ie: number;
  total_fr: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Company types (from api-company.ts)
// ---------------------------------------------------------------------------

export interface CompanySubstance {
  name: string;
  product_count: number;
}

export interface CompanyFunction {
  name: string;
  ie_count: number;
  fr_count: number;
  total: number;
}

export interface CompanyIeProduct {
  product_name: string | null;
  pcs_number: string | null;
  function_name: string | null;
  substances: string[];
}

export interface CompanyFrProduct {
  product_name: string | null;
  amm_number: string;
  fonctions: string | null;
  etat_autorisation: string | null;
  substances: string[];
}

export interface CompanyProfile {
  name: string;
  total_products: number;
  ie_product_count: number;
  fr_product_count: number;
  substance_count: number;
  substances: CompanySubstance[];
  functions: CompanyFunction[];
  ie_products: CompanyIeProduct[];
  fr_products: CompanyFrProduct[];
}

// ---------------------------------------------------------------------------
// Product types (from api-products.ts)
// ---------------------------------------------------------------------------

export interface ProductSearchParams {
  country?: "ie" | "fr" | "both";
  auth_holder?: string;
  substance?: string;
  status?: "active" | "withdrawn";
  crop?: string;
  limit?: number;
  offset?: number;
}

export interface ProductSearchResult {
  country: "ie" | "fr";
  product_name: string;
  product_id: string; // PCS number (IE) or AMM number (FR)
  auth_holder: string;
  status: string;
  substances: string | null;
  fonctions: string | null;
}

// ---------------------------------------------------------------------------
// Types — IE Product Detail
// ---------------------------------------------------------------------------

export interface IeProductDetail {
  country: "ie";
  product_name: string;
  pcs_number: string;
  auth_holder: string;
  marketing_company: string;
  product_type: string;
  function_name: string;
  user_type: string;
  substances: {
    substance_name: string;
    concentration: string | null;
  }[];
  crops: string[];
  data_as_of: string;
}

// ---------------------------------------------------------------------------
// Types — FR Product Detail
// ---------------------------------------------------------------------------

export interface FrSubstance {
  substance_name: string;
  concentration: string | null;
}

export interface FrAuthorizedUse {
  identifiant_usage: string;
  identifiant_usage_lib_court: string | null;
  etat_usage: string | null;
  dose_retenue: string | number | null;
  dose_unite: string | null;
  stade_cultural_min: string | null;
  stade_cultural_max: string | null;
  delai_recolte_jour: number | null;
  nombre_max_application: number | null;
  condition_emploi: string | null;
  znt_aquatique_m: number | null;
  znt_arthropodes_m: number | null;
  date_decision: string | null;
}

export interface FrHazardClass {
  libelle_court: string;
  libelle_long: string;
}

export interface FrConditionOfUse {
  categorie: string;
  condition_libelle: string;
}

export interface FrRiskPhrase {
  libelle_court: string;
  libelle_long: string;
}

export interface FrParallelTrade {
  permis_number: string;
  etat_autorisation: string | null;
  detenteur_pcp: string | null;
  nom_produit_importe: string | null;
  etat_membre_origine: string | null;
}

export interface FrProductDetail {
  country: "fr";
  product_name: string;
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
  substances: FrSubstance[];
  authorized_uses: FrAuthorizedUse[];
  all_uses_count: number;
  hazard_classes: FrHazardClass[];
  conditions_of_use: FrConditionOfUse[];
  risk_phrases: FrRiskPhrase[];
  parallel_trade: FrParallelTrade[];
  data_as_of: string;
}

export type ProductDetail = IeProductDetail | FrProductDetail;

// ---------------------------------------------------------------------------
// Helper functions (from api-products.ts)
// ---------------------------------------------------------------------------

export function countryFlag(country: string): string {
  return country === "ie" ? "🇮🇪" : country === "fr" ? "🇫🇷" : "";
}

export function countryLabel(country: string): string {
  return country === "ie"
    ? "Ireland"
    : country === "fr"
      ? "France"
      : country;
}
