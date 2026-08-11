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
