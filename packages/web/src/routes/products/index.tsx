import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { serverSearchProducts } from "~/lib/server-fns";
import type {
  ProductSearchParams,
  ProductSearchResult,
} from "../../lib/api-products";
import { countryFlag } from "../../lib/api-products";
import { Pagination } from "../../components/Pagination";
import { StatusBadge } from "../../components/StatusBadge";

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/products/")({
  component: ProductsListPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProductsListPage() {
  // Filter state
  const [country, setCountry] = useState<"both" | "ie" | "fr">(
    "both",
  );
  const [authHolder, setAuthHolder] = useState("");
  const [substance, setSubstance] = useState("");
  const [status, setStatus] = useState<"" | "active" | "withdrawn">(
    "",
  );
  const [page, setPage] = useState(0);

  // Debounced search params
  const [debouncedHolder, setDebouncedHolder] = useState("");
  const [debouncedSubstance, setDebouncedSubstance] = useState("");

  // Debounce auth_holder input
  const handleHolderChange = (value: string) => {
    setAuthHolder(value);
    setPage(0);
    clearTimeout((handleHolderChange as any)._t);
    (handleHolderChange as any)._t = setTimeout(
      () => setDebouncedHolder(value),
      400,
    );
  };

  // Debounce substance input
  const handleSubstanceChange = (value: string) => {
    setSubstance(value);
    setPage(0);
    clearTimeout((handleSubstanceChange as any)._t);
    (handleSubstanceChange as any)._t = setTimeout(
      () => setDebouncedSubstance(value),
      400,
    );
  };

  const params: ProductSearchParams = useMemo(
    () => ({
      country: country === "both" ? undefined : country,
      auth_holder: debouncedHolder || undefined,
      substance: debouncedSubstance || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [country, debouncedHolder, debouncedSubstance, status, page],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["products", "search", params],
    queryFn: () => serverSearchProducts({ data: params }),
    placeholderData: (prev) => prev,
  });

  const totalResults = (data?.total_ie ?? 0) + (data?.total_fr ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-secondary mb-6">
        <Link to="/" className="hover:text-brand">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-primary font-medium">Products</span>
      </nav>

      <h1 className="text-2xl font-semibold text-primary mb-1">
        Products
      </h1>
      <p className="text-secondary text-sm mb-6">
        Crop protection products registered in Ireland and France
      </p>

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <div className="bg-white border border-default rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Country toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-tertiary uppercase tracking-wide">
              Country
            </label>
            <div className="flex rounded-md border border-default overflow-hidden text-sm">
              {(["both", "ie", "fr"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCountry(c);
                    setPage(0);
                  }}
                  className={`px-3 py-1.5 transition-colors ${
                    country === c
                      ? "bg-brand text-white font-medium"
                      : "bg-white text-secondary hover:bg-gray-50"
                  } ${c !== "both" ? "border-l border-default" : ""}`}
                >
                  {c === "both"
                    ? "All"
                    : c === "ie"
                      ? "🇮🇪 IE"
                      : "🇫🇷 FR"}
                </button>
              ))}
            </div>
          </div>

          {/* Auth holder */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-tertiary uppercase tracking-wide">
              Authorization holder
            </label>
            <input
              type="text"
              value={authHolder}
              onChange={(e) => handleHolderChange(e.target.value)}
              placeholder="e.g. Bayer, Life Scientific"
              className="border border-default rounded-md px-3 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Substance */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-tertiary uppercase tracking-wide">
              Substance
            </label>
            <input
              type="text"
              value={substance}
              onChange={(e) => handleSubstanceChange(e.target.value)}
              placeholder="e.g. Prothioconazole"
              className="border border-default rounded-md px-3 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Status (FR only meaningful) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-tertiary uppercase tracking-wide">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(
                  e.target.value as "" | "active" | "withdrawn",
                );
                setPage(0);
              }}
              className="border border-default rounded-md px-3 py-1.5 text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              <option value="">All</option>
              <option value="active">Authorized</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Results summary ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-secondary">
          {isLoading ? (
            "Searching…"
          ) : (
            <>
              {totalResults.toLocaleString()} product
              {totalResults !== 1 ? "s" : ""}
              {data &&
                country === "both" &&
                data.total_ie > 0 &&
                data.total_fr > 0 && (
                  <span className="text-tertiary ml-1">
                    (🇮🇪 {data.total_ie.toLocaleString()} · 🇫🇷{" "}
                    {data.total_fr.toLocaleString()})
                  </span>
                )}
            </>
          )}
        </p>
      </div>

      {/* ── Error state ─────────────────────────────────────────── */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-4">
          Failed to load products
          {error instanceof Error ? `: ${error.message}` : ""}
        </div>
      )}

      {/* ── Desktop table ───────────────────────────────────────── */}
      {data && data.results.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden sm:block bg-white border border-default rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default bg-gray-50/50">
                  <th className="text-left px-4 py-2.5 font-medium text-secondary">
                    Product
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-secondary w-16">
                    {/* Country */}
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-secondary">
                    ID
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-secondary">
                    Holder
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-secondary">
                    Function
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-secondary w-24">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((p: ProductSearchResult) => (
                  <ProductRow
                    key={`${p.country}-${p.product_id}`}
                    product={p}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {data.results.map((p: ProductSearchResult) => (
              <ProductCard
                key={`${p.country}-${p.product_id}`}
                product={p}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalResults > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination
                page={page}
                totalItems={totalResults}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {data && data.results.length === 0 && (
        <div className="bg-white border border-default rounded-lg p-12 text-center">
          <p className="text-secondary">
            No products match the current filters.
          </p>
          <button
            onClick={() => {
              setCountry("both");
              setAuthHolder("");
              setSubstance("");
              setStatus("");
              setDebouncedHolder("");
              setDebouncedSubstance("");
              setPage(0);
            }}
            className="mt-3 text-sm text-brand hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <p className="text-xs text-tertiary mt-6">
        Data from PCS Ireland + ANSES France (e-PHY)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function ProductRow({
  product: p,
}: {
  product: ProductSearchResult;
}) {
  return (
    <tr className="border-b border-default last:border-b-0 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <Link
          to="/products/$country/$id"
          params={{ country: p.country, id: p.product_id }}
          className="text-brand font-medium hover:underline"
        >
          {p.product_name}
        </Link>
        {p.substances && (
          <p className="text-xs text-tertiary mt-0.5 truncate max-w-xs">
            {p.substances}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-base">
        {countryFlag(p.country)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-secondary">
        {p.product_id}
      </td>
      <td className="px-4 py-3">
        <Link
          to="/companies/$name"
          params={{ name: p.auth_holder }}
          className="text-secondary hover:text-brand hover:underline"
        >
          {p.auth_holder}
        </Link>
      </td>
      <td className="px-4 py-3 text-secondary">
        {p.fonctions ?? "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={p.status} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function ProductCard({
  product: p,
}: {
  product: ProductSearchResult;
}) {
  const navigate = useNavigate();

  return (
    <div className="block bg-white border border-default rounded-lg p-4 hover:border-brand/40 transition-colors">
      <div className="flex items-start justify-between mb-1">
        <Link
          to="/products/$country/$id"
          params={{ country: p.country, id: p.product_id }}
          className="text-brand font-medium hover:underline"
        >
          {p.product_name}
        </Link>
        <StatusBadge status={p.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-secondary mb-2">
        <span>{countryFlag(p.country)}</span>
        <span className="font-mono">{p.product_id}</span>
        <span className="text-tertiary">·</span>
        <span>{p.fonctions ?? "—"}</span>
      </div>
      <button
        onClick={() =>
          navigate({
            to: "/companies/$name",
            params: { name: p.auth_holder },
          })
        }
        className="text-xs text-secondary hover:text-brand hover:underline text-left"
      >
        {p.auth_holder}
      </button>
      {p.substances && (
        <p className="text-xs text-tertiary mt-1 truncate">
          {p.substances}
        </p>
      )}
    </div>
  );
}
