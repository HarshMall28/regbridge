/**
 * explore-queries.ts
 *
 * Generic table explorer for MCP agent use.
 *
 * exploreSchema() — returns column names, types, nullability for a table
 * exploreTable()  — queries any whitelisted table with dynamic filters + pagination
 *
 * These two tools together let an LLM agent discover what data exists and
 * scan it with arbitrary conditions — no pre-built endpoint needed.
 *
 * Location: packages/api/src/queries/explore-queries.ts
 */

import { db, sql } from "@regbridge/db";

// ---------------------------------------------------------------------------
// Table whitelist — all 31 data tables, excluding sync_log
// ---------------------------------------------------------------------------

const TABLE_WHITELIST = new Set([
  "countries",
  "eu_active_substances",
  "eu_country_authorizations",
  "eu_substance_group_members",
  "eu_substance_categories",
  "eu_pesticide_residues",
  "eu_commodities",
  "eu_mrls",
  "eu_regulations",
  "eu_substance_documents",
  "eu_emergency_authorisations",
  "oft_reference_substances",
  "oft_substances",
  "oft_dossiers",
  "oft_dossier_docs",
  "oft_tox_ref_values",
  "oft_endpoint_summaries",
  "oft_metabolites",
  "oft_literature",
  "ie_products",
  "ie_product_substances",
  "ie_product_crops",
  "fr_products",
  "fr_product_substances",
  "fr_substances",
  "fr_authorized_uses",
  "fr_all_uses",
  "fr_hazard_classes",
  "fr_conditions_of_use",
  "fr_risk_phrases",
  "fr_parallel_trade",
]);

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
}

export interface SchemaResult {
  table: string;
  columns: ColumnInfo[];
  row_count: number;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/**
 * Filter operators supported in explore queries.
 *
 * Filters are passed as an object where keys are column names,
 * optionally suffixed with an operator:
 *
 *   { status: "Approved" }                    → status = 'Approved'
 *   { expiry_dt__lt: "2028-01-01" }           → expiry_dt < '2028-01-01'
 *   { expiry_dt__gte: "2025-01-01" }          → expiry_dt >= '2025-01-01'
 *   { name__ilike: "glyphos" }                → name ILIKE '%glyphos%'
 *   { candidate_for_substitution__is: "true" } → candidate_for_substitution IS TRUE
 *   { cas_number__not: "null" }               → cas_number IS NOT NULL
 *   { etat_autorisation__in: "AUTORISE,RETIRE" } → etat_autorisation IN ('AUTORISE','RETIRE')
 */
export interface ExploreFilters {
  [key: string]: string | number | boolean;
}

export interface ExploreParams {
  table: string;
  filters?: ExploreFilters;
  select?: string[]; // specific columns to return (default: all)
  order_by?: string; // column name, prefix with - for DESC
  limit?: number; // max 500, default 50
  offset?: number;
}

export interface ExploreResult {
  table: string;
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  filters_applied: string[];
}

// ---------------------------------------------------------------------------
// Operator parsing
// ---------------------------------------------------------------------------

function parseFilterKey(key: string): {
  column: string;
  operator: string;
} {
  const suffixes = [
    "neq",
    "lte",
    "gte",
    "lt",
    "gt",
    "ilike",
    "like",
    "is",
    "not",
    "in",
    "eq",
  ];
  for (const suffix of suffixes) {
    if (key.endsWith(`__${suffix}`)) {
      return {
        column: key.slice(0, -(suffix.length + 2)),
        operator: suffix,
      };
    }
  }
  return { column: key, operator: "eq" };
}

// ---------------------------------------------------------------------------
// Column validation
// ---------------------------------------------------------------------------

async function getValidColumns(
  tableName: string,
): Promise<Set<string>> {
  const result = await sql<{ col: string }>`
    SELECT column_name as col
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = ${tableName}
  `.execute(db);

  return new Set(result.rows.map((r) => r.col));
}

// ---------------------------------------------------------------------------
// Build a single sql`` fragment for one filter condition
// ---------------------------------------------------------------------------

function buildCondition(
  column: string,
  operator: string,
  rawValue: string,
): { fragment: ReturnType<typeof sql> | null; display: string } {
  // sql.ref() doesn't quote column names with special chars, use sql.raw for quoted column
  const col = sql.raw(`"${column}"`);

  switch (operator) {
    case "eq":
      return {
        fragment: sql`${col} = ${rawValue}`,
        display: `${column} = '${rawValue}'`,
      };

    case "neq":
      return {
        fragment: sql`${col} != ${rawValue}`,
        display: `${column} != '${rawValue}'`,
      };

    case "lt":
      return {
        fragment: sql`${col} < ${rawValue}`,
        display: `${column} < '${rawValue}'`,
      };

    case "lte":
      return {
        fragment: sql`${col} <= ${rawValue}`,
        display: `${column} <= '${rawValue}'`,
      };

    case "gt":
      return {
        fragment: sql`${col} > ${rawValue}`,
        display: `${column} > '${rawValue}'`,
      };

    case "gte":
      return {
        fragment: sql`${col} >= ${rawValue}`,
        display: `${column} >= '${rawValue}'`,
      };

    case "ilike":
      return {
        fragment: sql`${col} ILIKE ${"%" + rawValue + "%"}`,
        display: `${column} ILIKE '%${rawValue}%'`,
      };

    case "like":
      return {
        fragment: sql`${col} LIKE ${"%" + rawValue + "%"}`,
        display: `${column} LIKE '%${rawValue}%'`,
      };

    case "is": {
      const lower = rawValue.toLowerCase();
      if (lower === "true") {
        return {
          fragment: sql`${col} IS TRUE`,
          display: `${column} IS TRUE`,
        };
      }
      if (lower === "false") {
        return {
          fragment: sql`${col} IS FALSE`,
          display: `${column} IS FALSE`,
        };
      }
      if (lower === "null") {
        return {
          fragment: sql`${col} IS NULL`,
          display: `${column} IS NULL`,
        };
      }
      return { fragment: null, display: "" };
    }

    case "not": {
      if (rawValue.toLowerCase() === "null") {
        return {
          fragment: sql`${col} IS NOT NULL`,
          display: `${column} IS NOT NULL`,
        };
      }
      return { fragment: null, display: "" };
    }

    case "in": {
      const inValues = rawValue.split(",").map((v) => v.trim());
      // Build IN clause: sql`col IN (val1, val2, ...)`
      // Kysely parameterizes each value via the template literal
      let inFragment = sql`${col} IN (`;
      for (let i = 0; i < inValues.length; i++) {
        if (i > 0) inFragment = sql`${inFragment}, `;
        inFragment = sql`${inFragment}${inValues[i]}`;
      }
      inFragment = sql`${inFragment})`;
      return {
        fragment: inFragment,
        display: `${column} IN (${inValues.join(", ")})`,
      };
    }

    default:
      return { fragment: null, display: "" };
  }
}

// ---------------------------------------------------------------------------
// exploreSchema
// ---------------------------------------------------------------------------

export async function exploreSchema(
  tableName: string,
): Promise<SchemaResult | null> {
  if (!TABLE_WHITELIST.has(tableName)) {
    return null;
  }

  const [columnsResult, countResult] = await Promise.all([
    sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = ${tableName}
      ORDER BY ordinal_position
    `.execute(db),

    sql<{ total: number }>`
      SELECT count(*)::int as total
      FROM ${sql.raw(`"${tableName}"`)}
    `.execute(db),
  ]);

  if (columnsResult.rows.length === 0) return null;

  return {
    table: tableName,
    columns: columnsResult.rows.map((c) => ({
      column_name: c.column_name,
      data_type: c.data_type,
      is_nullable: c.is_nullable === "YES",
      column_default: c.column_default,
    })),
    row_count: countResult.rows[0]?.total ?? 0,
  };
}

// ---------------------------------------------------------------------------
// exploreTable
// ---------------------------------------------------------------------------

export async function exploreTable(
  params: ExploreParams,
): Promise<ExploreResult | null> {
  const { table } = params;

  if (!TABLE_WHITELIST.has(table)) {
    return null;
  }

  const limit = Math.min(params.limit ?? 50, 500);
  const offset = params.offset ?? 0;

  // Validate columns against schema
  const validColumns = await getValidColumns(table);
  if (validColumns.size === 0) return null;

  // Build select columns
  let selectCols: string[];
  if (params.select && params.select.length > 0) {
    selectCols = params.select.filter((c) => validColumns.has(c));
    if (selectCols.length === 0) {
      selectCols = [...validColumns];
    }
  } else {
    selectCols = [...validColumns];
  }

  const selectFragment = sql.raw(
    selectCols.map((c) => `"${c}"`).join(", "),
  );
  const tableFragment = sql.raw(`"${table}"`);

  // Build WHERE conditions
  const conditions: ReturnType<typeof sql>[] = [];
  const filtersApplied: string[] = [];

  if (params.filters) {
    for (const [key, rawValue] of Object.entries(params.filters)) {
      const { column, operator } = parseFilterKey(key);
      if (!validColumns.has(column)) continue;

      const { fragment, display } = buildCondition(
        column,
        operator,
        String(rawValue),
      );
      if (fragment) {
        conditions.push(fragment);
        filtersApplied.push(display);
      }
    }
  }

  // Compose WHERE fragment
  let whereFragment = sql``;
  if (conditions.length > 0) {
    whereFragment = sql`WHERE ${conditions[0]}`;
    for (let i = 1; i < conditions.length; i++) {
      whereFragment = sql`${whereFragment} AND ${conditions[i]}`;
    }
  }

  // Build ORDER BY
  let orderFragment = sql``;
  if (params.order_by) {
    const desc = params.order_by.startsWith("-");
    const orderCol = desc
      ? params.order_by.slice(1)
      : params.order_by;
    if (validColumns.has(orderCol)) {
      orderFragment = sql`ORDER BY ${sql.raw(`"${orderCol}"`)} ${sql.raw(desc ? "DESC" : "ASC")} NULLS LAST`;
    }
  }

  // Execute count + data in parallel
  const [countResult, dataResult] = await Promise.all([
    sql<{ total: number }>`
      SELECT count(*)::int as total
      FROM ${tableFragment}
      ${whereFragment}
    `.execute(db),

    sql<Record<string, unknown>>`
      SELECT ${selectFragment}
      FROM ${tableFragment}
      ${whereFragment}
      ${orderFragment}
      LIMIT ${limit}
      OFFSET ${offset}
    `.execute(db),
  ]);

  return {
    table,
    rows: dataResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
    filters_applied: filtersApplied,
  };
}

// ---------------------------------------------------------------------------
// Convenience: list all available tables
// ---------------------------------------------------------------------------

export function listTables(): string[] {
  return [...TABLE_WHITELIST].sort();
}
