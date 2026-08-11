/**
 * gap_analysis.ts
 * Find EU-approved substances with zero or few products in IE or FR.
 * Wraps runAggregate with the correct join topology hardcoded.
 *
 * Location: packages/db/src/queries/gap-analysis.ts
 * Export from: packages/db/src/index.ts
 */

import { runAggregate } from "./aggregate.js";

export interface GapAnalysisParams {
  market: "ie" | "fr";
  expiry_before?: string;   // ISO date string e.g. "2027-01-01"
  expiry_after?: string;    // ISO date string e.g. "2024-01-01"
  max_products?: number;    // default 0 — return substances with <= this many products
  status?: string;          // default "Approved"
  limit?: number;           // default 50
}

export async function substanceGapAnalysis(
  params: GapAnalysisParams,
) {
  const {
    market,
    expiry_before,
    expiry_after,
    max_products = 0,
    status = "Approved",
    limit = 50,
  } = params;

  const bridgeTable =
    market === "ie" ? "ie_product_substances" : "fr_product_substances";
  const countColumn = `${bridgeTable}.substance_name`;

  const where: any[] = [{ column: "status", op: "eq", value: status }];
  if (expiry_before)
    where.push({ column: "expiry_dt", op: "lt", value: expiry_before });
  if (expiry_after)
    where.push({ column: "expiry_dt", op: "gt", value: expiry_after });

  return runAggregate({
    from: "eu_active_substances",
    join: {
      table: bridgeTable,
      type: "left",
      on: { from_column: "name", to_column: "substance_name" },
    },
    select: [
      { column: "name", alias: "substance" },
      { column: "expiry_dt", alias: "expires" },
      { column: "candidate_for_substitution", alias: "cfs" },
      { column: "status" },
    ],
    where,
    aggregate: [
      { fn: "count", column: countColumn, alias: "product_count" },
    ],
    group_by: [
      "name",
      "expiry_dt",
      "candidate_for_substitution",
      "status",
    ],
    having: [
      { alias: "product_count", op: "lte", value: max_products },
    ],
    order_by: [{ column: "expiry_dt", direction: "asc" }],
    limit,
  });
}
