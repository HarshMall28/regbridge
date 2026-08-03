/**
 * test-substance-profile.ts
 *
 * Test script for getSubstanceProfile().
 * Run: bun run --env-file .env packages/api/src/queries/test-substance-profile.ts
 *
 * Location: packages/api/src/queries/test-substance-profile.ts
 */

import { getSubstanceProfile } from "./substance-profile";

async function run() {
  const tests = [
    // by as_id
    { input: "811", label: "as_id (Glyphosate)" },
    // by CAS
    { input: "178928-70-6", label: "CAS (Prothioconazole)" },
    // by exact name
    { input: "Prothioconazole", label: "exact name" },
    // by prefix
    { input: "Glyphos", label: "prefix" },
  ];

  for (const test of tests) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`TEST: ${test.label} → input: "${test.input}"`);
    console.log("=".repeat(70));

    const start = performance.now();
    const result = await getSubstanceProfile(test.input);
    const elapsed = (performance.now() - start).toFixed(0);

    if (!result) {
      console.log(`  Result: null (${elapsed}ms)`);
      continue;
    }

    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Identity: ${result.identity.name} (as_id: ${result.identity.as_id})`);
    console.log(`  CAS: ${result.identity.cas_number}`);
    console.log(`  Status: ${result.identity.status}`);
    console.log(`  Expiry: ${result.identity.expiry_dt}`);
    console.log(`  Categories: ${result.categories.map((c) => c.name).join(", ") || "(none)"}`);
    console.log(`  Countries: ${result.country_count} authorized`);

    // Tox EU
    const adi = result.tox_eu.adi.value;
    const arfd = result.tox_eu.arfd.value;
    console.log(`  Tox EU — ADI: ${adi ?? "not set"}, ARfD: ${arfd ?? "not set"}`);

    // Tox OFT
    console.log(`  Tox OFT: ${result.tox_oft.length} reference values`);
    for (const t of result.tox_oft.slice(0, 3)) {
      console.log(
        `    ${t.endpoint_type}: ${t.value_lower}${t.unit ? " " + t.unit : ""} (${t.assessment_body ?? "?"})`
      );
    }
    if (result.tox_oft.length > 3) {
      console.log(`    ... and ${result.tox_oft.length - 3} more`);
    }

    // Genotoxicity
    console.log(`  Genotox: ${result.genotoxicity.conclusion ?? "no data"}`);

    // Metabolites
    console.log(`  Metabolites: ${result.metabolites.length}`);

    // Documents
    console.log(`  EFSA documents: ${result.documents.length}`);

    // Dossiers
    console.log(`  OFT dossiers: ${result.dossiers.length}`);
    for (const d of result.dossiers.slice(0, 2)) {
      console.log(`    ${d.output_title?.slice(0, 80)}...`);
    }

    // Emergency auths
    console.log(`  Emergency auths: ${result.emergency_auth_count}`);
    if (result.emergency_auths.length > 0) {
      const recent = result.emergency_auths[0];
      console.log(
        `    Most recent: ${recent.country_name} (${recent.valid_from} → ${recent.valid_until})`
      );
    }

    // IE products
    console.log(`  IE products: ${result.ie_product_count}`);
    for (const p of result.ie_products.slice(0, 3)) {
      console.log(`    ${p.product_name} (${p.pcs_number}) — ${p.auth_holder}`);
    }
    if (result.ie_product_count > 3) {
      console.log(`    ... and ${result.ie_product_count - 3} more`);
    }

    // FR products
    console.log(`  FR products: ${result.fr_product_count}`);
    for (const p of result.fr_products.slice(0, 3)) {
      console.log(`    ${p.product_name} (${p.amm_number}) — ${p.titulaire}`);
    }
    if (result.fr_product_count > 3) {
      console.log(`    ... and ${result.fr_product_count - 3} more`);
    }

    // Group
    if (result.group.is_group || result.group.part_of_group) {
      console.log(
        `  Group: ${result.group.is_group ? "IS group" : "part of group " + result.group.group_id} — ${result.group.members.length} members`
      );
    }

    // Legislation
    const legCount = [
      result.legislation.active,
      result.legislation.residue_linked,
      result.legislation.mrl_webpage,
    ].filter(Boolean).length;
    console.log(`  Legislation fields populated: ${legCount}/3`);
  }

  console.log("\n✅ All tests complete");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
