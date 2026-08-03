/**
 * Migration 009: Drop FK constraint on oft_metabolites.metabolite_substance_uuid
 *
 * 60 of 1,373 metabolite rows reference substance UUIDs not present in oft_substances.
 * These are valid cross-references to substances outside the OFT 3.0 IUCLID export.
 * Same pattern as Chat 2's migration 003 dropping eu_mrls.residue_id FK.
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("oft_metabolites")
    .dropConstraint("fk_met_metabolite")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("oft_metabolites")
    .addForeignKeyConstraint(
      "fk_met_metabolite",
      ["metabolite_substance_uuid"],
      "oft_substances",
      ["uuid"],
    )
    .execute();
}
