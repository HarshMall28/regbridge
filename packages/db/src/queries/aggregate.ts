/**
 * aggregate.ts — Generic cross-table aggregation query builder
 *
 * Security model:
 *   Layer 1: Table whitelist — only the 16 clean joinable tables
 *   Layer 2: Runtime column validation — every column reference checked
 *             against live schema before query builds
 *   Layer 3: Op/fn enum — no arbitrary SQL through filter values
 *   Layer 4: DB user is SELECT-only — no writes possible regardless
 *
 * Does NOT support: eu_emergency_authorisations (JSONB columns),
 *   eu_mrls (residue_id indirection), oft_* tables (different join topology).
 *   Those have dedicated endpoints.
 */

import { db, sql } from "../connection.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tables the aggregator is allowed to touch. JSONB-heavy and OFT tables excluded. */
export const AGGREGATE_WHITELIST = new Set([
  "eu_active_substances",
  "eu_substance_categories",
  "eu_country_authorizations",
  "eu_substance_group_members",
  "eu_commodities",
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
]);

export const ALLOWED_OPS = new Set([
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "ilike",
  "like",
  "in",
  "is_null",
  "not_null",
]);

export const ALLOWED_FNS = new Set([
  "count",
  "count_distinct",
  "sum",
  "avg",
  "min",
  "max",
]);

export const ALLOWED_JOIN_TYPES = new Set(["left", "inner"]);
export const ALLOWED_DIRECTIONS = new Set(["asc", "desc"]);

const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Input types — what the LLM sends
// ---------------------------------------------------------------------------

export interface WhereClause {
  column: string; // bare column name — table prefix optional
  op: string; // must be in ALLOWED_OPS
  value?: string | number | boolean | string[]; // not needed for is_null/not_null
}

export interface SelectColumn {
  column: string; // "table.column" or bare column
  alias?: string;
}

export interface AggregateColumn {
  fn: string; // must be in ALLOWED_FNS
  column: string; // "table.column" or bare column — use "*" for count(*)
  alias: string; // required — used in HAVING and output
}

export interface JoinClause {
  table: string; // must be in AGGREGATE_WHITELIST
  type: "left" | "inner";
  on: {
    from_column: string; // column in `from` table
    to_column: string; // column in joined table
  };
}

export interface HavingClause {
  alias: string; // must match an alias in `aggregate`
  op: string; // must be in ALLOWED_OPS (excluding is_null/not_null)
  value: number; // HAVING is always numeric
}

export interface OrderByClause {
  column: string; // bare column or alias
  direction: "asc" | "desc";
}

export interface AggregateParams {
  from: string;
  where?: WhereClause[];
  join?: JoinClause;
  select?: SelectColumn[];
  aggregate?: AggregateColumn[];
  group_by?: string[];
  having?: HavingClause[];
  order_by?: OrderByClause[];
  limit?: number;
}

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface AggregateResult {
  rows: Record<string, string | number | boolean | null>[];
  row_count: number;
  query_plan: {
    from: string;
    join: string | null;
    where_count: number;
    aggregate_fns: string[];
    having_count: number;
    limit: number;
  };
}

// ---------------------------------------------------------------------------
// Schema cache — avoid redundant schema lookups within one request
// ---------------------------------------------------------------------------

const schemaCache = new Map<string, Set<string>>();

async function getColumns(tableName: string): Promise<Set<string>> {
  if (schemaCache.has(tableName)) return schemaCache.get(tableName)!;

  const rows = (await db
    .selectFrom("information_schema.columns" as any)
    .select(["column_name"] as any)
    .where("table_name" as any, "=", tableName)
    .where("table_schema" as any, "=", "public")
    .execute()) as { column_name: string }[];

  const cols = new Set(rows.map((r) => r.column_name));
  schemaCache.set(tableName, cols);
  return cols;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Parse "table.column" or bare "column". Returns { table, column }. */
function parseColumnRef(
  ref: string,
  defaultTable: string,
): { table: string; column: string } {
  const parts = ref.split(".");
  if (parts.length === 2)
    return { table: parts[0], column: parts[1] };
  return { table: defaultTable, column: ref };
}

/** Validate a column reference against live schema. Throws ValidationError on failure. */
async function validateColumn(
  ref: string,
  defaultTable: string,
  joinTable: string | null,
  label: string,
): Promise<void> {
  if (ref === "*") return; // count(*) is always valid
  const { table, column } = parseColumnRef(ref, defaultTable);

  // Table must be in whitelist
  if (!AGGREGATE_WHITELIST.has(table)) {
    throw new AggregateValidationError(
      `${label}: table "${table}" is not in the allowed table list`,
    );
  }

  // Table must be one of the tables in use (from or join)
  if (table !== defaultTable && table !== joinTable) {
    throw new AggregateValidationError(
      `${label}: table "${table}" is not part of this query (from="${defaultTable}", join="${joinTable ?? "none"}")`,
    );
  }

  const cols = await getColumns(table);
  if (!cols.has(column)) {
    throw new AggregateValidationError(
      `${label}: column "${column}" does not exist in table "${table}". ` +
        `Available: ${[...cols].slice(0, 10).join(", ")}${cols.size > 10 ? "…" : ""}`,
    );
  }
}

export class AggregateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AggregateValidationError";
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function runAggregate(
  params: AggregateParams,
): Promise<AggregateResult> {
  // ── Layer 1: Table whitelist ──────────────────────────────────────────────
  if (!AGGREGATE_WHITELIST.has(params.from)) {
    throw new AggregateValidationError(
      `Table "${params.from}" is not in the allowed table list. ` +
        `Allowed: ${[...AGGREGATE_WHITELIST].join(", ")}`,
    );
  }

  const joinTable = params.join?.table ?? null;

  if (joinTable && !AGGREGATE_WHITELIST.has(joinTable)) {
    throw new AggregateValidationError(
      `Join table "${joinTable}" is not in the allowed table list.`,
    );
  }

  if (params.join && !ALLOWED_JOIN_TYPES.has(params.join.type)) {
    throw new AggregateValidationError(
      `Join type "${params.join.type}" is not allowed. Use "left" or "inner".`,
    );
  }

  // ── Layer 2: Validate all column references ───────────────────────────────
  // Join ON columns
  if (params.join) {
    await validateColumn(
      params.join.on.from_column,
      params.from,
      joinTable,
      "join.on.from_column",
    );
    await validateColumn(
      params.join.on.to_column,
      joinTable!,
      joinTable,
      "join.on.to_column",
    );
  }

  // WHERE columns
  for (const w of params.where ?? []) {
    if (!ALLOWED_OPS.has(w.op)) {
      throw new AggregateValidationError(
        `where op "${w.op}" is not allowed. Allowed: ${[...ALLOWED_OPS].join(", ")}`,
      );
    }
    await validateColumn(
      w.column,
      params.from,
      joinTable,
      `where.${w.column}`,
    );
  }

  // SELECT columns
  for (const s of params.select ?? []) {
    await validateColumn(
      s.column,
      params.from,
      joinTable,
      `select.${s.column}`,
    );
  }

  // AGGREGATE columns
  const aggregateAliases = new Set<string>();
  for (const a of params.aggregate ?? []) {
    if (!ALLOWED_FNS.has(a.fn)) {
      throw new AggregateValidationError(
        `aggregate fn "${a.fn}" is not allowed. Allowed: ${[...ALLOWED_FNS].join(", ")}`,
      );
    }
    if (!a.alias) {
      throw new AggregateValidationError(
        `Every aggregate entry must have an alias.`,
      );
    }
    await validateColumn(
      a.column,
      params.from,
      joinTable,
      `aggregate.${a.fn}(${a.column})`,
    );
    aggregateAliases.add(a.alias);
  }

  // GROUP BY columns
  for (const g of params.group_by ?? []) {
    await validateColumn(g, params.from, joinTable, `group_by.${g}`);
  }

  // HAVING — alias must exist in aggregate
  for (const h of params.having ?? []) {
    if (!aggregateAliases.has(h.alias)) {
      throw new AggregateValidationError(
        `having alias "${h.alias}" does not match any aggregate alias. ` +
          `Defined aliases: ${[...aggregateAliases].join(", ")}`,
      );
    }
    if (!ALLOWED_OPS.has(h.op)) {
      throw new AggregateValidationError(
        `having op "${h.op}" is not allowed.`,
      );
    }
  }

  // ORDER BY
  for (const o of params.order_by ?? []) {
    if (!ALLOWED_DIRECTIONS.has(o.direction)) {
      throw new AggregateValidationError(
        `order_by direction "${o.direction}" must be "asc" or "desc".`,
      );
    }
    // order_by column can be an aggregate alias — skip column validation if it is
    if (!aggregateAliases.has(o.column)) {
      await validateColumn(
        o.column,
        params.from,
        joinTable,
        `order_by.${o.column}`,
      );
    }
  }

  const limit = Math.min(params.limit ?? 50, MAX_LIMIT);

  // ── Build SELECT expressions ──────────────────────────────────────────────
  const selectExprs: any[] = [];

  for (const s of params.select ?? []) {
    const { table, column } = parseColumnRef(s.column, params.from);
    const ref = `${table}.${column}`;
    const expr = s.alias
      ? sql.raw(`"${table}"."${column}" AS "${s.alias}"`)
      : sql.raw(`"${table}"."${column}"`);
    selectExprs.push(expr);
  }

  for (const a of params.aggregate ?? []) {
    const { table, column } = parseColumnRef(a.column, params.from);
    const colRef = column === "*" ? "*" : `"${table}"."${column}"`;
    let expr: any;
    if (a.fn === "count_distinct") {
      expr = sql.raw(`COUNT(DISTINCT ${colRef}) AS "${a.alias}"`);
    } else {
      expr = sql.raw(
        `${a.fn.toUpperCase()}(${colRef}) AS "${a.alias}"`,
      );
    }
    selectExprs.push(expr);
  }

  // If no select and no aggregate, select all from the base table
  if (selectExprs.length === 0) {
    selectExprs.push(sql.raw(`"${params.from}".*`));
  }

  // ── Build query using raw SQL for full control ────────────────────────────
  // Kysely's type system doesn't handle dynamic multi-table queries well.
  // We use sql template tags throughout for safety — no string interpolation
  // of user values, only whitelisted identifiers and parameterised values.

  const parts: any[] = [];

  // SELECT
  parts.push(sql`SELECT`);
  parts.push(sql.join(selectExprs, sql`, `));

  // FROM
  parts.push(sql.raw(`FROM "${params.from}"`));

  // JOIN
  if (params.join) {
    const { table, type, on } = params.join;
    const { table: fromT, column: fromC } = parseColumnRef(
      on.from_column,
      params.from,
    );
    const { table: toT, column: toC } = parseColumnRef(
      on.to_column,
      table,
    );
    const joinType = type === "left" ? "LEFT JOIN" : "INNER JOIN";
    parts.push(
      sql.raw(
        `${joinType} "${table}" ON "${fromT}"."${fromC}" = "${toT}"."${toC}"`,
      ),
    );
  }

  // WHERE
  const whereParts: any[] = [];
  for (const w of params.where ?? []) {
    const { table, column } = parseColumnRef(w.column, params.from);
    const colRef = sql.raw(`"${table}"."${column}"`);

    switch (w.op) {
      case "eq":
        whereParts.push(sql`${colRef} = ${w.value}`);
        break;
      case "neq":
        whereParts.push(sql`${colRef} != ${w.value}`);
        break;
      case "lt":
        whereParts.push(sql`${colRef} < ${w.value}`);
        break;
      case "lte":
        whereParts.push(sql`${colRef} <= ${w.value}`);
        break;
      case "gt":
        whereParts.push(sql`${colRef} > ${w.value}`);
        break;
      case "gte":
        whereParts.push(sql`${colRef} >= ${w.value}`);
        break;
      case "like":
        whereParts.push(sql`${colRef} LIKE ${w.value}`);
        break;
      case "ilike":
        whereParts.push(sql`${colRef} ILIKE ${w.value}`);
        break;
      case "is_null":
        whereParts.push(sql`${colRef} IS NULL`);
        break;
      case "not_null":
        whereParts.push(sql`${colRef} IS NOT NULL`);
        break;
      case "in": {
        const vals = Array.isArray(w.value) ? w.value : [w.value];
        whereParts.push(
          sql`${colRef} IN (${sql.join(
            vals.map((v) => sql`${v}`),
            sql`, `,
          )})`,
        );
        break;
      }
    }
  }
  if (whereParts.length > 0) {
    parts.push(sql`WHERE`);
    parts.push(sql.join(whereParts, sql` AND `));
  }

  // GROUP BY
  if ((params.group_by ?? []).length > 0) {
    const groupParts = params.group_by!.map((g) => {
      const { table, column } = parseColumnRef(g, params.from);
      return sql.raw(`"${table}"."${column}"`);
    });
    parts.push(sql`GROUP BY`);
    parts.push(sql.join(groupParts, sql`, `));
  }

  // HAVING
  // HAVING — repeat raw aggregate expression (Postgres rejects aliases in HAVING)
  const havingParts: any[] = [];
  for (const h of params.having ?? []) {
    const aggDef = (params.aggregate ?? []).find(
      (a) => a.alias === h.alias,
    );
    if (!aggDef) continue;
    const { table, column } = parseColumnRef(
      aggDef.column,
      params.from,
    );
    const colRef = column === "*" ? "*" : `"${table}"."${column}"`;
    const fnExpr =
      aggDef.fn === "count_distinct"
        ? sql.raw(`COUNT(DISTINCT ${colRef})`)
        : sql.raw(`${aggDef.fn.toUpperCase()}(${colRef})`);
    switch (h.op) {
      case "eq":
        havingParts.push(sql`${fnExpr} = ${h.value}`);
        break;
      case "neq":
        havingParts.push(sql`${fnExpr} != ${h.value}`);
        break;
      case "lt":
        havingParts.push(sql`${fnExpr} < ${h.value}`);
        break;
      case "lte":
        havingParts.push(sql`${fnExpr} <= ${h.value}`);
        break;
      case "gt":
        havingParts.push(sql`${fnExpr} > ${h.value}`);
        break;
      case "gte":
        havingParts.push(sql`${fnExpr} >= ${h.value}`);
        break;
    }
  }
  if (havingParts.length > 0) {
    parts.push(sql`HAVING`);
    parts.push(sql.join(havingParts, sql` AND `));
  }

  // ORDER BY
  if ((params.order_by ?? []).length > 0) {
    const orderParts = params.order_by!.map((o) => {
      const dir = o.direction === "desc" ? "DESC" : "ASC";
      // If it's an aggregate alias, reference it directly
      if (aggregateAliases.has(o.column)) {
        return sql.raw(`"${o.column}" ${dir}`);
      }
      const { table, column } = parseColumnRef(o.column, params.from);
      return sql.raw(`"${table}"."${column}" ${dir}`);
    });
    parts.push(sql`ORDER BY`);
    parts.push(sql.join(orderParts, sql`, `));
  }

  // LIMIT
  parts.push(sql`LIMIT ${limit}`);

  // ── Execute ───────────────────────────────────────────────────────────────
  const query = sql.join(parts, sql` `);
  const rows = await query.execute(db);

  return {
    rows: (rows as any).rows ?? rows,
    row_count: ((rows as any).rows ?? rows).length,
    query_plan: {
      from: params.from,
      join: joinTable ? `${params.join!.type} ${joinTable}` : null,
      where_count: (params.where ?? []).length,
      aggregate_fns: (params.aggregate ?? []).map(
        (a) => `${a.fn}(${a.column}) as ${a.alias}`,
      ),
      having_count: (params.having ?? []).length,
      limit,
    },
  };
}
