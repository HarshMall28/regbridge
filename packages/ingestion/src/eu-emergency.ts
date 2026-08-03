/**
 * RegBridge — EU Emergency Authorisations (Article 53) Ingestion
 *
 * Source: EU Pesticides Database Angular backend
 * Endpoint: GET https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/ppp/backend/authorisations
 * Returns: ~6,700 records as a single JSON array, no pagination, no auth
 *
 * Run from monorepo root: bun run ingest:eu-emergency
 */

import { db, sql } from "@regbridge/db";

// ── Types ──────────────────────────────────────────────────────────────────

interface EmergencyAuthRaw {
  id: number;
  companyCode: string | null;
  tradeNames: string[] | null;
  activeSubstances: string[] | null;
  activeSubstancesIds: number[] | null;
  countryCode: string | null;
  countryName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  authHolder: string | null;
  pdfFile: string | null;
  excelFile: string | null;
  cropEppoCode: string[] | null;
  cropEppoName: string[] | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

/** Normalize ISO timestamp string, return null if unparseable */
function toISOString(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function insertBatch(
  rows: EmergencyAuthRaw[],
  now: Date,
): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insertInto("eu_emergency_authorisations")
    .values(
      rows.map((r) => ({
        id: r.id,
        company_code: r.companyCode ?? null,
        trade_names: JSON.stringify(r.tradeNames ?? []),
        active_substances: JSON.stringify(r.activeSubstances ?? []),
        active_substance_ids: JSON.stringify(
          r.activeSubstancesIds ?? [],
        ),
        country_code: r.countryCode ?? null,
        country_name: r.countryName ?? null,
        valid_from: toISOString(r.validFrom),
        valid_until: toISOString(r.validUntil),
        auth_holder: r.authHolder ?? null,
        pdf_file: r.pdfFile ?? null,
        excel_file: r.excelFile ?? null,
        crop_eppo_codes: JSON.stringify(r.cropEppoCode ?? []),
        crop_eppo_names: JSON.stringify(r.cropEppoName ?? []),
        last_synced_at: now,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet((eb) => ({
        company_code: eb.ref("excluded.company_code"),
        trade_names: eb.ref("excluded.trade_names"),
        active_substances: eb.ref("excluded.active_substances"),
        active_substance_ids: eb.ref("excluded.active_substance_ids"),
        country_code: eb.ref("excluded.country_code"),
        country_name: eb.ref("excluded.country_name"),
        valid_from: eb.ref("excluded.valid_from"),
        valid_until: eb.ref("excluded.valid_until"),
        auth_holder: eb.ref("excluded.auth_holder"),
        pdf_file: eb.ref("excluded.pdf_file"),
        excel_file: eb.ref("excluded.excel_file"),
        crop_eppo_codes: eb.ref("excluded.crop_eppo_codes"),
        crop_eppo_names: eb.ref("excluded.crop_eppo_names"),
        last_synced_at: eb.ref("excluded.last_synced_at"),
      })),
    )
    .execute();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const now = new Date();

  // ── 1. Fetch emergency authorisations ──────────────────────────────────
  console.log("Fetching EU emergency authorisations...");

  const res = await fetch(
    "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/ppp/backend/authorisations",
    {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
  );

  if (!res.ok) {
    throw new Error(
      `Emergency auth fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  const records: EmergencyAuthRaw[] = await res.json();
  console.log(
    `Fetched ${records.length} emergency authorisation records`,
  );

  // ── 2. Validate a sample ───────────────────────────────────────────────
  if (records.length === 0) {
    console.warn("No records returned — skipping insert");
    return;
  }

  const sample = records[0];
  if (typeof sample.id !== "number" || !sample.countryCode) {
    throw new Error(
      `Unexpected response shape. First record: ${JSON.stringify(sample).slice(0, 300)}`,
    );
  }

  // ── 3. Check for country codes not in countries table ──────────────────
  const existingCountries = await db
    .selectFrom("countries")
    .select("country_code")
    .execute();

  const knownCodes = new Set(
    existingCountries.map((c) => c.country_code),
  );
  const apiCodes = new Set(
    records.map((r) => r.countryCode).filter(Boolean) as string[],
  );
  const missingCodes = [...apiCodes].filter(
    (c) => !knownCodes.has(c),
  );

  if (missingCodes.length > 0) {
    console.warn(
      `Country codes in emergency auth data but missing from countries table: ${missingCodes.join(", ")}`,
    );
    console.warn(
      "These records will have country_code set but no FK match.",
    );
  }

  // ── 4. Insert in batches ───────────────────────────────────────────────
  console.log(
    `Inserting ${records.length} records in batches of ${BATCH_SIZE}...`,
  );

  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await insertBatch(batch, now);
    inserted += batch.length;

    if (inserted % 500 === 0 || inserted === records.length) {
      console.log(`  ${inserted}/${records.length}`);
    }
  }

  // ── 5. Log to sync_log ────────────────────────────────────────────────
  await db
    .insertInto("sync_log")
    .values({
      source_name: "EU_EMERGENCY",
      source_version: "angular-backend",
      record_count: records.length,
      synced_at: new Date(),
    })
    .execute();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nDone. ${records.length} emergency authorisations ingested in ${elapsed}s`,
  );

  // ── 6. Quick stats ─────────────────────────────────────────────────────
  const countryStats = await sql<{
    country_code: string;
    cnt: number;
  }>`
    SELECT country_code, COUNT(*)::int AS cnt
    FROM eu_emergency_authorisations
    GROUP BY country_code
    ORDER BY cnt DESC
    LIMIT 10
  `.execute(db);

  console.log("\nTop 10 countries by emergency authorisations:");
  for (const row of countryStats.rows) {
    console.log(`  ${row.country_code}: ${row.cnt}`);
  }

  const yearStats = await sql<{ yr: number; cnt: number }>`
    SELECT EXTRACT(YEAR FROM valid_from::timestamptz)::int AS yr, COUNT(*)::int AS cnt
    FROM eu_emergency_authorisations
    WHERE valid_from IS NOT NULL
    GROUP BY yr
    ORDER BY yr DESC
    LIMIT 5
  `.execute(db);

  console.log("\nRecent years:");
  for (const row of yearStats.rows) {
    console.log(`  ${row.yr}: ${row.cnt}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
