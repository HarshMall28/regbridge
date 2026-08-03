/**
 * RegBridge API — Endpoint declarations
 *
 * Pure schema. No logic. Every endpoint is a typed contract that
 * auto-generates OpenAPI + Scalar docs.
 *
 * Groups:
 *   health     — GET /health
 *   search     — GET /api/search
 *   substances — GET /api/substances/:identifier
 *   products   — GET /api/products, GET /api/products/:country/:id
 *   mrls       — GET /api/mrls/check
 *   tables     — GET /api/tables, GET /api/tables/:tableName, GET /api/tables/:tableName/schema
 */

import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { Schema } from "effect";
import {
  HealthResponse,
  SearchParams,
  SearchResponse,
  SubstanceIdentifierParam,
  SubstanceProfile,
  ProductSearchParams,
  ProductSearchResponse,
  ProductCountryParam,
  ProductIdParam,
  MrlCheckParams,
  MrlCheckResponse,
  TableNameParam,
  ExploreTableParams,
  ExploreTableResponse,
  ExploreSchemaResponse,
  ListTablesResponse,
  NotFoundError,
  ValidationError,
  CompanyNameParam,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Health group (unchanged from Chat 1)
// ---------------------------------------------------------------------------

class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health").addSuccess(HealthResponse),
) {}

// ---------------------------------------------------------------------------
// Search group — Cmd+K palette
// ---------------------------------------------------------------------------

class SearchGroup extends HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("paletteSearch", "/api/search")
    .setUrlParams(SearchParams)
    .addSuccess(SearchResponse)
    .addError(ValidationError),
) {}

// ---------------------------------------------------------------------------
// Substances group — profile deep-dive
// ---------------------------------------------------------------------------

class SubstancesGroup extends HttpApiGroup.make("substances").add(
  HttpApiEndpoint.get(
    "getProfile",
  )`/api/substances/${SubstanceIdentifierParam}`
    .addSuccess(SubstanceProfile)
    .addError(NotFoundError),
) {}

// ---------------------------------------------------------------------------
// Products group — search + detail
// ---------------------------------------------------------------------------

class ProductsGroup extends HttpApiGroup.make("products")
  .add(
    HttpApiEndpoint.get("searchProducts", "/api/products")
      .setUrlParams(ProductSearchParams)
      .addSuccess(ProductSearchResponse)
      .addError(ValidationError),
  )
  .add(
    HttpApiEndpoint.get(
      "getProductDetail",
    )`/api/products/${ProductCountryParam}/${ProductIdParam}`
      .addSuccess(Schema.Unknown) // Union of IE/FR shapes — Schema.Unknown avoids
      // serialization issues with discriminated unions.
      // OpenAPI consumers see the response shape from
      // the Scalar "Try it" output.
      .addError(NotFoundError),
  ) {}

// ---------------------------------------------------------------------------
// MRLs group — compliance check
// ---------------------------------------------------------------------------

class MrlsGroup extends HttpApiGroup.make("mrls").add(
  HttpApiEndpoint.get("checkCompliance", "/api/mrls/check")
    .setUrlParams(MrlCheckParams)
    .addSuccess(MrlCheckResponse)
    .addError(NotFoundError)
    .addError(ValidationError),
) {}

// ---------------------------------------------------------------------------
// Tables group — generic explorer for MCP agents
// ---------------------------------------------------------------------------

class TablesGroup extends HttpApiGroup.make("tables")
  .add(
    HttpApiEndpoint.get("listTables", "/api/tables")
      .addSuccess(ListTablesResponse)
      .addError(ValidationError),
  )
  .add(
    HttpApiEndpoint.get("exploreTable")`/api/tables/${TableNameParam}`
      .setUrlParams(ExploreTableParams)
      .addSuccess(ExploreTableResponse)
      .addError(NotFoundError)
      .addError(ValidationError),
  )
  .add(
    HttpApiEndpoint.get(
      "exploreSchema",
    )`/api/tables/${TableNameParam}/schema`
      .addSuccess(ExploreSchemaResponse)
      .addError(NotFoundError),
  ) {}

class CompaniesGroup extends HttpApiGroup.make("companies").add(
  HttpApiEndpoint.get(
    "getCompanyProfile",
  )`/api/companies/${CompanyNameParam}`
    .addSuccess(Schema.Unknown)
    .addError(NotFoundError),
) {}

// ---------------------------------------------------------------------------
// Root API — all groups composed
// ---------------------------------------------------------------------------

export class RegBridgeApi extends HttpApi.make("regbridge")
  .add(HealthGroup)
  .add(SearchGroup)
  .add(SubstancesGroup)
  .add(ProductsGroup)
  .add(CompaniesGroup)
  .add(MrlsGroup)
  .add(TablesGroup) {}
