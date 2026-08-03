/**
 * Migration 008: Expand OFT tables to capture all xlsx columns + widen varchar→text
 *
 * Two concerns addressed:
 * 1. The xlsx has columns we weren't storing. Add them.
 * 2. Several OFT columns were created as varchar(N) in 001_initial.ts.
 *    Probed max lengths show data exceeding those limits (e.g. iupac_name: 849 chars
 *    vs varchar(500), molecular_formula: 107 chars vs varchar(200)).
 *    Widen everything to text — same lesson as Chat 5's migration 006 for fr_ tables.
 *
 * Tables affected: 6 of 8 OFT tables + oft_tox_ref_values gets key_information column.
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // =========================================================================
  // PART 1: Widen all varchar(N) columns to text on OFT tables
  // =========================================================================
  // Chat 1 migration used varchar(N) based on SCHEMA.md estimates. Actual data
  // overflows these. The pattern from Chat 5: always use text for external data.

  // oft_reference_substances: uuid varchar(36), cas_number varchar(20),
  //   ec_number varchar(20), reference_substance_name varchar(500),
  //   molecular_formula varchar(200), inchi_key varchar(30),
  //   efsa_param_code varchar(50), pubchem_cid varchar(30),
  //   epa_dtxsid varchar(30), oft2_sub_name varchar(500), oft2_com_name varchar(500)
  const refSubVarchars = [
    "uuid", "cas_number", "ec_number", "reference_substance_name",
    "molecular_formula", "inchi_key", "efsa_param_code", "pubchem_cid",
    "epa_dtxsid", "oft2_sub_name", "oft2_com_name",
  ];
  for (const col of refSubVarchars) {
    await db.schema
      .alterTable("oft_reference_substances")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_substances: uuid varchar(36), chemical_name varchar(500),
  //   ref_substance_uuid varchar(36), composition_type varchar(100),
  //   origin varchar(100)
  const subVarchars = [
    "uuid", "chemical_name", "ref_substance_uuid", "composition_type", "origin",
  ];
  for (const col of subVarchars) {
    await db.schema
      .alterTable("oft_substances")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_dossiers: uuid varchar(36), expert_group varchar(50),
  //   food_domain varchar(100), doi varchar(200),
  //   output_type varchar(100), substance_uuid varchar(36)
  const dossierVarchars = [
    "uuid", "expert_group", "food_domain", "doi", "output_type", "substance_uuid",
  ];
  for (const col of dossierVarchars) {
    await db.schema
      .alterTable("oft_dossiers")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_dossier_docs: dossier_uuid varchar(36), document_type varchar(50),
  //   document_subtype varchar(100), document_uuid varchar(36)
  const ddVarchars = [
    "dossier_uuid", "document_type", "document_subtype", "document_uuid",
  ];
  for (const col of ddVarchars) {
    await db.schema
      .alterTable("oft_dossier_docs")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_tox_ref_values: doc_uuid varchar(36), substance_uuid varchar(36),
  //   dossier_uuid varchar(36), endpoint_type varchar(10),
  //   qualifier_lower varchar(5), qualifier_upper varchar(5),
  //   unit varchar(30), assessment_body varchar(100),
  //   population varchar(100), ref_value_descriptor varchar(200)
  const toxVarchars = [
    "doc_uuid", "substance_uuid", "dossier_uuid", "endpoint_type",
    "qualifier_lower", "qualifier_upper", "unit", "assessment_body",
    "population", "ref_value_descriptor",
  ];
  for (const col of toxVarchars) {
    await db.schema
      .alterTable("oft_tox_ref_values")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_endpoint_summaries: doc_uuid varchar(36), substance_uuid varchar(36),
  //   definition varchar(100)
  const endSumVarchars = ["doc_uuid", "substance_uuid", "definition"];
  for (const col of endSumVarchars) {
    await db.schema
      .alterTable("oft_endpoint_summaries")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_metabolites: doc_uuid varchar(36), parent_substance_uuid varchar(36),
  //   metabolite_substance_uuid varchar(36)
  const metabVarchars = [
    "doc_uuid", "parent_substance_uuid", "metabolite_substance_uuid",
  ];
  for (const col of metabVarchars) {
    await db.schema
      .alterTable("oft_metabolites")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // oft_literature: uuid varchar(36), literature_type varchar(50)
  const litVarchars = ["uuid", "literature_type"];
  for (const col of litVarchars) {
    await db.schema
      .alterTable("oft_literature")
      .alterColumn(col, (ac) => ac.setDataType("text"))
      .execute();
  }

  // =========================================================================
  // PART 2: Add new columns discovered from xlsx probe
  // =========================================================================

  // --- oft_reference_substances: 7 new columns ---
  // cas_name: IUPAC-style name tied to CAS (distinct from reference_substance_name)
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("cas_name", "text")
    .execute();

  // cas_number_alt: second "CAS number" field, differs from Inventory.CASNumber in 4 rows
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("cas_number_alt", "text")
    .execute();

  // cms_id: internal identifier
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("cms_id", "text")
    .execute();

  // description: substance description, max 1658 chars
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("description", "text")
    .execute();

  // inventory_entry: EC inventory entry reference
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("inventory_entry", "text")
    .execute();

  // name: alternative name field, max 277 chars
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("name", "text")
    .execute();

  // param_name: human-readable EFSA parameter name
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("param_name", "text")
    .execute();

  // related_substances_info: group/category classification, max 754 chars
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("related_substances_info", "text")
    .execute();

  // trade_name: commercial trade names
  await db.schema
    .alterTable("oft_reference_substances")
    .addColumn("trade_name", "text")
    .execute();

  // --- oft_substances: 1 new column ---
  // owner_legal_entity: UUID of owning legal entity
  await db.schema
    .alterTable("oft_substances")
    .addColumn("owner_legal_entity", "text")
    .execute();

  // --- oft_dossiers: 4 new columns ---
  // submission_remark: publication date and other metadata
  await db.schema
    .alterTable("oft_dossiers")
    .addColumn("submission_remark", "text")
    .execute();

  // submitting_legal_entity: who submitted the evaluation
  await db.schema
    .alterTable("oft_dossiers")
    .addColumn("submitting_legal_entity", "text")
    .execute();

  // template_name: user-assigned dossier name, max 255 chars
  await db.schema
    .alterTable("oft_dossiers")
    .addColumn("template_name", "text")
    .execute();

  // template_version: IUCLID template version (e.g. "efsa 2.0")
  await db.schema
    .alterTable("oft_dossiers")
    .addColumn("template_version", "text")
    .execute();

  // --- oft_tox_ref_values: 2 new columns ---
  // key_information: summary text on ToxRefValues (separate from END_SUM key_information)
  await db.schema
    .alterTable("oft_tox_ref_values")
    .addColumn("key_information", "text")
    .execute();

  // justification_overall_uf: reasoning for uncertainty factor choice, max 734 chars
  await db.schema
    .alterTable("oft_tox_ref_values")
    .addColumn("justification_overall_uf", "text")
    .execute();

  // --- oft_endpoint_summaries: 5 new columns ---
  // carcinogenicity_remarks: JustificationForClassificationOrNonClassification.Remarks
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("carcinogenicity_remarks", "text")
    .execute();

  // absorption_oral: KeyValue.AbsorptionOral
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("absorption_oral", "text")
    .execute();

  // bioaccumulation: KeyValue.Bioaccumulation
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("bioaccumulation", "text")
    .execute();

  // genotox_in_vitro_study_link: UUID link to relevant study record
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("genotox_in_vitro_study_link", "text")
    .execute();

  // genotox_in_vivo_study_link: UUID link to relevant study record
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("genotox_in_vivo_study_link", "text")
    .execute();

  // long_term_tox_oral_study: study name/type for long-term oral tox
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("long_term_tox_oral_study", "text")
    .execute();

  // study_record_link: generic link to relevant study record
  await db.schema
    .alterTable("oft_endpoint_summaries")
    .addColumn("study_record_link", "text")
    .execute();

  // --- oft_metabolites: 1 new column ---
  // metabolite_uuid: the metabolite entry's own UUID (ListMetabolites.Metabolites.UUID)
  await db.schema
    .alterTable("oft_metabolites")
    .addColumn("metabolite_uuid", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop new columns (reverse order of addition)
  await db.schema.alterTable("oft_metabolites").dropColumn("metabolite_uuid").execute();

  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("study_record_link").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("long_term_tox_oral_study").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("genotox_in_vivo_study_link").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("genotox_in_vitro_study_link").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("bioaccumulation").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("absorption_oral").execute();
  await db.schema.alterTable("oft_endpoint_summaries").dropColumn("carcinogenicity_remarks").execute();

  await db.schema.alterTable("oft_tox_ref_values").dropColumn("justification_overall_uf").execute();
  await db.schema.alterTable("oft_tox_ref_values").dropColumn("key_information").execute();

  await db.schema.alterTable("oft_dossiers").dropColumn("template_version").execute();
  await db.schema.alterTable("oft_dossiers").dropColumn("template_name").execute();
  await db.schema.alterTable("oft_dossiers").dropColumn("submitting_legal_entity").execute();
  await db.schema.alterTable("oft_dossiers").dropColumn("submission_remark").execute();

  await db.schema.alterTable("oft_substances").dropColumn("owner_legal_entity").execute();

  await db.schema.alterTable("oft_reference_substances").dropColumn("trade_name").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("related_substances_info").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("param_name").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("name").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("inventory_entry").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("description").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("cms_id").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("cas_number_alt").execute();
  await db.schema.alterTable("oft_reference_substances").dropColumn("cas_name").execute();

  // Revert varchar widening is intentionally skipped — text→varchar(N) is lossy
  // if any data exceeds N chars. No-op for down migration on varchar widening.
}
