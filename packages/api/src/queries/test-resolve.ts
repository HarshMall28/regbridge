/**
 * Test script for resolveSubstance
 * 
 * Place this at: packages/api/src/queries/test-resolve.ts
 * Run with: bun run --env-file .env packages/api/src/queries/test-resolve.ts
 * 
 * Add this script to root package.json:
 *   "test:resolve": "bun run --env-file .env packages/api/src/queries/test-resolve.ts"
 */

import { resolveSubstance, resolveSubstanceCandidates } from "./resolve-substance";

async function main() {
  console.log("=== resolveSubstance tests ===\n");

  // Test 1: by as_id (numeric)
  const t1 = await resolveSubstance("811");
  console.log("1. as_id '811':", t1 ? `${t1.name} (${t1.match_type})` : "NOT FOUND");

  // Test 2: by CAS number
  const t2 = await resolveSubstance("178928-70-6");
  console.log("2. CAS '178928-70-6':", t2 ? `${t2.name} (${t2.match_type})` : "NOT FOUND");

  // Test 3: by exact name
  const t3 = await resolveSubstance("Prothioconazole");
  console.log("3. Exact name 'Prothioconazole':", t3 ? `${t3.name} (${t3.match_type})` : "NOT FOUND");

  // Test 4: by exact name case-insensitive
  const t4 = await resolveSubstance("prothioconazole");
  console.log("4. Lowercase 'prothioconazole':", t4 ? `${t4.name} (${t4.match_type})` : "NOT FOUND");

  // Test 5: by prefix
  const t5 = await resolveSubstance("Prothi");
  console.log("5. Prefix 'Prothi':", t5 ? `${t5.name} (${t5.match_type})` : "NOT FOUND");

  // Test 6: by fuzzy
  const t6 = await resolveSubstance("Prothioconazol");
  console.log("6. Fuzzy 'Prothioconazol' (missing 'e'):", t6 ? `${t6.name} (${t6.match_type})` : "NOT FOUND");

  // Test 7: invalid CAS — should return null
  const t7 = await resolveSubstance("999999-99-9");
  console.log("7. Invalid CAS '999999-99-9':", t7 ? `${t7.name}` : "NULL (correct)");

  // Test 8: empty string — should return null
  const t8 = await resolveSubstance("");
  console.log("8. Empty string:", t8 ? `${t8.name}` : "NULL (correct)");

  // Test 9: Glyphosate by name
  const t9 = await resolveSubstance("Glyphosate");
  console.log("9. Exact name 'Glyphosate':", t9 ? `${t9.name} [as_id=${t9.as_id}, CAS=${t9.cas_number}, status=${t9.status}, expiry=${t9.expiry_dt}] (${t9.match_type})` : "NOT FOUND");

  // Test 10: short prefix "gly" — should match Glyphosate (shortest)
  const t10 = await resolveSubstance("gly");
  console.log("10. Prefix 'gly':", t10 ? `${t10.name} (${t10.match_type})` : "NOT FOUND");

  console.log("\n=== resolveSubstanceCandidates tests ===\n");

  // Test 11: multiple candidates for "met" (many substances start with Met)
  const t11 = await resolveSubstanceCandidates("met", 5);
  console.log("11. Candidates for 'met':");
  t11.forEach((r, i) => console.log(`    ${i + 1}. ${r.name} (${r.match_type})`));

  // Test 12: candidates for CAS — should return exactly one
  const t12 = await resolveSubstanceCandidates("178928-70-6", 5);
  console.log("12. Candidates for CAS '178928-70-6':");
  t12.forEach((r, i) => console.log(`    ${i + 1}. ${r.name} (${r.match_type})`));

  // Test 13: candidates for "prothi" — should show prefix matches
  const t13 = await resolveSubstanceCandidates("prothi", 5);
  console.log("13. Candidates for 'prothi':");
  t13.forEach((r, i) => console.log(`    ${i + 1}. ${r.name} (${r.match_type})`));

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
