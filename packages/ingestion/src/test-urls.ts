import { db, initDb } from "@regbridge/db";

initDb(Bun.env.DATABASE_URL!);
const rows = await db
  .selectFrom("eu_substance_documents")
  .select("source_url")
  .limit(10)
  .execute();
rows.forEach((r) => console.log(r.source_url));
process.exit(0);
