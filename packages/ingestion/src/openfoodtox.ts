/**
 * OpenFoodTox 3.0 ingestion script
 * Downloads xlsx from Zenodo, parses 8 sheets with SheetJS, inserts into Neon Postgres.
 *
 * Column mappings verified via probe against actual IUCLID 6 export (July 2026).
 * All xlsx columns are captured — zero data dropped.
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import { db, sql } from "@regbridge/db";

const DOWNLOAD_URL =
  "https://zenodo.org/records/19388272/files/OFT3.0%20export%20repository.xlsx?download=1";
const LOCAL_PATH = "/tmp/oft3.xlsx";
const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trim + nullify empty strings */
function n(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

/** Parse number, return null if not a valid number */
function num(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const v = Number(val);
  return Number.isFinite(v) ? v : null;
}

/** Parse boolean from IUCLID "true"/"false"/boolean */
function bool(val: unknown): boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  if (s === "true" || s === "yes") return true;
  if (s === "false" || s === "no") return false;
  return null;
}

/** Kysely batch insert */
async function kyselyBatchInsert(
  tableName: keyof import("@regbridge/db").Database,
  rows: Record<string, unknown>[],
  label: string,
) {
  if (rows.length === 0) {
    console.log(`  ${label}: 0 rows, skipping`);
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await (db.insertInto(tableName as any) as any)
      .values(batch as any)
      .execute();
    inserted += batch.length;
    if (inserted % 5000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ${label}: ${inserted}/${rows.length}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sheet parsers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function parseRefSub(rows: Row[]) {
  return rows.map((r) => ({
    uuid: n(r["Document UUID"])!,
    cas_number: n(r["Inventory.CASNumber"]),
    ec_number: n(r["EC number"]),
    reference_substance_name: n(r["ReferenceSubstanceName"]),
    iupac_name: n(r["IupacName"]),
    molecular_formula: n(
      r["MolecularStructuralInfo.MolecularFormula"],
    ),
    smiles: n(r["MolecularStructuralInfo.SmilesNotation"]),
    inchi: n(r["MolecularStructuralInfo.InChl"]),
    inchi_key: n(r["MolecularStructuralInfo.InChIKey"]),
    efsa_param_code: n(r["EFSA PARAM CODE"]),
    pubchem_cid: n(r["PUBCHEM CID"]),
    epa_dtxsid: n(r["US EPA DTXSID"]),
    oft2_sub_name: n(r["SUB NAME [EFSA OFT2.0]"]),
    oft2_com_name: n(r["COM NAME [EFSA OFT2.0]"]),
    // --- new columns from migration 008 ---
    cas_name: n(r["CAS name"]),
    cas_number_alt: n(r["CAS number"]),
    cms_id: n(r["CMS-ID"]),
    description: n(r["Description"]),
    inventory_entry: n(r["Inventory.InventoryEntry"]),
    name: n(r["Name"]),
    param_name: n(r["PARAM NAME"]),
    related_substances_info: n(
      r["RelatedSubstances.GroupCategoryInfo"],
    ),
    trade_name: n(r["Trade name"]),
  }));
}

function parseSub(rows: Row[]) {
  return rows.map((r) => ({
    uuid: n(r["Document UUID"])!,
    chemical_name: n(r["ChemicalName"]),
    ref_substance_uuid: n(r["ReferenceSubstance.ReferenceSubstance"]),
    composition_type: n(r["TypeOfSubstance.Composition"]),
    origin: null as string | null, // Not present in OFT 3.0 IUCLID export
    owner_legal_entity: n(r["OwnerLegalEntity"]),
  }));
}

function parseDossier(rows: Row[]) {
  return rows.map((r) => ({
    uuid: n(r["Document UUID"])!,
    efsa_question_number: n(r["DataSource.EFSAQuestionNumber"]),
    expert_group: n(r["Domain.ExpertGroup"]),
    food_domain: n(r["Domain.FoodDomain"]),
    regulation:
      n(r["Domain.Regulation"]) || n(r["Domain.Regulation.Other"]),
    output_title: n(r["LiteratureReference.EFSAOutputTitle"]),
    doi: n(r["LiteratureReference.LinkToPersistentIdentifier"]),
    evaluation_date: n(r["LiteratureReference.DateOfEvaluation"]),
    output_type: n(r["LiteratureReference.Type"]),
    substance_uuid: null as string | null, // Resolved later from DOSSIER_DOCS
    // --- new columns from migration 008 ---
    submission_remark: n(r["DossierSubject.DossierSubmissionRemark"]),
    submitting_legal_entity: n(
      r["DossierSubject.SubmittingLegalEntity"],
    ),
    template_name: n(r["DossierTemplate.NameGivenByUser"]),
    template_version: n(r["DossierTemplate.Version"]),
  }));
}

function parseDossierDocs(rows: Row[]) {
  return rows.map((r) => ({
    dossier_uuid: n(r["DOSSIER UUID"]),
    document_type: n(r["DOCUMENT TYPE"]),
    document_subtype: null as string | null, // Not a separate field in OFT 3.0
    document_uuid: n(r["DOCUMENT UUID"]),
  }));
}

/**
 * ToxRefValues flattening: each xlsx row can have ADI, ARfD, AOEL, AAOEL,
 * and/or OTHER populated. We produce one DB row per endpoint type found.
 * Rows with NO endpoint values are stored as endpoint_type = "NONE" to
 * preserve the discussion text and substance linkage.
 */
function parseToxRefValues(
  rows: Row[],
  dossierDocMap: Map<string, string>,
) {
  const result: Record<string, unknown>[] = [];
  const H = "HumanHealthHazardCharacteristics";

  for (const r of rows) {
    const docUuid = n(r["Document UUID"]);
    const substanceUuid = n(r["Parent UUID"]);
    const dossierUuid = docUuid
      ? (dossierDocMap.get(docUuid) ?? null)
      : null;
    const discussion = n(r["Discussion.Discussion"]);
    const keyInfo = n(r["KeyInformation.KeyInformation"]);

    let foundEndpoint = false;

    // Shared fields factory — avoids repeating the common columns in every push
    const base = () => ({
      doc_uuid: docUuid,
      substance_uuid: substanceUuid,
      dossier_uuid: dossierUuid,
      discussion,
      key_information: keyInfo,
    });

    // ADI
    const adiLower = num(
      r[`${H}.AcceptableDailyIntake.Adi.lowerValue`],
    );
    const adiUpper = num(
      r[`${H}.AcceptableDailyIntake.Adi.upperValue`],
    );
    const adiNoAlloc = bool(
      r[`${H}.AcceptableDailyIntake.NoAllocated`],
    );

    if (
      adiLower !== null ||
      adiUpper !== null ||
      adiNoAlloc === true
    ) {
      foundEndpoint = true;
      result.push({
        ...base(),
        endpoint_type: "ADI",
        value_lower: adiLower,
        value_upper: adiUpper,
        qualifier_lower: n(
          r[`${H}.AcceptableDailyIntake.Adi.lowerQualifier`],
        ),
        qualifier_upper: n(
          r[`${H}.AcceptableDailyIntake.Adi.upperQualifier`],
        ),
        unit: n(r[`${H}.AcceptableDailyIntake.Adi.Unit`]),
        assessment_body:
          n(r[`${H}.AcceptableDailyIntake.AssessmentBody`]) ||
          n(r[`${H}.AcceptableDailyIntake.AssessmentBody.Other`]),
        critical_endpoint: n(
          r[`${H}.AcceptableDailyIntake.CriticalEndpoint`],
        ),
        justification: n(
          r[`${H}.AcceptableDailyIntake.JustificationAndComments`],
        ),
        justification_overall_uf: n(
          r[`${H}.AcceptableDailyIntake.JustificationOverallUf`],
        ),
        overall_uncertainty_factor: num(
          r[`${H}.AcceptableDailyIntake.OverallUncertainty`],
        ),
        oral_absorption_pct: null,
        population: n(r[`${H}.AcceptableDailyIntake.Population`]),
        not_allocated: adiNoAlloc,
        ref_value_descriptor: null,
        efsa_opinion_ref: null,
      });
    }

    // ARfD
    const arfdLower = num(
      r[`${H}.AcuteReferenceDose.Arfd.lowerValue`],
    );
    const arfdUpper = num(
      r[`${H}.AcuteReferenceDose.Arfd.upperValue`],
    );
    const arfdNoAlloc = bool(
      r[`${H}.AcuteReferenceDose.NoAllocated`],
    );

    if (
      arfdLower !== null ||
      arfdUpper !== null ||
      arfdNoAlloc === true
    ) {
      foundEndpoint = true;
      result.push({
        ...base(),
        endpoint_type: "ARfD",
        value_lower: arfdLower,
        value_upper: arfdUpper,
        qualifier_lower: null,
        qualifier_upper: n(
          r[`${H}.AcuteReferenceDose.Arfd.upperQualifier`],
        ),
        unit: n(r[`${H}.AcuteReferenceDose.Arfd.Unit`]),
        assessment_body:
          n(r[`${H}.AcuteReferenceDose.AssessmentBody`]) ||
          n(r[`${H}.AcuteReferenceDose.AssessmentBody.Other`]),
        critical_endpoint: n(
          r[`${H}.AcuteReferenceDose.CriticalEndpoint`],
        ),
        justification: n(
          r[`${H}.AcuteReferenceDose.JustificationAndComments`],
        ),
        justification_overall_uf: n(
          r[`${H}.AcuteReferenceDose.JustificationOverallUf`],
        ),
        overall_uncertainty_factor: num(
          r[`${H}.AcuteReferenceDose.OverallUncertainty`],
        ),
        oral_absorption_pct: null,
        population: n(r[`${H}.AcuteReferenceDose.Population`]),
        not_allocated: arfdNoAlloc,
        ref_value_descriptor: null,
        efsa_opinion_ref: null,
      });
    }

    // AOEL
    const aoelVal = num(
      r[`${H}.AcceptableOperatorExposureLevel.Aoel.Value`],
    );
    const aoelNoAlloc = bool(
      r[`${H}.AcceptableOperatorExposureLevel.NoAllocated`],
    );

    if (aoelVal !== null || aoelNoAlloc === true) {
      foundEndpoint = true;
      result.push({
        ...base(),
        endpoint_type: "AOEL",
        value_lower: aoelVal,
        value_upper: null,
        qualifier_lower: null,
        qualifier_upper: null,
        unit: n(r[`${H}.AcceptableOperatorExposureLevel.Aoel.Unit`]),
        assessment_body:
          n(
            r[`${H}.AcceptableOperatorExposureLevel.AssessmentBody`],
          ) ||
          n(
            r[
              `${H}.AcceptableOperatorExposureLevel.AssessmentBody.Other`
            ],
          ),
        critical_endpoint: n(
          r[`${H}.AcceptableOperatorExposureLevel.CriticalEndpoint`],
        ),
        justification: n(
          r[
            `${H}.AcceptableOperatorExposureLevel.JustificationAndComments`
          ],
        ),
        justification_overall_uf: n(
          r[
            `${H}.AcceptableOperatorExposureLevel.JustificationOverallUf`
          ],
        ),
        overall_uncertainty_factor: num(
          r[
            `${H}.AcceptableOperatorExposureLevel.OverallUncertainty`
          ],
        ),
        oral_absorption_pct: num(
          r[`${H}.AcceptableOperatorExposureLevel.OralAbsorption`],
        ),
        population:
          n(r[`${H}.AcceptableOperatorExposureLevel.Population`]) ||
          n(
            r[
              `${H}.AcceptableOperatorExposureLevel.Population.Other`
            ],
          ),
        not_allocated: aoelNoAlloc,
        ref_value_descriptor: null,
        efsa_opinion_ref: null,
      });
    }

    // AAOEL
    const aaoelVal = num(
      r[`${H}.AcuteAcceptableOperatorExposureLevel.Aaoel.Value`],
    );
    const aaoelNoAlloc = bool(
      r[`${H}.AcuteAcceptableOperatorExposureLevel.NoAllocated`],
    );

    if (aaoelVal !== null || aaoelNoAlloc === true) {
      foundEndpoint = true;
      result.push({
        ...base(),
        endpoint_type: "AAOEL",
        value_lower: aaoelVal,
        value_upper: null,
        qualifier_lower: null,
        qualifier_upper: null,
        unit: n(
          r[`${H}.AcuteAcceptableOperatorExposureLevel.Aaoel.Unit`],
        ),
        assessment_body: null,
        critical_endpoint: n(
          r[
            `${H}.AcuteAcceptableOperatorExposureLevel.CriticalEndpoint`
          ],
        ),
        justification: n(
          r[
            `${H}.AcuteAcceptableOperatorExposureLevel.JustificationAndComments`
          ],
        ),
        justification_overall_uf: n(
          r[
            `${H}.AcuteAcceptableOperatorExposureLevel.JustificationOverallUf`
          ],
        ),
        overall_uncertainty_factor: num(
          r[
            `${H}.AcuteAcceptableOperatorExposureLevel.OverallUncertainty`
          ],
        ),
        oral_absorption_pct: num(
          r[
            `${H}.AcuteAcceptableOperatorExposureLevel.OralAbsorption`
          ],
        ),
        population:
          n(
            r[`${H}.AcuteAcceptableOperatorExposureLevel.Population`],
          ) ||
          n(
            r[
              `${H}.AcuteAcceptableOperatorExposureLevel.Population.Other`
            ],
          ),
        not_allocated: aaoelNoAlloc,
        ref_value_descriptor: null,
        efsa_opinion_ref: null,
      });
    }

    // OTHER reference values
    const otherLower = num(
      r[`${H}.OtherReferenceValues.RefValue.lowerValue`],
    );
    const otherUpper = num(
      r[`${H}.OtherReferenceValues.RefValue.upperValue`],
    );
    const otherNoAlloc = bool(
      r[`${H}.OtherReferenceValues.NoAllocated`],
    );

    if (
      otherLower !== null ||
      otherUpper !== null ||
      otherNoAlloc === true
    ) {
      foundEndpoint = true;
      result.push({
        ...base(),
        endpoint_type: "OTHER",
        value_lower: otherLower,
        value_upper: otherUpper,
        qualifier_lower: n(
          r[`${H}.OtherReferenceValues.RefValue.lowerQualifier`],
        ),
        qualifier_upper: n(
          r[`${H}.OtherReferenceValues.RefValue.upperQualifier`],
        ),
        unit:
          n(r[`${H}.OtherReferenceValues.RefValue.Unit`]) ||
          n(r[`${H}.OtherReferenceValues.RefValue.Unit.Other`]),
        assessment_body:
          n(r[`${H}.OtherReferenceValues.AssessmentBody`]) ||
          n(r[`${H}.OtherReferenceValues.AssessmentBody.Other`]),
        critical_endpoint: n(
          r[`${H}.OtherReferenceValues.CriticalEndpoint`],
        ),
        justification: n(
          r[`${H}.OtherReferenceValues.JustificationAndComments`],
        ),
        justification_overall_uf: n(
          r[`${H}.OtherReferenceValues.JustificationOverallUf`],
        ),
        overall_uncertainty_factor: num(
          r[`${H}.OtherReferenceValues.OverallUncertainty`],
        ),
        oral_absorption_pct: null,
        population:
          n(r[`${H}.OtherReferenceValues.Population`]) ||
          n(r[`${H}.OtherReferenceValues.Population.Other`]),
        not_allocated: otherNoAlloc,
        ref_value_descriptor:
          n(
            r[`${H}.OtherReferenceValues.ReferenceValueDescriptor`],
          ) ||
          n(
            r[
              `${H}.OtherReferenceValues.ReferenceValueDescriptor.Other`
            ],
          ),
        efsa_opinion_ref: n(
          r[`${H}.OtherReferenceValues.ReferenceToEFSAOpinion`],
        ),
      });
    }

    // Rows with NO endpoint values — store as NONE to preserve discussion/key_info/substance link
    if (!foundEndpoint) {
      result.push({
        ...base(),
        endpoint_type: "NONE",
        value_lower: null,
        value_upper: null,
        qualifier_lower: null,
        qualifier_upper: null,
        unit: null,
        assessment_body: null,
        critical_endpoint: null,
        justification: null,
        justification_overall_uf: null,
        overall_uncertainty_factor: null,
        oral_absorption_pct: null,
        population: null,
        not_allocated: null,
        ref_value_descriptor: null,
        efsa_opinion_ref: null,
      });
    }
  }

  return result;
}

function parseEndpointSummaries(rows: Row[]) {
  return rows.map((r) => ({
    doc_uuid: n(r["Document UUID"]),
    substance_uuid: n(r["Parent UUID"]),
    definition: n(r["Definition"]),
    genotox_in_vitro: n(
      r[
        "KeyValueForChemicalSafetyAssessment.GeneticToxicityInVitro.EndpointConclusion"
      ],
    ),
    genotox_in_vivo: n(
      r[
        "KeyValueForChemicalSafetyAssessment.GeneticToxicityInVivo.EndpointConclusion"
      ],
    ),
    carcinogenicity: n(
      r[
        "JustificationForClassificationOrNonClassification.JustifClassifCarc"
      ],
    ),
    key_information: n(r["KeyInformation.KeyInformation"]),
    discussion: n(r["Discussion.Discussion"]),
    // --- new columns from migration 008 ---
    carcinogenicity_remarks: n(
      r["JustificationForClassificationOrNonClassification.Remarks"],
    ),
    absorption_oral: n(r["KeyValue.AbsorptionOral"]),
    bioaccumulation: n(r["KeyValue.Bioaccumulation"]),
    genotox_in_vitro_study_link: n(
      r[
        "KeyValueForChemicalSafetyAssessment.GeneticToxicityInVitro.LinkToRelevantStudyRecord"
      ],
    ),
    genotox_in_vivo_study_link: n(
      r[
        "KeyValueForChemicalSafetyAssessment.GeneticToxicityInVivo.LinkToRelevantStudyRecord"
      ],
    ),
    long_term_tox_oral_study: n(
      r[
        "KeyValueForChemicalSafetyAssessment.LongTermToxOral.RelevantRecords.StudyNameType"
      ],
    ),
    study_record_link: n(r["LinkToRelevantStudyRecord.Link"]),
  }));
}

function parseMetabolites(rows: Row[]) {
  return rows.map((r) => ({
    doc_uuid: n(r["Document UUID"]),
    parent_substance_uuid: n(r["Parent UUID"]),
    metabolite_substance_uuid: n(
      r["ListMetabolites.Metabolites.LinkMetaboliteDataset"],
    ),
    remarks: null as string | null, // No remarks field in OFT 3.0
    metabolite_uuid: n(r["ListMetabolites.Metabolites.UUID"]),
  }));
}

function parseLiterature(rows: Row[]) {
  return rows.map((r) => ({
    uuid: n(r["Document UUID"])!,
    author: n(r["GeneralInfo.Author"]),
    literature_type:
      n(r["GeneralInfo.LiteratureType"]) ||
      n(r["GeneralInfo.LiteratureType.Other"]),
    title: n(r["GeneralInfo.Name"]),
    reference_year: num(r["GeneralInfo.ReferenceYear"]),
    report_no: n(r["GeneralInfo.ReportNo"]),
    doi: null as string | null, // DOI is embedded in the Source field
    source: n(r["GeneralInfo.Source"]),
    remarks: n(r["GeneralInfo.Remarks"]),
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTotal = Date.now();

  // 1. Download if not cached
  if (!fs.existsSync(LOCAL_PATH)) {
    console.log("Downloading OFT 3.0 xlsx (~22 MB)...");
    const start = Date.now();
    const res = await fetch(DOWNLOAD_URL);
    if (!res.ok)
      throw new Error(
        `Download failed: ${res.status} ${res.statusText}`,
      );
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(LOCAL_PATH, buf);
    console.log(
      `Downloaded in ${((Date.now() - start) / 1000).toFixed(1)}s (${(buf.length / 1024 / 1024).toFixed(1)} MB)`,
    );
  } else {
    console.log(`Using cached file: ${LOCAL_PATH}`);
  }

  // 2. Parse xlsx
  console.log("Parsing xlsx (this takes ~25s)...");
  const parseStart = Date.now();
  const workbook = XLSX.readFile(LOCAL_PATH, { dense: true });
  console.log(
    `Parsed in ${((Date.now() - parseStart) / 1000).toFixed(1)}s — ${workbook.SheetNames.length} sheets`,
  );

  // Helper to read a sheet
  function readSheet(name: string): Row[] {
    const sheet = workbook.Sheets[name];
    if (!sheet)
      throw new Error(
        `Sheet "${name}" not found. Available: ${workbook.SheetNames.join(", ")}`,
      );
    return XLSX.utils.sheet_to_json(sheet);
  }

  // 3. Parse all sheets into typed rows
  console.log("\nParsing sheets...");

  const refSubRaw = readSheet("REF_SUB");
  const refSubRows = parseRefSub(refSubRaw);
  console.log(
    `  REF_SUB: ${refSubRaw.length} raw → ${refSubRows.length} parsed`,
  );

  const subRaw = readSheet("SUB");
  const subRows = parseSub(subRaw);
  console.log(
    `  SUB: ${subRaw.length} raw → ${subRows.length} parsed`,
  );

  const dossierRaw = readSheet("DOSSIER");
  const dossierRows = parseDossier(dossierRaw);
  console.log(
    `  DOSSIER: ${dossierRaw.length} raw → ${dossierRows.length} parsed`,
  );

  const dossierDocsRaw = readSheet("DOSSIER_DOCS");
  const dossierDocsRows = parseDossierDocs(dossierDocsRaw);
  console.log(
    `  DOSSIER_DOCS: ${dossierDocsRaw.length} raw → ${dossierDocsRows.length} parsed`,
  );

  // Build lookup: document_uuid → dossier_uuid (for ToxRefValues dossier resolution)
  const dossierDocMap = new Map<string, string>();
  for (const dd of dossierDocsRows) {
    if (dd.document_uuid && dd.dossier_uuid) {
      dossierDocMap.set(dd.document_uuid, dd.dossier_uuid);
    }
  }
  console.log(
    `  Dossier doc lookup map: ${dossierDocMap.size} entries`,
  );

  // Resolve substance_uuid on dossiers via SUBSTANCE links in DOSSIER_DOCS
  const substanceForDossier = new Map<string, string>();
  for (const dd of dossierDocsRows) {
    if (
      dd.document_type === "SUBSTANCE" &&
      dd.dossier_uuid &&
      dd.document_uuid
    ) {
      substanceForDossier.set(dd.dossier_uuid, dd.document_uuid);
    }
  }
  for (const d of dossierRows) {
    d.substance_uuid = substanceForDossier.get(d.uuid) ?? null;
  }
  console.log(
    `  Dossiers with substance_uuid: ${dossierRows.filter((d) => d.substance_uuid).length}/${dossierRows.length}`,
  );

  const toxRefRaw = readSheet("FLEX_SUM.ToxRefValues");
  const toxRefRows = parseToxRefValues(toxRefRaw, dossierDocMap);
  console.log(
    `  ToxRefValues: ${toxRefRaw.length} raw → ${toxRefRows.length} flattened`,
  );

  const endSumRaw = readSheet("END_SUM");
  const endSumRows = parseEndpointSummaries(endSumRaw);
  console.log(
    `  END_SUM: ${endSumRaw.length} raw → ${endSumRows.length} parsed`,
  );

  const metabolitesRaw = readSheet("FLEX_SUM.Metabolites");
  const metabolitesRows = parseMetabolites(metabolitesRaw);
  console.log(
    `  Metabolites: ${metabolitesRaw.length} raw → ${metabolitesRows.length} parsed`,
  );

  const litRaw = readSheet("LIT");
  const litRows = parseLiterature(litRaw);
  console.log(
    `  LIT: ${litRaw.length} raw → ${litRows.length} parsed`,
  );

  // 4. Truncate and insert (order matters for FKs)
  console.log("\nClearing existing OFT data...");
  // Delete in reverse FK order
  await sql`DELETE FROM oft_metabolites`.execute(db);
  await sql`DELETE FROM oft_tox_ref_values`.execute(db);
  await sql`DELETE FROM oft_endpoint_summaries`.execute(db);
  await sql`DELETE FROM oft_dossier_docs`.execute(db);
  await sql`DELETE FROM oft_literature`.execute(db);
  await sql`DELETE FROM oft_dossiers`.execute(db);
  await sql`DELETE FROM oft_substances`.execute(db);
  await sql`DELETE FROM oft_reference_substances`.execute(db);
  console.log("  Cleared all OFT tables");

  // Insert in FK order
  console.log("\nInserting...");

  await kyselyBatchInsert(
    "oft_reference_substances",
    refSubRows,
    "oft_reference_substances",
  );
  await kyselyBatchInsert(
    "oft_substances",
    subRows,
    "oft_substances",
  );
  await kyselyBatchInsert(
    "oft_dossiers",
    dossierRows,
    "oft_dossiers",
  );
  await kyselyBatchInsert(
    "oft_dossier_docs",
    dossierDocsRows,
    "oft_dossier_docs",
  );
  await kyselyBatchInsert(
    "oft_tox_ref_values",
    toxRefRows,
    "oft_tox_ref_values",
  );
  await kyselyBatchInsert(
    "oft_endpoint_summaries",
    endSumRows,
    "oft_endpoint_summaries",
  );
  await kyselyBatchInsert(
    "oft_metabolites",
    metabolitesRows,
    "oft_metabolites",
  );
  await kyselyBatchInsert(
    "oft_literature",
    litRows,
    "oft_literature",
  );

  // 5. Log to sync_log
  const totalRecords =
    refSubRows.length +
    subRows.length +
    dossierRows.length +
    dossierDocsRows.length +
    toxRefRows.length +
    endSumRows.length +
    metabolitesRows.length +
    litRows.length;

  await db
    .insertInto("sync_log")
    .values({
      source_name: "OPENFOODTOX",
      source_version: "v7 (April 2026)",
      record_count: totalRecords,
      synced_at: new Date(),
    })
    .execute();

  // 6. Summary
  const elapsed = ((Date.now() - startTotal) / 1000).toFixed(1);
  console.log(`\n=== DONE in ${elapsed}s ===`);
  console.log(`  oft_reference_substances: ${refSubRows.length}`);
  console.log(`  oft_substances: ${subRows.length}`);
  console.log(`  oft_dossiers: ${dossierRows.length}`);
  console.log(`  oft_dossier_docs: ${dossierDocsRows.length}`);
  console.log(`  oft_tox_ref_values: ${toxRefRows.length}`);
  console.log(`  oft_endpoint_summaries: ${endSumRows.length}`);
  console.log(`  oft_metabolites: ${metabolitesRows.length}`);
  console.log(`  oft_literature: ${litRows.length}`);
  console.log(`  TOTAL: ${totalRecords}`);

  // Endpoint type breakdown
  const byType: Record<string, number> = {};
  for (const r of toxRefRows) {
    const t = (r.endpoint_type as string) || "UNKNOWN";
    byType[t] = (byType[t] || 0) + 1;
  }
  console.log("\n  ToxRefValues by endpoint type:");
  for (const [type, count] of Object.entries(byType).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`    ${type}: ${count}`);
  }

  // CAS coverage
  const withCas = refSubRows.filter((r) => r.cas_number).length;
  console.log(
    `\n  CAS coverage: ${withCas}/${refSubRows.length} (${((withCas / refSubRows.length) * 100).toFixed(0)}%)`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
