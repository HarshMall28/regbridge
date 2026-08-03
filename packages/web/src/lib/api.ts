// ---------------------------------------------------------------------------
// API client for RegBridge backend
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  throw new Error(
    "VITE_API_URL is not set. Add it to .env.development (e.g. http://localhost:3000)",
  );
}

const HEADERS: HeadersInit = {
  Accept: "application/json",
};

// ---------------------------------------------------------------------------
// Fetch wrapper
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

async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

export function searchPalette(q: string, limit = 12) {
  return apiFetch<SearchResult[]>("/api/search", {
    q,
    limit: String(limit),
  });
}

export function getSubstanceProfile(identifier: string) {
  return apiFetch<SubstanceProfile>(
    `/api/substances/${encodeURIComponent(identifier)}`,
  );
}

export function searchProducts(params: {
  substance?: string;
  country?: string;
  auth_holder?: string;
  limit?: number;
  offset?: number;
}) {
  const p: Record<string, string> = {};
  if (params.substance) p.substance = params.substance;
  if (params.country) p.country = params.country;
  if (params.auth_holder) p.auth_holder = params.auth_holder;
  if (params.limit) p.limit = String(params.limit);
  if (params.offset) p.offset = String(params.offset);
  return apiFetch<ProductSearchResponse>("/api/products", p);
}

export function getProductDetail(country: string, id: string) {
  return apiFetch<any>(
    `/api/products/${country}/${encodeURIComponent(id)}`,
  );
}

export function checkMrl(params: {
  substance: string;
  commodity: string;
  value?: number;
}) {
  const p: Record<string, string> = {
    substance: params.substance,
    commodity: params.commodity,
  };
  if (params.value !== undefined) p.value = String(params.value);
  return apiFetch<any>("/api/mrls/check", p);
}

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const qk = {
  search: (q: string) => ["search", q] as const,
  substance: (id: string) => ["substance", id] as const,
  products: (p: Record<string, string>) => ["products", p] as const,
  product: (country: string, id: string) =>
    ["product", country, id] as const,
  mrl: (substance: string, commodity: string) =>
    ["mrl", substance, commodity] as const,
  companyProducts: (name: string, offset: number) =>
    ["company-products", name, offset] as const,
};

// ---------------------------------------------------------------------------
// Types (matching API response shapes)
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: string;
  match_field: string;
  match_type: string;
  entity: any;
}

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
