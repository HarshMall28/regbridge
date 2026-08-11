/**
 * RegBridge API Client — thin typed wrapper around the Service Binding
 *
 * Usage:
 *   const client = createApiClient(env.API, env.API_KEY)
 *   const results = await client.paletteSearch("glyphosate")
 */

import type { Fetcher } from "@cloudflare/workers-types";
import type {
  SearchResult,
  SubstanceProfile,
  ProductSearchParams,
  ProductSearchResponse,
  ProductDetail,
  CompanyProfile,
  MrlCheckParams,
  MrlCheckResponse,
  SchemaResult,
  ExploreResult,
  ListTablesResponse,
  AggregateResult,
  AggregateParams,
  GapAnalysisParams,
  MarketDensityParams,
  ExpiryRiskParams,
} from "./types.js";

export * from "./types.js";

function e(s: string): string {
  return encodeURIComponent(s);
}

function qs(
  params: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      parts.push(`${e(k)}=${e(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function createApiClient(api: Fetcher, apiKey: string) {
  const call = async (path: string) => {
    const res = await api.fetch(`https://internal${path}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res;
  };

  return {
    /** GET /api/search — Cmd+K palette search */
    paletteSearch: async (
      q: string,
      limit?: number,
    ): Promise<SearchResult[]> => {
      const params = qs({ q, limit });
      const res = await call(`/api/search${params}`);
      return (await res.json()) as SearchResult[];
    },

    /** GET /api/substances/:identifier — full substance profile */
    getSubstanceProfile: async (
      identifier: string,
    ): Promise<SubstanceProfile> => {
      const res = await call(`/api/substances/${e(identifier)}`);
      return (await res.json()) as SubstanceProfile;
    },

    /** GET /api/products — filtered product search */
    searchProducts: async (
      params: ProductSearchParams,
    ): Promise<ProductSearchResponse> => {
      const query = qs({
        q: params.q,
        substance: params.substance,
        country: params.country,
        auth_holder: params.auth_holder,
        status: params.status,
        crop: params.crop,
        limit: params.limit,
        offset: params.offset,
      });
      const res = await call(`/api/products${query}`);
      return (await res.json()) as ProductSearchResponse;
    },

    /** GET /api/products/:country/:id — single product detail */
    getProductDetail: async (
      country: "ie" | "fr",
      id: string,
    ): Promise<ProductDetail> => {
      const res = await call(`/api/products/${e(country)}/${e(id)}`);
      return (await res.json()) as ProductDetail;
    },

    /** GET /api/companies/:name — company portfolio */
    getCompanyProfile: async (
      name: string,
    ): Promise<CompanyProfile> => {
      const res = await call(`/api/companies/${e(name)}`);
      return (await res.json()) as CompanyProfile;
    },

    /** GET /api/mrls/check — MRL compliance check */
    checkMrlCompliance: async (
      params: MrlCheckParams,
    ): Promise<MrlCheckResponse> => {
      const query = qs({
        substance: params.substance,
        commodity: params.commodity,
        value: params.value,
      });
      const res = await call(`/api/mrls/check${query}`);
      return (await res.json()) as MrlCheckResponse;
    },

    /** GET /api/tables — list all whitelisted tables */
    listTables: async (): Promise<ListTablesResponse> => {
      const res = await call("/api/tables");
      return (await res.json()) as ListTablesResponse;
    },

    /** GET /api/tables/:tableName — query table with filters */
    exploreTable: async (params: {
      tableName: string;
      filters?: Record<string, string>;
      limit?: number;
      offset?: number;
    }): Promise<ExploreResult> => {
      const query = qs({
        filters: params.filters
          ? JSON.stringify(params.filters)
          : undefined,
        limit: params.limit,
        offset: params.offset,
      });
      const res = await call(
        `/api/tables/${e(params.tableName)}${query}`,
      );
      return (await res.json()) as ExploreResult;
    },

    /** GET /api/tables/:tableName/schema — column metadata */
    exploreSchema: async (
      tableName: string,
    ): Promise<SchemaResult> => {
      const res = await call(`/api/tables/${e(tableName)}/schema`);
      return (await res.json()) as SchemaResult;
    },
    aggregate: async (
      params: AggregateParams,
    ): Promise<AggregateResult> => {
      // Send complex nested params as JSON-encoded query string fields
      // since GET requests can't have a body
      const query = qs({
        from: params.from,
        where: params.where
          ? JSON.stringify(params.where)
          : undefined,
        join: params.join ? JSON.stringify(params.join) : undefined,
        select: params.select
          ? JSON.stringify(params.select)
          : undefined,
        aggregate: params.aggregate
          ? JSON.stringify(params.aggregate)
          : undefined,
        group_by: params.group_by
          ? JSON.stringify(params.group_by)
          : undefined,
        having: params.having
          ? JSON.stringify(params.having)
          : undefined,
        order_by: params.order_by
          ? JSON.stringify(params.order_by)
          : undefined,
        limit: params.limit,
      });
      const res = await call(`/api/aggregate${query}`);
      return (await res.json()) as AggregateResult;
    },

    gapAnalysis: async (
      params: GapAnalysisParams,
    ): Promise<AggregateResult> => {
      const query = qs({
        market: params.market,
        expiry_before: params.expiry_before,
        expiry_after: params.expiry_after,
        max_products: params.max_products,
        status: params.status,
        limit: params.limit,
      });
      const res = await call(`/api/gap-analysis${query}`);
      return (await res.json()) as AggregateResult;
    },

    marketDensity: async (
      params: MarketDensityParams,
    ): Promise<AggregateResult> => {
      const query = qs({
        market: params.market,
        min_products: params.min_products,
        max_products: params.max_products,
        limit: params.limit,
      });
      const res = await call(`/api/market-density${query}`);
      return (await res.json()) as AggregateResult;
    },

    expiryRisk: async (
      params: ExpiryRiskParams,
    ): Promise<AggregateResult> => {
      const query = qs({
        expiry_before: params.expiry_before,
        expiry_after: params.expiry_after,
        market: params.market,
        max_products: params.max_products,
        cfs_only:
          params.cfs_only !== undefined
            ? String(params.cfs_only)
            : undefined,
        limit: params.limit,
      });
      const res = await call(`/api/expiry-risk${query}`);
      return (await res.json()) as AggregateResult;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
