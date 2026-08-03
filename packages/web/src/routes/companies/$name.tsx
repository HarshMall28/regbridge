import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import { StatusBadge } from "../../components/StatusBadge";
import { serverGetCompanyProfile } from "~/lib/server-fns";
import type {
  CompanySubstance,
  CompanyFunction,
  CompanyIeProduct,
  CompanyFrProduct,
  CompanyProfile,
} from "~/lib/api-company";
// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/companies/$name")({
  component: CompanyPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 5;
const INITIAL_SUBSTANCE_LIMIT = 10;

function CompanyPage() {
  const { name } = Route.useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["companies", name],
    queryFn: () => serverGetCompanyProfile({ data: { name } }),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-8 bg-gray-200 rounded w-72" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !data || (data as any)._tag === "NotFoundError") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <nav className="text-sm text-secondary mb-6">
          <Link to="/" className="hover:text-brand">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-primary font-medium">
            Company not found
          </span>
        </nav>
        <div className="bg-white border border-default rounded-lg p-8 text-center">
          <p className="text-lg font-medium text-primary mb-2">
            No products found
          </p>
          <p className="text-sm text-secondary mb-4">
            "{name}" doesn't match any authorization holder in Ireland
            or France.
          </p>
          <button
            onClick={() => window.history.back()}
            className="text-sm text-brand hover:underline"
          >
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return <CompanyProfileView data={data} />;
}

// ---------------------------------------------------------------------------
// Profile view
// ---------------------------------------------------------------------------

function CompanyProfileView({ data }: { data: CompanyProfile }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-secondary mb-6">
        <Link to="/" className="hover:text-brand">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-secondary">Companies</span>
        <span className="mx-1.5">/</span>
        <span className="text-primary font-medium">{data.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-primary flex items-center gap-2">
          <span className="text-lg">🏢</span>
          {data.name}
        </h1>
        <p className="text-sm text-secondary mt-0.5">
          Authorization holder across IE and FR markets
        </p>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <MetricCard
          value={data.total_products}
          label="Total products"
        />
        <MetricCard
          value={data.ie_product_count}
          label="🇮🇪 Ireland"
        />
        <MetricCard value={data.fr_product_count} label="🇫🇷 France" />
        <MetricCard value={data.substance_count} label="Substances" />
      </div>

      {/* Substance portfolio */}
      {data.substances.length > 0 && (
        <SubstancePortfolio substances={data.substances} />
      )}

      {/* Portfolio by function */}
      {data.functions.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Portfolio by function" />
          <div className="flex flex-wrap gap-2">
            {data.functions.map((f) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1.5 text-sm bg-white border border-default rounded-full px-3 py-1"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: functionColor(f.name) }}
                />
                <span className="text-primary font-medium">
                  {f.name}
                </span>
                <span className="text-tertiary">— {f.total}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Irish products */}
      {data.ie_products.length > 0 && (
        <IeProductsTable products={data.ie_products} />
      )}

      {/* French products */}
      {data.fr_products.length > 0 && (
        <FrProductsTable products={data.fr_products} />
      )}

      {/* Footer */}
      <p className="text-xs text-tertiary mt-8">
        Data aggregated from PCS Ireland + ANSES France · auth_holder
        name match
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Substance portfolio with expand/collapse
// ---------------------------------------------------------------------------

function SubstancePortfolio({
  substances,
}: {
  substances: CompanySubstance[];
}) {
  const [showAll, setShowAll] = useState(false);
  const maxCount = substances[0]?.product_count ?? 1;
  const needsToggle = substances.length > INITIAL_SUBSTANCE_LIMIT;
  const visible = showAll
    ? substances
    : substances.slice(0, INITIAL_SUBSTANCE_LIMIT);

  return (
    <section className="mb-8">
      <SectionHeader title="Substance portfolio — top active ingredients" />
      <div className="bg-white border border-default rounded-lg p-4">
        <div className="space-y-2">
          {visible.map((s) => {
            const pct = Math.max(
              (s.product_count / maxCount) * 100,
              4,
            );
            return (
              <div key={s.name} className="flex items-center gap-3">
                <Link
                  to="/substances/$identifier"
                  params={{ identifier: s.name }}
                  className="text-sm text-brand hover:underline w-36 sm:w-44 truncate shrink-0"
                  title={s.name}
                >
                  {s.name}
                </Link>
                <span className="text-xs text-secondary font-mono w-6 text-right shrink-0">
                  {s.product_count}
                </span>
                <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand/70 rounded transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {needsToggle && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-brand hover:underline mt-3"
          >
            {showAll
              ? "Show top 10 only"
              : `Show all ${substances.length} substances`}
          </button>
        )}

        <p className="text-xs text-tertiary mt-2">
          Each substance links to its regulatory profile · counts
          include both IE and FR
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// IE Products table
// ---------------------------------------------------------------------------

function IeProductsTable({
  products,
}: {
  products: CompanyIeProduct[];
}) {
  const [page, setPage] = useState(0);
  const slice = products.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  return (
    <section className="mb-8">
      <SectionHeader
        title="🇮🇪 Irish products"
        count={products.length}
      />

      {/* Desktop */}
      <div className="hidden sm:block bg-white border border-default rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-gray-50/50 text-secondary">
              <th className="text-left px-4 py-2 font-medium">
                Product
              </th>
              <th className="text-left px-4 py-2 font-medium">PCS</th>
              <th className="text-left px-4 py-2 font-medium">
                Function
              </th>
              <th className="text-left px-4 py-2 font-medium">
                Substances
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => (
              <tr
                key={p.pcs_number}
                className="border-b border-default last:border-b-0 hover:bg-gray-50/50"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/products/$country/$id"
                    params={{ country: "ie", id: p.pcs_number ?? "" }}
                    className="text-brand font-medium hover:underline"
                  >
                    {p.product_name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                  {p.pcs_number}
                </td>
                <td className="px-4 py-2.5 text-secondary">
                  {p.function_name}
                </td>
                <td className="px-4 py-2.5 text-secondary text-xs truncate max-w-[200px]">
                  {p.substances.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="sm:hidden flex flex-col gap-3">
        {slice.map((p) => (
          <Link
            key={p.pcs_number}
            to="/products/$country/$id"
            params={{ country: "ie", id: p.pcs_number ?? "" }}
            className="block bg-white border border-default rounded-lg p-4 hover:border-brand/40"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-brand font-medium">
                {p.product_name}
              </span>
              <span className="font-mono text-xs text-secondary">
                {p.pcs_number}
              </span>
            </div>
            <p className="text-xs text-secondary">
              {p.function_name}
            </p>
            <p className="text-xs text-tertiary mt-1 truncate">
              {p.substances.join(", ")}
            </p>
          </Link>
        ))}
      </div>

      {products.length > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            page={page}
            totalItems={products.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FR Products table
// ---------------------------------------------------------------------------

function FrProductsTable({
  products,
}: {
  products: CompanyFrProduct[];
}) {
  const [page, setPage] = useState(0);
  const slice = products.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  return (
    <section className="mb-8">
      <SectionHeader
        title="🇫🇷 French products"
        count={products.length}
      />

      {/* Desktop */}
      <div className="hidden sm:block bg-white border border-default rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-gray-50/50 text-secondary">
              <th className="text-left px-4 py-2 font-medium">
                Product
              </th>
              <th className="text-left px-4 py-2 font-medium">AMM</th>
              <th className="text-left px-4 py-2 font-medium">
                Function
              </th>
              <th className="text-left px-4 py-2 font-medium w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => (
              <tr
                key={p.amm_number}
                className="border-b border-default last:border-b-0 hover:bg-gray-50/50"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/products/$country/$id"
                    params={{ country: "fr", id: p.amm_number }}
                    className="text-brand font-medium hover:underline"
                  >
                    {p.product_name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                  {p.amm_number}
                </td>
                <td className="px-4 py-2.5 text-secondary">
                  {p.fonctions}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    status={p.etat_autorisation ?? "Unknown"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="sm:hidden flex flex-col gap-3">
        {slice.map((p) => (
          <Link
            key={p.amm_number}
            to="/products/$country/$id"
            params={{ country: "fr", id: p.amm_number }}
            className="block bg-white border border-default rounded-lg p-4 hover:border-brand/40"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-brand font-medium">
                {p.product_name}
              </span>
              <StatusBadge
                status={p.etat_autorisation ?? "Unknown"}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-secondary">
              <span className="font-mono">{p.amm_number}</span>
              <span className="text-tertiary">·</span>
              <span>{p.fonctions}</span>
            </div>
          </Link>
        ))}
      </div>

      {products.length > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            page={page}
            totalItems={products.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function MetricCard({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="bg-white border border-default rounded-lg px-4 py-3 text-center">
      <p className="text-2xl font-semibold text-brand">{value}</p>
      <p className="text-xs text-secondary mt-0.5">{label}</p>
    </div>
  );
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-primary">
        {title}
      </h2>
      {count != null && (
        <span className="text-xs font-medium text-brand bg-green-50 px-2.5 py-0.5 rounded-full">
          {count} products
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function functionColor(name: string): string {
  const colors: Record<string, string> = {
    Fungicide: "#16A34A",
    Herbicide: "#2563EB",
    Insecticide: "#D97706",
    "Growth reg.": "#7C3AED",
    Other: "#6B7280",
  };
  for (const [key, color] of Object.entries(colors)) {
    if (name.startsWith(key)) return color;
  }
  return colors.Other;
}
