import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Widen ALL varchar columns in ALL France tables to text.
  // External data sources should never hit varchar constraints.
  const alterations = [
    // fr_products
    [
      "fr_products",
      [
        "amm_number",
        "type_produit",
        "gamme_usage",
        "etat_autorisation",
        "amm_reference",
      ],
    ],
    // fr_product_substances
    ["fr_product_substances", ["amm_number", "concentration"]],
    // fr_substances
    ["fr_substances", ["numero_cas", "etat_autorisation"]],
    // fr_authorized_uses
    [
      "fr_authorized_uses",
      [
        "amm_number",
        "type_produit",
        "gamme_usage",
        "stade_cultural_min",
        "stade_cultural_max",
        "etat_usage",
        "dose_unite",
        "delai_recolte_bbch",
      ],
    ],
    // fr_all_uses
    [
      "fr_all_uses",
      [
        "amm_number",
        "stade_cultural_min",
        "stade_cultural_max",
        "etat_usage",
        "dose_unite",
        "delai_recolte_bbch",
      ],
    ],
    // fr_hazard_classes
    ["fr_hazard_classes", ["amm_number", "libelle_court"]],
    // fr_conditions_of_use
    ["fr_conditions_of_use", ["amm_number", "type_produit"]],
    // fr_risk_phrases
    ["fr_risk_phrases", ["amm_number", "libelle_court"]],
    // fr_parallel_trade
    [
      "fr_parallel_trade",
      [
        "permis_number",
        "amm_reference_francais",
        "etat_autorisation",
      ],
    ],
  ] as const;

  for (const [table, columns] of alterations) {
    for (const col of columns) {
      await sql`ALTER TABLE ${sql.ref(table)} ALTER COLUMN ${sql.ref(col)} TYPE text`.execute(
        db,
      );
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Not worth reversing — text→varchar(20) would truncate data
}
