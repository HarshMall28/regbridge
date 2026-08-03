import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("eu_emergency_authorisations")
    .addColumn("last_synced_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("eu_emergency_authorisations")
    .dropColumn("last_synced_at")
    .execute();
}
