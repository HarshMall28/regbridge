/**
 * RegBridge — EU Substance Documents Ingestion
 *
 * Source: EU Pesticides Database Angular backend
 * Endpoint: GET https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api/active_substance/details/{AS_ID}
 * Extracts: payload.documents array per substance
 *
 * Run from monorepo root: bun run ingest:eu-substance-docs
 */

import { db, initDb, sql } from "@regbridge/db";

initDb(Bun.env.DATABASE_URL!);

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api/active_substance/details";
const CONCURRENCY = 20;
const BATCH_SIZE = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface APIDocument {
  ID: string;
  FILENAME: string;
  TYPE: string;
  DESCRIPTION: string;
}

interface APIResponse {
  success: boolean;
  payload: {
    documents: APIDocument[];
    [key: string]: unknown;
  };
}

interface DocRow {
  as_id: number;
  filename: string | null;
  document_type: string | null;
  description: string | null;
  source_url: string | null;
}

// ── Concurrency pool ───────────────────────────────────────────────────────

async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return results;
}

// ── Fetch with retry ───────────────────────────────────────────────────────

async function fetchDocs(
  asId: number,
  retries = 2,
): Promise<{ asId: number; docs: APIDocument[]; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/${asId}`, {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { asId, docs: [] }; // substance doesn't exist on this backend
        }
        if (attempt < retries) {
          await new Promise((r) =>
            setTimeout(r, 1000 * (attempt + 1)),
          );
          continue;
        }
        return {
          asId,
          docs: [],
          error: `${res.status} ${res.statusText}`,
        };
      }

      const data: APIResponse = await res.json();
      return { asId, docs: data.payload?.documents ?? [] };
    } catch (err: any) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { asId, docs: [], error: err.message ?? String(err) };
    }
  }

  return { asId, docs: [], error: "exhausted retries" };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // ── 1. Get all substance IDs ───────────────────────────────────────────
  console.log(
    "Fetching all substance IDs from eu_active_substances...",
  );
  const substances = await db
    .selectFrom("eu_active_substances")
    .select("as_id")
    .orderBy("as_id", "asc")
    .execute();

  const asIds = substances.map((r) => r.as_id);
  console.log(
    `Found ${asIds.length} substances to fetch documents for`,
  );

  // ── 2. Fetch all at concurrency 20 ─────────────────────────────────────
  console.log(`Fetching documents at concurrency=${CONCURRENCY}...`);

  let fetched = 0;
  let totalDocs = 0;
  let errors = 0;
  let withDocs = 0;
  const allDocRows: DocRow[] = [];

  // Process in chunks so we can log progress
  const CHUNK = 200;
  for (let c = 0; c < asIds.length; c += CHUNK) {
    const chunk = asIds.slice(c, c + CHUNK);
    const results = await withConcurrency(
      chunk,
      CONCURRENCY,
      fetchDocs,
    );

    for (const result of results) {
      fetched++;
      if (result.error) {
        errors++;
        if (errors <= 10) {
          console.warn(
            `  Error as_id=${result.asId}: ${result.error}`,
          );
        }
      }
      if (result.docs.length > 0) {
        withDocs++;
        totalDocs += result.docs.length;
        for (const doc of result.docs) {
          allDocRows.push({
            as_id: result.asId,
            filename: doc.FILENAME || null,
            document_type: doc.TYPE || null,
            description: doc.DESCRIPTION || null,
            source_url: doc.ID
              ? `https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api/active_substance/download/${doc.ID}`
              : null,
          });
        }
      }
    }

    console.log(
      `  ${fetched}/${asIds.length} fetched | ${withDocs} with docs | ${totalDocs} total docs | ${errors} errors`,
    );
  }

  console.log(
    `\nFetch complete: ${fetched} substances, ${withDocs} have documents, ${totalDocs} document records, ${errors} errors`,
  );

  if (errors > 10) {
    console.warn(`  (${errors - 10} additional errors suppressed)`);
  }

  // ── 3. Clear and insert ────────────────────────────────────────────────
  if (allDocRows.length === 0) {
    console.log("No documents to insert.");
  } else {
    console.log(
      `\nInserting ${allDocRows.length} document records...`,
    );
    await sql`DELETE FROM eu_substance_documents`.execute(db);

    for (let i = 0; i < allDocRows.length; i += BATCH_SIZE) {
      const batch = allDocRows.slice(i, i + BATCH_SIZE);
      await db
        .insertInto("eu_substance_documents")
        .values(batch)
        .execute();
    }
    console.log(`  ✓ ${allDocRows.length} document records inserted`);
  }

  // ── 4. Log to sync_log ────────────────────────────────────────────────
  await db
    .insertInto("sync_log")
    .values({
      source_name: "EU_SUBSTANCE_DOCS",
      source_version: "angular-backend",
      record_count: allDocRows.length,
      synced_at: new Date(),
    })
    .execute();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);

  // ── 5. Quick stats ─────────────────────────────────────────────────────
  const stats = await sql<{ document_type: string; cnt: number }>`
    SELECT document_type, COUNT(*)::int AS cnt
    FROM eu_substance_documents
    GROUP BY document_type
    ORDER BY cnt DESC
  `.execute(db);

  console.log("\nDocuments by type:");
  for (const row of stats.rows) {
    console.log(`  ${row.document_type}: ${row.cnt}`);
  }

  const topSubstances = await sql<{ as_id: number; cnt: number }>`
    SELECT as_id, COUNT(*)::int AS cnt
    FROM eu_substance_documents
    GROUP BY as_id
    ORDER BY cnt DESC
    LIMIT 5
  `.execute(db);

  console.log("\nTop 5 substances by document count:");
  for (const row of topSubstances.rows) {
    console.log(`  as_id=${row.as_id}: ${row.cnt} documents`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
