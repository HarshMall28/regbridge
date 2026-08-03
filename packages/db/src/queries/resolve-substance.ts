import { db, sql } from "../connection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchType =
  | "exact_id"
  | "exact_cas"
  | "exact_name"
  | "prefix"
  | "fuzzy";

export interface ResolvedSubstance {
  as_id: number;
  name: string;
  cas_number: string | null;
  status: string | null;
  expiry_dt: string | null;
  candidate_for_substitution: boolean | null;
  match_type: MatchType;
  match_field: "as_id" | "cas_number" | "name";
}

// CAS pattern: 2-7 digits, dash, 2 digits, dash, 1 digit
const CAS_REGEX = /^\d{2,7}-\d{2}-\d$/;

// Pure numeric — treat as as_id
const NUMERIC_REGEX = /^\d+$/;

// Junk CAS values in the data that should not be used for matching
const INVALID_CAS = new Set(["No CAS allocated", "See note", ""]);

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function resolveSubstance(
  input: string,
): Promise<ResolvedSubstance | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Try as numeric as_id
  if (NUMERIC_REGEX.test(trimmed)) {
    const row = await db
      .selectFrom("eu_active_substances")
      .select([
        "as_id",
        "name",
        "cas_number",
        "status",
        "expiry_dt",
        "candidate_for_substitution",
      ])
      .where("as_id", "=", parseInt(trimmed, 10))
      .executeTakeFirst();

    if (row) {
      return { ...row, match_type: "exact_id", match_field: "as_id" };
    }
    // Fall through — might be a short numeric string that's not an as_id
  }

  // 2. Try as CAS number
  if (CAS_REGEX.test(trimmed)) {
    const row = await db
      .selectFrom("eu_active_substances")
      .select([
        "as_id",
        "name",
        "cas_number",
        "status",
        "expiry_dt",
        "candidate_for_substitution",
      ])
      .where("cas_number", "=", trimmed)
      .executeTakeFirst();

    if (row) {
      return {
        ...row,
        match_type: "exact_cas",
        match_field: "cas_number",
      };
    }
    // CAS not found — don't fall through to name search with a CAS string
    return null;
  }

  // 3. Try exact name match (case-insensitive)
  const exactRow = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
    ])
    .where(sql`LOWER(name)`, "=", trimmed.toLowerCase())
    .executeTakeFirst();

  if (exactRow) {
    return {
      ...exactRow,
      match_type: "exact_name",
      match_field: "name",
    };
  }

  // 4. Try prefix match (case-insensitive)
  // Tiebreak: approved > not-approved, then shortest name
  const prefixRow = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
    ])
    .where(sql`LOWER(name)`, "like", `${trimmed.toLowerCase()}%`)
    .orderBy(
      sql`CASE WHEN status = 'Approved' THEN 0 ELSE 1 END`,
      "asc",
    )
    .orderBy(sql`LENGTH(name)`, "asc")
    .executeTakeFirst();

  if (prefixRow) {
    return {
      ...prefixRow,
      match_type: "prefix",
      match_field: "name",
    };
  }

  // 5. Try trigram fuzzy match (requires pg_trgm index)
  const fuzzyRow = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
      sql<number>`similarity(name, ${trimmed})`.as("sim"),
    ])
    .where(sql`similarity(name, ${trimmed})`, ">", 0.3)
    .orderBy("sim", "desc")
    .executeTakeFirst();

  if (fuzzyRow) {
    const { sim, ...substance } = fuzzyRow;
    return { ...substance, match_type: "fuzzy", match_field: "name" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch resolve — for palette search (returns multiple candidates)
// ---------------------------------------------------------------------------

export async function resolveSubstanceCandidates(
  input: string,
  limit: number = 5,
): Promise<ResolvedSubstance[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const results: ResolvedSubstance[] = [];

  // 1. Exact as_id
  if (NUMERIC_REGEX.test(trimmed)) {
    const row = await db
      .selectFrom("eu_active_substances")
      .select([
        "as_id",
        "name",
        "cas_number",
        "status",
        "expiry_dt",
        "candidate_for_substitution",
      ])
      .where("as_id", "=", parseInt(trimmed, 10))
      .executeTakeFirst();

    if (row) {
      results.push({
        ...row,
        match_type: "exact_id",
        match_field: "as_id",
      });
    }
  }

  // 2. Exact CAS
  if (CAS_REGEX.test(trimmed)) {
    const row = await db
      .selectFrom("eu_active_substances")
      .select([
        "as_id",
        "name",
        "cas_number",
        "status",
        "expiry_dt",
        "candidate_for_substitution",
      ])
      .where("cas_number", "=", trimmed)
      .executeTakeFirst();

    if (row) {
      results.push({
        ...row,
        match_type: "exact_cas",
        match_field: "cas_number",
      });
    }
    return results; // CAS is deterministic — don't fuzzy search a CAS string
  }

  // 3. Exact name
  const exactRow = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
    ])
    .where(sql`LOWER(name)`, "=", trimmed.toLowerCase())
    .executeTakeFirst();

  if (exactRow) {
    results.push({
      ...exactRow,
      match_type: "exact_name",
      match_field: "name",
    });
  }

  // 4. Prefix matches (excluding any exact match already found)
  const existingIds = new Set(results.map((r) => r.as_id));
  const prefixRows = await db
    .selectFrom("eu_active_substances")
    .select([
      "as_id",
      "name",
      "cas_number",
      "status",
      "expiry_dt",
      "candidate_for_substitution",
    ])
    .where(sql`LOWER(name)`, "like", `${trimmed.toLowerCase()}%`)
    .orderBy(
      sql`CASE WHEN status = 'Approved' THEN 0 ELSE 1 END`,
      "asc",
    )
    .orderBy(sql`LENGTH(name)`, "asc")
    .limit(limit)
    .execute();

  for (const row of prefixRows) {
    if (!existingIds.has(row.as_id)) {
      results.push({
        ...row,
        match_type: "prefix",
        match_field: "name",
      });
      existingIds.add(row.as_id);
    }
  }

  // 5. Fuzzy matches (only if we don't have enough results yet)
  if (results.length < limit && trimmed.length >= 3) {
    const fuzzyRows = await db
      .selectFrom("eu_active_substances")
      .select([
        "as_id",
        "name",
        "cas_number",
        "status",
        "expiry_dt",
        "candidate_for_substitution",
        sql<number>`similarity(name, ${trimmed})`.as("sim"),
      ])
      .where(sql`similarity(name, ${trimmed})`, ">", 0.3)
      .orderBy("sim", "desc")
      .limit(limit)
      .execute();

    for (const row of fuzzyRows) {
      if (!existingIds.has(row.as_id)) {
        const { sim, ...substance } = row;
        results.push({
          ...substance,
          match_type: "fuzzy",
          match_field: "name",
        });
        existingIds.add(row.as_id);
      }
    }
  }

  return results.slice(0, limit);
}
