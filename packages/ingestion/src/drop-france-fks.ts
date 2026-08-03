// packages/ingestion/src/drop-france-fks.ts
import { db, sql } from "@regbridge/db";

const result = await sql`
  SELECT conname, conrelid::regclass AS table_name
  FROM pg_constraint 
  WHERE contype = 'f' 
    AND conrelid::regclass::text LIKE 'fr_%'
`.execute(db);

for (const row of result.rows as any[]) {
  console.log(`Dropping ${row.table_name}.${row.conname}`);
  await sql
    .raw(
      `ALTER TABLE ${row.table_name} DROP CONSTRAINT ${row.conname}`,
    )
    .execute(db);
}

console.log(`Dropped ${result.rows.length} FK constraints`);
process.exit(0);
