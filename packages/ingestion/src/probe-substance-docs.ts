/**
 * RegBridge — Substance Documents Endpoint Probe
 *
 * Tests the undocumented Angular backend endpoint for substance documents.
 * Measures latency, error rates, and response shape at different concurrency levels.
 *
 * Run from monorepo root:
 *   bun run --env-file .env packages/ingestion/src/probe-substance-docs.ts
 */

import { db, initDb } from "@regbridge/db";

initDb(Bun.env.DATABASE_URL!);

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api/active_substance/details";

const SAMPLE_SIZE = 50; // how many substance IDs to test
const CONCURRENCY_LEVELS = [5, 10, 20]; // test each level

// ── Types ──────────────────────────────────────────────────────────────────

interface ProbeResult {
  asId: number;
  status: number;
  latencyMs: number;
  error?: string;
}

// ── Concurrency pool ───────────────────────────────────────────────────────

async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  let index = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (index < queue.length) {
      const i = index++;
      const item = queue[i];
      results[i] = await fn(item);
    }
  });

  await Promise.all(workers);
  return results;
}

// ── Single request ─────────────────────────────────────────────────────────

async function probeOne(asId: number): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/${asId}`, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    return {
      asId,
      status: res.status,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `${res.status} ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      asId,
      status: 0,
      latencyMs: Date.now() - start,
      error: err.message ?? String(err),
    };
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printStats(label: string, results: ProbeResult[]) {
  const successes = results.filter((r) => r.status === 200);
  const failures = results.filter((r) => r.status !== 200);
  const latencies = successes
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);

  console.log(`\n── ${label} ──`);
  console.log(
    `  Total: ${results.length} | OK: ${successes.length} | Failed: ${failures.length}`,
  );

  if (latencies.length > 0) {
    console.log(
      `  Latency — p50: ${percentile(latencies, 50)}ms | p95: ${percentile(latencies, 95)}ms | max: ${latencies[latencies.length - 1]}ms`,
    );
  }

  if (failures.length > 0) {
    // Group failures by error/status
    const errorCounts = new Map<string, number>();
    for (const f of failures) {
      const key = f.error ?? `status ${f.status}`;
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    console.log("  Errors:");
    for (const [err, count] of errorCounts) {
      console.log(`    ${err}: ${count}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Grab a sample of real as_ids from the database
  console.log(
    `Fetching ${SAMPLE_SIZE} substance IDs from eu_active_substances...`,
  );

  const rows = await db
    .selectFrom("eu_active_substances")
    .select("as_id")
    .orderBy("as_id", "asc")
    .limit(SAMPLE_SIZE)
    .execute();

  const sampleIds = rows.map((r) => r.as_id);
  console.log(
    `Got ${sampleIds.length} IDs: [${sampleIds[0]}..${sampleIds[sampleIds.length - 1]}]`,
  );

  // ── 1. First, fetch ONE to inspect response shape ──────────────────────
  console.log(
    `\nFetching single record (as_id=${sampleIds[0]}) to inspect response shape...`,
  );

  const shapeRes = await fetch(`${BASE_URL}/${sampleIds[0]}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (shapeRes.ok) {
    const body = await shapeRes.json();
    console.log("\n── RESPONSE SHAPE ──");
    console.log(
      `Type: ${typeof body} | isArray: ${Array.isArray(body)}`,
    );

    if (typeof body === "object" && body !== null) {
      console.log(`Top-level keys: ${Object.keys(body).join(", ")}`);
      // Print each key with its type and a preview
      for (const [key, val] of Object.entries(body)) {
        const type = Array.isArray(val)
          ? `array[${(val as any[]).length}]`
          : typeof val;
        const preview =
          typeof val === "string"
            ? val.slice(0, 80)
            : Array.isArray(val) && (val as any[]).length > 0
              ? JSON.stringify((val as any[])[0]).slice(0, 200)
              : String(val);
        console.log(`  ${key}: ${type} → ${preview}`);
      }

      // If there's a documents-like array, print its first element fully
      for (const [key, val] of Object.entries(body)) {
        if (
          Array.isArray(val) &&
          (val as any[]).length > 0 &&
          typeof (val as any[])[0] === "object"
        ) {
          console.log(`\n  Full first element of "${key}":`);
          console.log(
            `  ${JSON.stringify((val as any[])[0], null, 2)
              .split("\n")
              .join("\n  ")}`,
          );
        }
      }
    } else {
      console.log(
        `Full body (first 500 chars): ${JSON.stringify(body).slice(0, 500)}`,
      );
    }
  } else {
    console.log(
      `Single fetch failed: ${shapeRes.status} ${shapeRes.statusText}`,
    );
    const text = await shapeRes.text();
    console.log(`Body: ${text.slice(0, 300)}`);
  }

  // ── 2. Test each concurrency level ─────────────────────────────────────
  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(
      `\nTesting concurrency=${concurrency} with ${sampleIds.length} IDs...`,
    );
    const start = Date.now();
    const results = await withConcurrency(
      sampleIds,
      concurrency,
      probeOne,
    );
    const wallTime = ((Date.now() - start) / 1000).toFixed(1);
    printStats(
      `Concurrency ${concurrency} (${wallTime}s wall time)`,
      results,
    );
  }

  // ── 3. Recommendation ──────────────────────────────────────────────────
  console.log("\n── RECOMMENDATION ──");
  console.log(
    "Pick the highest concurrency where failures=0 and p95 < 2000ms.",
  );
  console.log("For 1,482 substances:");
  for (const c of CONCURRENCY_LEVELS) {
    const estSeconds = Math.ceil((1482 / c) * 0.3); // rough estimate at 300ms avg
    console.log(
      `  concurrency=${c}: ~${estSeconds}s (~${(estSeconds / 60).toFixed(1)} min)`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
