/**
 * Test: checkMrlCompliance
 *
 * Run: bun run --env-file .env packages/api/src/queries/test-mrl-compliance.ts
 */

import { checkMrlCompliance } from "./mrl-compliance";

async function main() {
  console.log("MRL Compliance Check — Test Suite");
  console.log("==================================\n");

  // ── Test 1: Specific MRL — Glyphosate in Apples ──
  console.log("Test 1: Glyphosate + Apples (specific, common substance)");
  const t1 = await checkMrlCompliance({
    substance: "Glyphosate",
    commodity: "Apples",
  });
  console.log(`  mrl_type: ${t1.mrl_type}`);
  console.log(`  residue: ${t1.residue_definition?.residue_name}`);
  console.log(`  commodities found: ${t1.commodity_results?.length}`);
  if (t1.commodity_results?.[0]?.mrl) {
    const m = t1.commodity_results[0].mrl;
    console.log(`  MRL: ${m.display} (${m.value} ${m.unit})`);
    console.log(`  LOD: ${m.is_lod}`);
    console.log(`  Regulation: ${m.regulation_number}`);
    console.log(`  Inherited: ${t1.commodity_results[0].inherited_from_parent}`);
  }
  console.log();

  // ── Test 2: Specific MRL with compliance check ──
  console.log("Test 2: Glyphosate + Apples + value 0.05 (compliance check)");
  const t2 = await checkMrlCompliance({
    substance: "Glyphosate",
    commodity: "Apples",
    value: 0.05,
  });
  if (t2.compliance) {
    console.log(`  Tested: ${t2.compliance.tested_value} mg/kg`);
    console.log(`  Compliant: ${t2.compliance.compliant}`);
    console.log(`  Margin: ${t2.compliance.margin} mg/kg`);
  }
  console.log();

  // ── Test 3: Default MRL substance ──
  console.log("Test 3: Lecithin + Wheat (default MRL substance)");
  const t3 = await checkMrlCompliance({
    substance: "Lecithin",
    commodity: "Wheat",
  });
  console.log(`  mrl_type: ${t3.mrl_type}`);
  if (t3.default_mrl) {
    console.log(`  Default value: ${t3.default_mrl.value} ${t3.default_mrl.unit}`);
    console.log(`  Regulation: ${t3.default_mrl.regulation_text}`);
  }
  console.log();

  // ── Test 4: Default MRL with compliance (should fail at 0.02) ──
  console.log("Test 4: Lecithin + Wheat + value 0.02 (over default)");
  const t4 = await checkMrlCompliance({
    substance: "Lecithin",
    commodity: "Wheat",
    value: 0.02,
  });
  if (t4.compliance) {
    console.log(`  Tested: ${t4.compliance.tested_value} mg/kg`);
    console.log(`  Compliant: ${t4.compliance.compliant}`);
    console.log(`  Margin: ${t4.compliance.margin} mg/kg`);
  }
  console.log();

  // ── Test 5: CAS number input ──
  console.log("Test 5: CAS 1071-83-6 (Glyphosate) + Rice");
  const t5 = await checkMrlCompliance({
    substance: "1071-83-6",
    commodity: "Rice",
  });
  console.log(`  Resolved: ${t5.substance.name} (as_id: ${t5.substance.as_id})`);
  console.log(`  mrl_type: ${t5.mrl_type}`);
  if (t5.commodity_results?.[0]?.mrl) {
    console.log(`  MRL: ${t5.commodity_results[0].mrl.display}`);
  }
  console.log();

  // ── Test 6: Copper compound (override table) ──
  console.log("Test 6: Copper oxide + Grapes (prl_overrides edge case)");
  const t6 = await checkMrlCompliance({
    substance: "Copper oxide",
    commodity: "Grapes",
  });
  console.log(`  mrl_type: ${t6.mrl_type}`);
  console.log(`  residue: ${t6.residue_definition?.residue_name}`);
  if (t6.commodity_results?.[0]?.mrl) {
    console.log(`  MRL: ${t6.commodity_results[0].mrl.display}`);
  } else {
    console.log(`  No MRL found for this commodity`);
  }
  console.log();

  // ── Test 7: Dithiocarbamates (shared residue — Mancozeb) ──
  console.log("Test 7: Mancozeb + Tomatoes (shared Dithiocarbamates residue)");
  const t7 = await checkMrlCompliance({
    substance: "Mancozeb",
    commodity: "Tomatoes",
  });
  console.log(`  mrl_type: ${t7.mrl_type}`);
  console.log(`  residue: ${t7.residue_definition?.residue_name}`);
  if (t7.commodity_results?.[0]?.mrl) {
    console.log(`  MRL: ${t7.commodity_results[0].mrl.display}`);
  }
  console.log();

  // ── Test 8: Commodity not found ──
  console.log("Test 8: Glyphosate + nonexistent commodity");
  const t8 = await checkMrlCompliance({
    substance: "Glyphosate",
    commodity: "Unicorn meat",
  });
  console.log(`  mrl_type: ${t8.mrl_type}`);
  console.log(`  commodity_results: ${t8.commodity_results?.length} matches`);
  console.log();

  // ── Test 9: Substance not found ──
  console.log("Test 9: Nonexistent substance");
  try {
    await checkMrlCompliance({
      substance: "Unobtanium",
      commodity: "Apples",
    });
  } catch (e: any) {
    console.log(`  Error (expected): ${e.message}`);
  }
  console.log();

  // ── Test 10: Chlorantraniliprole (resolved via name search step) ──
  console.log("Test 10: Chlorantraniliprole + Potatoes (step 4 resolution)");
  const t10 = await checkMrlCompliance({
    substance: "Chlorantraniliprole",
    commodity: "Potatoes",
  });
  console.log(`  mrl_type: ${t10.mrl_type}`);
  console.log(`  residue: ${t10.residue_definition?.residue_name}`);
  if (t10.commodity_results?.[0]?.mrl) {
    console.log(`  MRL: ${t10.commodity_results[0].mrl.display}`);
  }
  console.log();

  console.log("✓ All tests complete");
}

main().catch(console.error);
