import { createServerFn } from "@tanstack/react-start";
import {
  db,
  paletteSearch,
  getSubstanceProfile,
  searchProducts,
  getProductDetail,
  getCompanyProfile,
  checkMrlCompliance,
} from "@regbridge/db";

// ---------------------------------------------------------------------------
// Palette Search
// ---------------------------------------------------------------------------

export const serverPaletteSearch = createServerFn({ method: "GET" })
  .validator((input: { query: string; limit?: number }) => input)
  .handler(async ({ data }) => {
    const results = await paletteSearch(data.query, data.limit ?? 20);
    return JSON.parse(JSON.stringify(results));
  });

// ---------------------------------------------------------------------------
// Substance Profile
// ---------------------------------------------------------------------------

export const serverGetSubstanceProfile = createServerFn({
  method: "GET",
})
  .validator((input: { identifier: string }) => input)
  .handler(async ({ data }) => {
    const result = await getSubstanceProfile(data.identifier);
    if (result === null) {
      throw new Error(`Substance not found: ${data.identifier}`);
    }
    return JSON.parse(JSON.stringify(result));
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
    const results = await searchProducts({
      substance: data.substance,
      country: data.country ?? "both",
      auth_holder: data.auth_holder,
      status: data.status,
      crop: data.crop,
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
    });
    return JSON.parse(JSON.stringify(results));
  });

// ---------------------------------------------------------------------------
// Product Detail
// ---------------------------------------------------------------------------

export const serverGetProductDetail = createServerFn({
  method: "GET",
})
  .validator((input: { country: "ie" | "fr"; id: string }) => input)
  .handler(async ({ data }) => {
    const result = await getProductDetail(data.country, data.id);
    if (result === null) {
      throw new Error(
        `Product not found: ${data.country}/${data.id}`,
      );
    }
    return JSON.parse(JSON.stringify(result));
  });

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

export const serverGetCompanyProfile = createServerFn({
  method: "GET",
})
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const result = await getCompanyProfile(data.name);
    if (result === null) {
      throw new Error(`Company not found: ${data.name}`);
    }
    return JSON.parse(JSON.stringify(result));
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
    const result = await checkMrlCompliance({
      substance: data.substance,
      commodity: data.commodity,
      value: data.value,
    });
    return JSON.parse(JSON.stringify(result));
  });
