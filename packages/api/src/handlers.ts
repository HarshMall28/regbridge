/**
 * RegBridge API — Handler implementations
 *
 * Each handler bridges an Effect HttpApi endpoint to the existing Kysely
 * query functions via Effect.tryPromise. No business logic lives here —
 * it's all in the query functions. Handlers do three things:
 *   1. Destructure validated params from Effect
 *   2. Call the Kysely function
 *   3. Map errors to the right HttpApi error schema
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { RegBridgeApi } from "./api.js";
import { NotFoundError, ValidationError } from "./schemas.js";

// -- Import your existing query functions from the queries directory --
// Adjust these import paths to match your actual file locations.
import { paletteSearch } from "@regbridge/db";
import { resolveSubstance } from "@regbridge/db";
import { getSubstanceProfile } from "@regbridge/db";
import { searchProducts, getProductDetail } from "@regbridge/db";
import { checkMrlCompliance } from "@regbridge/db";
import { getCompanyProfile } from "@regbridge/db";
import {
  exploreTable,
  exploreSchema,
  listTables,
} from "@regbridge/db";

// ---------------------------------------------------------------------------
// Health group handler
// ---------------------------------------------------------------------------

const HealthGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "health",
  (handlers) =>
    handlers.handle("check", () =>
      Effect.succeed({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    ),
);

// ---------------------------------------------------------------------------
// Search group handler
// ---------------------------------------------------------------------------

const SearchGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "search",
  (handlers) =>
    handlers.handle("paletteSearch", ({ urlParams }) =>
      Effect.tryPromise({
        try: () => paletteSearch(urlParams.q, urlParams.limit ?? 10),
        catch: (err) =>
          new ValidationError({
            message:
              err instanceof Error ? err.message : "Search failed",
          }),
      }),
    ),
);

// ---------------------------------------------------------------------------
// Substances group handler
// ---------------------------------------------------------------------------

const SubstancesGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "substances",
  (handlers) =>
    handlers.handle("getProfile", ({ path }) =>
      Effect.tryPromise({
        try: async () => {
          const result = await getSubstanceProfile(path.identifier);
          if (result === null) return null;
          // JSON round-trip: converts Neon Date objects to ISO strings
          return JSON.parse(JSON.stringify(result));
        },
        catch: (err) =>
          new NotFoundError({
            message:
              err instanceof Error
                ? err.message
                : `Substance not found: ${path.identifier}`,
          }),
      }).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `No substance found for: ${path.identifier}`,
                }),
              )
            : Effect.succeed(result),
        ),
      ),
    ),
);

// ---------------------------------------------------------------------------
// Products group handler
// ---------------------------------------------------------------------------

const ProductsGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "products",
  (handlers) =>
    handlers
      .handle("searchProducts", ({ urlParams }) =>
        Effect.tryPromise({
          try: () =>
            searchProducts({
              substance: urlParams.substance,
              country:
                (urlParams.country as "ie" | "fr" | "both") ?? "both",
              auth_holder: urlParams.auth_holder,
              status: urlParams.status as
                | "active"
                | "withdrawn"
                | undefined,
              crop: urlParams.crop,
              limit: urlParams.limit ?? 50,
              offset: urlParams.offset ?? 0,
            }),
          catch: (err) =>
            new ValidationError({
              message:
                err instanceof Error
                  ? err.message
                  : "Product search failed",
            }),
        }),
      )
      .handle("getProductDetail", ({ path }) =>
        Effect.tryPromise({
          try: () =>
            getProductDetail(path.country as "ie" | "fr", path.id),
          catch: (err) =>
            new NotFoundError({
              message:
                err instanceof Error
                  ? err.message
                  : `Product not found: ${path.country}/${path.id}`,
            }),
        }).pipe(
          Effect.flatMap((result) =>
            result === null
              ? Effect.fail(
                  new NotFoundError({
                    message: `No product found: ${path.country}/${path.id}`,
                  }),
                )
              : Effect.succeed(result),
          ),
        ),
      ),
);

// ---------------------------------------------------------------------------
// MRLs group handler
// ---------------------------------------------------------------------------

const MrlsGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "mrls",
  (handlers) =>
    handlers.handle("checkCompliance", ({ urlParams }) =>
      Effect.tryPromise({
        try: async () => {
          const result = await checkMrlCompliance({
            substance: urlParams.substance,
            commodity: urlParams.commodity,
            value: urlParams.value,
          });
          // JSON round-trip: normalizes Neon Date objects and ensures
          // string numbers stay as strings (matching what Neon returns)
          return JSON.parse(JSON.stringify(result));
        },
        catch: (err) => {
          const msg =
            err instanceof Error ? err.message : "MRL check failed";
          if (
            msg.toLowerCase().includes("not found") ||
            msg.toLowerCase().includes("no substance")
          ) {
            return new NotFoundError({ message: msg });
          }
          return new ValidationError({ message: msg });
        },
      }),
    ),
);

// ---------------------------------------------------------------------------
// Tables group handler
// ---------------------------------------------------------------------------

const TablesGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "tables",
  (handlers) =>
    handlers
      .handle("listTables", () =>
        Effect.tryPromise({
          try: async () => ({ tables: await listTables() }),
          catch: (err) =>
            new ValidationError({
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to list tables",
            }),
        }),
      )
      .handle("exploreTable", ({ path, urlParams }) => {
        // Parse the JSON filters string if provided
        let filters: Record<string, string> = {};
        if (urlParams.filters) {
          try {
            filters = JSON.parse(urlParams.filters);
          } catch {
            return Effect.fail(
              new ValidationError({
                message: `Invalid filters JSON: ${urlParams.filters}`,
              }),
            );
          }
        }

        return Effect.tryPromise({
          try: () =>
            exploreTable({
              table: path.tableName,
              filters,
              limit: urlParams.limit ?? 50,
              offset: urlParams.offset ?? 0,
            }),
          catch: (err) => {
            const msg =
              err instanceof Error
                ? err.message
                : "Table query failed";
            if (
              msg.includes("not in whitelist") ||
              msg.includes("Invalid table")
            ) {
              return new NotFoundError({ message: msg });
            }
            return new ValidationError({ message: msg });
          },
        }).pipe(
          Effect.flatMap((result) =>
            result === null
              ? Effect.fail(
                  new NotFoundError({
                    message: `Table not found: ${path.tableName}`,
                  }),
                )
              : Effect.succeed(result),
          ),
        );
      })
      .handle("exploreSchema", ({ path }) =>
        Effect.tryPromise({
          try: () => exploreSchema(path.tableName),
          catch: (err) =>
            new NotFoundError({
              message:
                err instanceof Error
                  ? err.message
                  : `Schema not found for: ${path.tableName}`,
            }),
        }).pipe(
          Effect.flatMap((result) =>
            result === null
              ? Effect.fail(
                  new NotFoundError({
                    message: `Table not found: ${path.tableName}`,
                  }),
                )
              : Effect.succeed(result),
          ),
        ),
      ),
);

const CompaniesGroupLive = HttpApiBuilder.group(
  RegBridgeApi,
  "companies",
  (handlers) =>
    handlers.handle("getCompanyProfile", ({ path }) =>
      Effect.tryPromise({
        try: async () => {
          const result = await getCompanyProfile(path.name);
          if (result === null) return null;
          return JSON.parse(JSON.stringify(result));
        },
        catch: (err) =>
          new NotFoundError({
            message:
              err instanceof Error
                ? err.message
                : `Company not found: ${path.name}`,
          }),
      }).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `No products found for: ${path.name}`,
                }),
              )
            : Effect.succeed(result),
        ),
      ),
    ),
);
// ---------------------------------------------------------------------------
// Composed API layer — provide this to the server
// ---------------------------------------------------------------------------

export const ApiLive = HttpApiBuilder.api(RegBridgeApi).pipe(
  Layer.provide(HealthGroupLive),
  Layer.provide(SearchGroupLive),
  Layer.provide(SubstancesGroupLive),
  Layer.provide(ProductsGroupLive),
  Layer.provide(CompaniesGroupLive),
  Layer.provide(MrlsGroupLive),
  Layer.provide(TablesGroupLive),
);
