// packages/web/src/content/mcp.ts
// MCP showcase page content. Edit prose here, layout in routes/mcp.tsx.

export const heroHeadline =
  "Regulatory intelligence that reasons, not just retrieves.";

export const heroSubtitle =
  "Claude connects to 32 tables of EU regulatory data and produces the analysis your team currently assembles manually. Compliance checks in seconds. Competitive landscapes on demand. Market entry signals from data you already have.";

export const mcpEndpoint =
  "regbridge-mcp.activeintel.workers.dev/mcp";

export const videoIntro =
  "Watch: Claude analyses Companys portfolio, maps the competitive landscape, and identifies market entry opportunities across EU regulatory data.";

// Placeholder — replace with your actual YouTube video ID after upload
export const youtubeVideoId = "3gzvh-zUPzA";

// ---------------------------------------------------------------------------
// Daily workflow scenarios
// ---------------------------------------------------------------------------

export interface Scenario {
  question: string;
  tools: string[];
  outcome: string;
}

export const dailyWorkflows: Scenario[] = [
  {
    question: "Check this lab report for MRL compliance.",
    tools: ["check_mrl_compliance"],
    outcome:
      "Upload a Certificate of Analysis PDF. Claude reads analytes, checks each substance-commodity pair against current EU MRLs, and returns a pass/fail table with regulation numbers and enforcement values. What takes 30 minutes of cross-referencing becomes a 20-second conversation.",
  },
  {
    question: "Compile the regulatory dossier for PROSARO in France.",
    tools: ["get_product_detail", "get_substance_profile"],
    outcome:
      "Claude pulls the full French product record (authorized uses, hazard classes, buffer zones, risk phrases), then fetches the toxicological profile for each active substance. Returns a structured summary that replaces 2 hours of clicking through e-PHY and the EU database.",
  },
  {
    question:
      "Which of our products use substances expiring before 2028?",
    tools: ["get_company_profile", "get_substance_profile"],
    outcome:
      "Claude loads the full product portfolio for an auth holder, identifies every substance, checks EU approval expiry dates, and flags the ones within 24 months. Portfolio risk assessment in one question.",
  },
];

// ---------------------------------------------------------------------------
// Strategic intelligence scenarios
// ---------------------------------------------------------------------------

export const strategicScenarios: Scenario[] = [
  {
    question: "Market entry opportunities for your Company.",
    tools: [
      "get_company_profile",
      "explore_table",
      "get_substance_profile",
    ],
    outcome:
      "Claude loads Company's current portfolio (21 IE, 54 FR products), scans EU substances with healthy approval runways, cross-references competitor density in target markets, and identifies gaps: approved substances with clean tox profiles where the Company has no product yet.",
  },
  {
    question: "Competitive landscape for Prothioconazole in France.",
    tools: [
      "get_substance_profile",
      "search_products",
      "get_company_profile",
    ],
    outcome:
      "Claude checks the substance's EU status and tox profile, finds all 701 French products containing it, maps each auth holder, and returns a competitor breakdown: who holds what, authorization status, and the substance's regulatory runway.",
  },
  {
    question: "Emergency authorization trends for neonicotinoids.",
    tools: ["explore_schema", "explore_table"],
    outcome:
      "Claude queries emergency authorizations filtered by neonicotinoid compounds, groups by country and year. Recurring Article 53 permits reveal ongoing demand that permanent registrations aren't serving. That pattern is a market signal.",
  },
  {
    question: "Can we register Boscalid in Ireland?",
    tools: [
      "get_substance_profile",
      "search_products",
      "check_mrl_compliance",
    ],
    outcome:
      "Claude checks EU approval (active, no CfS flag, clean tox), scans Irish products for competitive density, pulls French formulations for reference, and checks MRLs on major Irish crops. Returns a structured go/no-go with every data point a registration manager needs.",
  },
];

// ---------------------------------------------------------------------------
// Tool reference
// ---------------------------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  category: "discovery" | "query" | "detail" | "compliance";
}

export const tools: ToolDef[] = [
  {
    name: "search",
    description:
      "Unified search across substances, products, and companies.",
    category: "discovery",
  },
  {
    name: "list_tables",
    description: "Returns all 32 table names in the database.",
    category: "discovery",
  },
  {
    name: "explore_schema",
    description:
      "Column names, types, and nullability for any table. Call before explore_table.",
    category: "discovery",
  },
  {
    name: "explore_table",
    description:
      "Query any table with dynamic filters. 11 operators, validated columns, parameterized values.",
    category: "query",
  },
  {
    name: "search_products",
    description:
      "Filtered product search across Ireland and France. Filter by substance, company, status, crop.",
    category: "query",
  },
  {
    name: "get_substance_profile",
    description:
      "Full regulatory profile: tox values, genotoxicity, products, emergency auths, MRL linkage. 13-table cross-tier join.",
    category: "detail",
  },
  {
    name: "get_product_detail",
    description:
      "Single product with all child data. IE: substances + crops. FR: uses, hazard classes, risk phrases, conditions, parallel trade.",
    category: "detail",
  },
  {
    name: "get_company_profile",
    description:
      "Auth holder portfolio: products by country, substance list, function breakdown.",
    category: "detail",
  },
  {
    name: "check_mrl_compliance",
    description:
      "Substance + commodity → MRL value with optional compliance check against a tested concentration.",
    category: "compliance",
  },
];

export const categoryLabels: Record<string, string> = {
  discovery: "Discovery",
  query: "Query",
  detail: "Detail",
  compliance: "Compliance",
};

export const categoryColors: Record<string, string> = {
  discovery: "#8B5CF6",
  query: "#3B82F6",
  detail: "#16A34A",
  compliance: "#F97316",
};
