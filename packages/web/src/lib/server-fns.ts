import { createServerFn } from "@tanstack/react-start";
//import { createServerFn } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createApiClient } from "@regbridge/api-client";
import type {
  ProductSearchParams,
  MrlCheckParams,
} from "@regbridge/api-client";
import type { Fetcher } from "@cloudflare/workers-types";

function getClient() {
  return createApiClient(env.API, env.API_KEY);
}

// ---------------------------------------------------------------------------
// Palette Search
// ---------------------------------------------------------------------------

export const serverPaletteSearch = createServerFn({ method: "GET" })
  .validator((input: { query: string; limit?: number }) => input)
  .handler(async ({ data }) => {
    const client = getClient();
    return client.paletteSearch(data.query, data.limit ?? 20);
  });

// ---------------------------------------------------------------------------
// Substance Profile
// ---------------------------------------------------------------------------

export const serverGetSubstanceProfile = createServerFn({
  method: "GET",
})
  .validator((input: { identifier: string }) => input)
  .handler(async ({ data }) => {
    const client = getClient();
    const result = await client.getSubstanceProfile(data.identifier);
    if (result === null) {
      throw new Error(`Substance not found: ${data.identifier}`);
    }
    return result;
  });

// ---------------------------------------------------------------------------
// Product Search
// ---------------------------------------------------------------------------

export const serverSearchProducts = createServerFn({ method: "GET" })
  .validator(
    (input: {
      substance?: string;
      country?: "ie" | "fr" | "both";
      auth_holder?: string;
      status?: "active" | "withdrawn";
      crop?: string;
      limit?: number;
      offset?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const client = getClient();
    const params: ProductSearchParams = {
      substance: data.substance,
      country: data.country ?? "both",
      auth_holder: data.auth_holder,
      status: data.status,
      crop: data.crop,
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
    };
    return client.searchProducts(params);
  });

// ---------------------------------------------------------------------------
// Product Detail
// ---------------------------------------------------------------------------

export const serverGetProductDetail = createServerFn({
  method: "GET",
})
  .validator((input: { country: "ie" | "fr"; id: string }) => input)
  .handler(async ({ data }) => {
    const client = getClient();
    const result = await client.getProductDetail(
      data.country,
      data.id,
    );
    if (result === null) {
      throw new Error(
        `Product not found: ${data.country}/${data.id}`,
      );
    }
    return result;
  });

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

export const serverGetCompanyProfile = createServerFn({
  method: "GET",
})
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const client = getClient();
    const result = await client.getCompanyProfile(data.name);
    if (result === null) {
      throw new Error(`Company not found: ${data.name}`);
    }
    return result;
  });

// ---------------------------------------------------------------------------
// MRL Compliance Check
// ---------------------------------------------------------------------------

export const serverCheckMrl = createServerFn({ method: "GET" })
  .validator(
    (input: {
      substance: string;
      commodity: string;
      value?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const client = getClient();
    const params: MrlCheckParams = {
      substance: data.substance,
      commodity: data.commodity,
      value: data.value,
    };
    return client.checkMrlCompliance(params);
  });
