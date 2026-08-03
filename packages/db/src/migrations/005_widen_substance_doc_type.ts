import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("eu_substance_documents")
    .alterColumn("document_type", (col) => col.setDataType("text"))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("eu_substance_documents")
    .alterColumn("document_type", (col) => col.setDataType("varchar(50)"))
    .execute();
}
