// ---------------------------------------------------------------------------
// Shared response types for RegBridge API consumers
// ---------------------------------------------------------------------------

// -- Search (palette) --
export interface SubstanceSearchEntity {
  as_id: number;
  name: string;
  cas_number: string | null;
  status: string | null;
  expiry_dt: string | null;
  candidate_for_substitution: boolean | null;
  category: string | null;
  country_count: number;
}

export interface ProductSearchEntity {
  product_name: string;
  country: string;
  identifier: string;
  auth_holder: string | null;
  status: string | null;
  substances: string[];
}

export interface SearchResult {
  type: "substance" | "product";
  match_field: string;
  match_type: string;
  entity: SubstanceSearchEntity | ProductSearchEntity;
}

// -- Substance Profile --
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
  trade_names: string[] | null;
  crop_eppo_names: string[] | null;
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

// -- Products --
export interface ProductSearchParams {
  q?: string;
  substance?: string;
  country?: "ie" | "fr" | "both";
  auth_holder?: string;
  status?: "active" | "withdrawn";
  crop?: string;
  limit?: number;
  offset?: number;
}

export interface ProductSearchResponse {
  results: {
    country: "ie" | "fr";
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

export interface IeProductDetail {
  country: "ie";
  product_name: string | null;
  pcs_number: string | null;
  auth_holder: string | null;
  marketing_company: string | null;
  product_type: string | null;
  function_name: string | null;
  user_type: string | null;
  substances: {
    substance_name: string;
    concentration: string | null;
  }[];
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
  substances: {
    substance_name: string;
    concentration: string | null;
  }[];
  authorized_uses: {
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
  }[];
  all_uses_count: number;
  hazard_classes: {
    libelle_court: string | null;
    libelle_long: string | null;
  }[];
  conditions_of_use: {
    categorie: string | null;
    condition_libelle: string | null;
  }[];
  risk_phrases: {
    libelle_court: string | null;
    libelle_long: string | null;
  }[];
  parallel_trade: {
    permis_number: string | null;
    etat_autorisation: string | null;
    detenteur_pcp: string | null;
    nom_produit_importe: string | null;
    etat_membre_origine: string | null;
  }[];
  data_as_of: string | null;
}

export type ProductDetail = IeProductDetail | FrProductDetail;

// -- Company --
export interface CompanyProfile {
  name: string;
  total_products: number;
  ie_product_count: number;
  fr_product_count: number;
  substance_count: number;
  substances: { name: string; product_count: number }[];
  functions: {
    name: string;
    ie_count: number;
    fr_count: number;
    total: number;
  }[];
  ie_products: {
    product_name: string | null;
    pcs_number: string | null;
    function_name: string | null;
    substances: string[];
  }[];
  fr_products: {
    product_name: string | null;
    amm_number: string;
    fonctions: string | null;
    etat_autorisation: string | null;
    substances: string[];
  }[];
}

// -- MRL --
export interface MrlCheckParams {
  substance: string;
  commodity: string;
  value?: number;
}

export interface MrlCheckResponse {
  substance: {
    as_id: number;
    name: string;
    cas_number: string | null;
  };
  residue_definition: {
    residue_id: number | null;
    residue_name: string | null;
    footnote: string | null;
  } | null;
  mrl_type: "default" | "specific" | "unresolved";
  default_mrl?: {
    value: number;
    unit: "mg/kg";
    regulation_text: string;
  };
  commodity_results?: {
    commodity_id: number;
    product_name: string | null;
    product_code: string | null;
    parent_id: number | null;
    mrl: {
      value: number;
      display: string;
      is_lod: boolean;
      unit: "mg/kg";
      regulation_number: string | null;
      regulation_url: string | null;
      applicability: "current" | "future" | "previous";
      application_date: string | null;
      footnote: string | null;
    } | null;
    inherited_from_parent: boolean;
    parent_name: string | null;
  }[];
  compliance?: {
    tested_value: number;
    compliant: boolean;
    margin: number;
  };
  data_as_of: string;
  source: "EU Pesticides Database";
  disclaimer: string;
}

// -- Tables / Explore --
export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
}

export interface SchemaResult {
  table: string;
  columns: ColumnInfo[];
  row_count: number;
}

export interface ExploreResult {
  table: string;
  rows: Record<string, string | number | boolean | null>[];
  total: number;
  limit: number;
  offset: number;
  filters_applied: string[];
}

export interface ListTablesResponse {
  tables: string[];
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}
