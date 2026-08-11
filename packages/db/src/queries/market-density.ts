/**
 * market_density.ts
 * Count products per substance in IE or FR — reveals competitive saturation.
 *
 * Location: packages/db/src/queries/market-density.ts
 * Export from: packages/db/src/index.ts
 */

import { runAggregate } from "./aggregate.js";

export interface MarketDensityParams {
  market: "ie" | "fr";
  min_products?: number;   // only return substances with >= this many products
  max_products?: number;   // only return substances with <= this many products
  limit?: number;          // default 50
}

export async function marketDensity(params: MarketDensityParams) {
  const { market, min_products, max_products, limit = 50 } = params;

  const substanceTable =
    market === "ie" ? "ie_product_substances" : "fr_product_substances";

  const having: any[] = [];
  if (min_products !== undefined)
    having.push({ alias: "product_count", op: "gte", value: min_products });
  if (max_products !== undefined)
    having.push({ alias: "product_count", op: "lte", value: max_products });

  return runAggregate({
    from: substanceTable,
    select: [{ column: "substance_name" }],
    aggregate: [
      { fn: "count", column: "*", alias: "product_count" },
    ],
    group_by: ["substance_name"],
    having,
    order_by: [{ column: "product_count", direction: "desc" }],
    limit,
  });
}
