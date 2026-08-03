import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Extensions
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // countries
  await db.schema
    .createTable("countries")
    .addColumn("country_code", "varchar(2)", (col) =>
      col.primaryKey(),
    )
    .addColumn("country_name", "varchar(50)")
    .execute();

  // eu_active_substances
  await db.schema
    .createTable("eu_active_substances")
    .addColumn("as_id", "integer", (col) => col.primaryKey())
    .addColumn("name", "varchar(200)")
    .addColumn("cas_number", "varchar(20)")
    .addColumn("status", "varchar(50)")
    .addColumn("approval_dt", "date")
    .addColumn("expiry_dt", "date")
    .addColumn("risk_assessment", "varchar(10)")
    .addColumn("is_microorganism", "boolean")
    .addColumn("rms", "varchar(4000)")
    .addColumn("corms", "varchar(4000)")
    .addColumn("remark", "text")
    .addColumn("legislations_old", "text")
    .addColumn("legislations_actives", "text")
    .addColumn("tox_value_adi", "varchar(42)")
    .addColumn("tox_source_adi", "varchar(100)")
    .addColumn("tox_remark_adi", "varchar(200)")
    .addColumn("tox_value_arfd", "varchar(42)")
    .addColumn("tox_source_arfd", "varchar(100)")
    .addColumn("tox_remark_arfd", "varchar(200)")
    .addColumn("tox_value_aoel", "varchar(42)")
    .addColumn("tox_source_aoel", "varchar(100)")
    .addColumn("tox_remark_aoel", "varchar(200)")
    .addColumn("tox_value_aaoel", "varchar(42)")
    .addColumn("tox_source_aaoel", "varchar(100)")
    .addColumn("tox_remark_aaoel", "varchar(200)")
    .addColumn("tox_value_other", "varchar(42)")
    .addColumn("tox_source_other", "varchar(100)")
    .addColumn("tox_remark_other", "varchar(200)")
    .addColumn("authorisations_at_nat_level", "text")
    .addColumn("basic_substance", "boolean")
    .addColumn("low_risk", "boolean")
    .addColumn("candidate_for_substitution", "boolean")
    .addColumn("candidate_for_substitution_type", "varchar(40)")
    .addColumn("part_of_group", "boolean")
    .addColumn("part_of_group_id", "integer")
    .addColumn("is_group", "boolean")
    .addColumn("pesticide_residue_linked", "text")
    .addColumn("pest_res_mrl_webpage", "text")
    .addColumn("pest_res_linked_legislation", "text")
    .addColumn("pest_res_linked_legislation_url", "text")
    .addColumn("last_synced_at", "timestamptz")
    .execute();

  // eu_country_authorizations
  await db.schema
    .createTable("eu_country_authorizations")
    .addColumn("as_id", "integer", (col) => col.notNull())
    .addColumn("country_code", "varchar(2)", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_eu_country_auth", [
      "as_id",
      "country_code",
    ])
    .addForeignKeyConstraint(
      "fk_eca_substance",
      ["as_id"],
      "eu_active_substances",
      ["as_id"],
    )
    .addForeignKeyConstraint(
      "fk_eca_country",
      ["country_code"],
      "countries",
      ["country_code"],
    )
    .execute();

  // eu_substance_categories
  await db.schema
    .createTable("eu_substance_categories")
    .addColumn("as_id", "integer", (col) => col.notNull())
    .addColumn("category_code", "varchar(5)", (col) => col.notNull())
    .addColumn("category_name", "varchar(50)")
    .addPrimaryKeyConstraint("pk_eu_sub_cat", [
      "as_id",
      "category_code",
    ])
    .addForeignKeyConstraint(
      "fk_esc_substance",
      ["as_id"],
      "eu_active_substances",
      ["as_id"],
    )
    .execute();

  // eu_substance_documents
  await db.schema
    .createTable("eu_substance_documents")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("as_id", "integer", (col) => col.notNull())
    .addColumn("filename", "text")
    .addColumn("document_type", "varchar(50)")
    .addColumn("description", "text")
    .addColumn("source_url", "text")
    .addForeignKeyConstraint(
      "fk_esd_substance",
      ["as_id"],
      "eu_active_substances",
      ["as_id"],
    )
    .execute();

  // eu_emergency_authorisations
  await db.schema
    .createTable("eu_emergency_authorisations")
    .addColumn("id", "integer", (col) => col.primaryKey())
    .addColumn("company_code", "text")
    .addColumn("trade_names", "jsonb")
    .addColumn("active_substances", "jsonb")
    .addColumn("active_substance_ids", "jsonb")
    .addColumn("country_code", "varchar(2)")
    .addColumn("country_name", "varchar(50)")
    .addColumn("valid_from", "timestamptz")
    .addColumn("valid_until", "timestamptz")
    .addColumn("auth_holder", "text")
    .addColumn("pdf_file", "text")
    .addColumn("excel_file", "text")
    .addColumn("crop_eppo_codes", "jsonb")
    .addColumn("crop_eppo_names", "jsonb")
    .addForeignKeyConstraint(
      "fk_eea_country",
      ["country_code"],
      "countries",
      ["country_code"],
    )
    .execute();

  // eu_pesticide_residues
  await db.schema
    .createTable("eu_pesticide_residues")
    .addColumn("residue_id", "integer", (col) => col.primaryKey())
    .addColumn("residue_name", "text")
    .addColumn("language", "varchar(2)")
    .addColumn("footnote_code", "text")
    .addColumn("footnote_def", "text")
    .addColumn("footnote_txt", "text")
    .addColumn("version_nbr", "integer")
    .addColumn("original_residue_id", "integer")
    .execute();

  // eu_commodities
  await db.schema
    .createTable("eu_commodities")
    .addColumn("commodity_id", "integer", (col) => col.primaryKey())
    .addColumn("parent_id", "integer")
    .addColumn("product_code", "varchar(7)")
    .addColumn("product_type_id", "integer")
    .addColumn("product_name", "varchar(500)")
    .addColumn("scientific_names", "text")
    .addColumn("synonym_names", "text")
    .addColumn("scientific_synonyms", "text")
    .execute();

  // eu_mrls
  await db.schema
    .createTable("eu_mrls")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("residue_id", "integer")
    .addColumn("commodity_id", "integer")
    .addColumn("included_in_annex", "varchar(50)")
    .addColumn("regulation_number", "varchar(100)")
    .addColumn("regulation_url", "varchar(200)")
    .addColumn("voted_date", "varchar(10)")
    .addColumn("entry_into_force_date", "varchar(10)")
    .addColumn("application_date", "varchar(10)")
    .addColumn("applicability", "integer")
    .addColumn("applicability_text", "varchar(20)")
    .addColumn("mrl_value", "varchar(15)")
    .addColumn("mrl_value_only", "numeric")
    .addColumn("mrl_lod", "varchar(1)")
    .addColumn("footnote_text", "text")
    .addColumn("current_version_number", "integer")
    .addColumn("original_pesticide_residue_id", "integer")
    .addColumn("next_version_number", "integer")
    .addColumn("next_pesticide_residue_id", "integer")
    .addForeignKeyConstraint(
      "fk_mrls_residue",
      ["residue_id"],
      "eu_pesticide_residues",
      ["residue_id"],
    )
    .addForeignKeyConstraint(
      "fk_mrls_commodity",
      ["commodity_id"],
      "eu_commodities",
      ["commodity_id"],
    )
    .execute();

  // eu_regulations
  await db.schema
    .createTable("eu_regulations")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("regulation_code", "varchar(100)", (col) =>
      col.unique().notNull(),
    )
    .addColumn("eur_lex_url", "text", (col) => col.unique())
    .addColumn("full_text", "text")
    .addColumn("voted_date", "date")
    .addColumn("entry_into_force_date", "date")
    .addColumn("application_date", "date")
    .execute();

  // oft_reference_substances
  await db.schema
    .createTable("oft_reference_substances")
    .addColumn("uuid", "varchar(36)", (col) => col.primaryKey())
    .addColumn("cas_number", "varchar(20)")
    .addColumn("ec_number", "varchar(20)")
    .addColumn("reference_substance_name", "varchar(500)")
    .addColumn("iupac_name", "text")
    .addColumn("molecular_formula", "varchar(200)")
    .addColumn("smiles", "text")
    .addColumn("inchi", "text")
    .addColumn("inchi_key", "varchar(30)")
    .addColumn("efsa_param_code", "varchar(50)")
    .addColumn("pubchem_cid", "varchar(30)")
    .addColumn("epa_dtxsid", "varchar(30)")
    .addColumn("oft2_sub_name", "varchar(500)")
    .addColumn("oft2_com_name", "varchar(500)")
    .execute();

  // oft_substances
  await db.schema
    .createTable("oft_substances")
    .addColumn("uuid", "varchar(36)", (col) => col.primaryKey())
    .addColumn("chemical_name", "varchar(500)")
    .addColumn("ref_substance_uuid", "varchar(36)")
    .addColumn("composition_type", "varchar(100)")
    .addColumn("origin", "varchar(100)")
    .addForeignKeyConstraint(
      "fk_oftsub_refsubstance",
      ["ref_substance_uuid"],
      "oft_reference_substances",
      ["uuid"],
    )
    .execute();

  // oft_dossiers
  await db.schema
    .createTable("oft_dossiers")
    .addColumn("uuid", "varchar(36)", (col) => col.primaryKey())
    .addColumn("efsa_question_number", "text")
    .addColumn("expert_group", "varchar(50)")
    .addColumn("food_domain", "varchar(100)")
    .addColumn("regulation", "text")
    .addColumn("output_title", "text")
    .addColumn("doi", "varchar(200)")
    .addColumn("evaluation_date", "date")
    .addColumn("output_type", "varchar(100)")
    .addColumn("substance_uuid", "varchar(36)")
    .execute();

  // oft_dossier_docs
  await db.schema
    .createTable("oft_dossier_docs")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("dossier_uuid", "varchar(36)")
    .addColumn("document_type", "varchar(50)")
    .addColumn("document_subtype", "varchar(100)")
    .addColumn("document_uuid", "varchar(36)")
    .addForeignKeyConstraint(
      "fk_dd_dossier",
      ["dossier_uuid"],
      "oft_dossiers",
      ["uuid"],
    )
    .execute();

  // oft_tox_ref_values
  await db.schema
    .createTable("oft_tox_ref_values")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("doc_uuid", "varchar(36)")
    .addColumn("substance_uuid", "varchar(36)")
    .addColumn("dossier_uuid", "varchar(36)")
    .addColumn("endpoint_type", "varchar(10)")
    .addColumn("value_lower", "real")
    .addColumn("value_upper", "real")
    .addColumn("qualifier_lower", "varchar(5)")
    .addColumn("qualifier_upper", "varchar(5)")
    .addColumn("unit", "varchar(30)")
    .addColumn("assessment_body", "varchar(100)")
    .addColumn("critical_endpoint", "text")
    .addColumn("justification", "text")
    .addColumn("overall_uncertainty_factor", "real")
    .addColumn("oral_absorption_pct", "real")
    .addColumn("population", "varchar(100)")
    .addColumn("not_allocated", "boolean")
    .addColumn("discussion", "text")
    .addColumn("ref_value_descriptor", "varchar(200)")
    .addColumn("efsa_opinion_ref", "text")
    .addForeignKeyConstraint(
      "fk_trv_substance",
      ["substance_uuid"],
      "oft_substances",
      ["uuid"],
    )
    .addForeignKeyConstraint(
      "fk_trv_dossier",
      ["dossier_uuid"],
      "oft_dossiers",
      ["uuid"],
    )
    .execute();

  // oft_endpoint_summaries
  await db.schema
    .createTable("oft_endpoint_summaries")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("doc_uuid", "varchar(36)")
    .addColumn("substance_uuid", "varchar(36)")
    .addColumn("definition", "varchar(100)")
    .addColumn("genotox_in_vitro", "text")
    .addColumn("genotox_in_vivo", "text")
    .addColumn("carcinogenicity", "text")
    .addColumn("key_information", "text")
    .addColumn("discussion", "text")
    .addForeignKeyConstraint(
      "fk_es_substance",
      ["substance_uuid"],
      "oft_substances",
      ["uuid"],
    )
    .execute();

  // oft_metabolites
  await db.schema
    .createTable("oft_metabolites")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("doc_uuid", "varchar(36)")
    .addColumn("parent_substance_uuid", "varchar(36)")
    .addColumn("metabolite_substance_uuid", "varchar(36)")
    .addColumn("remarks", "text")
    .addForeignKeyConstraint(
      "fk_met_parent",
      ["parent_substance_uuid"],
      "oft_substances",
      ["uuid"],
    )
    .addForeignKeyConstraint(
      "fk_met_metabolite",
      ["metabolite_substance_uuid"],
      "oft_substances",
      ["uuid"],
    )
    .execute();

  // oft_literature
  await db.schema
    .createTable("oft_literature")
    .addColumn("uuid", "varchar(36)", (col) => col.primaryKey())
    .addColumn("author", "text")
    .addColumn("literature_type", "varchar(50)")
    .addColumn("title", "text")
    .addColumn("reference_year", "integer")
    .addColumn("report_no", "text")
    .addColumn("doi", "text")
    .addColumn("source", "text")
    .addColumn("remarks", "text")
    .execute();

  // ie_products
  await db.schema
    .createTable("ie_products")
    .addColumn("product_id", "serial", (col) => col.primaryKey())
    .addColumn("product_name", "text")
    .addColumn("pcs_number", "varchar(20)", (col) => col.unique())
    .addColumn("auth_holder", "text")
    .addColumn("marketing_company", "text")
    .addColumn("product_type", "varchar(20)")
    .addColumn("function_name", "varchar(50)")
    .addColumn("user_type", "varchar(20)")
    .addColumn("last_synced_at", "timestamptz")
    .execute();

  // ie_product_substances
  await db.schema
    .createTable("ie_product_substances")
    .addColumn("product_id", "integer", (col) => col.notNull())
    .addColumn("substance_name", "text", (col) => col.notNull())
    .addColumn("concentration", "varchar(50)")
    .addPrimaryKeyConstraint("pk_ie_prod_sub", [
      "product_id",
      "substance_name",
    ])
    .addForeignKeyConstraint(
      "fk_ips_product",
      ["product_id"],
      "ie_products",
      ["product_id"],
    )
    .execute();

  // ie_product_crops
  await db.schema
    .createTable("ie_product_crops")
    .addColumn("product_id", "integer", (col) => col.notNull())
    .addColumn("crop_name", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_ie_prod_crop", [
      "product_id",
      "crop_name",
    ])
    .addForeignKeyConstraint(
      "fk_ipc_product",
      ["product_id"],
      "ie_products",
      ["product_id"],
    )
    .execute();

  // fr_products
  await db.schema
    .createTable("fr_products")
    .addColumn("amm_number", "varchar(20)", (col) => col.primaryKey())
    .addColumn("product_name", "text")
    .addColumn("type_produit", "varchar(20)")
    .addColumn("seconds_noms", "text")
    .addColumn("titulaire", "text")
    .addColumn("type_commercial", "text")
    .addColumn("gamme_usage", "varchar(20)")
    .addColumn("mentions_autorisees", "text")
    .addColumn("restrictions_usage", "text")
    .addColumn("restrictions_usage_libelle", "text")
    .addColumn("substances_actives_raw", "text")
    .addColumn("fonctions", "text")
    .addColumn("formulations", "text")
    .addColumn("etat_autorisation", "varchar(20)")
    .addColumn("date_retrait", "date")
    .addColumn("date_premiere_autorisation", "date")
    .addColumn("amm_reference", "varchar(20)")
    .addColumn("nom_produit_reference", "text")
    .addColumn("last_synced_at", "timestamptz")
    .execute();

  // fr_product_substances
  await db.schema
    .createTable("fr_product_substances")
    .addColumn("amm_number", "varchar(20)", (col) => col.notNull())
    .addColumn("substance_name", "text", (col) => col.notNull())
    .addColumn("concentration", "varchar(50)")
    .addPrimaryKeyConstraint("pk_fr_prod_sub", [
      "amm_number",
      "substance_name",
    ])
    .addForeignKeyConstraint(
      "fk_fps_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_substances
  await db.schema
    .createTable("fr_substances")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("nom_substance", "text", (col) =>
      col.unique().notNull(),
    )
    .addColumn("numero_cas", "varchar(20)")
    .addColumn("etat_autorisation", "varchar(20)")
    .addColumn("variant", "text")
    .execute();

  // fr_authorized_uses
  await db.schema
    .createTable("fr_authorized_uses")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("amm_number", "varchar(20)")
    .addColumn("type_produit", "varchar(20)")
    .addColumn("nom_produit", "text")
    .addColumn("seconds_noms", "text")
    .addColumn("titulaire", "text")
    .addColumn("type_commercial", "text")
    .addColumn("gamme_usage", "varchar(20)")
    .addColumn("mentions_autorisees", "text")
    .addColumn("substances_actives", "text")
    .addColumn("fonctions", "text")
    .addColumn("formulations", "text")
    .addColumn("identifiant_usage_lib_court", "text")
    .addColumn("identifiant_usage", "text")
    .addColumn("date_decision", "date")
    .addColumn("stade_cultural_min", "varchar(10)")
    .addColumn("stade_cultural_max", "varchar(10)")
    .addColumn("etat_usage", "varchar(20)")
    .addColumn("dose_retenue", "numeric")
    .addColumn("dose_unite", "varchar(20)")
    .addColumn("delai_recolte_jour", "integer")
    .addColumn("delai_recolte_bbch", "varchar(10)")
    .addColumn("nombre_max_application", "integer")
    .addColumn("date_fin_distribution", "date")
    .addColumn("date_fin_utilisation", "date")
    .addColumn("condition_emploi", "text")
    .addColumn("znt_aquatique_m", "integer")
    .addColumn("znt_arthropodes_m", "integer")
    .addForeignKeyConstraint(
      "fk_fau_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_all_uses
  await db.schema
    .createTable("fr_all_uses")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("amm_number", "varchar(20)")
    .addColumn("nom_produit", "text")
    .addColumn("identifiant_usage", "text")
    .addColumn("date_decision", "date")
    .addColumn("stade_cultural_min", "varchar(10)")
    .addColumn("stade_cultural_max", "varchar(10)")
    .addColumn("etat_usage", "varchar(20)")
    .addColumn("dose_retenue", "numeric")
    .addColumn("dose_unite", "varchar(20)")
    .addColumn("delai_recolte_jour", "integer")
    .addColumn("delai_recolte_bbch", "varchar(10)")
    .addColumn("nombre_max_application", "integer")
    .addColumn("date_fin_distribution", "date")
    .addColumn("date_fin_utilisation", "date")
    .addColumn("condition_emploi", "text")
    .addColumn("znt_aquatique_m", "integer")
    .addColumn("znt_arthropodes_m", "integer")
    .addColumn("znt_plantes_m", "integer")
    .addColumn("mentions_autorisees", "text")
    .addColumn("intervalle_min_applications_jour", "integer")
    .addForeignKeyConstraint(
      "fk_fau_all_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_hazard_classes
  await db.schema
    .createTable("fr_hazard_classes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("amm_number", "varchar(20)")
    .addColumn("nom_produit", "text")
    .addColumn("libelle_court", "varchar(20)")
    .addColumn("libelle_long", "text")
    .addForeignKeyConstraint(
      "fk_fhc_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_conditions_of_use
  await db.schema
    .createTable("fr_conditions_of_use")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("amm_number", "varchar(20)")
    .addColumn("type_produit", "varchar(20)")
    .addColumn("nom_produit", "text")
    .addColumn("categorie", "text")
    .addColumn("condition_libelle", "text")
    .addForeignKeyConstraint(
      "fk_fcou_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_risk_phrases
  await db.schema
    .createTable("fr_risk_phrases")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("amm_number", "varchar(20)")
    .addColumn("nom_produit", "text")
    .addColumn("libelle_court", "varchar(10)")
    .addColumn("libelle_long", "text")
    .addForeignKeyConstraint(
      "fk_frp_product",
      ["amm_number"],
      "fr_products",
      ["amm_number"],
    )
    .execute();

  // fr_parallel_trade
  await db.schema
    .createTable("fr_parallel_trade")
    .addColumn("permis_number", "varchar(20)", (col) =>
      col.primaryKey(),
    )
    .addColumn("nom_produit", "text")
    .addColumn("etat_autorisation", "varchar(20)")
    .addColumn("detenteur_pcp", "text")
    .addColumn("produit_reference_francais", "text")
    .addColumn("amm_reference_francais", "varchar(20)")
    .addColumn("nom_produit_importe", "text")
    .addColumn("amm_produit_importe", "text")
    .addColumn("etat_membre_origine", "text")
    .addColumn("mentions_etiquetage", "text")
    .execute();

  // sync_log
  await db.schema
    .createTable("sync_log")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("source_name", "varchar(50)", (col) => col.notNull())
    .addColumn("source_version", "varchar(50)")
    .addColumn("file_md5", "varchar(32)")
    .addColumn("record_count", "integer")
    .addColumn("synced_at", "timestamptz", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // B-tree indexes
  await sql`CREATE INDEX idx_eas_cas ON eu_active_substances (cas_number)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_eas_expiry ON eu_active_substances (expiry_dt)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_eca_country ON eu_country_authorizations (country_code)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_mrls_residue ON eu_mrls (residue_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_mrls_commodity ON eu_mrls (commodity_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_mrls_applicability ON eu_mrls (applicability)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_eea_valid_until ON eu_emergency_authorisations (valid_until)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_eea_substance_ids ON eu_emergency_authorisations USING gin (active_substance_ids)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_oft_ref_cas ON oft_reference_substances (cas_number)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_oft_sub_refuuid ON oft_substances (ref_substance_uuid)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trv_substance ON oft_tox_ref_values (substance_uuid)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trv_endpoint ON oft_tox_ref_values (endpoint_type)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_es_substance ON oft_endpoint_summaries (substance_uuid)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_ie_pcs ON ie_products (pcs_number)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_ips_substance ON ie_product_substances (substance_name)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_fps_substance ON fr_product_substances (substance_name)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_fr_cas ON fr_substances (numero_cas)`.execute(
    db,
  );

  // GIN trigram indexes for Cmd+K palette
  await sql`CREATE INDEX idx_trgm_eas_name ON eu_active_substances USING gin (name gin_trgm_ops)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trgm_ie_product ON ie_products USING gin (product_name gin_trgm_ops)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trgm_ie_auth ON ie_products USING gin (auth_holder gin_trgm_ops)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trgm_fr_product ON fr_products USING gin (product_name gin_trgm_ops)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_trgm_fr_titulaire ON fr_products USING gin (titulaire gin_trgm_ops)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    "sync_log",
    "fr_parallel_trade",
    "fr_risk_phrases",
    "fr_conditions_of_use",
    "fr_hazard_classes",
    "fr_all_uses",
    "fr_authorized_uses",
    "fr_substances",
    "fr_product_substances",
    "fr_products",
    "ie_product_crops",
    "ie_product_substances",
    "ie_products",
    "oft_literature",
    "oft_metabolites",
    "oft_endpoint_summaries",
    "oft_tox_ref_values",
    "oft_dossier_docs",
    "oft_dossiers",
    "oft_substances",
    "oft_reference_substances",
    "eu_regulations",
    "eu_mrls",
    "eu_commodities",
    "eu_pesticide_residues",
    "eu_emergency_authorisations",
    "eu_substance_documents",
    "eu_substance_categories",
    "eu_country_authorizations",
    "eu_active_substances",
    "countries",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }

  await sql`DROP EXTENSION IF EXISTS pg_trgm`.execute(db);
}
