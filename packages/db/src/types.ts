import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type JsonValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;
type Jsonb = ColumnType<JsonValue, string, string>;
type OptionalTimestamp = ColumnType<Date, Date | undefined, Date>;

// ---------------------------------------------------------------------------
// TIER 1a — EU Pesticides API
// ---------------------------------------------------------------------------

export interface EuActiveSubstancesTable {
  as_id: number;
  name: string;
  cas_number: string | null;
  status: string | null;
  approval_dt: string | null;
  expiry_dt: string | null;
  risk_assessment: string | null;
  is_microorganism: boolean | null;
  rms: string | null;
  corms: string | null;
  remark: string | null;
  legislations_old: string | null;
  legislations_actives: string | null;
  tox_value_adi: string | null;
  tox_source_adi: string | null;
  tox_remark_adi: string | null;
  tox_value_arfd: string | null;
  tox_source_arfd: string | null;
  tox_remark_arfd: string | null;
  tox_value_aoel: string | null;
  tox_source_aoel: string | null;
  tox_remark_aoel: string | null;
  tox_value_aaoel: string | null;
  tox_source_aaoel: string | null;
  tox_remark_aaoel: string | null;
  tox_value_other: string | null;
  tox_source_other: string | null;
  tox_remark_other: string | null;
  authorisations_at_nat_level: string | null;
  basic_substance: boolean | null;
  low_risk: boolean | null;
  candidate_for_substitution: boolean | null;
  candidate_for_substitution_type: string | null;
  part_of_group: boolean | null;
  part_of_group_id: number | null;
  is_group: boolean | null;
  pesticide_residue_linked: string | null;
  pest_res_mrl_webpage: string | null;
  pest_res_linked_legislation: string | null;
  pest_res_linked_legislation_url: string | null;
  last_synced_at: OptionalTimestamp;
  classification_reg_1272: string | null;
  pest_res_linked_annex: string | null;
  resolved_residue_id: number | null;
}

export interface EuSubstanceGroupMembersTable {
  group_as_id: number;
  member_as_id: number;
  member_name: string | null;
}

export interface EuCountryAuthorizationsTable {
  as_id: number;
  country_code: string;
}

export interface EuSubstanceCategoriesTable {
  as_id: number;
  category_code: string;
  category_name: string | null;
}

export interface EuPesticideResiduesTable {
  residue_id: number;
  residue_name: string | null;
  language: string | null;
  footnote_code: string | null;
  footnote_def: string | null;
  footnote_txt: string | null;
  version_nbr: number | null;
  original_residue_id: number | null;
}

export interface EuCommoditiesTable {
  commodity_id: number;
  parent_id: number | null;
  product_code: string | null;
  product_type_id: number | null;
  product_name: string | null;
  scientific_names: string | null;
  synonym_names: string | null;
  scientific_synonyms: string | null;
}

export interface EuMrlsTable {
  id: Generated<number>;
  residue_id: number | null;
  commodity_id: number | null;
  included_in_annex: string | null;
  regulation_number: string | null;
  regulation_url: string | null;
  voted_date: string | null;
  entry_into_force_date: string | null;
  application_date: string | null;
  applicability: number | null;
  applicability_text: string | null;
  mrl_value: string | null;
  mrl_value_only: number | null;
  mrl_lod: string | null;
  footnote_text: string | null;
  current_version_number: number | null;
  original_pesticide_residue_id: number | null;
  next_version_number: number | null;
  next_pesticide_residue_id: number | null;
}

export interface EuRegulationsTable {
  id: Generated<number>;
  regulation_code: string;
  eur_lex_url: string | null;
  full_text: string | null;
  voted_date: string | null;
  entry_into_force_date: string | null;
  application_date: string | null;
}

export interface EuSubstanceDocumentsTable {
  id: Generated<number>;
  as_id: number;
  filename: string | null;
  document_type: string | null;
  description: string | null;
  source_url: string | null;
}

export interface EuEmergencyAuthorisationsTable {
  id: number;
  company_code: string | null;
  trade_names: Jsonb | null;
  active_substances: Jsonb | null;
  active_substance_ids: Jsonb | null;
  country_code: string | null;
  country_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  auth_holder: string | null;
  pdf_file: string | null;
  excel_file: string | null;
  crop_eppo_codes: Jsonb | null;
  crop_eppo_names: Jsonb | null;
  last_synced_at: OptionalTimestamp;
}

export interface CountriesTable {
  country_code: string;
  country_name: string | null;
}

// ---------------------------------------------------------------------------
// TIER 1b — OpenFoodTox 3.0
// ---------------------------------------------------------------------------

export interface OftReferenceSubstancesTable {
  uuid: string;
  cas_number: string | null;
  ec_number: string | null;
  reference_substance_name: string | null;
  iupac_name: string | null;
  molecular_formula: string | null;
  smiles: string | null;
  inchi: string | null;
  inchi_key: string | null;
  efsa_param_code: string | null;
  pubchem_cid: string | null;
  epa_dtxsid: string | null;
  oft2_sub_name: string | null;
  oft2_com_name: string | null;
  cas_name: string | null;
  cas_number_alt: string | null;
  cms_id: string | null;
  description: string | null;
  inventory_entry: string | null;
  name: string | null;
  param_name: string | null;
  related_substances_info: string | null;
  trade_name: string | null;
}

export interface OftSubstancesTable {
  uuid: string;
  chemical_name: string | null;
  ref_substance_uuid: string | null;
  composition_type: string | null;
  origin: string | null;
  owner_legal_entity: string | null;
}

export interface OftDossiersTable {
  uuid: string;
  efsa_question_number: string | null;
  expert_group: string | null;
  food_domain: string | null;
  regulation: string | null;
  output_title: string | null;
  doi: string | null;
  evaluation_date: string | null;
  output_type: string | null;
  substance_uuid: string | null;
  submission_remark: string | null;
  submitting_legal_entity: string | null;
  template_name: string | null;
  template_version: string | null;
}

export interface OftDossierDocsTable {
  id: Generated<number>;
  dossier_uuid: string | null;
  document_type: string | null;
  document_subtype: string | null;
  document_uuid: string | null;
}

export interface OftToxRefValuesTable {
  id: Generated<number>;
  doc_uuid: string | null;
  substance_uuid: string | null;
  dossier_uuid: string | null;
  endpoint_type: string | null;
  value_lower: number | null;
  value_upper: number | null;
  qualifier_lower: string | null;
  qualifier_upper: string | null;
  unit: string | null;
  assessment_body: string | null;
  critical_endpoint: string | null;
  justification: string | null;
  overall_uncertainty_factor: number | null;
  oral_absorption_pct: number | null;
  population: string | null;
  not_allocated: boolean | null;
  discussion: string | null;
  ref_value_descriptor: string | null;
  efsa_opinion_ref: string | null;
  key_information: string | null;
  justification_overall_uf: string | null;
}

export interface OftEndpointSummariesTable {
  id: Generated<number>;
  doc_uuid: string | null;
  substance_uuid: string | null;
  definition: string | null;
  genotox_in_vitro: string | null;
  genotox_in_vivo: string | null;
  carcinogenicity: string | null;
  key_information: string | null;
  discussion: string | null;
  carcinogenicity_remarks: string | null;
  absorption_oral: string | null;
  bioaccumulation: string | null;
  genotox_in_vitro_study_link: string | null;
  genotox_in_vivo_study_link: string | null;
  long_term_tox_oral_study: string | null;
  study_record_link: string | null;
}

export interface OftMetabolitesTable {
  id: Generated<number>;
  doc_uuid: string | null;
  parent_substance_uuid: string | null;
  metabolite_substance_uuid: string | null;
  remarks: string | null;
  metabolite_uuid: string | null;
}

export interface OftLiteratureTable {
  uuid: string;
  author: string | null;
  literature_type: string | null;
  title: string | null;
  reference_year: number | null;
  report_no: string | null;
  doi: string | null;
  source: string | null;
  remarks: string | null;
}

// ---------------------------------------------------------------------------
// TIER 2 — Ireland PCS
// ---------------------------------------------------------------------------

export interface IeProductsTable {
  product_id: Generated<number>;
  product_name: string | null;
  pcs_number: string | null;
  auth_holder: string | null;
  marketing_company: string | null;
  product_type: string | null;
  function_name: string | null;
  user_type: string | null;
  last_synced_at: OptionalTimestamp;
}

export interface IeProductSubstancesTable {
  product_id: number;
  substance_name: string;
  concentration: string | null;
}

export interface IeProductCropsTable {
  product_id: number;
  crop_name: string;
}

// ---------------------------------------------------------------------------
// TIER 3 — France e-PHY
// ---------------------------------------------------------------------------

export interface FrProductsTable {
  amm_number: string;
  product_name: string | null;
  type_produit: string | null;
  seconds_noms: string | null;
  titulaire: string | null;
  type_commercial: string | null;
  gamme_usage: string | null;
  mentions_autorisees: string | null;
  restrictions_usage: string | null;
  restrictions_usage_libelle: string | null;
  substances_actives_raw: string | null;
  fonctions: string | null;
  formulations: string | null;
  etat_autorisation: string | null;
  date_retrait: string | null;
  date_premiere_autorisation: string | null;
  amm_reference: string | null;
  nom_produit_reference: string | null;
  last_synced_at: OptionalTimestamp;
}

export interface FrProductSubstancesTable {
  amm_number: string;
  substance_name: string;
  concentration: string | null;
}

export interface FrSubstancesTable {
  id: Generated<number>;
  nom_substance: string;
  numero_cas: string | null;
  etat_autorisation: string | null;
  variant: string | null;
}

export interface FrAuthorizedUsesTable {
  id: Generated<number>;
  amm_number: string | null;
  type_produit: string | null;
  nom_produit: string | null;
  seconds_noms: string | null;
  titulaire: string | null;
  type_commercial: string | null;
  gamme_usage: string | null;
  mentions_autorisees: string | null;
  substances_actives: string | null;
  fonctions: string | null;
  formulations: string | null;
  identifiant_usage_lib_court: string | null;
  identifiant_usage: string | null;
  date_decision: string | null;
  stade_cultural_min: string | null;
  stade_cultural_max: string | null;
  etat_usage: string | null;
  dose_retenue: number | null;
  dose_unite: string | null;
  delai_recolte_jour: number | null;
  delai_recolte_bbch: string | null;
  nombre_max_application: number | null;
  date_fin_distribution: string | null;
  date_fin_utilisation: string | null;
  condition_emploi: string | null;
  znt_aquatique_m: number | null;
  znt_arthropodes_m: number | null;
}

export interface FrAllUsesTable {
  id: Generated<number>;
  amm_number: string | null;
  nom_produit: string | null;
  identifiant_usage: string | null;
  date_decision: string | null;
  stade_cultural_min: string | null;
  stade_cultural_max: string | null;
  etat_usage: string | null;
  dose_retenue: number | null;
  dose_unite: string | null;
  delai_recolte_jour: number | null;
  delai_recolte_bbch: string | null;
  nombre_max_application: number | null;
  date_fin_distribution: string | null;
  date_fin_utilisation: string | null;
  condition_emploi: string | null;
  znt_aquatique_m: number | null;
  znt_arthropodes_m: number | null;
  znt_plantes_m: number | null;
  mentions_autorisees: string | null;
  intervalle_min_applications_jour: number | null;
}

export interface FrHazardClassesTable {
  id: Generated<number>;
  amm_number: string | null;
  nom_produit: string | null;
  libelle_court: string | null;
  libelle_long: string | null;
}

export interface FrConditionsOfUseTable {
  id: Generated<number>;
  amm_number: string | null;
  type_produit: string | null;
  nom_produit: string | null;
  categorie: string | null;
  condition_libelle: string | null;
}

export interface FrRiskPhrasesTable {
  id: Generated<number>;
  amm_number: string | null;
  nom_produit: string | null;
  libelle_court: string | null;
  libelle_long: string | null;
}

export interface FrParallelTradeTable {
  id: Generated<number>;
  permis_number: string | null;
  nom_produit: string | null;
  etat_autorisation: string | null;
  detenteur_pcp: string | null;
  produit_reference_francais: string | null;
  amm_reference_francais: string | null;
  nom_produit_importe: string | null;
  amm_produit_importe: string | null;
  etat_membre_origine: string | null;
  mentions_etiquetage: string | null;
}

// ---------------------------------------------------------------------------
// MRL Resolution — Override Table
// ---------------------------------------------------------------------------

export interface PrlOverridesTable {
  prl_text: string;
  resolved_residue_id: number;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface SyncLogTable {
  id: Generated<number>;
  source_name: string;
  source_version: string | null;
  file_md5: string | null;
  record_count: number | null;
  synced_at: ColumnType<Date, Date | undefined, never>;
}

// ---------------------------------------------------------------------------
// Root Database interface
// ---------------------------------------------------------------------------

export interface Database {
  countries: CountriesTable;
  eu_active_substances: EuActiveSubstancesTable;
  eu_country_authorizations: EuCountryAuthorizationsTable;
  eu_substance_group_members: EuSubstanceGroupMembersTable;
  eu_substance_categories: EuSubstanceCategoriesTable;
  eu_pesticide_residues: EuPesticideResiduesTable;
  eu_commodities: EuCommoditiesTable;
  eu_mrls: EuMrlsTable;
  eu_regulations: EuRegulationsTable;
  eu_substance_documents: EuSubstanceDocumentsTable;
  eu_emergency_authorisations: EuEmergencyAuthorisationsTable;
  oft_reference_substances: OftReferenceSubstancesTable;
  oft_substances: OftSubstancesTable;
  oft_dossiers: OftDossiersTable;
  oft_dossier_docs: OftDossierDocsTable;
  oft_tox_ref_values: OftToxRefValuesTable;
  oft_endpoint_summaries: OftEndpointSummariesTable;
  oft_metabolites: OftMetabolitesTable;
  oft_literature: OftLiteratureTable;
  ie_products: IeProductsTable;
  ie_product_substances: IeProductSubstancesTable;
  ie_product_crops: IeProductCropsTable;
  fr_products: FrProductsTable;
  fr_product_substances: FrProductSubstancesTable;
  fr_substances: FrSubstancesTable;
  fr_authorized_uses: FrAuthorizedUsesTable;
  fr_all_uses: FrAllUsesTable;
  fr_hazard_classes: FrHazardClassesTable;
  fr_conditions_of_use: FrConditionsOfUseTable;
  fr_risk_phrases: FrRiskPhrasesTable;
  fr_parallel_trade: FrParallelTradeTable;
  prl_overrides: PrlOverridesTable;
  sync_log: SyncLogTable;
}

// ---------------------------------------------------------------------------
// Per-table helper types
// ---------------------------------------------------------------------------

export type EuActiveSubstance = Selectable<EuActiveSubstancesTable>;
export type NewEuActiveSubstance =
  Insertable<EuActiveSubstancesTable>;
export type EuMrl = Selectable<EuMrlsTable>;
export type NewEuMrl = Insertable<EuMrlsTable>;
export type EuEmergencyAuthorisation =
  Selectable<EuEmergencyAuthorisationsTable>;
export type NewEuEmergencyAuthorisation =
  Insertable<EuEmergencyAuthorisationsTable>;
export type IeProduct = Selectable<IeProductsTable>;
export type NewIeProduct = Insertable<IeProductsTable>;
export type FrProduct = Selectable<FrProductsTable>;
export type NewFrProduct = Insertable<FrProductsTable>;
export type OftToxRefValue = Selectable<OftToxRefValuesTable>;
export type NewOftToxRefValue = Insertable<OftToxRefValuesTable>;
export type SyncLog = Selectable<SyncLogTable>;
export type NewSyncLog = Insertable<SyncLogTable>;
