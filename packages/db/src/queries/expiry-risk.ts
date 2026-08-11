/**
 * expiry-risk.ts
 * Substances expiring soon with low IE/FR product coverage — renewal risk signal.
 *
 * Location: packages/db/src/queries/expiry-risk.ts
 * Export from: packages/db/src/index.ts
 */

import { runAggregate } from "./aggregate.js";

export interface ExpiryRiskParams {
  expiry_before: string;    // ISO date e.g. "2027-01-01" — required
  expiry_after?: string;    // ISO date e.g. "2024-01-01" — optional lower bound
  market?: "ie" | "fr";    // default "ie"
  max_products?: number;    // default 5 — surfaces low-coverage substances
  cfs_only?: boolean;       // if true, only candidate-for-substitution substances
  limit?: number;           // default 50
}

export async function expiryRiskScan(params: ExpiryRiskParams) {
  const {
    expiry_before,
    expiry_after,
    market = "ie",
    max_products = 5,
    cfs_only = false,
    limit = 50,
  } = params;

  const bridgeTable =
    market === "ie" ? "ie_product_substances" : "fr_product_substances";
  const countColumn = `${bridgeTable}.substance_name`;

  const where: any[] = [
    { column: "status", op: "eq", value: "Approved" },
    { column: "expiry_dt", op: "lt", value: expiry_before },
  ];
  if (expiry_after)
    where.push({ column: "expiry_dt", op: "gt", value: expiry_after });
  if (cfs_only)
    where.push({ column: "candidate_for_substitution", op: "eq", value: true });

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
      { column: "rms", alias: "rapporteur" },
    ],
    where,
    aggregate: [
      { fn: "count", column: countColumn, alias: "product_count" },
    ],
    group_by: [
      "name",
      "expiry_dt",
      "candidate_for_substitution",
      "rms",
    ],
    having: [
      { alias: "product_count", op: "lte", value: max_products },
    ],
    order_by: [{ column: "expiry_dt", direction: "asc" }],
    limit,
  });
}
