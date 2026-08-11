/**
 * RegBridge — Ireland PCS Register Ingestion
 *
 * Scrapes all ~1,286 products from the PCS (Pesticide Control Service)
 * product register using 3 parallel sessions with independent token chains.
 *
 * Target tables: ie_products, ie_product_substances, ie_product_crops
 * Verified: 1,286 products, 0 failures, ~4.7 min wall time (3 sessions)
 *
 * Usage: bun run --env-file .env packages/ingestion/src/ireland-pcs.ts
 */

import { db, initDb, sql } from "@regbridge/db";

initDb(Bun.env.DATABASE_URL!);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL =
  "https://www.pcs.agriculture.gov.ie/pppd/Search/Product";
const CONCURRENCY = 3;
const DELAY_MS = 300;
const BATCH_SIZE = 50;
const USER_AGENT = "RegBridge/1.0 (regulatory-data-aggregator)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: number;
  cookie: string;
  internalId: string;
  token: string;
}

interface ParsedProduct {
  product_name: string | null;
  pcs_number: string | null;
  auth_holder: string | null;
  marketing_company: string | null;
  product_type: string | null;
  function_name: string | null;
  user_type: string | null;
  substances: {
    substance_name: string;
    concentration: string | null;
  }[];
  crops: string[];
}

type Cell = { tag: string; text: string };
type Row = Cell[];
type Table = Row[];

// ---------------------------------------------------------------------------
// HTML parsing — regex-based, zero external dependencies
// ---------------------------------------------------------------------------

function extractHiddenInput(
  html: string,
  name: string,
): string | null {
  // name="X" ... value="Y"
  const re1 = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return m1[1];
  // value="Y" ... name="X"
  const re2 = new RegExp(
    `<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

function extractProductIds(html: string): string[] {
  const ids: string[] = [];
  const re = /<option\s+value="(\d+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function parseTables(html: string): Table[] {
  const tables: Table[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) !== null) {
    const rows: Row[] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tm[1])) !== null) {
      const cells: Cell[] = [];
      const cellRe = /<(t[dh])[^>]*>([\s\S]*?)<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push({
          tag: cm[1].toLowerCase(),
          text: stripTags(cm[2]),
        });
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

/**
 * Identifies tables by header content:
 *   Table 0: Product info (key-value, th="Product Name" in first row)
 *   Table 1: Substances (header th includes "Active Substance")
 *   Table 2: Crops (header th includes "Crops") — optional, ~21% of products lack this
 */
function parseProduct(tables: Table[]): ParsedProduct {
  const product: ParsedProduct = {
    product_name: null,
    pcs_number: null,
    auth_holder: null,
    marketing_company: null,
    product_type: null,
    function_name: null,
    user_type: null,
    substances: [],
    crops: [],
  };

  for (const table of tables) {
    if (table.length === 0) continue;
    const headerTexts = table[0]
      .filter((c) => c.tag === "th")
      .map((c) => c.text);

    if (headerTexts.includes("Product Name")) {
      // Product info: each row is th (label) + td (value)
      for (const row of table) {
        const th = row.find((c) => c.tag === "th");
        const td = row.find((c) => c.tag === "td");
        if (!th || !td) continue;
        const value = td.text || null;
        switch (th.text) {
          case "Product Name":
            product.product_name = value;
            break;
          case "PCS No.":
            product.pcs_number = value;
            break;
          case "Authorization Holder":
            product.auth_holder = value;
            break;
          case "Marketing Company":
            product.marketing_company = value;
            break;
          case "Product Type":
            product.product_type = value;
            break;
          case "Function":
            product.function_name = value;
            break;
          case "User Type":
            product.user_type = value;
            break;
        }
      }
    } else if (
      headerTexts.some((t) =>
        t.toLowerCase().includes("active substance"),
      )
    ) {
      // Substances: skip header row, data rows have 2 tds
      for (let i = 1; i < table.length; i++) {
        const tds = table[i].filter((c) => c.tag === "td");
        if (tds.length >= 2 && tds[0].text) {
          product.substances.push({
            substance_name: tds[0].text,
            concentration: tds[1].text || null,
          });
        }
      }
    } else if (
      headerTexts.some(
        (t) =>
          t.toLowerCase().includes("crops") ||
          t.toLowerCase().includes("approved"),
      )
    ) {
      // Crops: skip header row, each row has 1 td
      for (let i = 1; i < table.length; i++) {
        const td = table[i].find((c) => c.tag === "td");
        if (td?.text) product.crops.push(td.text);
      }
    }
  }

  return product;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

async function initSession(id: number): Promise<{
  session: Session;
  productIds: string[];
}> {
  const res = await fetch(BASE_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `[S${id}] GET failed: ${res.status} ${res.statusText}`,
    );
  }

  const html = await res.text();

  // Extract antiforgery cookie
  const setCookies = res.headers.getSetCookie?.() ?? [];
  let cookie = "";
  for (const sc of setCookies) {
    const name = sc.split("=")[0];
    if (
      name.toLowerCase().includes("antiforgery") ||
      name.toLowerCase().includes("aspnet")
    ) {
      cookie = sc.split(";")[0];
      break;
    }
  }
  if (!cookie) {
    cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  }

  const token = extractHiddenInput(
    html,
    "__RequestVerificationToken",
  );
  const internalId = extractHiddenInput(html, "InternalIdentifier");

  if (!token || !internalId) {
    throw new Error(
      `[S${id}] Could not extract token or InternalIdentifier`,
    );
  }

  const productIds = extractProductIds(html);
  console.log(
    `[S${id}] Session initialized — ${productIds.length} product IDs`,
  );

  return {
    session: { id, cookie, internalId, token },
    productIds,
  };
}

async function fetchProduct(
  session: Session,
  productId: string,
): Promise<{ product: ParsedProduct; newToken: string }> {
  const body = new URLSearchParams({
    QueryProductId: productId,
    AutoSubmit: "False",
    ReturnUrl: "",
    InternalIdentifier: session.internalId,
    EventCommand: "query",
    EventResult: "",
    __RequestVerificationToken: session.token,
  });

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: session.cookie,
      "User-Agent": USER_AGENT,
      Accept: "text/html",
    },
    body: body.toString(),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `[S${session.id}] POST product ${productId} failed: ${res.status}`,
    );
  }

  const html = await res.text();

  // Update cookie if server rotated it
  const newCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of newCookies) {
    const name = sc.split("=")[0];
    if (
      name.toLowerCase().includes("antiforgery") ||
      name.toLowerCase().includes("aspnet")
    ) {
      session.cookie = sc.split(";")[0];
      break;
    }
  }

  const newToken = extractHiddenInput(
    html,
    "__RequestVerificationToken",
  );
  if (!newToken) {
    throw new Error(
      `[S${session.id}] No token in response for product ${productId} — chain broken`,
    );
  }

  const tables = parseTables(html);
  const product = parseProduct(tables);

  return { product, newToken };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Worker — processes a slice of product IDs on one session
// ---------------------------------------------------------------------------

async function processChunk(
  session: Session,
  productIds: string[],
  label: string,
): Promise<ParsedProduct[]> {
  const results: ParsedProduct[] = [];
  let failures = 0;
  const maxRetries = 2;

  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { product, newToken } = await fetchProduct(
          session,
          pid,
        );
        session.token = newToken;
        results.push(product);
        break;
      } catch (err: any) {
        if (attempt < maxRetries) {
          console.warn(
            `[${label}] Product ${pid} attempt ${attempt + 1} failed: ${err.message}. Re-initializing session...`,
          );
          try {
            const fresh = await initSession(session.id);
            session.cookie = fresh.session.cookie;
            session.internalId = fresh.session.internalId;
            session.token = fresh.session.token;
            await sleep(500);
          } catch (initErr: any) {
            console.error(
              `[${label}] Session re-init failed: ${initErr.message}`,
            );
          }
        } else {
          console.error(
            `[${label}] Product ${pid} FAILED after ${maxRetries + 1} attempts: ${err.message}`,
          );
          failures++;
        }
      }
    }

    if ((i + 1) % 100 === 0 || i === productIds.length - 1) {
      console.log(
        `[${label}] ${i + 1}/${productIds.length} (${failures} failures)`,
      );
    }

    await sleep(DELAY_MS);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Database insertion — batched, full replace
// ---------------------------------------------------------------------------

async function insertProducts(
  products: ParsedProduct[],
): Promise<void> {
  if (products.length === 0) return;

  const now = new Date();

  // Full replace: delete child tables first (FK order), then parent
  console.log("Clearing existing ie_* tables...");
  await sql`DELETE FROM ie_product_crops`.execute(db);
  await sql`DELETE FROM ie_product_substances`.execute(db);
  await sql`DELETE FROM ie_products`.execute(db);

  console.log(`Inserting ${products.length} products...`);

  // Insert products in batches, collecting generated serial IDs
  const productIdMap = new Map<string, number>(); // pcs_number → product_id

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const rows = batch.map((p) => ({
      product_name: p.product_name,
      pcs_number: p.pcs_number,
      auth_holder: p.auth_holder,
      marketing_company: p.marketing_company,
      product_type: p.product_type,
      function_name: p.function_name,
      user_type: p.user_type,
      last_synced_at: now,
    }));

    const inserted = await db
      .insertInto("ie_products")
      .values(rows)
      .returning(["product_id", "pcs_number"])
      .execute();

    for (const row of inserted) {
      if (row.pcs_number) {
        productIdMap.set(row.pcs_number, row.product_id);
      }
    }
  }

  console.log(`  ${productIdMap.size} products inserted`);

  // Resolve child rows against generated product_ids
  const allSubstances: {
    product_id: number;
    substance_name: string;
    concentration: string | null;
  }[] = [];
  const allCrops: { product_id: number; crop_name: string }[] = [];

  for (const p of products) {
    if (!p.pcs_number) continue;
    const productId = productIdMap.get(p.pcs_number);
    if (!productId) continue;

    const seenSubstances = new Set<string>();
    for (const s of p.substances) {
      if (!seenSubstances.has(s.substance_name)) {
        seenSubstances.add(s.substance_name);
        allSubstances.push({
          product_id: productId,
          substance_name: s.substance_name,
          concentration: s.concentration,
        });
      }
    }
    const seenCrops = new Set<string>();
    for (const crop of p.crops) {
      if (!seenCrops.has(crop)) {
        seenCrops.add(crop);
        allCrops.push({ product_id: productId, crop_name: crop });
      }
    }
  }

  if (allSubstances.length > 0) {
    console.log(
      `Inserting ${allSubstances.length} substance rows...`,
    );
    for (let i = 0; i < allSubstances.length; i += BATCH_SIZE) {
      const batch = allSubstances.slice(i, i + BATCH_SIZE);
      await db
        .insertInto("ie_product_substances")
        .values(batch)
        .execute();
    }
  }

  if (allCrops.length > 0) {
    console.log(`Inserting ${allCrops.length} crop rows...`);
    for (let i = 0; i < allCrops.length; i += BATCH_SIZE) {
      const batch = allCrops.slice(i, i + BATCH_SIZE);
      await db.insertInto("ie_product_crops").values(batch).execute();
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log("=== Ireland PCS Register Ingestion ===\n");

  // Phase 1: Initialize parallel sessions
  console.log(`Initializing ${CONCURRENCY} sessions...`);
  const inits = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => initSession(i + 1)),
  );

  const allProductIds = inits[0].productIds;
  console.log(`\nTotal products to scrape: ${allProductIds.length}`);

  // Phase 2: Split product IDs across sessions
  const chunkSize = Math.ceil(allProductIds.length / CONCURRENCY);
  const chunks: string[][] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    chunks.push(
      allProductIds.slice(i * chunkSize, (i + 1) * chunkSize),
    );
  }
  console.log(
    `Chunks: ${chunks.map((c, i) => `S${i + 1}=${c.length}`).join(", ")}`,
  );

  // Phase 3: Scrape in parallel
  console.log(
    `\nStarting parallel scrape with ${DELAY_MS}ms delay...\n`,
  );
  const scrapeT0 = Date.now();
  const results = await Promise.all(
    inits.map(({ session }, i) =>
      processChunk(session, chunks[i], `S${i + 1}`),
    ),
  );
  const scrapeElapsed = ((Date.now() - scrapeT0) / 1000).toFixed(1);

  const allProducts = results.flat();
  console.log(
    `\nScrape complete: ${allProducts.length} products in ${scrapeElapsed}s`,
  );

  // Validation
  const withSubstances = allProducts.filter(
    (p) => p.substances.length > 0,
  ).length;
  const withCrops = allProducts.filter(
    (p) => p.crops.length > 0,
  ).length;
  const noPcs = allProducts.filter((p) => !p.pcs_number).length;
  const totalSubRows = allProducts.reduce(
    (s, p) => s + p.substances.length,
    0,
  );
  const totalCropRows = allProducts.reduce(
    (s, p) => s + p.crops.length,
    0,
  );
  console.log(
    `  With substances: ${withSubstances} (${totalSubRows} rows), With crops: ${withCrops} (${totalCropRows} rows), No PCS#: ${noPcs}`,
  );

  // Phase 4: Insert into database
  console.log(`\nInserting into database...`);
  await insertProducts(allProducts);

  // Phase 5: Log to sync_log
  await db
    .insertInto("sync_log")
    .values({
      source_name: "IRELAND_PCS",
      source_version: "1.0",
      record_count: allProducts.length,
      synced_at: new Date(),
    })
    .execute();

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== Done in ${totalElapsed}s ===`);

  // Final counts from DB
  const productCount = await db
    .selectFrom("ie_products")
    .select(sql<number>`count(*)`.as("n"))
    .executeTakeFirst();
  const substanceCount = await db
    .selectFrom("ie_product_substances")
    .select(sql<number>`count(*)`.as("n"))
    .executeTakeFirst();
  const cropCount = await db
    .selectFrom("ie_product_crops")
    .select(sql<number>`count(*)`.as("n"))
    .executeTakeFirst();

  console.log(`\nDB counts:`);
  console.log(`  ie_products: ${productCount?.n}`);
  console.log(`  ie_product_substances: ${substanceCount?.n}`);
  console.log(`  ie_product_crops: ${cropCount?.n}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
