/**
 * RegBridge API — Effect Schema definitions
 *
 * Written from the actual TypeScript interfaces in the query layer.
 * Every schema matches its corresponding function return type exactly.
 */

import { Schema } from "effect";
import { HttpApiSchema } from "@effect/platform";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Nullable = Schema.NullOr;
const NS = Nullable(Schema.String); // string | null
const NN = Nullable(Schema.Number); // number | null
const NB = Nullable(Schema.Boolean); // boolean | null

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 400 }),
) {}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const HealthResponse = Schema.Struct({
  status: Schema.String,
  timestamp: Schema.String,
});

// ---------------------------------------------------------------------------
// 1. GET /api/search — Palette search
// ---------------------------------------------------------------------------

export const SearchParams = Schema.Struct({
  q: Schema.String.annotations({ description: "Search query" }),
  limit: Schema.optional(Schema.NumberFromString).annotations({
    description: "Max results per type (default 10)",
  }),
});

// The entity shapes differ per type. Schema.Unknown avoids
// discriminated union serialization issues in Effect HttpApi.
export const SearchResponse = Schema.Array(
  Schema.Struct({
    type: Schema.String,
    match_field: Schema.String,
    match_type: Schema.String,
    entity: Schema.Unknown,
  }),
);

// ---------------------------------------------------------------------------
// 2. GET /api/substances/:identifier — Substance profile
// ---------------------------------------------------------------------------

export const SubstanceIdentifierParam = HttpApiSchema.param(
  "identifier",
  Schema.String.annotations({
    description: "as_id, CAS number, or substance name",
  }),
);

const ToxEuValue = Schema.Struct({
  value: NS,
  source: NS,
  remark: NS,
});

export const SubstanceProfile = Schema.Struct({
  identity: Schema.Struct({
    as_id: Schema.Number,
    name: Schema.String,
    cas_number: NS,
    status: NS,
    expiry_dt: NS,
    approval_dt: NS,
    candidate_for_substitution: NB,
    candidate_for_substitution_type: NS,
    is_microorganism: NB,
    low_risk: NB,
    basic_substance: NB,
    rms: NS,
    corms: NS,
  }),
  categories: Schema.Array(
    Schema.Struct({ code: Schema.String, name: NS }),
  ),
  countries: Schema.Array(
    Schema.Struct({ country_code: Schema.String, country_name: NS }),
  ),
  country_count: Schema.Number,
  tox_eu: Schema.Struct({
    adi: ToxEuValue,
    arfd: ToxEuValue,
    aoel: ToxEuValue,
    aaoel: ToxEuValue,
  }),
  tox_oft: Schema.Array(
    Schema.Struct({
      endpoint_type: NS,
      value_lower: NN,
      value_upper: NN,
      unit: NS,
      assessment_body: NS,
      critical_endpoint: NS,
      justification: NS,
      not_allocated: NB,
      population: NS,
    }),
  ),
  genotoxicity: Schema.Struct({
    conclusion: NS,
    in_vitro_link: NS,
    in_vivo_link: NS,
  }),
  metabolites: Schema.Array(
    Schema.Struct({ name: NS, uuid: NS, remarks: NS }),
  ),
  documents: Schema.Array(
    Schema.Struct({
      filename: NS,
      document_type: NS,
      description: NS,
      source_url: NS,
    }),
  ),
  dossiers: Schema.Array(
    Schema.Struct({
      efsa_question_number: NS,
      output_title: NS,
      doi: NS,
      evaluation_date: NS,
      output_type: NS,
      docs: Schema.Array(
        Schema.Struct({
          document_type: NS,
          document_subtype: NS,
        }),
      ),
    }),
  ),
  emergency_auths: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      country_code: NS,
      country_name: NS,
      valid_from: NS,
      valid_until: NS,
      auth_holder: NS,
      trade_names: Schema.Unknown,
      crop_eppo_names: Schema.Unknown,
    }),
  ),
  emergency_auth_count: Schema.Number,
  ie_products: Schema.Array(
    Schema.Struct({
      product_name: NS,
      pcs_number: NS,
      auth_holder: NS,
      substances: NS,
      crops: NS,
    }),
  ),
  ie_product_count: Schema.Number,
  fr_products: Schema.Array(
    Schema.Struct({
      product_name: NS,
      amm_number: Schema.String,
      titulaire: NS,
      etat_autorisation: NS,
      substances: NS,
      fonctions: NS,
    }),
  ),
  fr_product_count: Schema.Number,
  group: Schema.Struct({
    is_group: Schema.Boolean,
    part_of_group: Schema.Boolean,
    group_id: NN,
    members: Schema.Array(
      Schema.Struct({ as_id: Schema.Number, name: NS }),
    ),
  }),
  legislation: Schema.Struct({
    active: NS,
    residue_linked: NS,
    mrl_webpage: NS,
  }),
  data_as_of: NS,
});

// ---------------------------------------------------------------------------
// 3. GET /api/products — Product search
// ---------------------------------------------------------------------------

export const ProductSearchParams = Schema.Struct({
  q: Schema.optional(Schema.String).annotations({
    description:
      "General text search across product name, substance, and auth holder",
  }),
  substance: Schema.optional(Schema.String).annotations({
    description: "Filter by active substance name",
  }),
  country: Schema.optional(Schema.String).annotations({
    description: "ie, fr, or both (default: both)",
  }),
  auth_holder: Schema.optional(Schema.String).annotations({
    description: "Authorization holder (substring match)",
  }),
  status: Schema.optional(Schema.String).annotations({
    description: "active or withdrawn (FR only)",
  }),
  crop: Schema.optional(Schema.String).annotations({
    description: "Crop name (IE only)",
  }),
  limit: Schema.optional(Schema.NumberFromString).annotations({
    description: "Max results (default 50, max 200)",
  }),
  offset: Schema.optional(Schema.NumberFromString).annotations({
    description: "Pagination offset (default 0)",
  }),
});

export const ProductSearchResponse = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      country: Schema.String,
      product_name: NS,
      product_id: Schema.String,
      auth_holder: NS,
      status: NS,
      substances: NS,
      fonctions: NS,
    }),
  ),
  total_ie: Schema.Number,
  total_fr: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
});

// ---------------------------------------------------------------------------
// 4. GET /api/products/:country/:id — Product detail
// ---------------------------------------------------------------------------

export const ProductCountryParam = HttpApiSchema.param(
  "country",
  Schema.String.annotations({ description: "ie or fr" }),
);

export const ProductIdParam = HttpApiSchema.param(
  "id",
  Schema.String.annotations({
    description: "PCS number (IE) or AMM number (FR)",
  }),
);

// IE and FR detail shapes differ significantly. Schema.Unknown avoids
// union serialization issues — the actual JSON is self-describing via
// the `country` field.
export const ProductDetailResponse = Schema.Unknown;

// ---------------------------------------------------------------------------
// 5. GET /api/mrls/check — MRL compliance
// ---------------------------------------------------------------------------

export const MrlCheckParams = Schema.Struct({
  substance: Schema.String.annotations({
    description: "Substance name, CAS, or as_id",
  }),
  commodity: Schema.String.annotations({
    description: "Commodity name or commodity_id",
  }),
  value: Schema.optional(Schema.NumberFromString).annotations({
    description: "Residue value (mg/kg) for compliance check",
  }),
});

const MrlValue = Schema.Struct({
  value: Schema.String, // Neon HTTP dialect returns numeric as string
  display: Schema.String,
  is_lod: Schema.Boolean,
  unit: Schema.Literal("mg/kg"),
  regulation_number: NS,
  regulation_url: NS,
  applicability: Schema.Literal("current", "future", "previous"),
  application_date: NS,
  footnote: NS,
});

const CommodityMatch = Schema.Struct({
  commodity_id: Schema.Number,
  product_name: NS,
  product_code: NS,
  parent_id: NN,
  mrl: Nullable(MrlValue),
  inherited_from_parent: Schema.Boolean,
  parent_name: NS,
});

export const MrlCheckResponse = Schema.Struct({
  substance: Schema.Struct({
    as_id: Schema.Number,
    name: Schema.String,
    cas_number: NS,
  }),
  residue_definition: Nullable(
    Schema.Struct({
      residue_id: NN,
      residue_name: NS,
      footnote: NS,
    }),
  ),
  mrl_type: Schema.Literal("default", "specific", "unresolved"),
  default_mrl: Schema.optional(
    Schema.Struct({
      value: Schema.Number,
      unit: Schema.Literal("mg/kg"),
      regulation_text: Schema.String,
    }),
  ),
  commodity_results: Schema.optional(Schema.Array(CommodityMatch)),
  compliance: Schema.optional(
    Schema.Struct({
      tested_value: Schema.Number,
      compliant: Schema.Boolean,
      margin: Schema.Number,
    }),
  ),
  data_as_of: Schema.String,
  source: Schema.Literal("EU Pesticides Database"),
  disclaimer: Schema.String,
});

// ---------------------------------------------------------------------------
// 6. GET /api/tables/:tableName — Generic table explorer
// ---------------------------------------------------------------------------

export const TableNameParam = HttpApiSchema.param(
  "tableName",
  Schema.String.annotations({
    description: "One of 32 whitelisted table names",
  }),
);

export const ExploreTableParams = Schema.Struct({
  filters: Schema.optional(Schema.String).annotations({
    description:
      'JSON filter object, e.g. {"status":"Approved","expiry_dt__lt":"2028-01-01"}',
  }),
  limit: Schema.optional(Schema.NumberFromString).annotations({
    description: "Max rows (default 50, max 500)",
  }),
  offset: Schema.optional(Schema.NumberFromString).annotations({
    description: "Offset (default 0)",
  }),
});

export const ExploreTableResponse = Schema.Struct({
  table: Schema.String,
  rows: Schema.Array(Schema.Unknown),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
  filters_applied: Schema.Array(Schema.String),
});

// ---------------------------------------------------------------------------
// 7. GET /api/tables/:tableName/schema — Table schema discovery
// ---------------------------------------------------------------------------

export const ExploreSchemaResponse = Schema.Struct({
  table: Schema.String,
  columns: Schema.Array(
    Schema.Struct({
      column_name: Schema.String,
      data_type: Schema.String,
      is_nullable: Schema.Boolean,
      column_default: NS,
    }),
  ),
  row_count: Schema.Number,
});

// ---------------------------------------------------------------------------
// 8. GET /api/tables — List tables
// ---------------------------------------------------------------------------

export const ListTablesResponse = Schema.Struct({
  tables: Schema.Array(Schema.String),
});

export const CompanyNameParam = HttpApiSchema.param(
  "name",
  Schema.String,
);

/**
 * aggregate-schema.ts
 * Add these exports to schemas.ts and import them in api.ts / handlers.ts
 */

// ---------------------------------------------------------------------------
// Aggregate endpoint schemas
// ---------------------------------------------------------------------------

export const AggregateParams = Schema.Struct({
  from: Schema.String.annotations({
    description: "Base table name. Must be in the allowed whitelist.",
  }),
  /* All nested fields arrive as JSON-encoded strings via query params.
     The handler's parseJsonField() decodes them before passing to runAggregate(). */
  where: Schema.optional(Schema.String).annotations({
    description: "JSON array of WhereClause objects",
  }),
  join: Schema.optional(Schema.String).annotations({
    description: "JSON JoinClause object",
  }),
  select: Schema.optional(Schema.String).annotations({
    description: "JSON array of SelectColumn objects",
  }),
  aggregate: Schema.optional(Schema.String).annotations({
    description: "JSON array of AggregateColumn objects",
  }),
  group_by: Schema.optional(Schema.String).annotations({
    description: "JSON array of column name strings",
  }),
  having: Schema.optional(Schema.String).annotations({
    description: "JSON array of HavingClause objects",
  }),
  order_by: Schema.optional(Schema.String).annotations({
    description: "JSON array of OrderByClause objects",
  }),
  limit: Schema.optional(Schema.NumberFromString).annotations({
    description: "Max rows. Hard capped at 100.",
  }),
});
const QueryPlan = Schema.Struct({
  from: Schema.String,
  join: Schema.NullOr(Schema.String),
  where_count: Schema.Number,
  aggregate_fns: Schema.Array(Schema.String),
  having_count: Schema.Number,
  limit: Schema.Number,
});

export const GapAnalysisUrlParams = Schema.Struct({
  market: Schema.Literal("ie", "fr"),
  expiry_before: Schema.optional(Schema.String),
  expiry_after: Schema.optional(Schema.String),
  max_products: Schema.optional(Schema.NumberFromString),
  status: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
});

export const MarketDensityUrlParams = Schema.Struct({
  market: Schema.Literal("ie", "fr"),
  min_products: Schema.optional(Schema.NumberFromString),
  max_products: Schema.optional(Schema.NumberFromString),
  limit: Schema.optional(Schema.NumberFromString),
});

export const ExpiryRiskUrlParams = Schema.Struct({
  expiry_before: Schema.String,
  expiry_after: Schema.optional(Schema.String),
  market: Schema.optional(Schema.Literal("ie", "fr")),
  max_products: Schema.optional(Schema.NumberFromString),
  cfs_only: Schema.optional(Schema.BooleanFromString),
  limit: Schema.optional(Schema.NumberFromString),
});

export const AggregateResponse = Schema.Struct({
  rows: Schema.Array(Schema.Unknown),
  row_count: Schema.Number,
  query_plan: QueryPlan,
});
