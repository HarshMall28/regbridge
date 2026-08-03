/**
 * RegBridge — MRL Compliance Check (Step 6)
 *
 * Substance + commodity → MRL value lookup with optional compliance check.
 *
 * Join chain (pre-computed at ingestion):
 *   eu_active_substances.resolved_residue_id → eu_mrls.residue_id
 *                                               + eu_commodities.commodity_id
 *                                               = MRL value
 *
 * Three branches:
 *   - Default:    pesticide_residue_linked starts with "Default" → 0.01 mg/kg
 *   - Specific:   resolved_residue_id populated → exact MRL from eu_mrls
 *   - Unresolved: resolved_residue_id null, non-default → raw text, no MRL
 *
 * File: packages/api/src/queries/mrl-compliance.ts
 */

import { db, sql } from "../connection";
import { resolveSubstance } from "./resolve-substance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MrlCheckParams {
  substance: string; // name, CAS, or as_id
  commodity: string; // commodity name or commodity_id as string
  value?: number; // mg/kg — optional compliance comparison
}

export interface MrlResult {
  value: number;
  display: string; // e.g. "0.01*"
  is_lod: boolean; // true if mrl_lod = "*"
  unit: "mg/kg";
  regulation_number: string | null;
  regulation_url: string | null;
  applicability: "current" | "future" | "previous";
  application_date: string | null;
  footnote: string | null;
}

export interface CommodityMatch {
  commodity_id: number;
  product_name: string | null;
  product_code: string | null;
  parent_id: number | null;
  mrl: MrlResult | null;
  inherited_from_parent: boolean;
  parent_name: string | null;
}

export interface ComplianceResult {
  tested_value: number;
  compliant: boolean;
  margin: number; // mrl - value (positive = headroom)
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
    value: 0.01;
    unit: "mg/kg";
    regulation_text: string;
  };
  commodity_results?: CommodityMatch[];
  compliance?: ComplianceResult;
  data_as_of: string;
  source: "EU Pesticides Database";
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APPLICABILITY_MAP: Record<
  number,
  "current" | "future" | "previous"
> = {
  0: "future",
  1: "current",
  2: "previous",
};

const DISCLAIMER =
  "MRL values are sourced from the EU Pesticides Database and are provided for informational purposes. Always verify against the official EU Pesticides Database for regulatory decisions.";

/**
 * Resolve commodity input to matching eu_commodities rows.
 * If input is numeric, treat as commodity_id. Otherwise ILIKE search.
 */
async function resolveCommodity(
  input: string,
  limit: number = 10,
): Promise<
  {
    commodity_id: number;
    product_name: string | null;
    product_code: string | null;
    parent_id: number | null;
  }[]
> {
  const trimmed = input.trim();

  // Numeric → direct commodity_id lookup
  if (/^\d+$/.test(trimmed)) {
    const row = await db
      .selectFrom("eu_commodities")
      .select([
        "commodity_id",
        "product_name",
        "product_code",
        "parent_id",
      ])
      .where("commodity_id", "=", parseInt(trimmed, 10))
      .executeTakeFirst();

    return row ? [row] : [];
  }

  // Text → search product_name, synonym_names, scientific_names
  // Exact match first (case-insensitive), then ILIKE contains
  const exactRows = await db
    .selectFrom("eu_commodities")
    .select([
      "commodity_id",
      "product_name",
      "product_code",
      "parent_id",
    ])
    .where(sql<boolean>`LOWER(product_name) = LOWER(${trimmed})`)
    .execute();

  if (exactRows.length > 0) return exactRows;

  // ILIKE contains — search product_name and synonym_names
  const ilikeRows = await db
    .selectFrom("eu_commodities")
    .select([
      "commodity_id",
      "product_name",
      "product_code",
      "parent_id",
    ])
    .where((eb) =>
      eb.or([
        sql<boolean>`product_name ILIKE ${"%" + trimmed + "%"}`,
        sql<boolean>`synonym_names ILIKE ${"%" + trimmed + "%"}`,
        sql<boolean>`scientific_names ILIKE ${"%" + trimmed + "%"}`,
      ]),
    )
    .orderBy(sql`LENGTH(product_name)`, "asc") // prefer shortest (most specific)
    .limit(limit)
    .execute();

  return ilikeRows;
}

/**
 * Fetch MRL from eu_mrls for a given residue_id + commodity_id.
 * Returns current (applicability=1) first, then future (0).
 * Falls back to parent commodity if no direct match.
 */
async function fetchMrl(
  residueId: number,
  commodityId: number,
  parentId: number | null,
): Promise<{
  mrl: MrlResult | null;
  inherited: boolean;
  parentName: string | null;
}> {
  // Try direct match
  const directRow = await db
    .selectFrom("eu_mrls")
    .select([
      "mrl_value",
      "mrl_value_only",
      "mrl_lod",
      "regulation_number",
      "regulation_url",
      "applicability",
      "applicability_text",
      "application_date",
      "footnote_text",
    ])
    .where("residue_id", "=", residueId)
    .where("commodity_id", "=", commodityId)
    .where("applicability", "=", 1) // current
    .executeTakeFirst();

  if (directRow) {
    return {
      mrl: {
        value: directRow.mrl_value_only ?? 0,
        display: directRow.mrl_value ?? "",
        is_lod: directRow.mrl_lod === "*",
        unit: "mg/kg",
        regulation_number: directRow.regulation_number,
        regulation_url: directRow.regulation_url,
        applicability:
          APPLICABILITY_MAP[directRow.applicability ?? 1] ??
          "current",
        application_date: directRow.application_date,
        footnote: directRow.footnote_text,
      },
      inherited: false,
      parentName: null,
    };
  }

  // No direct match — try parent commodity (one level up)
  if (parentId != null) {
    const parentRow = await db
      .selectFrom("eu_mrls")
      .select([
        "mrl_value",
        "mrl_value_only",
        "mrl_lod",
        "regulation_number",
        "regulation_url",
        "applicability",
        "applicability_text",
        "application_date",
        "footnote_text",
      ])
      .where("residue_id", "=", residueId)
      .where("commodity_id", "=", parentId)
      .where("applicability", "=", 1)
      .executeTakeFirst();

    if (parentRow) {
      // Get parent name for display
      const parent = await db
        .selectFrom("eu_commodities")
        .select(["product_name"])
        .where("commodity_id", "=", parentId)
        .executeTakeFirst();

      return {
        mrl: {
          value: parentRow.mrl_value_only ?? 0,
          display: parentRow.mrl_value ?? "",
          is_lod: parentRow.mrl_lod === "*",
          unit: "mg/kg",
          regulation_number: parentRow.regulation_number,
          regulation_url: parentRow.regulation_url,
          applicability:
            APPLICABILITY_MAP[parentRow.applicability ?? 1] ??
            "current",
          application_date: parentRow.application_date,
          footnote: parentRow.footnote_text,
        },
        inherited: true,
        parentName: parent?.product_name ?? null,
      };
    }
  }

  return { mrl: null, inherited: false, parentName: null };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function checkMrlCompliance(
  params: MrlCheckParams,
): Promise<MrlCheckResponse> {
  const { substance, commodity, value } = params;

  // ── Step 1: Resolve substance ──
  const resolved = await resolveSubstance(substance);
  if (!resolved) {
    throw new Error(`Substance not found: "${substance}"`);
  }

  // ── Step 2: Get MRL-specific fields ──
  const substanceRow = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "pesticide_residue_linked",
      "resolved_residue_id",
    ])
    .where("as_id", "=", resolved.as_id)
    .executeTakeFirst();

  if (!substanceRow) {
    throw new Error(
      `Substance as_id=${resolved.as_id} not found in database`,
    );
  }

  const prl = substanceRow.pesticide_residue_linked;
  const residueId = substanceRow.resolved_residue_id;

  // Determine mrl_type
  const mrlType: "default" | "specific" | "unresolved" =
    prl?.startsWith("Default")
      ? "default"
      : residueId != null
        ? "specific"
        : "unresolved";

  // ── Step 3: Get data_as_of ──
  const syncRow = await db
    .selectFrom("sync_log")
    .select(["synced_at"])
    .where("source_name", "=", "EU_ACTIVE_SUBSTANCES")
    .orderBy("synced_at", "desc")
    .executeTakeFirst();

  const dataAsOf = syncRow?.synced_at
    ? new Date(syncRow.synced_at).toISOString()
    : new Date().toISOString();

  // Base response
  const base = {
    substance: {
      as_id: substanceRow.as_id,
      name: substanceRow.name,
      cas_number: substanceRow.cas_number,
    },
    data_as_of: dataAsOf,
    source: "EU Pesticides Database" as const,
    disclaimer: DISCLAIMER,
  };

  // ── Branch 1: Default MRL ──
  if (mrlType === "default") {
    const response: MrlCheckResponse = {
      ...base,
      mrl_type: "default",
      residue_definition: null,
      default_mrl: {
        value: 0.01,
        unit: "mg/kg",
        regulation_text:
          prl ??
          "Default MRL of 0.01 mg/kg according to Art 18(1)(b) Reg 396 / 2005",
      },
    };

    // Compliance check against default 0.01
    if (value != null) {
      response.compliance = {
        tested_value: value,
        compliant: value <= 0.01,
        margin: 0.01 - value,
      };
    }

    return response;
  }

  // ── Branch 3: Unresolved ──
  if (mrlType === "unresolved") {
    return {
      ...base,
      mrl_type: "unresolved",
      residue_definition: {
        residue_id: null,
        residue_name: prl,
        footnote: null,
      },
    };
  }

  // ── Branch 2: Specific MRL ──
  // Get residue definition details
  const residueRow = await db
    .selectFrom("eu_pesticide_residues")
    .select([
      "residue_id",
      "residue_name",
      "footnote_code",
      "footnote_def",
    ])
    .where("residue_id", "=", residueId!)
    .executeTakeFirst();

  // Resolve commodity
  const commodityMatches = await resolveCommodity(commodity);

  if (commodityMatches.length === 0) {
    // No commodity found — return residue info without MRL
    return {
      ...base,
      mrl_type: "specific",
      residue_definition: residueRow
        ? {
            residue_id: residueRow.residue_id,
            residue_name: residueRow.residue_name,
            footnote:
              [residueRow.footnote_code, residueRow.footnote_def]
                .filter(Boolean)
                .join(" — ") || null,
          }
        : null,
      commodity_results: [],
    };
  }

  // Fetch MRL for each matching commodity (in parallel)
  const commodityResults: CommodityMatch[] = await Promise.all(
    commodityMatches.map(async (c) => {
      const { mrl, inherited, parentName } = await fetchMrl(
        residueId!,
        c.commodity_id,
        c.parent_id,
      );

      return {
        commodity_id: c.commodity_id,
        product_name: c.product_name,
        product_code: c.product_code,
        parent_id: c.parent_id,
        mrl,
        inherited_from_parent: inherited,
        parent_name: parentName,
      };
    }),
  );

  const response: MrlCheckResponse = {
    ...base,
    mrl_type: "specific",
    residue_definition: residueRow
      ? {
          residue_id: residueRow.residue_id,
          residue_name: residueRow.residue_name,
          footnote:
            [residueRow.footnote_code, residueRow.footnote_def]
              .filter(Boolean)
              .join(" — ") || null,
        }
      : null,
    commodity_results: commodityResults,
  };

  // Compliance check — use the first commodity match with an MRL
  if (value != null) {
    const firstWithMrl = commodityResults.find((c) => c.mrl != null);
    if (firstWithMrl?.mrl) {
      response.compliance = {
        tested_value: value,
        compliant: value <= firstWithMrl.mrl.value,
        margin: firstWithMrl.mrl.value - value,
      };
    }
  }

  return response;
}
