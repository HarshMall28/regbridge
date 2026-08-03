import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop the current PK on permis_number
  await sql`ALTER TABLE fr_parallel_trade DROP CONSTRAINT fr_parallel_trade_pkey`.execute(
    db,
  );
  // Add a serial id column as new PK
  await sql`ALTER TABLE fr_parallel_trade ADD COLUMN id serial PRIMARY KEY`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE fr_parallel_trade DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE fr_parallel_trade ADD PRIMARY KEY (permis_number)`.execute(
    db,
  );
}
