/**
 * Test script for paletteSearch
 *
 * Place at: packages/api/src/queries/test-palette.ts
 * Run with: bun run --env-file .env packages/api/src/queries/test-palette.ts
 *
 * Add to root package.json:
 *   "test:palette": "bun run --env-file .env packages/api/src/queries/test-palette.ts"
 */

import { paletteSearch, type SearchResult } from "./palette-search";

function printResult(r: SearchResult) {
  if (r.type === "substance") {
    console.log(
      `    [SUBSTANCE] ${r.entity.name} | ${r.entity.status} | ${r.entity.category ?? "?"} | ${r.entity.country_count} countries | CAS: ${r.entity.cas_number} | match: ${r.match_type} on ${r.match_field}`
    );
  } else if (r.type === "product") {
    console.log(
      `    [PRODUCT ${r.entity.country}] ${r.entity.product_name} | ${r.entity.identifier} | ${r.entity.auth_holder} | ${r.entity.status} | substances: ${r.entity.substances.join(", ")} | match: ${r.match_type} on ${r.match_field}`
    );
  } else {
    console.log(
      `    [COMPANY] ${r.entity.company_name} | IE: ${r.entity.ie_product_count} products | FR: ${r.entity.fr_product_count} products | match: ${r.match_type} on ${r.match_field}`
    );
  }
}

async function main() {
  console.log("=== Palette Search Tests ===\n");

  // Test 1: Substance prefix — most common search
  console.log('1. "prothi" (substance prefix):');
  const t1 = await paletteSearch("prothi");
  t1.forEach(printResult);
  console.log(`   → ${t1.length} results\n`);

  // Test 2: CAS number — exact substance lookup
  console.log('2. "178928-70-6" (CAS number):');
  const t2 = await paletteSearch("178928-70-6");
  t2.forEach(printResult);
  console.log(`   → ${t2.length} results\n`);

  // Test 3: Product name — should match IE and FR products
  console.log('3. "PROSARO" (product name):');
  const t3 = await paletteSearch("PROSARO");
  t3.forEach(printResult);
  console.log(`   → ${t3.length} results\n`);

  // Test 4: PCS number — exact IE product
  console.log('4. "07167" (PCS number):');
  const t4 = await paletteSearch("07167");
  t4.forEach(printResult);
  console.log(`   → ${t4.length} results\n`);

  // Test 5: AMM number — exact FR product
  console.log('5. "2100108" (AMM number):');
  const t5 = await paletteSearch("2100108");
  t5.forEach(printResult);
  console.log(`   → ${t5.length} results\n`);

  // Test 6: Company name — should aggregate across IE + FR
  console.log('6. "Bayer" (company name):');
  const t6 = await paletteSearch("Bayer");
  t6.forEach(printResult);
  console.log(`   → ${t6.length} results\n`);

  // Test 7: Company name — Life Scientific specifically
  console.log('7. "Life Scientific" (company name):');
  const t7 = await paletteSearch("Life Scientific");
  t7.forEach(printResult);
  console.log(`   → ${t7.length} results\n`);

  // Test 8: Short query "gly" — should return Glyphosate substance + products
  console.log('8. "gly" (short prefix):');
  const t8 = await paletteSearch("gly");
  t8.forEach(printResult);
  console.log(`   → ${t8.length} results\n`);

  // Test 9: Empty string — should return empty
  console.log('9. "" (empty):');
  const t9 = await paletteSearch("");
  console.log(`   → ${t9.length} results (should be 0)\n`);

  // Test 10: Measure timing
  console.log("10. Timing test (5 runs of 'prothi'):");
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await paletteSearch("prothi");
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }
  console.log(`    Times: ${times.map((t) => t.toFixed(1) + "ms").join(", ")}`);
  console.log(`    Avg: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms`);
  console.log(`    Target: <50ms\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
