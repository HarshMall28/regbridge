import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { createApiClient } from "@regbridge/api-client";

interface Env {
  API: Fetcher;
  API_KEY: string;
}

// Schema definitions
const searchSchema = {
  q: z
    .string()
    .describe(
      "Search query — substance name, product name, or company name",
    ),
};

const substanceProfileSchema = {
  identifier: z
    .string()
    .describe(
      "Substance name (e.g. 'prothioconazole') or CAS number (e.g. '178928-70-6')",
    ),
};

const searchProductsSchema = {
  q: z
    .string()
    .describe("Product name or authorization holder to search for"),
};

const productDetailSchema = {
  country: z
    .enum(["ie", "fr"])
    .describe("Country code: 'ie' for Ireland, 'fr' for France"),
  id: z
    .string()
    .describe(
      "Product ID — PCS number for IE (e.g. '07167'), AMM number for FR (e.g. '2100108')",
    ),
};

const mrlComplianceSchema = {
  substance: z
    .string()
    .describe("Active substance name (e.g. 'glyphosate')"),
  commodity: z
    .string()
    .describe("Food commodity name (e.g. 'wheat', 'apples')"),
  value: z
    .number()
    .optional()
    .describe(
      "Measured residue level in mg/kg. If provided, returns compliance check. If omitted, returns just the MRL limit.",
    ),
};

const listTablesSchema = {};

const exploreTableSchema = {
  table_name: z
    .string()
    .describe(
      "Table name from list_tables (e.g. 'eu_active_substances')",
    ),
  filters: z
    .string()
    .optional()
    .describe(
      'JSON string of column filters (e.g. \'{"status": "Approved"}\')',
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum rows to return (1-100, default 10)"),
};

const exploreSchemaSchema = {
  table_name: z
    .string()
    .describe(
      "Table name from list_tables (e.g. 'eu_active_substances')",
    ),
};

function createServer(env: Env) {
  const client = createApiClient(env.API, env.API_KEY);
  const server = new McpServer(
    {
      name: "RegBridge",
      version: "1.0.0",
    },
    {
      instructions: `You are connected to RegBridge, a regulatory intelligence database covering EU crop protection data across 32 tables.

RESPONSE FORMAT:
- Use tables for any list of 3+ items. Never write lists as paragraphs.
- Keep answers concise. No introductions, no summaries, no filler.
- Every claim must cite its source: regulation number, data table, or data_as_of timestamp.
- When showing MRL values, always include the regulation number and whether the value is at LOD (marked with *).
- When showing substance status, always include approval date, expiry date, and whether it is a candidate for substitution.

TOOL USAGE:
- Call explore_schema before explore_table. explore_table will fail if you guess column names.
- For substance questions, prefer get_substance_profile over explore_table. It returns a 13-table cross-tier profile in one call.
- For "what products contain X" questions, use search_products with the substance filter, not explore_table on product tables.
- For company portfolio questions, use get_company_profile. It aggregates across IE and FR in one call.
- For MRL compliance, use check_mrl_compliance. Do not manually query eu_mrls.
- When analyzing multiple substances, call get_substance_profile for each one separately rather than using explore_table.

DATA CONTEXT:
- EU approval does not mean currently valid. Always check expiry_dt > today, not just status = 'Approved'.
- Emergency authorizations (Article 53) are 120-day temporary permits. Recurring ones for the same substance in the same country signal unmet market demand.
- Ireland uses PCS numbers (4-5 digits). France uses AMM numbers (7 digits). These are not interchangeable.
- This data is not legally authoritative. Always recommend verification against official registers for regulatory submissions.`,
    },
  );

  // 1. Search — the entry point for all queries
  server.registerTool(
    "search",
    {
      description:
        "START HERE. Search EU crop protection regulatory data by name. " +
        "Returns matching substances, IE products, FR products, and companies. " +
        "Use this to find identifiers before calling get_substance_profile, " +
        "get_product_detail, or get_company_profile. Supports partial matching " +
        "(e.g. 'prothi' finds Prothioconazole). Do NOT guess identifiers — " +
        "always search first.",
      inputSchema: z.object(searchSchema),
    },
    async (args: { q: string }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.paletteSearch(args.q)),
        },
      ],
    }),
  );

  // 2. Substance profile — deep dive on one substance
  server.registerTool(
    "get_substance_profile",
    {
      description:
        "Get the full regulatory profile of one active substance. Returns " +
        "toxicology (ADI, ARfD, AOEL), 28 EU member state authorizations, " +
        "IE and FR commercial products, Article 53 emergency authorizations, " +
        "metabolites, documents, and legislation. Call search first to get " +
        "the exact substance name or CAS number. Returns a large response.",
      inputSchema: z.object(substanceProfileSchema),
    },
    async (args: { identifier: string }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await client.getSubstanceProfile(args.identifier),
          ),
        },
      ],
    }),
  );

  // 3. Search products
  server.registerTool(
    "search_products",
    {
      description:
        "Search commercial crop protection products across Ireland (IE) and " +
        "France (FR). Returns summary list: name, country, auth holder, " +
        "substances, status. Use this to find a product ID, then call " +
        "get_product_detail with country + ID for the full record.",
      inputSchema: z.object(searchProductsSchema),
    },
    async (args: { q: string }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await client.searchProducts({ q: args.q }),
          ),
        },
      ],
    }),
  );

  // 4. Product detail
  server.registerTool(
    "get_product_detail",
    {
      description:
        "Get full regulatory detail for one product. Requires country ('ie' or " +
        "'fr') and product ID from search_products results. IE products return " +
        "PCS number, substances, auth holder. FR products return authorized " +
        "uses, hazard classes (GHS), risk phrases, conditions of use, and " +
        "parallel trade permits. Do NOT call without a valid ID from " +
        "search_products.",
      inputSchema: z.object(productDetailSchema),
    },
    async (args: { country: "ie" | "fr"; id: string }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await client.getProductDetail(args.country, args.id),
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "get_company_profile",
    {
      description:
        "Get a company's crop protection portfolio across IE and FR. Returns " +
        "all products registered to this authorization holder with substance " +
        "breakdown and function categories. Use the company name exactly as " +
        "it appears in search results (e.g. 'Life Scientific', 'BAYER SAS').",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Company/authorization holder name"),
      }),
    },
    async ({ name }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.getCompanyProfile(name)),
        },
      ],
    }),
  );
  // 6. MRL compliance check
  server.registerTool(
    "check_mrl_compliance",
    {
      description:
        "Check EU Maximum Residue Limits for a substance + commodity pair. " +
        "Always returns the MRL limit in mg/kg and its regulation. If value " +
        "is provided, also returns compliance status and margin. Use substance " +
        "and commodity names in English (e.g. substance='glyphosate', " +
        "commodity='wheat'). Do NOT use for substances not in the EU database.",
      inputSchema: z.object(mrlComplianceSchema),
    },
    async ({ substance, commodity, value }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await client.checkMrlCompliance({
              substance,
              commodity,
              value,
            }),
          ),
        },
      ],
    }),
  );

  // 7. List tables
  server.registerTool(
    "list_tables",
    {
      description:
        "List all 31 database tables. Call this FIRST when exploring raw data. " +
        "Tables are prefixed by source: eu_ (EU regulatory), fr_ (France), " +
        "ie_ (Ireland), oft_ (EFSA OpenFoodTox), countries. After listing, " +
        "call explore_schema on a table to see its columns before querying.",
      inputSchema: z.object(listTablesSchema),
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.listTables()),
        },
      ],
    }),
  );

  // 8. Explore table
  server.registerTool(
    "explore_table",
    {
      description:
        "Query any table with optional filters. REQUIRES: call list_tables " +
        "then explore_schema first. Filters are a JSON object: keys are " +
        "column names from the schema, values are match criteria. Operators: " +
        "__lt, __gt, __lte, __gte, __ne, __like. Example: " +
        '{"status": "Approved", "expiry_dt__lt": "2027-01-01"}. ' +
        "Returns max 100 rows per call. Narrow with filters, not large limits.",
      inputSchema: z.object(exploreTableSchema),
    },
    async (args: {
      table_name: string;
      filters?: string;
      limit: number;
    }) => {
      const filters = args.filters
        ? (JSON.parse(args.filters) as Record<string, string>)
        : undefined;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              await client.exploreTable({
                tableName: args.table_name,
                filters,
                limit: args.limit,
              }),
            ),
          },
        ],
      };
    },
  );

  // 9. Explore schema
  server.registerTool(
    "explore_schema",
    {
      description:
        "Get column names, data types, and nullable flags for a table. Call " +
        "this BEFORE explore_table to know which columns exist and what " +
        "filter keys are valid. Required step — do NOT call explore_table " +
        "without checking the schema first.",
      inputSchema: z.object(exploreSchemaSchema),
    },
    async (args: { table_name: string }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            await client.exploreSchema(args.table_name),
          ),
        },
      ],
    }),
  );
  server.registerTool(
    "aggregate",
    {
      description:
        "Generic cross-table aggregation query. Executes a single SQL query with " +
        "optional JOIN, WHERE, GROUP BY, HAVING, and ORDER BY — returning computed " +
        "results in one call instead of multiple explore_table calls.\n\n" +
        "USE FOR:\n" +
        "- Gap analysis: EU-approved substances with zero IE or FR products\n" +
        "- Market density: count of distinct auth holders per substance\n" +
        "- Expiry risk: substances expiring within N months with product counts\n" +
        "- Portfolio coverage: which function categories a company covers\n" +
        "- Any question requiring COUNT, COUNT_DISTINCT, SUM, AVG, MIN, MAX across tables\n\n" +
        "SECURITY: Only these tables are allowed:\n" +
        "eu_active_substances, eu_substance_categories, eu_country_authorizations,\n" +
        "eu_substance_group_members, eu_commodities,\n" +
        "ie_products, ie_product_substances, ie_product_crops,\n" +
        "fr_products, fr_product_substances, fr_substances,\n" +
        "fr_authorized_uses, fr_all_uses, fr_hazard_classes,\n" +
        "fr_conditions_of_use, fr_risk_phrases\n\n" +
        "COLUMN NAMES: All column references are validated against live schema. " +
        "Call explore_schema first if unsure of column names. Unknown columns → 400 error.\n\n" +
        "JOIN TOPOLOGY (the correct bridge tables):\n" +
        "- EU substances → IE products: join ie_product_substances on " +
        "  eu_active_substances.name = ie_product_substances.substance_name, " +
        "  then optionally join ie_products on ie_product_substances.product_id = ie_products.product_id\n" +
        "- EU substances → FR products: join fr_product_substances on " +
        "  eu_active_substances.name = fr_product_substances.substance_name\n" +
        "- Single join only. For 3-table queries, use two aggregate calls or explore_table.\n\n" +
        "HARD LIMIT: 100 rows regardless of what you pass.",
      inputSchema: z.object({
        from: z
          .string()
          .describe(
            "Base table name. Must be in the allowed whitelist above.",
          ),
        where: z
          .array(
            z.object({
              column: z
                .string()
                .describe(
                  "Column name, optionally table-prefixed as 'table.column'",
                ),
              op: z
                .enum([
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
                ])
                .describe("Filter operator"),
              value: z
                .union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.array(z.string()),
                ])
                .optional()
                .describe(
                  "Filter value. Omit for is_null/not_null. Array for 'in'.",
                ),
            }),
          )
          .optional()
          .describe("Row-level filters (WHERE clause)"),
        join: z
          .object({
            table: z
              .string()
              .describe("Table to join — must be in whitelist"),
            type: z.enum(["left", "inner"]),
            on: z.object({
              from_column: z
                .string()
                .describe("Column in the `from` table"),
              to_column: z
                .string()
                .describe("Column in the joined table"),
            }),
          })
          .optional()
          .describe("Single table join"),
        select: z
          .array(
            z.object({
              column: z
                .string()
                .describe(
                  "Column to select, optionally table-prefixed",
                ),
              alias: z.string().optional().describe("Output alias"),
            }),
          )
          .optional()
          .describe("Columns to include in output"),
        aggregate: z
          .array(
            z.object({
              fn: z
                .enum([
                  "count",
                  "count_distinct",
                  "sum",
                  "avg",
                  "min",
                  "max",
                ])
                .describe("Aggregation function"),
              column: z
                .string()
                .describe(
                  "Column to aggregate. Use '*' for count(*)",
                ),
              alias: z
                .string()
                .describe(
                  "Required output alias — used in having and order_by",
                ),
            }),
          )
          .optional()
          .describe("Aggregation functions — activates GROUP BY"),
        group_by: z
          .array(z.string())
          .optional()
          .describe(
            "Columns to group by. Required when aggregate is present.",
          ),
        having: z
          .array(
            z.object({
              alias: z
                .string()
                .describe("Aggregate alias to filter on"),
              op: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
              value: z.number().describe("Numeric threshold"),
            }),
          )
          .optional()
          .describe(
            "Post-aggregation filter on aggregate values (HAVING)",
          ),
        order_by: z
          .array(
            z.object({
              column: z
                .string()
                .describe("Column name or aggregate alias"),
              direction: z.enum(["asc", "desc"]),
            }),
          )
          .optional()
          .describe("Sort order"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Max rows. Hard capped at 100."),
      }),
    },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.aggregate(args as any)),
        },
      ],
    }),
  );

  server.registerTool(
    "gap_analysis",
    {
      description:
        "Find EU-approved substances with zero or few products registered in Ireland or France. " +
        "USE FOR: 'which substances have no IE products', 'gap analysis', 'zero coverage in IE/FR', " +
        "'which approved substances have no generic alternatives'. " +
        "Returns substance name, expiry date, candidate-for-substitution flag, and product count.",
      inputSchema: z.object({
        market: z
          .enum(["ie", "fr"])
          .describe("Which market to check"),
        expiry_before: z
          .string()
          .optional()
          .describe(
            "Only substances expiring before this date e.g. '2027-01-01'",
          ),
        expiry_after: z
          .string()
          .optional()
          .describe("Lower bound on expiry date"),
        max_products: z
          .number()
          .optional()
          .describe(
            "Max product count. Default 0 = zero products only.",
          ),
        status: z
          .string()
          .optional()
          .describe("EU approval status. Default 'Approved'."),
        limit: z.number().optional().describe("Max rows, default 50"),
      }),
    },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.gapAnalysis(args)),
        },
      ],
    }),
  );

  server.registerTool(
    "market_density",
    {
      description:
        "Count products per substance in IE or FR — reveals competitive saturation. " +
        "USE FOR: 'most registered substances', 'competitive landscape', " +
        "'how many products per substance', 'dominant substances'. " +
        "Returns substance name and product count sorted by count descending.",
      inputSchema: z.object({
        market: z
          .enum(["ie", "fr"])
          .describe("Which market to analyse"),
        min_products: z
          .number()
          .optional()
          .describe(
            "Only substances with at least this many products",
          ),
        max_products: z
          .number()
          .optional()
          .describe(
            "Only substances with at most this many products",
          ),
        limit: z.number().optional().describe("Max rows, default 50"),
      }),
    },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.marketDensity(args)),
        },
      ],
    }),
  );

  server.registerTool(
    "expiry_risk",
    {
      description:
        "Find EU-approved substances expiring soon with low IE/FR product coverage. " +
        "USE FOR: 'expiry risk', 'substances expiring in next X months', " +
        "'renewal pipeline', 'expiring with few products', 'at risk substances'. " +
        "Returns substance, expiry date, CfS flag, rapporteur, and product count.",
      inputSchema: z.object({
        expiry_before: z
          .string()
          .describe(
            "Substances expiring before this date e.g. '2027-01-01'",
          ),
        expiry_after: z
          .string()
          .optional()
          .describe("Lower bound on expiry date"),
        market: z
          .enum(["ie", "fr"])
          .optional()
          .describe("Market to check coverage. Default 'ie'."),
        max_products: z
          .number()
          .optional()
          .describe("Max product count threshold. Default 5."),
        cfs_only: z
          .boolean()
          .optional()
          .describe("Only candidate-for-substitution substances"),
        limit: z.number().optional(),
      }),
    },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await client.expiryRisk(args)),
        },
      ],
    }),
  );

  return server;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createMcpHandler(() => createServer(env))(
      request,
      env,
      ctx,
    );
  },
} satisfies ExportedHandler<Env>;
