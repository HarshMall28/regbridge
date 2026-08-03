/**
 * Migration 003 — Drop FK constraint on eu_mrls.residue_id
 *
 * The MRL API returns historical (applicability=2) and future (applicability=0)
 * records that reference old/upcoming residue IDs. These IDs don't exist in the
 * pesticide-residues endpoint (which only serves current definitions).
 *
 * Verified: zero orphan residue IDs have applicability=1 (current). The join
 * works for all current MRLs. The FK blocks ingestion of legitimate historical data.
 *
 * Run: bun run migrate
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE eu_mrls DROP CONSTRAINT IF EXISTS fk_mrls_residue`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE eu_mrls ADD CONSTRAINT fk_mrls_residue FOREIGN KEY (residue_id) REFERENCES eu_pesticide_residues(residue_id)`.execute(
    db,
  );
}
