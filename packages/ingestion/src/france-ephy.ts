/**
 * RegBridge — France e-PHY ingestion
 *
 * Fully automated:
 *   1. Hits data.gouv.fr API to find the UTF-8 ZIP resource URL + last_modified
 *   2. Compares against sync_log — skips if unchanged
 *   3. Downloads ZIP, unzips in /tmp, parses 8 semicolon-delimited CSVs
 *   4. Full-replace inserts into 9 tables (fr_products + fr_product_substances + 7 others)
 *
 * Run: bun run --env-file .env packages/ingestion/src/france-ephy.ts
 */

import { db, initDb, sql } from "@regbridge/db";

initDb(Bun.env.DATABASE_URL!);
import type { Insertable } from "kysely";
import type {
  FrProductsTable,
  FrProductSubstancesTable,
  FrSubstancesTable,
  FrAuthorizedUsesTable,
  FrAllUsesTable,
  FrHazardClassesTable,
  FrConditionsOfUseTable,
  FrRiskPhrasesTable,
  FrParallelTradeTable,
} from "@regbridge/db";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATASET_SLUG =
  "donnees-ouvertes-du-catalogue-e-phy-des-produits-phytopharmaceutiques-matieres-fertilisantes-et-supports-de-culture-adjuvants-produits-mixtes-et-melanges";
const DATASET_API = `https://www.data.gouv.fr/api/1/datasets/${DATASET_SLUG}/`;
const TMP_DIR = "/tmp/ephy";
const BATCH_SIZE = 1000;
const SOURCE_NAME = "FRANCE_EPHY";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** Parse semicolon-delimited CSV. No quoting in these files (verified). */
function parseCSV(filePath: string): Record<string, string>[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(";")
    .map((h) => h.trim().replace(/[\u2018\u2019]/g, "'"));
  if (headers[headers.length - 1] === "") headers.pop();

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(";");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (fields[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

/** Empty string → null, also trims whitespace */
function n(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse French date "dd/mm/yyyy" to ISO "yyyy-mm-dd" string or null */
function parseDate(v: string | undefined): string | null {
  if (!v || v === "") return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** Parse numeric value or null */
function num(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const parsed = parseFloat(v.replace(",", "."));
  return isNaN(parsed) ? null : parsed;
}

/** Parse integer value or null */
function int(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const parsed = parseInt(v, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse pipe-delimited substance string into structured records.
 * Format: "diméthoate (Dimethoate) 400.0 g/L | quinmérac (Quinmerac) 60.0 g/L"
 */
function parseSubstances(
  raw: string,
): { substance_name: string; concentration: string | null }[] {
  if (!raw || raw.trim() === "") return [];
  const parts = raw.split(" | ");
  const results: {
    substance_name: string;
    concentration: string | null;
  }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const concMatch = trimmed.match(
      /^(.+?)\s+(\d+[\d.,]*\s*(?:g\/L|g\/kg|mg\/L|mg\/kg|mg\/diffuseur|g\/diffuseur|g\/piège|mg\/piège|mg\/Unité|g\/q|mL\/L|L\/hL|g\/hL|kg\/hL|g\/ha|mg\/ha|UFC\/[gkLm][gL]?|UI\/[gm]g?|UIAK\/mg|UAAK\/mg|spores\/g|OB\/L|GMS|%|g))$/i,
    );

    if (concMatch) {
      results.push({
        substance_name: concMatch[1].trim(),
        concentration: concMatch[2].trim(),
      });
    } else {
      results.push({ substance_name: trimmed, concentration: null });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Step 1: Find UTF-8 ZIP URL from data.gouv.fr API
// ---------------------------------------------------------------------------

interface DataGouvResource {
  id: string;
  title: string;
  url: string;
  last_modified: string;
  format: string;
  filesize: number;
}

interface DataGouvDataset {
  resources: DataGouvResource[];
}

async function findUtf8ZipResource(): Promise<{
  url: string;
  lastModified: string;
  resourceId: string;
}> {
  log("Fetching dataset metadata from data.gouv.fr API...");
  const resp = await fetch(DATASET_API, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(
      `data.gouv.fr API returned ${resp.status}: ${await resp.text()}`,
    );
  }
  const dataset: DataGouvDataset = await resp.json();

  const utf8Resource = dataset.resources.find(
    (r) =>
      r.format?.toLowerCase() === "zip" &&
      (r.title?.toLowerCase().includes("utf-8") ||
        r.title?.toLowerCase().includes("utf8")),
  );

  if (!utf8Resource) {
    const fallback = dataset.resources.find(
      (r) =>
        r.format?.toLowerCase() === "zip" &&
        !r.title?.toLowerCase().includes("xml"),
    );
    if (!fallback)
      throw new Error("No suitable ZIP resource found in dataset");
    log(`Using fallback resource: ${fallback.title}`);
    return {
      url: fallback.url,
      lastModified: fallback.last_modified,
      resourceId: fallback.id,
    };
  }

  log(`Found UTF-8 resource: ${utf8Resource.title}`);
  log(`  URL: ${utf8Resource.url}`);
  log(`  Last modified: ${utf8Resource.last_modified}`);
  log(
    `  Size: ${(utf8Resource.filesize / 1024 / 1024).toFixed(1)} MB`,
  );

  return {
    url: utf8Resource.url,
    lastModified: utf8Resource.last_modified,
    resourceId: utf8Resource.id,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Check sync_log for skip
// ---------------------------------------------------------------------------

async function shouldSync(lastModified: string): Promise<boolean> {
  const lastSync = await db
    .selectFrom("sync_log")
    .selectAll()
    .where("source_name", "=", SOURCE_NAME)
    .orderBy("synced_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!lastSync) {
    log("No previous sync found — will ingest.");
    return true;
  }

  if (lastSync.source_version === lastModified) {
    log(
      `Data unchanged since last sync (${lastModified}). Skipping.`,
    );
    return false;
  }

  log(
    `Data changed: previous=${lastSync.source_version}, current=${lastModified}. Will re-ingest.`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Step 3: Download and unzip
// ---------------------------------------------------------------------------

async function downloadAndUnzip(zipUrl: string): Promise<string> {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const zipPath = `${TMP_DIR}/ephy.zip`;
  const extractDir = `${TMP_DIR}/csv`;

  log(`Downloading ZIP from ${zipUrl}...`);
  const resp = await fetch(zipUrl);
  if (!resp.ok) {
    throw new Error(
      `Download failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const buffer = await resp.arrayBuffer();
  await Bun.write(zipPath, buffer);
  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
  log(`Downloaded ${sizeMB} MB`);

  if (existsSync(extractDir)) {
    execSync(`rm -rf ${extractDir}`);
  }
  mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o ${zipPath} -d ${extractDir}`);

  const files = execSync(`ls ${extractDir}`)
    .toString()
    .trim()
    .split("\n");
  log(`Extracted ${files.length} files: ${files.join(", ")}`);

  return extractDir;
}

// ---------------------------------------------------------------------------
// Step 4: Parse and insert each CSV
// ---------------------------------------------------------------------------

function findFile(dir: string, pattern: string): string {
  const files = execSync(`ls ${dir}`).toString().trim().split("\n");
  const match = files.find((f) =>
    f.toLowerCase().includes(pattern.toLowerCase()),
  );
  if (!match)
    throw new Error(`File matching "${pattern}" not found in ${dir}`);
  return `${dir}/${match}`;
}

// ---- 4a: fr_products + fr_product_substances ----

async function ingestProducts(dir: string): Promise<number> {
  const filePath = findFile(dir, "produits_utf8");
  const rows = parseCSV(filePath);
  log(`Parsed ${rows.length} products from produits_utf8.csv`);

  const products: Insertable<FrProductsTable>[] = [];
  const substances: Insertable<FrProductSubstancesTable>[] = [];
  const seenSubstances = new Set<string>();

  for (const r of rows) {
    const ammNumber = r["numero AMM"];
    if (!ammNumber) continue;

    products.push({
      amm_number: ammNumber,
      product_name: n(r["nom produit"]),
      type_produit: n(r["type produit"]),
      seconds_noms: n(r["seconds noms commerciaux"]),
      titulaire: n(r["titulaire"]),
      type_commercial: n(r["type commercial"]),
      gamme_usage: n(r["gamme usage"]),
      mentions_autorisees: n(r["mentions autorisees"]),
      restrictions_usage: n(r["restrictions usage"]),
      restrictions_usage_libelle: n(r["restrictions usage libelle"]),
      substances_actives_raw: n(r["Substances actives"]),
      fonctions: n(r["fonctions"]),
      formulations: n(r["formulations"]),
      etat_autorisation: n(r["Etat d'autorisation"]),
      date_retrait: parseDate(r["Date de retrait du produit"]),
      date_premiere_autorisation: parseDate(
        r["Date de première autorisation"],
      ),
      amm_reference: n(r["Numéro AMM du produit de référence"]),
      nom_produit_reference: n(r["Nom du produit de référence"]),
      last_synced_at: new Date(),
    });

    const parsed = parseSubstances(r["Substances actives"] ?? "");
    for (const s of parsed) {
      const key = `${ammNumber}::${s.substance_name}`;
      if (!seenSubstances.has(key)) {
        seenSubstances.add(key);
        substances.push({
          amm_number: ammNumber,
          substance_name: s.substance_name,
          concentration: s.concentration,
        });
      }
    }
  }

  log("Deleting existing fr_product_substances...");
  await sql`DELETE FROM fr_product_substances`.execute(db);
  log("Deleting existing fr_products...");
  await sql`DELETE FROM fr_products`.execute(db);

  log(`Inserting ${products.length} products...`);
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("fr_products")
      .values(batch)
      .onConflict((oc) =>
        oc.column("amm_number").doUpdateSet((eb) => ({
          product_name: eb.ref("excluded.product_name"),
          type_produit: eb.ref("excluded.type_produit"),
          seconds_noms: eb.ref("excluded.seconds_noms"),
          titulaire: eb.ref("excluded.titulaire"),
          type_commercial: eb.ref("excluded.type_commercial"),
          gamme_usage: eb.ref("excluded.gamme_usage"),
          mentions_autorisees: eb.ref("excluded.mentions_autorisees"),
          restrictions_usage: eb.ref("excluded.restrictions_usage"),
          restrictions_usage_libelle: eb.ref(
            "excluded.restrictions_usage_libelle",
          ),
          substances_actives_raw: eb.ref(
            "excluded.substances_actives_raw",
          ),
          fonctions: eb.ref("excluded.fonctions"),
          formulations: eb.ref("excluded.formulations"),
          etat_autorisation: eb.ref("excluded.etat_autorisation"),
          date_retrait: eb.ref("excluded.date_retrait"),
          date_premiere_autorisation: eb.ref(
            "excluded.date_premiere_autorisation",
          ),
          amm_reference: eb.ref("excluded.amm_reference"),
          nom_produit_reference: eb.ref(
            "excluded.nom_produit_reference",
          ),
          last_synced_at: eb.ref("excluded.last_synced_at"),
        })),
      )
      .execute();
    if (
      (i + BATCH_SIZE) % 2000 === 0 ||
      i + BATCH_SIZE >= products.length
    ) {
      log(
        `  products: ${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`,
      );
    }
  }

  log(`Inserting ${substances.length} product-substance links...`);
  for (let i = 0; i < substances.length; i += BATCH_SIZE) {
    const batch = substances.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("fr_product_substances")
      .values(batch)
      .execute();
    if (
      (i + BATCH_SIZE) % 2000 === 0 ||
      i + BATCH_SIZE >= substances.length
    ) {
      log(
        `  substances: ${Math.min(i + BATCH_SIZE, substances.length)}/${substances.length}`,
      );
    }
  }

  return products.length;
}

// ---- 4b: fr_substances ----

async function ingestSubstances(dir: string): Promise<number> {
  const filePath = findFile(dir, "substance_active_utf8");
  const rows = parseCSV(filePath);
  log(
    `Parsed ${rows.length} substances from substance_active_utf8.csv`,
  );

  const substances: Insertable<FrSubstancesTable>[] = rows
    .filter((r) => r["Nom substance active"])
    .map((r) => ({
      nom_substance: r["Nom substance active"],
      numero_cas: n(r["Numero CAS"]),
      etat_autorisation: n(r["Etat d'autorisation"]),
      variant: n(r["Variant"]),
    }));

  log("Deleting existing fr_substances...");
  await sql`DELETE FROM fr_substances`.execute(db);

  log(`Inserting ${substances.length} substances...`);
  for (let i = 0; i < substances.length; i += BATCH_SIZE) {
    const batch = substances.slice(i, i + BATCH_SIZE);
    await db.insertInto("fr_substances").values(batch).execute();
  }
  log(`  Done: ${substances.length} substances`);
  return substances.length;
}

// ---- 4c: fr_authorized_uses ----

async function ingestAuthorizedUses(dir: string): Promise<number> {
  const filePath = findFile(
    dir,
    "usages_des_produits_autorises_utf8",
  );
  log(`Reading authorized uses...`);

  // This CSV has duplicate "mentions autorisees" at columns 8 and 29.
  // parseCSV would silently overwrite. Use index-based access instead.
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .filter((l) => l.trim().length > 0);

  log(`Parsed ${lines.length - 1} authorized uses`);

  const uses: Insertable<FrAuthorizedUsesTable>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(";");
    uses.push({
      amm_number: n(f[1]),
      type_produit: n(f[0]),
      nom_produit: n(f[2]),
      seconds_noms: n(f[3]),
      titulaire: n(f[4]),
      type_commercial: n(f[5]),
      gamme_usage: n(f[6]),
      mentions_autorisees: n(f[7]),
      substances_actives: n(f[8]),
      fonctions: n(f[9]),
      formulations: n(f[10]),
      identifiant_usage_lib_court: n(f[11]),
      identifiant_usage: n(f[12]),
      date_decision: parseDate(f[13]),
      stade_cultural_min: n(f[14]),
      stade_cultural_max: n(f[15]),
      etat_usage: n(f[16]),
      dose_retenue: num(f[17]),
      dose_unite: n(f[18]),
      delai_recolte_jour: int(f[19]),
      delai_recolte_bbch: n(f[20]),
      nombre_max_application: int(f[21]),
      date_fin_distribution: parseDate(f[22]),
      date_fin_utilisation: parseDate(f[23]),
      condition_emploi: n(f[24]),
      znt_aquatique_m: int(f[25]),
      znt_arthropodes_m: int(f[26]),
    });
  }

  log("Deleting existing fr_authorized_uses...");
  await sql`DELETE FROM fr_authorized_uses`.execute(db);

  log(`Inserting ${uses.length} authorized uses...`);
  for (let i = 0; i < uses.length; i += BATCH_SIZE) {
    const batch = uses.slice(i, i + BATCH_SIZE);
    await db.insertInto("fr_authorized_uses").values(batch).execute();
    if (
      (i + BATCH_SIZE) % 5000 === 0 ||
      i + BATCH_SIZE >= uses.length
    ) {
      log(
        `  authorized uses: ${Math.min(i + BATCH_SIZE, uses.length)}/${uses.length}`,
      );
    }
  }
  return uses.length;
}

// ---- 4d: fr_all_uses ----

async function ingestAllUses(dir: string): Promise<number> {
  const filePath = findFile(dir, "produits_usages_utf8");
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .filter((l) => l.trim().length > 0);
  log(
    `Parsed ${lines.length - 1} all uses from produits_usages_utf8.csv`,
  );

  log("Deleting existing fr_all_uses...");
  await sql`DELETE FROM fr_all_uses`.execute(db);

  let inserted = 0;
  let batch: Insertable<FrAllUsesTable>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(";");
    batch.push({
      amm_number: n(f[0]),
      nom_produit: n(f[1]),
      identifiant_usage: n(f[2]),
      date_decision: parseDate(f[3]),
      stade_cultural_min: n(f[4]),
      stade_cultural_max: n(f[5]),
      etat_usage: n(f[6]),
      dose_retenue: num(f[7]),
      dose_unite: n(f[8]),
      delai_recolte_jour: int(f[9]),
      delai_recolte_bbch: n(f[10]),
      nombre_max_application: int(f[11]),
      date_fin_distribution: parseDate(f[12]),
      date_fin_utilisation: parseDate(f[13]),
      condition_emploi: n(f[14]),
      znt_aquatique_m: int(f[15]),
      znt_arthropodes_m: int(f[16]),
      znt_plantes_m: int(f[17]),
      mentions_autorisees: n(f[18]),
      intervalle_min_applications_jour: int(f[19]),
    });

    if (batch.length >= BATCH_SIZE) {
      await db.insertInto("fr_all_uses").values(batch).execute();
      inserted += batch.length;
      batch = [];
      if (inserted % 10000 === 0) {
        log(`  all uses: ${inserted}/${lines.length - 1}`);
      }
    }
  }

  if (batch.length > 0) {
    await db.insertInto("fr_all_uses").values(batch).execute();
    inserted += batch.length;
  }

  log(`  Done: ${inserted} all uses`);
  return inserted;
}

// ---- 4e: fr_hazard_classes ----

async function ingestHazardClasses(dir: string): Promise<number> {
  const filePath = findFile(
    dir,
    "produits_classe_et_mention_danger_utf8",
  );
  const rows = parseCSV(filePath);
  log(`Parsed ${rows.length} hazard classes`);

  const records: Insertable<FrHazardClassesTable>[] = rows.map(
    (r) => ({
      amm_number: n(r["numero AMM"]),
      nom_produit: n(r["nom produit"]),
      libelle_court: n(r["Libellé court"]),
      libelle_long: n(r["Libellé long"]),
    }),
  );

  log("Deleting existing fr_hazard_classes...");
  await sql`DELETE FROM fr_hazard_classes`.execute(db);

  log(`Inserting ${records.length} hazard classes...`);
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db.insertInto("fr_hazard_classes").values(batch).execute();
  }
  log(`  Done: ${records.length}`);
  return records.length;
}

// ---- 4f: fr_conditions_of_use ----

async function ingestConditionsOfUse(dir: string): Promise<number> {
  const filePath = findFile(dir, "produits_condition_emploi_utf8");
  const rows = parseCSV(filePath);
  log(`Parsed ${rows.length} conditions of use`);

  log("Deleting existing fr_conditions_of_use...");
  await sql`DELETE FROM fr_conditions_of_use`.execute(db);

  let inserted = 0;
  let batch: Insertable<FrConditionsOfUseTable>[] = [];

  for (const r of rows) {
    batch.push({
      amm_number: n(r["numero AMM"]),
      type_produit: n(r["type produit"]),
      nom_produit: n(r["nom produit"]),
      categorie: n(r["catégorie de condition d'emploi"]),
      condition_libelle: n(r["condition d'emploi libelle"]),
    });

    if (batch.length >= BATCH_SIZE) {
      await db
        .insertInto("fr_conditions_of_use")
        .values(batch)
        .execute();
      inserted += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await db
      .insertInto("fr_conditions_of_use")
      .values(batch)
      .execute();
    inserted += batch.length;
  }

  log(`  Done: ${inserted} conditions of use`);
  return inserted;
}

// ---- 4g: fr_risk_phrases ----

async function ingestRiskPhrases(dir: string): Promise<number> {
  const filePath = findFile(dir, "produits_phrases_de_risque_utf8");
  const rows = parseCSV(filePath);
  log(`Parsed ${rows.length} risk phrases`);

  const records: Insertable<FrRiskPhrasesTable>[] = rows.map((r) => ({
    amm_number: n(r["numero AMM"]),
    nom_produit: n(r["nom produit"]),
    libelle_court: n(
      r["Libellé court phrase de risque"] ??
        r["Libellé court phrase de risque "],
    ),
    libelle_long: n(
      r["Libellé long phrase de risque"] ??
        r["Libellé long phrase de risque"],
    ),
  }));

  log("Deleting existing fr_risk_phrases...");
  await sql`DELETE FROM fr_risk_phrases`.execute(db);

  log(`Inserting ${records.length} risk phrases...`);
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db.insertInto("fr_risk_phrases").values(batch).execute();
  }
  log(`  Done: ${records.length}`);
  return records.length;
}

// ---- 4h: fr_parallel_trade ----

async function ingestParallelTrade(dir: string): Promise<number> {
  const filePath = findFile(dir, "permis_de_commerce_parallele_utf8");
  const rows = parseCSV(filePath);
  log(`Parsed ${rows.length} parallel trade permits`);

  // No dedup — permis_number is NOT unique. One permit can have multiple
  // source countries/products. Each row is a unique permit × source combination.
  // Table uses serial id PK, not permis_number.
  const records = rows
    .filter((r) => r["N° Permis"])
    .map((r) => ({
      permis_number: n(r["N° Permis"]),
      nom_produit: n(r["Nom du produit"]),
      etat_autorisation: n(r["Etat d'autorisation"]),
      detenteur_pcp: n(r["Détenteur PCP"]),
      produit_reference_francais: n(
        r["Produit de référence français"],
      ),
      amm_reference_francais: n(r["N° AMM de référence français"]),
      nom_produit_importe: n(r["Nom du produit importé"]),
      amm_produit_importe: n(r["N° AMM du produit importé"]),
      etat_membre_origine: n(r["Etat Membre d'origine"]),
      mentions_etiquetage: n(r["Mentions d'étiquetage"]),
    }));

  log("Deleting existing fr_parallel_trade...");
  await sql`DELETE FROM fr_parallel_trade`.execute(db);

  log(`Inserting ${records.length} parallel trade permits...`);
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db.insertInto("fr_parallel_trade").values(batch).execute();
  }
  log(`  Done: ${records.length}`);
  return records.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  log("=== France e-PHY ingestion starting ===");

  // Step 1: Find the UTF-8 ZIP resource
  const resource = await findUtf8ZipResource();

  // Step 2: Check if we need to sync
  const forceSync = process.argv.includes("--force");
  if (!forceSync) {
    const needsSync = await shouldSync(resource.lastModified);
    if (!needsSync) {
      log("=== Skipping ingestion — data unchanged ===");
      process.exit(0);
    }
  } else {
    log("--force flag: skipping freshness check");
  }

  // Step 3: Download and unzip
  const csvDir = await downloadAndUnzip(resource.url);

  // Step 4: Ingest all 8 CSVs into 9 tables
  const counts: Record<string, number> = {};

  counts.products = await ingestProducts(csvDir);
  counts.substances = await ingestSubstances(csvDir);
  counts.authorized_uses = await ingestAuthorizedUses(csvDir);
  counts.all_uses = await ingestAllUses(csvDir);
  counts.hazard_classes = await ingestHazardClasses(csvDir);
  counts.conditions_of_use = await ingestConditionsOfUse(csvDir);
  counts.risk_phrases = await ingestRiskPhrases(csvDir);
  counts.parallel_trade = await ingestParallelTrade(csvDir);

  // Step 5: Log to sync_log
  const totalRecords = Object.values(counts).reduce(
    (a, b) => a + b,
    0,
  );
  await db
    .insertInto("sync_log")
    .values({
      source_name: SOURCE_NAME,
      source_version: resource.lastModified,
      record_count: totalRecords,
      synced_at: new Date(),
    })
    .execute();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log("=== France e-PHY ingestion complete ===");
  log(`Total time: ${elapsed}s`);
  log("Record counts:");
  for (const [table, count] of Object.entries(counts)) {
    log(`  ${table}: ${count}`);
  }

  // Cleanup
  execSync(`rm -rf ${TMP_DIR}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
