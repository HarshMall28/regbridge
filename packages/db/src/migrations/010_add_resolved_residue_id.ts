/**
 * Migration 008: Add resolved_residue_id to eu_active_substances
 *
 * Adds a pre-computed FK from eu_active_substances to eu_pesticide_residues,
 * resolving the text-based pesticide_residue_linked field to an integer residue_id.
 *
 * Also creates prl_overrides — a small reference table (3 rows) for edge cases
 * where the pesticide_residue_linked text cannot be algorithmically matched
 * to eu_pesticide_residues.residue_name.
 *
 * Run: bun run migrate
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add resolved_residue_id column
  await db.schema
    .alterTable("eu_active_substances")
    .addColumn("resolved_residue_id", "integer")
    .execute();

  // 2. Create prl_overrides table
  await db.schema
    .createTable("prl_overrides")
    .addColumn("prl_text", "text", (col) => col.primaryKey())
    .addColumn("resolved_residue_id", "integer", (col) =>
      col.notNull(),
    )
    .execute();

  // 3. Seed the 3 override mappings (manually verified):
  //    - "Copper compounds (Copper)" × 6 substances → "Total copper" (4050)
  //    - "Fosetyl-Al (...)" × 2 substances → "Fosetyl" (3650)
  //    - "Dazomet (Methylisothiocyanate...)" × 2 substances → "Methylisothiocyanate (...)" (2711)
  await sql`
    INSERT INTO prl_overrides (prl_text, resolved_residue_id) VALUES
      ('Copper compounds (Copper)', 4050),
      ('Fosetyl-Al (sum of fosetyl, phosphonic acid and their salts, expressed as fosetyl)', 3650),
      ('Dazomet (Methylisothiocyanate resulting from the use of dazomet and metam)', 2711)
    ON CONFLICT (prl_text) DO UPDATE SET
      resolved_residue_id = EXCLUDED.resolved_residue_id
  `.execute(db);

  // 4. Run initial resolution pass on existing data
  //    (same logic the ingestion script runs on every sync)

  // Step 1: Trim trailing whitespace
  await sql`
    UPDATE eu_active_substances
    SET pesticide_residue_linked = TRIM(pesticide_residue_linked)
    WHERE pesticide_residue_linked IS NOT NULL
      AND pesticide_residue_linked != TRIM(pesticide_residue_linked)
  `.execute(db);

  // Step 2: Exact match
  await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = epr.residue_id
    FROM eu_pesticide_residues epr
    WHERE epr.residue_name = eas.pesticide_residue_linked
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND eas.resolved_residue_id IS NULL
  `.execute(db);

  // Step 3: ILIKE prefix (catches footnote markers like (F), (R), (A))
  await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = epr.residue_id
    FROM eu_pesticide_residues epr
    WHERE epr.residue_name ILIKE eas.pesticide_residue_linked || '%'
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND eas.resolved_residue_id IS NULL
  `.execute(db);

  // Step 4: Substance name contained in residue name (single match only)
  await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = (
      SELECT epr.residue_id FROM eu_pesticide_residues epr
      WHERE epr.residue_name ILIKE '%' || eas.name || '%'
      LIMIT 1
    )
    WHERE eas.resolved_residue_id IS NULL
      AND eas.pesticide_residue_linked IS NOT NULL
      AND eas.pesticide_residue_linked NOT LIKE 'Default%'
      AND (
        SELECT COUNT(*) FROM eu_pesticide_residues epr
        WHERE epr.residue_name ILIKE '%' || eas.name || '%'
      ) = 1
  `.execute(db);

  // Step 5: Override table
  await sql`
    UPDATE eu_active_substances eas
    SET resolved_residue_id = po.resolved_residue_id
    FROM prl_overrides po
    WHERE eas.pesticide_residue_linked = po.prl_text
      AND eas.resolved_residue_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("eu_active_substances")
    .dropColumn("resolved_residue_id")
    .execute();

  await db.schema.dropTable("prl_overrides").ifExists().execute();
}
