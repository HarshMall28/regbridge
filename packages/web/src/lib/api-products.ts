/**
 * Product-specific API types and fetch functions.
 * Extends the existing api.ts pattern. Merge into api.ts or import alongside it.
 *
 * Depends on: apiFetch<T>() and qk from your existing api.ts
 */

// ---------------------------------------------------------------------------
// Types — Product Search
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

export interface ProductSearchResponse {
  results: ProductSearchResult[];
  total_ie: number;
  total_fr: number;
  limit: number;
  offset: number;
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
  substances: { substance_name: string; concentration: string | null }[];
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
// Query key factories (merge into your existing qk object)
// ---------------------------------------------------------------------------

export const productKeys = {
  search: (params: ProductSearchParams) =>
    ["products", "search", params] as const,
  detail: (country: string, id: string) =>
    ["products", "detail", country, id] as const,
};

// ---------------------------------------------------------------------------
// Fetch functions (use your existing apiFetch wrapper)
// ---------------------------------------------------------------------------

/**
 * Replace API_BASE with your VITE_API_URL or import apiFetch from api.ts.
 * These are standalone for portability — wire into your existing apiFetch.
 */

const API_BASE =
  typeof window !== "undefined"
    ? (import.meta as any).env?.VITE_API_URL ?? ""
    : "";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

export async function searchProducts(
  params: ProductSearchParams
): Promise<ProductSearchResponse> {
  const qs = new URLSearchParams();
  if (params.country && params.country !== "both")
    qs.set("country", params.country);
  if (params.auth_holder) qs.set("auth_holder", params.auth_holder);
  if (params.substance) qs.set("substance", params.substance);
  if (params.status) qs.set("status", params.status);
  if (params.crop) qs.set("crop", params.crop);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return apiFetch<ProductSearchResponse>(`/api/products?${qs.toString()}`);
}

export async function getProductDetail(
  country: string,
  id: string
): Promise<ProductDetail> {
  return apiFetch<ProductDetail>(`/api/products/${country}/${id}`);
}

// ---------------------------------------------------------------------------
// Country flag helper
// ---------------------------------------------------------------------------

export function countryFlag(country: string): string {
  return country === "ie" ? "🇮🇪" : country === "fr" ? "🇫🇷" : "";
}

export function countryLabel(country: string): string {
  return country === "ie" ? "Ireland" : country === "fr" ? "France" : country;
}
