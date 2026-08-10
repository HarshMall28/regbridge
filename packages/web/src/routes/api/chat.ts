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
- When referencing a substance: [Azoxystrobin](/substances/Azoxystrobin)
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

6. Raw table exploration (ONLY when questions 1-5 cannot answer it) → call list_tables, then explore_schema, then explore_table. Never call explore_table without first calling explore_schema on that table.

CRITICAL: Prefer exactly ONE tool call. Only chain tools when the question explicitly needs data from multiple sources or multiple named entities. Never call get_substance_profile before check_mrl_compliance — check_mrl_compliance resolves the substance internally.

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
  if (json.length <= 15000) return data;
  return {
    truncated: true,
    note: "Response truncated to fit model context. Narrow the question or request a specific section.",
    preview: json.slice(0, 15000),
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
          model: openrouter("deepseek/deepseek-v4-flash"),
          temperature: 0,
          system: SYSTEM_PROMPT,
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
                const client = getClient();
                return maybeTruncate(
                  await client.paletteSearch(query, limit ?? 20),
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
                "Pass the substance name or CAS directly as the identifier.",
              inputSchema: z.object({
                identifier: z
                  .string()
                  .describe(
                    "Substance name (e.g. 'prothioconazole') or CAS number (e.g. '178928-70-6'). Pass name directly — no need to search first.",
                  ),
              }),
              execute: async ({ identifier }) => {
                const client = getClient();
                return maybeTruncate(
                  await client.getSubstanceProfile(identifier),
                );
              },
            }),

            search_products: tool({
              description:
                "Search commercial crop protection products across Ireland (IE) and France (FR). " +
                "Returns: product name, country, authorization holder, active substances, status. " +
                "USE FOR: 'what products contain substance X', 'products available in IE/FR', " +
                "product name lookup. " +
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
                const client = getClient();
                const params: ProductSearchParams = {
                  q: query,
                  country,
                  substance,
                  auth_holder: company,
                  limit: limit ?? 20,
                };
                return maybeTruncate(await client.searchProducts(params));
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
                const client = getClient();
                return maybeTruncate(
                  await client.getProductDetail(country, id),
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
                const client = getClient();
                return maybeTruncate(await client.getCompanyProfile(name));
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
                const client = getClient();
                return maybeTruncate(
                  await client.checkMrlCompliance({
                    substance,
                    commodity,
                    value: concentration,
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
                const client = getClient();
                return maybeTruncate(await client.listTables());
              },
            }),

            explore_schema: tool({
              description:
                "Get column names, data types, and nullable flags for any of the 32 database tables. " +
                "ALWAYS call this before explore_table — explore_table will fail if column names are wrong. " +
                "Tables are prefixed by source: eu_ (EU regulatory), fr_ (France national), " +
                "ie_ (Ireland national), oft_ (EFSA OpenFoodTox), countries. " +
                "USE ONLY when get_substance_profile, search_products, get_company_profile, " +
                "and check_mrl_compliance cannot answer the question.",
              inputSchema: z.object({
                table_name: z
                  .string()
                  .describe(
                    "Table name (e.g. 'eu_active_substances', 'ie_products', 'eu_mrls')",
                  ),
              }),
              execute: async ({ table_name }) => {
                const client = getClient();
                return maybeTruncate(
                  await client.exploreSchema(table_name),
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
                "USE ONLY for questions that the dedicated tools (get_substance_profile, search_products, " +
                "get_company_profile, check_mrl_compliance) cannot answer.",
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
                const client = getClient();
                return maybeTruncate(
                  await client.exploreTable({
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
