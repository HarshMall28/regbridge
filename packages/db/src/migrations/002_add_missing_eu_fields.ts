/**
 * Migration 002 — Add missing fields from EU Pesticides API
 *
 * Adds:
 *   1. eu_active_substances.classification_reg_1272 (text) — CLP classification, deprecated but still populated
 *   2. eu_active_substances.pest_res_linked_annex (text) — which annex of Reg 396/2005
 *   3. eu_substance_group_members table — group substance → member substance junction
 *
 * Run: bun run migrate (from monorepo root)
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Add classification_reg_1272 column
  await db.schema
    .alterTable("eu_active_substances")
    .addColumn("classification_reg_1272", "text")
    .execute();

  // 2. Add pest_res_linked_annex column
  await db.schema
    .alterTable("eu_active_substances")
    .addColumn("pest_res_linked_annex", "text")
    .execute();

  // 3. Create group members junction table
  await db.schema
    .createTable("eu_substance_group_members")
    .addColumn("group_as_id", "integer", (col) =>
      col.notNull().references("eu_active_substances.as_id")
    )
    .addColumn("member_as_id", "integer", (col) => col.notNull())
    .addColumn("member_name", "varchar(200)")
    .addPrimaryKeyConstraint("eu_substance_group_members_pk", [
      "group_as_id",
      "member_as_id",
    ])
    .execute();

  // Index for reverse lookup: "which groups contain substance X?"
  await db.schema
    .createIndex("idx_group_members_member")
    .on("eu_substance_group_members")
    .column("member_as_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("eu_substance_group_members").ifExists().execute();

  await db.schema
    .alterTable("eu_active_substances")
    .dropColumn("pest_res_linked_annex")
    .execute();

  await db.schema
    .alterTable("eu_active_substances")
    .dropColumn("classification_reg_1272")
    .execute();
}
