import { createFileRoute } from "@tanstack/react-router";
import {
  streamText,
  tool,
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { createApiClient } from "@regbridge/api-client";
import type { ProductSearchParams } from "@regbridge/api-client";

const SYSTEM_PROMPT = `You are a regulatory intelligence analyst for EU crop protection data. You have access to RegBridge — 32 tables covering EU substance approvals, EFSA toxicology, and national product registers for Ireland and France.

RESPONSE FORMAT:
- Use markdown tables for any comparison of 2+ items.
- Bold key values: **Approved**, **0.05 mg/kg**, **2028-12-15**.
- Keep responses concise and under 500 words.
- When referencing a substance: [Azoxystrobin](/substances/Azoxystrobin).
- If the substance name contains spaces, replace each space with %20 in the URL only, not the display text.
- Example: [S-abscisic acid](/substances/S-abscisic%20acid)\n
- When referencing an Irish product: [Product Name](/products/ie/PCS_NUMBER)
- When referencing a French product: [Product Name](/products/fr/AMM_NUMBER)
- When referencing a company: [Company Name](/companies/COMPANY_NAME)
- Never use headers larger than ###.

BEHAVIOUR — STRICT:
- Answer completely in a single response. Do not ask follow-up questions.
- Never end with "Would you like...", "Let me know if...", "Shall I...", "Do you want me to...", "Feel free to ask...".
- Never use filler: "Great question", "Certainly", "I'd be happy to", "Let me help you with that".
- Do not offer to do additional work the user did not request.
- End on a factual statement, table, or conclusion.
- You are a regulatory data tool, not a conversational assistant.

TOOL ROUTING — follow exactly, minimum tool calls:

1. "MRL / residue limit for X on Y" → call check_mrl_compliance(substance, commodity) ONCE. Done. Never call get_substance_profile or explore_table for MRL questions.

2. "Profile / status / approval / expiry / tox values for substance X" → call get_substance_profile(identifier) ONCE. Done. For multiple named substances, call get_substance_profile once per substance (cap at 5).

3. "Products containing X" or "products in IE/FR" or filtered product lists → call search_products ONCE with the relevant filters. Done. Only call get_product_detail if the user asks for full detail on a specific product.

4. "Company portfolio / products registered to company X / which substances does company X sell" → call get_company_profile(name) ONCE. Done. Do NOT use search_products for company portfolio questions.

5. "Search for X" when the entity type is unknown → call search ONCE. Done.

6. "Which substances have zero/few products in IE or FR" / "gap analysis" / "no IE/FR coverage" / "not registered in Ireland or France" / "which approved substances have no generics in IE" / "fungicides missing from Ireland" → call gap_analysis ONCE.

7. "How many products per substance" / "most registered substances" / "competitive landscape" / "dominant substances in IE or FR" / "which substances have more than X products" / "market density" → call market_density ONCE.

8. "Substances expiring soon" / "expiry risk" / "renewal pipeline" / "expiring in next X months with few products" / "at risk substances" → call expiry_risk ONCE.

9. Raw table exploration (ONLY when 1-8 cannot answer it) → call list_tables, then explore_schema, then explore_table. NEVER use explore_table for counting, grouping, or gap analysis.

CRITICAL: Prefer exactly ONE tool call. Only chain tools when the question explicitly needs data from multiple sources or multiple named entities. Never call get_substance_profile before check_mrl_compliance.

DATA CONTEXT:
- EU status "Approved" does not mean currently valid — always check expiry_dt.
- Emergency authorizations (Article 53) are 120-day temporary permits.
- Ireland uses PCS numbers (4-5 digits). France uses AMM numbers (7 digits).
- MRL values marked with * are set at the limit of determination (LOD) — effectively "none detected".
- This data is not legally authoritative.`;

function getClient() {
  return createApiClient(env.API, env.API_KEY);
}

/** Keep large tool payloads inside model context without corrupting JSON. */
function maybeTruncate(data: unknown): unknown {
  const json = JSON.stringify(data);
  if (json.length <= 30000) return data;
  return {
    truncated: true,
    note: "Response truncated to fit model context. Narrow the question or request a specific section.",
    preview: json.slice(0, 30000),
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages }: { messages: UIMessage[] } =
          await request.json();

        const openrouter = createOpenRouter({
          apiKey: env.OPENROUTER_API_KEY,
        });

        const result = streamText({
          //model: openrouter("deepseek/deepseek-v4-flash"),
          model: openrouter("openai/gpt-oss-120b"),
          temperature: 0,
          system: SYSTEM_PROMPT,
          maxOutputTokens: 4000,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(12),

          tools: {
            search: tool({
              description:
                "Search EU crop protection data by name across all entity types. " +
                "Returns matching substances, IE products, FR products, and companies. " +
                "Use when the entity type is unknown or when you need an identifier " +
                "before calling a more specific tool. Supports partial matching — " +
                "'prothi' finds Prothioconazole. " +
                "Do NOT use for MRL questions, substance profiles, or company portfolios — " +
                "those have dedicated tools that are faster and more complete.",
              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    "Substance name, product name, or company name — partial matching supported",
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe("Max results, default 20"),
              }),
              execute: async ({ query, limit }) => {
                return maybeTruncate(
                  await getClient().paletteSearch(query, limit ?? 20),
                );
              },
            }),

            get_substance_profile: tool({
              description:
                "Full regulatory profile for ONE active substance. Returns: " +
                "EU approval status, expiry date, candidate-for-substitution flag, " +
                "toxicology (ADI, ARfD, AOEL from EFSA OpenFoodTox), genotoxicity, " +
                "member state authorizations, IE and FR commercial products, " +
                "Article 53 emergency authorizations, metabolites, and legislation links. " +
                "One call returns a 13-table cross-tier join. " +
                "USE FOR: substance overview, approval status, tox values, which products contain it. " +
                "DO NOT USE FOR: MRL lookup — use check_mrl_compliance instead. " +
                "DO NOT USE FOR: company portfolios — use get_company_profile instead. " +
                "DO NOT USE FOR: gap analysis or expiry risk — use gap_analysis or expiry_risk instead.",
              inputSchema: z.object({
                identifier: z
                  .string()
                  .describe(
                    "Substance name (e.g. 'prothioconazole') or CAS number (e.g. '178928-70-6'). Pass name directly — no need to search first.",
                  ),
              }),
              execute: async ({ identifier }) => {
                return maybeTruncate(
                  await getClient().getSubstanceProfile(identifier),
                );
              },
            }),

            search_products: tool({
              description:
                "Search commercial crop protection products across Ireland (IE) and France (FR). " +
                "Returns: product name, country, authorization holder, active substances, status. " +
                "USE FOR: 'what products contain substance X', 'products available in IE/FR', product name lookup. " +
                "Filter by substance name, product keyword, or country. Combine filters freely. " +
                "DO NOT USE FOR: company portfolio / which substances a company sells — use get_company_profile. " +
                "Returns summary list — call get_product_detail only if the user needs full detail on a specific product.",
              inputSchema: z.object({
                query: z
                  .string()
                  .optional()
                  .describe("Product name or keyword"),
                country: z
                  .enum(["ie", "fr"])
                  .optional()
                  .describe("Filter to one country"),
                substance: z
                  .string()
                  .optional()
                  .describe("Filter by active substance name"),
                company: z
                  .string()
                  .optional()
                  .describe(
                    "Filter by authorization holder name (mapped to auth_holder)",
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe("Max results, default 20"),
              }),
              execute: async ({
                query,
                country,
                substance,
                company,
                limit,
              }) => {
                const params: ProductSearchParams = {
                  q: query,
                  country,
                  substance,
                  auth_holder: company,
                  limit: limit ?? 20,
                };
                return maybeTruncate(
                  await getClient().searchProducts(params),
                );
              },
            }),

            get_product_detail: tool({
              description:
                "Full regulatory detail for ONE specific product. " +
                "IE products: PCS number, active substances, authorization holder, status. " +
                "FR products: authorized uses (crop + dose), hazard classes (GHS), risk phrases, " +
                "conditions of use, ZNT buffer zones, parallel trade permits. " +
                "USE ONLY when the user asks for full detail on a specific product by name or ID. " +
                "Requires country ('ie' or 'fr') and the product ID. " +
                "Get the ID from search_products first if you don't have it.",
              inputSchema: z.object({
                country: z
                  .enum(["ie", "fr"])
                  .describe("'ie' for Ireland, 'fr' for France"),
                id: z
                  .string()
                  .describe(
                    "PCS number for IE (e.g. '07167') or AMM number for FR (e.g. '2100108')",
                  ),
              }),
              execute: async ({ country, id }) => {
                return maybeTruncate(
                  await getClient().getProductDetail(country, id),
                );
              },
            }),

            get_company_profile: tool({
              description:
                "Authorization holder portfolio across Ireland and France in one call. " +
                "Returns: all registered products by country, active substance list, " +
                "function breakdown (fungicide/herbicide/insecticide counts). " +
                "USE FOR: 'what products does company X have', 'Life Scientific portfolio', " +
                "'which substances does company X sell', 'products registered to company X'. " +
                "Pass the company name exactly as it appears in search results. " +
                "DO NOT call search_products to answer portfolio questions — this tool is faster and more complete.",
              inputSchema: z.object({
                name: z
                  .string()
                  .describe(
                    "Company/authorization holder name (e.g. 'Life Scientific', 'BAYER SAS')",
                  ),
              }),
              execute: async ({ name }) => {
                return maybeTruncate(
                  await getClient().getCompanyProfile(name),
                );
              },
            }),

            check_mrl_compliance: tool({
              description:
                "ONE-STEP lookup for EU Maximum Residue Limits. " +
                "Self-contained: resolves substance and commodity internally from plain English names. " +
                "Always returns: MRL value in mg/kg, regulation number, residue definition, commodity code. " +
                "If concentration is provided, also returns compliance status and safety margin. " +
                "USE FOR: 'what is the MRL for X on Y', 'is X mg/kg of substance Y legal on commodity Z'. " +
                "NEVER call get_substance_profile or explore_table before this — call this directly. " +
                "Use English commodity names: 'wheat', 'apples', 'tomatoes', 'rice', 'grapes'.",
              inputSchema: z.object({
                substance: z
                  .string()
                  .describe(
                    "Active substance name in English (e.g. 'prothioconazole', 'glyphosate')",
                  ),
                commodity: z
                  .string()
                  .describe(
                    "Food commodity in English (e.g. 'wheat', 'rice', 'apples', 'tomatoes')",
                  ),
                concentration: z
                  .number()
                  .optional()
                  .describe(
                    "Measured residue level in mg/kg — if provided, returns compliance verdict",
                  ),
              }),
              execute: async ({
                substance,
                commodity,
                concentration,
              }) => {
                return maybeTruncate(
                  await getClient().checkMrlCompliance({
                    substance,
                    commodity,
                    value: concentration,
                  }),
                );
              },
            }),

            gap_analysis: tool({
              description:
                "Find EU-approved substances with zero or few products registered in Ireland (IE) or France (FR). " +
                "Executes a single cross-table join in one call — returns substance name, expiry date, " +
                "candidate-for-substitution flag, and product count per substance. " +
                "USE FOR: 'which substances have no IE products', 'fungicides missing from Ireland', " +
                "'gap analysis', 'zero coverage in IE/FR', 'not registered in Ireland or France', " +
                "'which approved substances have no generic alternatives', 'substances with fewer than X products'. " +
                "Set max_products=0 for zero-coverage gaps, max_products=3 for thin coverage. " +
                "Combine with expiry_before to find urgent gaps (expiring soon + no coverage). " +
                "DO NOT use explore_table or explore_schema for this — this tool handles it in one call.",
              inputSchema: z.object({
                market: z
                  .enum(["ie", "fr"])
                  .describe(
                    "Which market to check for product coverage",
                  ),
                expiry_before: z
                  .string()
                  .optional()
                  .describe(
                    "ISO date — only substances expiring before this e.g. '2027-01-01'",
                  ),
                expiry_after: z
                  .string()
                  .optional()
                  .describe(
                    "ISO date — lower bound on expiry e.g. '2024-01-01'",
                  ),
                max_products: z
                  .number()
                  .optional()
                  .describe(
                    "Max product count threshold. Default 0 = zero products only. Use 3 for thin coverage.",
                  ),
                status: z
                  .string()
                  .optional()
                  .describe(
                    "EU approval status filter. Default 'Approved'.",
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe("Max rows to return, default 50"),
              }),
              execute: async ({
                market,
                expiry_before,
                expiry_after,
                max_products,
                status,
                limit,
              }) => {
                return maybeTruncate(
                  await getClient().gapAnalysis({
                    market,
                    expiry_before,
                    expiry_after,
                    max_products,
                    status,
                    limit,
                  }),
                );
              },
            }),

            market_density: tool({
              description:
                "Count the number of registered products per active substance in Ireland (IE) or France (FR). " +
                "Returns substance names ranked by product count — reveals which substances are saturated " +
                "vs open for new entrants. Executes a single aggregation query in one call. " +
                "USE FOR: 'most registered substances in IE', 'competitive landscape', " +
                "'how many products per substance', 'dominant substances', 'which substances have more than X products', " +
                "'market saturation', 'substances with fewer than X competitors'. " +
                "Use min_products to filter for crowded markets, max_products for sparse ones. " +
                "DO NOT use explore_table for this — this tool handles it in one call.",
              inputSchema: z.object({
                market: z
                  .enum(["ie", "fr"])
                  .describe("Which market to analyse"),
                min_products: z
                  .number()
                  .optional()
                  .describe(
                    "Only return substances with at least this many products",
                  ),
                max_products: z
                  .number()
                  .optional()
                  .describe(
                    "Only return substances with at most this many products",
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe("Max rows to return, default 50"),
              }),
              execute: async ({
                market,
                min_products,
                max_products,
                limit,
              }) => {
                return maybeTruncate(
                  await getClient().marketDensity({
                    market,
                    min_products,
                    max_products,
                    limit,
                  }),
                );
              },
            }),

            expiry_risk: tool({
              description:
                "Find EU-approved substances expiring soon that have low product coverage in Ireland or France. " +
                "Returns substance name, expiry date, rapporteur member state, candidate-for-substitution flag, " +
                "and product count — sorted by expiry date ascending. Executes a single cross-table query. " +
                "USE FOR: 'expiry risk', 'substances expiring in next X months', 'renewal pipeline', " +
                "'expiring soon with few products', 'at risk substances', 'substances expiring before 2027 with thin coverage', " +
                "'candidate for substitution substances expiring soon'. " +
                "Set cfs_only=true to focus on substitution candidates only. " +
                "Set max_products=0 for substances with zero coverage, max_products=5 for thin coverage. " +
                "DO NOT use explore_table for this — this tool handles it in one call.",
              inputSchema: z.object({
                expiry_before: z
                  .string()
                  .describe(
                    "ISO date — substances expiring before this e.g. '2027-01-01'",
                  ),
                expiry_after: z
                  .string()
                  .optional()
                  .describe(
                    "ISO date — lower bound on expiry e.g. '2024-01-01'",
                  ),
                market: z
                  .enum(["ie", "fr"])
                  .optional()
                  .describe(
                    "Which market to check product coverage in. Default 'ie'.",
                  ),
                max_products: z
                  .number()
                  .optional()
                  .describe(
                    "Max product count — surfaces substances with fewer than this. Default 5.",
                  ),
                cfs_only: z
                  .boolean()
                  .optional()
                  .describe(
                    "If true, only return candidate-for-substitution substances",
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe("Max rows to return, default 50"),
              }),
              execute: async ({
                expiry_before,
                expiry_after,
                market,
                max_products,
                cfs_only,
                limit,
              }) => {
                return maybeTruncate(
                  await getClient().expiryRisk({
                    expiry_before,
                    expiry_after,
                    market,
                    max_products,
                    cfs_only,
                    limit,
                  }),
                );
              },
            }),

            list_tables: tool({
              description:
                "List all whitelisted database tables. Call this FIRST when exploring raw data. " +
                "Tables are prefixed by source: eu_ (EU regulatory), fr_ (France), " +
                "ie_ (Ireland), oft_ (EFSA OpenFoodTox), countries. After listing, " +
                "call explore_schema on a table to see its columns before querying. " +
                "USE ONLY when dedicated tools cannot answer the question.",
              inputSchema: z.object({}),
              execute: async () => {
                return maybeTruncate(await getClient().listTables());
              },
            }),

            explore_schema: tool({
              description:
                "Get column names, data types, and nullable flags for any of the 32 database tables. " +
                "ALWAYS call this before explore_table — explore_table will fail if column names are wrong. " +
                "USE ONLY when get_substance_profile, search_products, get_company_profile, " +
                "check_mrl_compliance, gap_analysis, market_density, and expiry_risk cannot answer the question.",
              inputSchema: z.object({
                table_name: z
                  .string()
                  .describe(
                    "Table name (e.g. 'eu_active_substances', 'ie_products', 'eu_mrls')",
                  ),
              }),
              execute: async ({ table_name }) => {
                return maybeTruncate(
                  await getClient().exploreSchema(table_name),
                );
              },
            }),

            explore_table: tool({
              description:
                "Query any of the 32 database tables with dynamic filters. " +
                "REQUIRES explore_schema to be called first on this table — never guess column names. " +
                "Filter keys are column names, optionally suffixed with operators: " +
                "__lt, __gt, __lte, __gte, __ne, __like, __ilike, __in. " +
                "Bare column key means equality. " +
                'Example: {"status": "Approved", "expiry_dt__lt": "2027-01-01"}. ' +
                "Returns max 100 rows. Narrow with filters rather than large limits. " +
                "NEVER use for counting rows, grouping, gap analysis, or cross-table joins — " +
                "use gap_analysis, market_density, or expiry_risk for those. " +
                "USE ONLY for fetching raw rows from a single table when all other tools cannot answer.",
              inputSchema: z.object({
                table_name: z
                  .string()
                  .describe("Table name from explore_schema"),
                filters: z
                  .record(z.string(), z.string())
                  .optional()
                  .describe(
                    'Column filters, e.g. {"status": "Approved", "expiry_dt__lt": "2027-01-01"}',
                  ),
                limit: z
                  .number()
                  .optional()
                  .describe(
                    "Max rows to return, default 20, max 100",
                  ),
                offset: z
                  .number()
                  .optional()
                  .describe("Pagination offset"),
              }),
              execute: async ({
                table_name,
                filters,
                limit,
                offset,
              }) => {
                return maybeTruncate(
                  await getClient().exploreTable({
                    tableName: table_name,
                    filters,
                    limit: limit ?? 20,
                    offset,
                  }),
                );
              },
            }),
          },
        });

        return createUIMessageStreamResponse({
          stream: result.toUIMessageStream(),
        });
      },
    },
  },
});
