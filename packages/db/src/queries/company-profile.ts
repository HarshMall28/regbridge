/**
 * company-profile.ts
 *
 * Company portfolio query — aggregates products, substances, and functions
 * for a given authorization holder name. "Company" = auth_holder string,
 * not a corporate entity (Bayer CropScience Limited ≠ BAYER SAS).
 *
 * Consumed by: Effect HttpApi endpoint, future MCP tool, future createServerFn
 *
 * Location: packages/api/src/queries/company-profile.ts
 */

import { db } from "../connection";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface CompanyProfile {
  name: string;
  total_products: number;
  ie_product_count: number;
  fr_product_count: number;
  substance_count: number;

  /** Unique substances sorted by product_count desc. Name is EU canonical where resolvable. */
  substances: Array<{
    name: string;
    product_count: number;
  }>;

  /** Function breakdown with per-country splits */
  functions: Array<{
    name: string;
    ie_count: number;
    fr_count: number;
    total: number;
  }>;

  ie_products: Array<{
    product_name: string | null;
    pcs_number: string | null;
    function_name: string | null;
    substances: string[];
  }>;

  fr_products: Array<{
    product_name: string | null;
    amm_number: string;
    fonctions: string | null;
    etat_autorisation: string | null;
    substances: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function getCompanyProfile(
  name: string,
): Promise<CompanyProfile | null> {
  const searchName = stripCorporateSuffix(name);

  // Fire IE and FR queries in parallel
  const [ieData, frData] = await Promise.all([
    fetchIeCompanyProducts(searchName),
    fetchFrCompanyProducts(searchName),
  ]);

  // If no products in either market, company doesn't exist
  if (ieData.products.length === 0 && frData.products.length === 0) {
    return null;
  }

  // Aggregate substances across both markets
  // Case-insensitive dedup: "lambda-Cyhalothrin" and "Lambda-Cyhalothrin" merge.
  // Preserve the first-seen casing for display.
  const substanceCounts = new Map<string, number>();
  const substanceDisplay = new Map<string, string>();

  for (const p of ieData.products) {
    for (const s of p.substances) {
      const key = s.toLowerCase();
      substanceCounts.set(key, (substanceCounts.get(key) ?? 0) + 1);
      if (!substanceDisplay.has(key)) substanceDisplay.set(key, s);
    }
  }

  for (const p of frData.products) {
    for (const s of p.substances) {
      const normalized = extractEuName(s);
      const key = normalized.toLowerCase();
      substanceCounts.set(key, (substanceCounts.get(key) ?? 0) + 1);
      if (!substanceDisplay.has(key))
        substanceDisplay.set(key, normalized);
    }
  }

  const substances = [...substanceCounts.entries()]
    .map(([key, product_count]) => ({
      name: substanceDisplay.get(key) ?? key,
      product_count,
    }))
    .sort((a, b) => b.product_count - a.product_count);

  // Aggregate functions across both markets
  const funcMap = new Map<
    string,
    { ie_count: number; fr_count: number }
  >();

  for (const p of ieData.products) {
    const fn = p.function_name ?? "Other";
    const existing = funcMap.get(fn) ?? { ie_count: 0, fr_count: 0 };
    existing.ie_count++;
    funcMap.set(fn, existing);
  }

  for (const p of frData.products) {
    const fn = normalizeFonction(p.fonctions);
    const existing = funcMap.get(fn) ?? { ie_count: 0, fr_count: 0 };
    existing.fr_count++;
    funcMap.set(fn, existing);
  }

  const functions = [...funcMap.entries()]
    .map(([name, counts]) => ({
      name,
      ie_count: counts.ie_count,
      fr_count: counts.fr_count,
      total: counts.ie_count + counts.fr_count,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    name,
    total_products: ieData.products.length + frData.products.length,
    ie_product_count: ieData.products.length,
    fr_product_count: frData.products.length,
    substance_count: substances.length,
    substances,
    functions,
    ie_products: ieData.products,
    fr_products: frData.products,
  };
}

// ---------------------------------------------------------------------------
// IE products for a company
// ---------------------------------------------------------------------------

interface IeCompanyProduct {
  product_name: string | null;
  pcs_number: string | null;
  function_name: string | null;
  substances: string[];
}

async function fetchIeCompanyProducts(
  searchName: string,
): Promise<{ products: IeCompanyProduct[] }> {
  const rows = await db
    .selectFrom("ie_products")
    .select([
      "product_id",
      "product_name",
      "pcs_number",
      "function_name",
    ])
    .where("auth_holder", "ilike", `%${searchName}%`)
    .orderBy("product_name")
    .execute();

  if (rows.length === 0) return { products: [] };

  // Batch-fetch all substances for matched products
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

  const products: IeCompanyProduct[] = rows.map((r) => ({
    product_name: r.product_name,
    pcs_number: r.pcs_number,
    function_name: r.function_name,
    substances: substancesByProduct.get(r.product_id) ?? [],
  }));

  return { products };
}

// ---------------------------------------------------------------------------
// FR products for a company
// ---------------------------------------------------------------------------

interface FrCompanyProduct {
  product_name: string | null;
  amm_number: string;
  fonctions: string | null;
  etat_autorisation: string | null;
  substances: string[];
}

async function fetchFrCompanyProducts(
  searchName: string,
): Promise<{ products: FrCompanyProduct[] }> {
  const rows = await db
    .selectFrom("fr_products")
    .select([
      "amm_number",
      "product_name",
      "fonctions",
      "etat_autorisation",
    ])
    .where("titulaire", "ilike", `%${searchName}%`)
    .where("type_produit", "in", [
      "PPP",
      "ADJUVANT",
      "PRODUIT-MIXTE",
      "MELANGE",
    ])
    .orderBy("product_name")
    .execute();

  if (rows.length === 0) return { products: [] };

  // Batch-fetch all substances
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

  const products: FrCompanyProduct[] = rows.map((r) => ({
    product_name: r.product_name,
    amm_number: r.amm_number,
    fonctions: r.fonctions,
    etat_autorisation: r.etat_autorisation,
    substances: substancesByAmm.get(r.amm_number) ?? [],
  }));

  return { products };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip common corporate suffixes for cross-country matching.
 * "Life Scientific Limited" → "Life Scientific"
 * "BAYER SEEDS S.A.S." → "BAYER SEEDS"
 *
 * Guard: only strip if the result has 2+ words remaining.
 * "BAYER SAS" stays "BAYER SAS" (stripping "SAS" leaves single word "BAYER"
 * which is too broad and would match all Bayer entities).
 */
function stripCorporateSuffix(name: string): string {
  const suffixPattern =
    /\s+(?:Limited|Ltd\.?|LTD|SAS|S\.?A\.?S\.?|GmbH|S\.?A\.?|S\.?L\.?|Inc\.?|Corp\.?|B\.?V\.?|AG|PLC|Pty|d\.o\.o\.?|s\.r\.o\.?)\s*$/i;

  const stripped = name.replace(suffixPattern, "").trim();

  // Guard: if stripping leaves a single word, keep the original
  // to avoid overly broad ILIKE matches
  if (stripped.split(/\s+/).length < 2) {
    return name;
  }

  return stripped;
}

/**
 * Extract EU canonical name from FR substance format.
 * Handles nested parens: "diquat (dibromide) (Diquat (dibromide))" → "Diquat (dibromide)"
 * Simple case: "pendiméthaline (Pendimethalin)" → "Pendimethalin"
 * Falls back to raw string if no parens found (safeners etc).
 */
function extractEuName(frName: string): string {
  const match = frName.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  return match ? match[1] : frName;
}

/**
 * Normalize FR fonctions string to a clean English function name.
 * Handles pipe-delimited compound functions:
 *   "Fongicide | Régulateur de croissance" → "Fungicide | Growth reg."
 * Single values: "Fongicide" → "Fungicide"
 * null → "Other"
 */
function normalizeFonction(fonctions: string | null): string {
  if (!fonctions) return "Other";

  const map: Record<string, string> = {
    Fongicide: "Fungicide",
    Herbicide: "Herbicide",
    Insecticide: "Insecticide",
    "Régulateur de croissance": "Growth reg.",
    "Subst. Croiss.": "Growth reg.",
    Répulsif: "Repellent",
    Molluscicide: "Molluscicide",
    Rodenticide: "Rodenticide",
    Nématicide: "Nematicide",
    "Stimul. Déf. Plantes - Maladies": "Plant defence stim.",
  };

  return fonctions
    .split("|")
    .map((s) => {
      const trimmed = s.trim();
      return map[trimmed] ?? trimmed;
    })
    .join(" | ");
}
