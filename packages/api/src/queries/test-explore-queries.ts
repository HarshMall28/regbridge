/**
 * test-explore-queries.ts
 *
 * Test script for exploreSchema() and exploreTable().
 * Run: bun run --env-file .env packages/api/src/queries/test-explore-queries.ts
 *
 * Location: packages/api/src/queries/test-explore-queries.ts
 */

import {
  exploreSchema,
  exploreTable,
  listTables,
} from "./explore-queries";

async function run() {
  // -----------------------------------------------------------------------
  // 1. List tables
  // -----------------------------------------------------------------------
  console.log("=".repeat(70));
  console.log("AVAILABLE TABLES");
  console.log("=".repeat(70));
  const tables = listTables();
  console.log(`  ${tables.length} tables: ${tables.join(", ")}`);

  // -----------------------------------------------------------------------
  // 2. Schema discovery
  // -----------------------------------------------------------------------
  console.log(`\n${"=".repeat(70)}`);
  console.log("SCHEMA TESTS");
  console.log("=".repeat(70));

  for (const tableName of [
    "eu_active_substances",
    "fr_products",
    "ie_products",
  ]) {
    const start = performance.now();
    const schema = await exploreSchema(tableName);
    const elapsed = (performance.now() - start).toFixed(0);

    if (schema) {
      console.log(
        `\n  ${schema.table}: ${schema.columns.length} columns, ${schema.row_count} rows (${elapsed}ms)`,
      );
      for (const col of schema.columns.slice(0, 5)) {
        console.log(
          `    ${col.column_name}: ${col.data_type}${col.is_nullable ? " (nullable)" : ""}`,
        );
      }
      if (schema.columns.length > 5) {
        console.log(`    ... and ${schema.columns.length - 5} more`);
      }
    }
  }

  // Invalid table
  const invalid = await exploreSchema("not_a_table");
  console.log(`\n  Invalid table returns null: ${invalid === null}`);

  // -----------------------------------------------------------------------
  // 3. Explore queries
  // -----------------------------------------------------------------------
  console.log(`\n${"=".repeat(70)}`);
  console.log("EXPLORE TABLE TESTS");
  console.log("=".repeat(70));

  // 3a: Basic equality filter
  console.log("\n--- EU substances: status = Approved, limit 5 ---");
  let start = performance.now();
  let result = await exploreTable({
    table: "eu_active_substances",
    filters: { status: "Approved" },
    select: ["as_id", "name", "cas_number", "status", "expiry_dt"],
    order_by: "name",
    limit: 5,
  });
  let elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    console.log(`  Filters: ${result.filters_applied.join(", ")}`);
    for (const r of result.rows) {
      console.log(`    ${r.name} (${r.as_id}) — expires: ${r.expiry_dt}`);
    }
  }

  // 3b: Date range — substances expiring before 2028
  console.log("\n--- EU substances: approved + expiring before 2028-01-01 ---");
  start = performance.now();
  result = await exploreTable({
    table: "eu_active_substances",
    filters: {
      status: "Approved",
      expiry_dt__lt: "2028-01-01",
      expiry_dt__not: "null",
    },
    select: ["as_id", "name", "expiry_dt", "candidate_for_substitution"],
    order_by: "expiry_dt",
    limit: 10,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    console.log(`  Filters: ${result.filters_applied.join(", ")}`);
    for (const r of result.rows) {
      console.log(
        `    ${r.name} — expires: ${r.expiry_dt}${r.candidate_for_substitution ? " ⚠️ CFS" : ""}`,
      );
    }
  }

  // 3c: ILIKE — fuzzy name search
  console.log("\n--- EU substances: name ILIKE 'azol' ---");
  start = performance.now();
  result = await exploreTable({
    table: "eu_active_substances",
    filters: { name__ilike: "azol" },
    select: ["as_id", "name", "status"],
    order_by: "name",
    limit: 10,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    for (const r of result.rows) {
      console.log(`    ${r.name} — ${r.status}`);
    }
  }

  // 3d: IS filter — candidate for substitution
  console.log("\n--- EU substances: candidate_for_substitution IS TRUE ---");
  start = performance.now();
  result = await exploreTable({
    table: "eu_active_substances",
    filters: {
      candidate_for_substitution__is: "true",
      status: "Approved",
    },
    select: [
      "as_id",
      "name",
      "expiry_dt",
      "candidate_for_substitution_type",
    ],
    order_by: "expiry_dt",
    limit: 5,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    for (const r of result.rows) {
      console.log(
        `    ${r.name} — expires: ${r.expiry_dt} — type: ${r.candidate_for_substitution_type}`,
      );
    }
  }

  // 3e: IN filter — FR products by type
  console.log("\n--- FR products: type_produit IN (ADJUVANT, MELANGE) ---");
  start = performance.now();
  result = await exploreTable({
    table: "fr_products",
    filters: { type_produit__in: "ADJUVANT,MELANGE" },
    select: ["amm_number", "product_name", "type_produit", "etat_autorisation"],
    order_by: "product_name",
    limit: 5,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    for (const r of result.rows) {
      console.log(
        `    ${r.product_name} (${r.amm_number}) — ${r.type_produit} — ${r.etat_autorisation}`,
      );
    }
  }

  // 3f: Emergency authorisations — recent
  console.log("\n--- Emergency auths: valid_from >= 2025-01-01, limit 5 ---");
  start = performance.now();
  result = await exploreTable({
    table: "eu_emergency_authorisations",
    filters: { valid_from__gte: "2025-01-01" },
    select: [
      "id",
      "country_name",
      "valid_from",
      "valid_until",
      "auth_holder",
    ],
    order_by: "-valid_from",
    limit: 5,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    for (const r of result.rows) {
      console.log(
        `    ${r.country_name}: ${r.valid_from} → ${r.valid_until} (${r.auth_holder})`,
      );
    }
  }

  // 3g: DESC order — largest IE product_id
  console.log("\n--- IE products: order by -product_id, limit 5 ---");
  start = performance.now();
  result = await exploreTable({
    table: "ie_products",
    select: ["product_id", "product_name", "pcs_number", "auth_holder"],
    order_by: "-product_id",
    limit: 5,
  });
  elapsed = (performance.now() - start).toFixed(0);
  if (result) {
    console.log(
      `  Time: ${elapsed}ms | Total: ${result.total} | Showing: ${result.rows.length}`,
    );
    for (const r of result.rows) {
      console.log(
        `    ${r.product_name} (${r.pcs_number}) — ${r.auth_holder}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. Simulated agent flow — opportunity screening
  // -----------------------------------------------------------------------
  console.log(`\n${"=".repeat(70)}`);
  console.log("SIMULATED AGENT: Opportunity Screening");
  console.log("=".repeat(70));
  console.log(
    '  "Find approved substances expiring within 18 months, not microorganisms"',
  );

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() + 18);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  start = performance.now();
  const opportunities = await exploreTable({
    table: "eu_active_substances",
    filters: {
      status: "Approved",
      expiry_dt__lt: cutoff,
      expiry_dt__not: "null",
      is_microorganism__is: "false",
    },
    select: [
      "as_id",
      "name",
      "cas_number",
      "expiry_dt",
      "candidate_for_substitution",
      "low_risk",
      "basic_substance",
    ],
    order_by: "expiry_dt",
    limit: 50,
  });
  elapsed = (performance.now() - start).toFixed(0);

  if (opportunities) {
    console.log(
      `\n  Step 1 scan: ${elapsed}ms | ${opportunities.total} substances expiring before ${cutoff}`,
    );
    console.log(`  Filters: ${opportunities.filters_applied.join(", ")}`);
    console.log("\n  Results:");
    for (const r of opportunities.rows.slice(0, 10)) {
      const daysLeft = Math.round(
        (new Date(r.expiry_dt as string).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(
        `    ${r.name} (${r.cas_number ?? "no CAS"}) — expires: ${r.expiry_dt} (${daysLeft} days)${r.candidate_for_substitution ? " ⚠️ CFS" : ""}`,
      );
    }
    if (opportunities.total > 10) {
      console.log(`    ... and ${opportunities.total - 10} more`);
    }
    console.log(
      "\n  → Agent would now call getSubstanceProfile() for each interesting hit",
    );
  }

  console.log("\n✅ All tests complete");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
