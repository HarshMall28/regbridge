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
// Fetch
// ---------------------------------------------------------------------------

const API_BASE =
  typeof window !== "undefined"
    ? ((import.meta as any).env?.VITE_API_URL ?? "")
    : "";

export async function fetchCompany(
  name: string,
): Promise<CompanyProfile> {
  const res = await fetch(
    `${API_BASE}/api/companies/${encodeURIComponent(name)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
