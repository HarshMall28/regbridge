/**
 * test-product-queries.ts
 *
 * Test script for searchProducts() and getProductDetail().
 * Run: bun run --env-file .env packages/api/src/queries/test-product-queries.ts
 *
 * Location: packages/api/src/queries/test-product-queries.ts
 */

import {
  searchProducts,
  getProductDetail,
  type ProductSearchParams,
  type FrProductDetail,
  type IeProductDetail,
} from "./product-queries";

async function run() {
  console.log("=".repeat(70));
  console.log("PRODUCT SEARCH TESTS");
  console.log("=".repeat(70));

  const searchTests: Array<{ label: string; params: ProductSearchParams }> = [
    {
      label: "IE only — substance: Glyphosate",
      params: { substance: "Glyphosate", country: "ie", limit: 5 },
    },
    {
      label: "FR only — substance: Prothioconazole, active only",
      params: {
        substance: "Prothioconazole",
        country: "fr",
        status: "active",
        limit: 5,
      },
    },
    {
      label: "Both countries — auth_holder: Bayer",
      params: { auth_holder: "Bayer", country: "both", limit: 5 },
    },
    {
      label: "IE — crop: Wheat",
      params: { crop: "Wheat", country: "ie", limit: 5 },
    },
    {
      label: "FR — withdrawn products, substance: Glyphosate",
      params: {
        substance: "Glyphosate",
        country: "fr",
        status: "withdrawn",
        limit: 5,
      },
    },
  ];

  for (const test of searchTests) {
    console.log(`\n--- ${test.label} ---`);
    const start = performance.now();
    const result = await searchProducts(test.params);
    const elapsed = (performance.now() - start).toFixed(0);

    console.log(
      `  Time: ${elapsed}ms | IE: ${result.total_ie} | FR: ${result.total_fr} | Showing: ${result.results.length}`,
    );
    for (const r of result.results) {
      console.log(
        `  [${r.country.toUpperCase()}] ${r.product_name} (${r.product_id}) — ${r.auth_holder} — ${r.status}`,
      );
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("PRODUCT DETAIL TESTS");
  console.log("=".repeat(70));

  // IE detail — use a known PCS number
  console.log("\n--- IE Detail: PCS 07167 (Aero) ---");
  let start = performance.now();
  const ieDetail = (await getProductDetail("ie", "07167")) as IeProductDetail | null;
  let elapsed = (performance.now() - start).toFixed(0);

  if (ieDetail) {
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Product: ${ieDetail.product_name} (${ieDetail.pcs_number})`);
    console.log(`  Auth holder: ${ieDetail.auth_holder}`);
    console.log(`  Function: ${ieDetail.function_name}`);
    console.log(
      `  Substances: ${ieDetail.substances.map((s) => `${s.substance_name} (${s.concentration})`).join(", ")}`,
    );
    console.log(`  Crops: ${ieDetail.crops.length} crops`);
    if (ieDetail.crops.length > 0) {
      console.log(`    First 5: ${ieDetail.crops.slice(0, 5).join(", ")}`);
    }
  } else {
    console.log(`  Not found (${elapsed}ms)`);
  }

  // FR detail — use a known AMM number (PROSARO)
  console.log("\n--- FR Detail: AMM 2100108 (PROSARO) ---");
  start = performance.now();
  const frDetail = (await getProductDetail("fr", "2100108")) as FrProductDetail | null;
  elapsed = (performance.now() - start).toFixed(0);

  if (frDetail) {
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Product: ${frDetail.product_name} (${frDetail.amm_number})`);
    console.log(`  Titulaire: ${frDetail.titulaire}`);
    console.log(`  Status: ${frDetail.etat_autorisation}`);
    console.log(`  Type: ${frDetail.type_produit}`);
    console.log(`  Fonctions: ${frDetail.fonctions}`);
    console.log(`  Formulations: ${frDetail.formulations}`);
    console.log(
      `  Substances: ${frDetail.substances.map((s) => `${s.substance_name} (${s.concentration})`).join(", ")}`,
    );
    console.log(`  Authorized uses: ${frDetail.authorized_uses.length}`);
    if (frDetail.authorized_uses.length > 0) {
      const first = frDetail.authorized_uses[0];
      console.log(
        `    First: ${first.identifiant_usage_lib_court ?? first.identifiant_usage} — dose: ${first.dose_retenue} ${first.dose_unite} — max apps: ${first.nombre_max_application}`,
      );
    }
    console.log(`  All uses (including historical): ${frDetail.all_uses_count}`);
    console.log(`  Hazard classes: ${frDetail.hazard_classes.length}`);
    for (const h of frDetail.hazard_classes.slice(0, 3)) {
      console.log(`    ${h.libelle_court}: ${h.libelle_long}`);
    }
    console.log(`  Conditions of use: ${frDetail.conditions_of_use.length}`);
    for (const c of frDetail.conditions_of_use.slice(0, 3)) {
      console.log(`    [${c.categorie}] ${c.condition_libelle?.slice(0, 80)}`);
    }
    console.log(`  Risk phrases: ${frDetail.risk_phrases.length}`);
    for (const r of frDetail.risk_phrases.slice(0, 3)) {
      console.log(`    ${r.libelle_court}: ${r.libelle_long}`);
    }
    console.log(`  Parallel trade permits: ${frDetail.parallel_trade.length}`);
    for (const p of frDetail.parallel_trade.slice(0, 3)) {
      console.log(
        `    ${p.permis_number} — ${p.nom_produit_importe} from ${p.etat_membre_origine} (${p.etat_autorisation})`,
      );
    }
  } else {
    console.log(`  Not found (${elapsed}ms)`);
  }

  // FR detail — withdrawn product to test edge case
  console.log("\n--- FR Detail: AMM 2000001 (DESHERBANT ALLEES PJT BASF HJ) ---");
  start = performance.now();
  const withdrawn = (await getProductDetail("fr", "2000001")) as FrProductDetail | null;
  elapsed = (performance.now() - start).toFixed(0);

  if (withdrawn) {
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Product: ${withdrawn.product_name}`);
    console.log(`  Status: ${withdrawn.etat_autorisation}`);
    console.log(`  Date retrait: ${withdrawn.date_retrait}`);
    console.log(`  Authorized uses: ${withdrawn.authorized_uses.length}`);
    console.log(`  All uses count: ${withdrawn.all_uses_count}`);
    console.log(`  Hazard classes: ${withdrawn.hazard_classes.length}`);
  } else {
    console.log(`  Not found (${elapsed}ms)`);
  }

  console.log("\n✅ All tests complete");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
