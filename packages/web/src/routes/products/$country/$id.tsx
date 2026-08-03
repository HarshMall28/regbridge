import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { serverGetProductDetail } from "~/lib/server-fns";
import {
  countryFlag,
  countryLabel,
  type ProductDetail,
  type IeProductDetail,
  type FrProductDetail,
  type FrAuthorizedUse,
} from "../../../lib/api-products";
import {
  parseUsage,
  formatDose,
  formatPHI,
  formatZNT,
} from "../../../lib/usage-parser";
import { Pagination } from "../../../components/Pagination";
import { StatusBadge } from "../../../components/StatusBadge";

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/products/$country/$id")({
  component: ProductDetailPage,
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ProductDetailPage() {
  const { country, id } = Route.useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["products", "detail", country, id],
    queryFn: () =>
      serverGetProductDetail({
        data: { country: country as "ie" | "fr", id },
      }),
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-8 bg-gray-200 rounded w-72" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-sm text-red-800">
          {error instanceof Error
            ? error.message
            : "Product not found"}
        </div>
      </div>
    );
  }

  return data.country === "ie" ? (
    <IeProductPage product={data as IeProductDetail} />
  ) : (
    <FrProductPage product={data as FrProductDetail} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// IE PRODUCT DETAIL — simple, one-page
// ═══════════════════════════════════════════════════════════════════════════

function IeProductPage({ product: p }: { product: IeProductDetail }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <Breadcrumb country="ie" name={p.product_name} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-primary">
            {p.product_name}
          </h1>
          <p className="text-secondary text-sm mt-0.5">
            PCS {p.pcs_number} · {p.auth_holder}
          </p>
        </div>
        <StatusBadge status="Authorised" />
      </div>

      {/* Identity grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <InfoCard label="PCS number" value={p.pcs_number} mono />
        <InfoCard label="Function" value={p.function_name} />
        <InfoCard label="User type" value={p.user_type} />
        <CompanyLink label="Auth holder" value={p.auth_holder} />
        <InfoCard label="Marketing co." value={p.marketing_company} />
        <InfoCard label="Product type" value={p.product_type} />
      </div>

      {/* Active substances */}
      {p.substances.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            icon="🧪"
            title={`Active substance${p.substances.length > 1 ? "s" : ""}`}
            count={p.substances.length}
          />
          <div className="bg-white border border-default rounded-lg divide-y divide-default">
            {p.substances.map((s) => (
              <div
                key={s.substance_name}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-brand bg-green-50 px-2.5 py-0.5 rounded">
                    {s.concentration ?? "—"}
                  </span>
                  <span className="text-sm text-primary">
                    {s.substance_name}
                  </span>
                </div>
                <Link
                  to="/substances/$identifier"
                  params={{ identifier: s.substance_name }}
                  className="text-sm text-brand hover:underline"
                >
                  View substance →
                </Link>
              </div>
            ))}
          </div>
          <p className="text-xs text-tertiary mt-2">
            Each substance links to its full regulatory profile
          </p>
        </section>
      )}

      {/* Approved crops */}
      {p.crops.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            icon="🌾"
            title="Approved crops"
            count={p.crops.length}
          />
          <div className="flex flex-wrap gap-2">
            {p.crops.map((c) => (
              <span
                key={c}
                className="text-sm text-secondary bg-gray-100 px-3 py-1 rounded-full border border-default"
              >
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <p className="text-xs text-tertiary mt-8">
        Data from PCS Ireland · as of{" "}
        {new Date(p.data_as_of).toLocaleDateString("en-IE", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FR PRODUCT DETAIL — data-heavy, paginated sections
// ═══════════════════════════════════════════════════════════════════════════

function FrProductPage({ product: p }: { product: FrProductDetail }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <Breadcrumb country="fr" name={p.product_name} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-primary">
            {p.product_name}
          </h1>
          <p className="text-secondary text-sm mt-0.5">
            AMM {p.amm_number} · {p.titulaire} ·{" "}
            {p.date_premiere_autorisation
              ? `Since ${new Date(p.date_premiere_autorisation).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}`
              : ""}
          </p>
        </div>
        <StatusBadge status={p.etat_autorisation ?? "Unknown"} />
      </div>

      {/* Identity grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <InfoCard label="AMM number" value={p.amm_number} mono />
        <InfoCard label="Function" value={p.fonctions} />
        <InfoCard label="Formulation" value={p.formulations} />
        <InfoCard label="Usage range" value={p.gamme_usage} />
        <InfoCard label="Commercial type" value={p.type_commercial} />
        <CompanyLink label="Titulaire" value={p.titulaire} />
      </div>

      {/* Active substances */}
      {p.substances.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            icon="🧪"
            title={`Active substance${p.substances.length > 1 ? "s" : ""}`}
            count={p.substances.length}
          />
          <div className="bg-white border border-default rounded-lg divide-y divide-default">
            {p.substances.map((s) => (
              <div
                key={s.substance_name}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-brand bg-green-50 px-2.5 py-0.5 rounded">
                    {s.concentration ?? "—"}
                  </span>
                  <span className="text-sm text-primary">
                    {s.substance_name}
                  </span>
                </div>
                <Link
                  to="/substances/$identifier"
                  params={{
                    identifier: extractEnglishName(s.substance_name),
                  }}
                  className="text-sm text-brand hover:underline"
                >
                  View substance →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Authorized uses */}
      {p.authorized_uses.length > 0 && (
        <AuthorizedUsesSection uses={p.authorized_uses} />
      )}

      {/* Hazard classification */}
      {p.hazard_classes.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            icon="⚠️"
            title="Hazard classification"
            count={p.hazard_classes.length}
            countLabel="classes"
          />
          <div className="bg-white border border-default rounded-lg divide-y divide-default">
            {p.hazard_classes.map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span className="text-xs font-mono font-bold text-secondary bg-gray-100 px-2 py-0.5 rounded shrink-0">
                  {h.libelle_court}
                </span>
                <span className="text-sm text-primary">
                  {h.libelle_long}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk phrases (GHS) */}
      {p.risk_phrases.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon="⊘" title="Risk phrases (GHS)" />
          <div className="bg-white border border-default rounded-lg divide-y divide-default">
            {p.risk_phrases.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span className="text-xs font-mono font-bold text-red-600 shrink-0">
                  {r.libelle_court}
                </span>
                <span className="text-sm text-primary">
                  {r.libelle_long}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Conditions of use */}
      {p.conditions_of_use.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            icon="📋"
            title="Conditions of use"
            count={p.conditions_of_use.length}
            countLabel="conditions"
          />
          <div className="bg-white border border-default rounded-lg divide-y divide-default">
            {p.conditions_of_use.map((c, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs font-medium text-tertiary uppercase tracking-wide mb-0.5">
                  {c.categorie}
                </p>
                <p className="text-sm text-primary">
                  {c.condition_libelle}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Parallel trade permits */}
      {p.parallel_trade.length > 0 && (
        <ParallelTradeSection permits={p.parallel_trade} />
      )}

      {/* Footer */}
      <p className="text-xs text-tertiary mt-8">
        Data from ANSES e-PHY · as of{" "}
        {new Date(p.data_as_of).toLocaleDateString("en-IE", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-sections with pagination
// ═══════════════════════════════════════════════════════════════════════════

const USES_PAGE_SIZE = 5;
const TRADE_PAGE_SIZE = 5;

function AuthorizedUsesSection({
  uses,
}: {
  uses: FrAuthorizedUse[];
}) {
  const [page, setPage] = useState(0);
  const slice = uses.slice(
    page * USES_PAGE_SIZE,
    (page + 1) * USES_PAGE_SIZE,
  );

  return (
    <section className="mb-8">
      <SectionHeader
        icon="📑"
        title="Authorized uses"
        count={uses.length}
        countLabel="uses"
      />

      {/* Desktop table */}
      <div className="hidden sm:block bg-white border border-default rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-gray-50/50 text-secondary">
              <th className="text-left px-4 py-2 font-medium">
                Usage
              </th>
              <th className="text-left px-4 py-2 font-medium">
                Dose
              </th>
              <th className="text-left px-4 py-2 font-medium">PHI</th>
              <th className="text-left px-4 py-2 font-medium">
                Max apps
              </th>
              <th className="text-left px-4 py-2 font-medium">ZNT</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((u, i) => {
              const parsed = parseUsage(u.identifiant_usage);
              return (
                <tr
                  key={i}
                  className="border-b border-default last:border-b-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-primary">
                      {parsed.display}
                    </span>
                    {parsed.treatment && (
                      <span className="text-tertiary text-xs ml-1.5">
                        ({parsed.treatment})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {formatDose(u.dose_retenue, u.dose_unite)}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {formatPHI(u.delai_recolte_jour)}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {u.nombre_max_application ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {formatZNT(u.znt_aquatique_m)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {slice.map((u, i) => {
          const parsed = parseUsage(u.identifiant_usage);
          return (
            <div
              key={i}
              className="bg-white border border-default rounded-lg p-4"
            >
              <p className="font-medium text-sm text-primary mb-2">
                {parsed.display}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <LabelValue
                  label="Dose"
                  value={formatDose(u.dose_retenue, u.dose_unite)}
                />
                <LabelValue
                  label="PHI"
                  value={formatPHI(u.delai_recolte_jour)}
                />
                <LabelValue
                  label="Max apps"
                  value={String(u.nombre_max_application ?? "—")}
                />
                <LabelValue
                  label="ZNT (aquatic)"
                  value={formatZNT(u.znt_aquatique_m)}
                />
              </div>
              {u.condition_emploi && (
                <p className="text-xs text-tertiary mt-2 italic">
                  {u.condition_emploi}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {uses.length > USES_PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            page={page}
            totalItems={uses.length}
            pageSize={USES_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      <p className="text-xs text-tertiary mt-2">
        PHI = pre-harvest interval · ZNT = buffer zone (aquatic)
      </p>
    </section>
  );
}

function ParallelTradeSection({
  permits,
}: {
  permits: FrProductDetail["parallel_trade"];
}) {
  const [page, setPage] = useState(0);
  const slice = permits.slice(
    page * TRADE_PAGE_SIZE,
    (page + 1) * TRADE_PAGE_SIZE,
  );

  return (
    <section className="mb-8">
      <SectionHeader
        icon="⇌"
        title="Parallel trade permits"
        count={permits.length}
        countLabel="permits"
      />

      {/* Desktop table */}
      <div className="hidden sm:block bg-white border border-default rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-gray-50/50 text-secondary">
              <th className="text-left px-4 py-2 font-medium">
                Permit
              </th>
              <th className="text-left px-4 py-2 font-medium">
                Holder
              </th>
              <th className="text-left px-4 py-2 font-medium">
                Origin
              </th>
              <th className="text-left px-4 py-2 font-medium">
                Source product
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => (
              <tr
                key={i}
                className="border-b border-default last:border-b-0"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                  {t.permis_number}
                </td>
                <td className="px-4 py-2.5 text-primary">
                  {t.detenteur_pcp ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-secondary">
                  {originFlag(t.etat_membre_origine)}{" "}
                  {t.etat_membre_origine}
                </td>
                <td className="px-4 py-2.5 text-secondary">
                  {t.nom_produit_importe ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {slice.map((t, i) => (
          <div
            key={i}
            className="bg-white border border-default rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-secondary">
                {t.permis_number}
              </span>
            </div>
            <p className="text-sm text-primary">
              {t.detenteur_pcp ?? "—"}
            </p>
            <div className="flex items-center gap-2 text-xs text-secondary mt-1">
              <span>
                {originFlag(t.etat_membre_origine)}{" "}
                {t.etat_membre_origine}
              </span>
              <span className="text-tertiary">·</span>
              <span>{t.nom_produit_importe ?? "—"}</span>
            </div>
          </div>
        ))}
      </div>

      {permits.length > TRADE_PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            page={page}
            totalItems={permits.length}
            pageSize={TRADE_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      <p className="text-xs text-tertiary mt-2">
        Parallel imports — same formulation, authorized via mutual
        recognition
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared UI components
// ═══════════════════════════════════════════════════════════════════════════

function Breadcrumb({
  country,
  name,
}: {
  country: string;
  name: string;
}) {
  return (
    <nav className="text-sm text-secondary mb-6">
      <Link to="/" className="hover:text-brand">
        Home
      </Link>
      <span className="mx-1.5">/</span>
      <Link to="/products" className="hover:text-brand">
        Products
      </Link>
      <span className="mx-1.5">/</span>
      <span>
        {countryFlag(country)} {countryLabel(country)}
      </span>
      <span className="mx-1.5">/</span>
      <span className="text-primary font-medium">{name}</span>
    </nav>
  );
}

function InfoCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="bg-white border border-default rounded-lg px-4 py-3">
      <p className="text-xs text-tertiary uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm font-medium text-primary ${mono ? "font-mono" : ""}`}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function CompanyLink({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) {
    return <InfoCard label={label} value={value} />;
  }
  return (
    <div className="bg-white border border-default rounded-lg px-4 py-3">
      <p className="text-xs text-tertiary uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <Link
        to="/companies/$name"
        params={{ name: value }}
        className="text-sm font-medium text-brand hover:underline"
      >
        {value}
      </Link>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  countLabel,
}: {
  icon: string;
  title: string;
  count?: number;
  countLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-primary flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      {count != null && (
        <span className="text-xs font-medium text-brand bg-green-50 px-2.5 py-0.5 rounded-full">
          {count} {countLabel ?? ""}
        </span>
      )}
    </div>
  );
}

function LabelValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <span className="text-tertiary">{label}: </span>
      <span className="text-secondary font-medium">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function extractEnglishName(frName: string): string {
  const match = frName.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  return match ? match[1] : frName;
}

function originFlag(name: string | null): string {
  if (!name) return "";
  const map: Record<string, string> = {
    Italie: "🇮🇹",
    Belgique: "🇧🇪",
    Allemagne: "🇩🇪",
    Espagne: "🇪🇸",
    "Royaume-Uni": "🇬🇧",
    "Pays-Bas": "🇳🇱",
    Autriche: "🇦🇹",
    Portugal: "🇵🇹",
    Grèce: "🇬🇷",
    Lituanie: "🇱🇹",
    Pologne: "🇵🇱",
    Hongrie: "🇭🇺",
    "République tchèque": "🇨🇿",
    Slovaquie: "🇸🇰",
    Roumanie: "🇷🇴",
    Bulgarie: "🇧🇬",
    Croatie: "🇭🇷",
    Slovénie: "🇸🇮",
    Danemark: "🇩🇰",
    Suède: "🇸🇪",
    Finlande: "🇫🇮",
    Irlande: "🇮🇪",
    Chypre: "🇨🇾",
    Luxembourg: "🇱🇺",
    Malte: "🇲🇹",
    Lettonie: "🇱🇻",
    Estonie: "🇪🇪",
  };
  return map[name] ?? "🏳️";
}
