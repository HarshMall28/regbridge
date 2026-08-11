export { db, initDb } from "./connection";
export type { Database } from "./types";
export { sql } from "kysely";

export type {
  EuActiveSubstance,
  NewEuActiveSubstance,
  EuMrl,
  NewEuMrl,
  EuEmergencyAuthorisation,
  NewEuEmergencyAuthorisation,
  IeProduct,
  NewIeProduct,
  FrProduct,
  NewFrProduct,
  OftToxRefValue,
  NewOftToxRefValue,
  SyncLog,
  NewSyncLog,
} from "./types";

export type {
  EuActiveSubstancesTable,
  EuCountryAuthorizationsTable,
  EuSubstanceCategoriesTable,
  EuPesticideResiduesTable,
  EuCommoditiesTable,
  EuMrlsTable,
  EuRegulationsTable,
  EuSubstanceDocumentsTable,
  EuEmergencyAuthorisationsTable,
  CountriesTable,
  OftReferenceSubstancesTable,
  OftSubstancesTable,
  OftDossiersTable,
  OftDossierDocsTable,
  OftToxRefValuesTable,
  OftEndpointSummariesTable,
  OftMetabolitesTable,
  OftLiteratureTable,
  IeProductsTable,
  IeProductSubstancesTable,
  IeProductCropsTable,
  FrProductsTable,
  FrProductSubstancesTable,
  FrSubstancesTable,
  FrAuthorizedUsesTable,
  FrAllUsesTable,
  FrHazardClassesTable,
  FrConditionsOfUseTable,
  FrRiskPhrasesTable,
  FrParallelTradeTable,
  SyncLogTable,
} from "./types";

// Query functions
export { paletteSearch } from "./queries/palette-search";
export { getSubstanceProfile } from "./queries/substance-profile";
export { resolveSubstance } from "./queries/resolve-substance";
export {
  searchProducts,
  getProductDetail,
} from "./queries/product-queries";
export { getCompanyProfile } from "./queries/company-profile";
export {
  exploreTable,
  exploreSchema,
  listTables,
} from "./queries/explore-queries";
export { checkMrlCompliance } from "./queries/mrl-compliance";
