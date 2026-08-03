/**
 * Latency test — measures raw DB round trip time
 * 
 * Place at: packages/api/src/queries/test-latency.ts
 * Run: bun run --env-file .env packages/api/src/queries/test-latency.ts
 */

import { db, sql } from "@regbridge/db";

async function main() {
  console.log("=== DB Latency Tests ===\n");

  // Test 1: Simplest possible query — SELECT 1
  const times1: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await sql`SELECT 1`.execute(db);
    times1.push(performance.now() - start);
  }
  console.log("1. SELECT 1 (raw round trip):");
  console.log(`   Times: ${times1.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times1.reduce((a, b) => a + b, 0) / times1.length).toFixed(1)}ms\n`);

  // Test 2: Simple indexed lookup — PK on eu_active_substances
  const times2: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await db.selectFrom("eu_active_substances").select("name").where("as_id", "=", 811).executeTakeFirst();
    times2.push(performance.now() - start);
  }
  console.log("2. PK lookup (as_id = 811):");
  console.log(`   Times: ${times2.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times2.reduce((a, b) => a + b, 0) / times2.length).toFixed(1)}ms\n`);

  // Test 3: Prefix search on name (uses LIKE, no trigram)
  const times3: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await db.selectFrom("eu_active_substances").select(["as_id", "name"]).where(sql`LOWER(name)`, "like", "prothi%").limit(5).execute();
    times3.push(performance.now() - start);
  }
  console.log("3. Prefix LIKE 'prothi%':");
  console.log(`   Times: ${times3.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times3.reduce((a, b) => a + b, 0) / times3.length).toFixed(1)}ms\n`);

  // Test 4: Trigram similarity (uses GIN index)
  const times4: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await db.selectFrom("eu_active_substances").select(["as_id", "name"]).where(sql`similarity(name, 'prothi')`, ">", 0.3).orderBy(sql`similarity(name, 'prothi')`, "desc").limit(5).execute();
    times4.push(performance.now() - start);
  }
  console.log("4. Trigram similarity('prothi'):");
  console.log(`   Times: ${times4.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times4.reduce((a, b) => a + b, 0) / times4.length).toFixed(1)}ms\n`);

  // Test 5: FR product search with JOIN (biggest table hit in palette)
  const times5: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await db
      .selectFrom("fr_products as fp")
      .leftJoin("fr_product_substances as fps", "fp.amm_number", "fps.amm_number")
      .select(["fp.amm_number", "fp.product_name", sql<string>`string_agg(fps.substance_name, ', ')`.as("subs")])
      .where("fp.type_produit", "in", ["PPP", "ADJUVANT", "PRODUIT-MIXTE", "MELANGE"])
      .where(sql`LOWER(fp.product_name)`, "like", "prothi%")
      .groupBy(["fp.amm_number", "fp.product_name"])
      .limit(3)
      .execute();
    times5.push(performance.now() - start);
  }
  console.log("5. FR product prefix + JOIN:");
  console.log(`   Times: ${times5.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times5.reduce((a, b) => a + b, 0) / times5.length).toFixed(1)}ms\n`);

  // Test 6: The UNION ALL substance query from palette-search-v2
  const times6: number[] = [];
  const q = "prothi";
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await db.executeQuery(
      sql`
        (
          SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
                 'exact_name' as match_type, 0 as rank
          FROM eu_active_substances
          WHERE LOWER(name) = ${q}
          LIMIT 1
        )
        UNION ALL
        (
          SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
                 'prefix' as match_type,
                 CASE WHEN status = 'Approved' THEN 0 ELSE 1 END as rank
          FROM eu_active_substances
          WHERE LOWER(name) LIKE ${q + "%"}
            AND LOWER(name) != ${q}
          ORDER BY rank, LENGTH(name)
          LIMIT 5
        )
        UNION ALL
        (
          SELECT as_id, name, cas_number, status, expiry_dt, candidate_for_substitution,
                 'fuzzy' as match_type, 2 as rank
          FROM eu_active_substances
          WHERE similarity(name, ${q}) > 0.3
            AND LOWER(name) NOT LIKE ${q + "%"}
          ORDER BY similarity(name, ${q}) DESC
          LIMIT 5
        )
        LIMIT 5
      `.compile(db)
    );
    times6.push(performance.now() - start);
  }
  console.log("6. UNION ALL substance query:");
  console.log(`   Times: ${times6.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`   Avg: ${(times6.reduce((a, b) => a + b, 0) / times6.length).toFixed(1)}ms\n`);

  // Summary
  const avgRoundTrip = times1.reduce((a, b) => a + b, 0) / times1.length;
  console.log("=== Summary ===");
  console.log(`Raw round trip (Mumbai→London): ~${avgRoundTrip.toFixed(0)}ms`);
  console.log(`Palette search makes ~4 parallel groups of queries`);
  console.log(`Expected palette time in London: ~${(avgRoundTrip * 0.05 * 4).toFixed(0)}-${(avgRoundTrip * 0.1 * 4).toFixed(0)}ms`);
  console.log(`Expected palette time from Mumbai: ~${(avgRoundTrip * 4).toFixed(0)}-${(avgRoundTrip * 6).toFixed(0)}ms`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
