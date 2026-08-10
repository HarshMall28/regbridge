import { useState, useRef, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  serverGetSubstanceProfile,
  serverCheckMrl,
} from "~/lib/server-fns";
import type {
  EmergencyAuth,
  SubstanceProfile,
} from "../../lib/types";
import { StatusBadge, ExpiryBadge } from "~/components/StatusBadge";
import { Pagination } from "~/components/Pagination";
import {
  SUBSTANCE_SECTIONS,
  EU_COUNTRIES,
  PAGINATION,
} from "~/lib/tokens";

type SubstanceCategory = SubstanceProfile["categories"][number];
type GroupMember = SubstanceProfile["group"]["members"][number];
type Metabolite = SubstanceProfile["metabolites"][number];
type SubstanceDocument = SubstanceProfile["documents"][number];
type SubstanceDossier = SubstanceProfile["dossiers"][number];
type ToxOftEntry = SubstanceProfile["tox_oft"][number];

export const Route = createFileRoute("/substances/$identifier")({
  component: SubstancePage,
});

function SubstancePage() {
  const { identifier } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["substance", identifier],
    queryFn: () =>
      serverGetSubstanceProfile({ data: { identifier } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-txt-tertiary">
        Loading substance profile...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <nav className="text-sm text-txt-secondary mb-6">
          <Link to="/" className="hover:text-brand">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-txt-primary font-medium">
            Substance not found
          </span>
        </nav>
        <div className="section-card p-8 text-center">
          <p className="text-lg font-medium text-txt-primary mb-2">
            Substance not found
          </p>
          <p className="text-sm text-txt-secondary mb-4">
            "{identifier}" is not in the EU active substances
            database. It may be a safener or co-formulant that only
            appears in national product registrations.
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

  return <SubstanceProfileView data={data} />;
}

// ===========================================================================
// Main layout
// ===========================================================================

function SubstanceProfileView({ data }: { data: SubstanceProfile }) {
  const id = data.identity;
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );

  const scrollTo = (sectionId: string) => {
    sectionRefs.current[sectionId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Determine which sections to show
  const hasMetabolites = data.metabolites.some(
    (m: any) => m.name !== null,
  );
  const hasGroup = data.group.is_group || data.group.part_of_group;
  const visibleSections = SUBSTANCE_SECTIONS.filter((s) => {
    if (s.id === "metabolites" && !hasMetabolites) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* ---- MOBILE HEADER ---- */}
      <div className="lg:hidden sticky top-[49px] z-20 bg-surface-sidebar border-b border-border">
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-lg font-semibold text-txt-primary leading-tight">
            {id.name}
          </h1>
          {id.cas_number && (
            <p className="font-mono text-xs text-txt-secondary mt-0.5">
              {id.cas_number}
            </p>
          )}
          <div className="mt-1.5">
            <StatusBadge status={id.status} />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
          <MetricChip
            value={data.country_count}
            label="Countries"
            onClick={() => scrollTo("member-states")}
          />
          <MetricChip
            value={data.ie_product_count}
            label="IE prod."
            onClick={() => scrollTo("ie-products")}
          />
          <MetricChip
            value={data.fr_product_count}
            label="FR prod."
            onClick={() => scrollTo("fr-products")}
          />
          <MetricChip
            value={data.emergency_auth_count}
            label="Emerg."
            onClick={() => scrollTo("emergency-auths")}
          />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="flex-shrink-0 px-2.5 py-1 text-xs rounded-full border border-border bg-surface-card text-txt-secondary hover:text-brand hover:border-brand transition-colors"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-49px)]">
        {/* ---- SIDEBAR (desktop only) ---- */}
        <aside className="hidden lg:block w-[280px] flex-shrink-0 bg-surface-sidebar lg:border-r border-border p-4 overflow-y-auto lg:sticky lg:top-[49px] lg:h-[calc(100vh-49px)]">
          {/* Identity */}
          <h1 className="text-xl font-semibold text-txt-primary leading-tight">
            {id.name}
          </h1>
          {id.cas_number && (
            <p className="font-mono text-xs text-txt-secondary mt-1">
              {id.cas_number}
            </p>
          )}
          <div className="mt-2">
            <StatusBadge status={id.status} />
          </div>

          <hr className="border-border my-3" />

          {/* Dates */}
          <div className="space-y-1">
            <div className="field-row">
              <span className="field-label">Approved</span>
              <span className="field-value text-sm">
                {id.approval_dt ? formatDate(id.approval_dt) : "—"}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Expires</span>
              <span className="field-value text-sm flex items-center gap-1.5">
                {id.expiry_dt ? formatDate(id.expiry_dt) : "—"}
                <ExpiryBadge expiryDt={id.expiry_dt} />
              </span>
            </div>
          </div>

          <hr className="border-border my-3" />

          {/* RMS / CoRMS */}
          <div className="space-y-1">
            <div className="field-row">
              <span className="field-label">RMS</span>
              <span className="field-value">{id.rms ?? "—"}</span>
            </div>
            <div className="field-row">
              <span className="field-label">CoRMS</span>
              <span className="field-value">{id.corms ?? "—"}</span>
            </div>
          </div>

          {/* Category + flags */}
          {data.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {data.categories.map((c: SubstanceCategory) => (
                <span key={c.code} className="badge badge-neutral">
                  {c.name ?? c.code}
                </span>
              ))}
            </div>
          )}
          {id.candidate_for_substitution && (
            <div className="mt-2">
              <span className="badge badge-withdrawn">
                Candidate for substitution
              </span>
            </div>
          )}

          <hr className="border-border my-3" />

          {/* Metrics */}
          <p className="text-2xs font-medium uppercase tracking-wider text-txt-tertiary mb-2">
            Metrics
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              value={data.country_count}
              label="Countries"
              onClick={() => scrollTo("member-states")}
            />
            <MetricCard
              value={data.ie_product_count}
              label="IE prod."
              onClick={() => scrollTo("ie-products")}
            />
            <MetricCard
              value={data.fr_product_count}
              label="FR prod."
              onClick={() => scrollTo("fr-products")}
            />
            <MetricCard
              value={data.emergency_auth_count}
              label="Emerg."
              onClick={() => scrollTo("emergency-auths")}
            />
          </div>

          <hr className="border-border my-3" />

          {/* Tox summary */}
          <p className="text-2xs font-medium uppercase tracking-wider text-txt-tertiary mb-2">
            Tox
          </p>
          <div className="space-y-0.5">
            <ToxSummaryRow
              label="ADI"
              value={data.tox_eu.adi.value}
            />
            <ToxSummaryRow
              label="ARfD"
              value={data.tox_eu.arfd.value}
            />
            <ToxSummaryRow
              label="AOEL"
              value={data.tox_eu.aoel.value}
            />
            <ToxSummaryRow
              label="AAOEL"
              value={data.tox_eu.aaoel.value}
            />
            <ToxSummaryRow
              label="Genotox"
              value={
                parseGenotoxConclusion(data.genotoxicity.conclusion)
                  .label
              }
              isNegative={
                !parseGenotoxConclusion(data.genotoxicity.conclusion)
                  .isClean
              }
            />
          </div>

          <hr className="border-border my-3" />

          {/* Jump to — desktop only */}
          <div className="hidden lg:block">
            <p className="text-2xs font-medium uppercase tracking-wider text-txt-tertiary mb-2">
              Jump to
            </p>
            <nav className="space-y-1">
              {visibleSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className="block text-sm text-txt-secondary hover:text-brand transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* ---- MAIN CONTENT ---- */}
        <main className="flex-1 p-4 lg:p-5 space-y-4 overflow-y-auto">
          {/* Key facts & tox — mobile collapsible */}
          <details className="lg:hidden section-card group">
            <summary className="text-sm font-medium text-txt-primary cursor-pointer list-none flex items-center justify-between">
              Key facts & tox
              <span className="text-txt-tertiary text-xs group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <div className="field-row">
                  <span className="field-label">Approved</span>
                  <span className="field-value text-sm">
                    {id.approval_dt
                      ? formatDate(id.approval_dt)
                      : "—"}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Expires</span>
                  <span className="field-value text-sm flex items-center gap-1.5">
                    {id.expiry_dt ? formatDate(id.expiry_dt) : "—"}
                    <ExpiryBadge expiryDt={id.expiry_dt} />
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="field-row">
                  <span className="field-label">RMS</span>
                  <span className="field-value">{id.rms ?? "—"}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">CoRMS</span>
                  <span className="field-value">
                    {id.corms ?? "—"}
                  </span>
                </div>
              </div>
              {data.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.categories.map((c: SubstanceCategory) => (
                    <span
                      key={c.code}
                      className="badge badge-neutral"
                    >
                      {c.name ?? c.code}
                    </span>
                  ))}
                </div>
              )}
              {id.candidate_for_substitution && (
                <span className="badge badge-withdrawn">
                  Candidate for substitution
                </span>
              )}
              <div className="space-y-0.5 pt-1 border-t border-border">
                <ToxSummaryRow
                  label="ADI"
                  value={data.tox_eu.adi.value}
                />
                <ToxSummaryRow
                  label="ARfD"
                  value={data.tox_eu.arfd.value}
                />
                <ToxSummaryRow
                  label="AOEL"
                  value={data.tox_eu.aoel.value}
                />
                <ToxSummaryRow
                  label="AAOEL"
                  value={data.tox_eu.aaoel.value}
                />
                <ToxSummaryRow
                  label="Genotox"
                  value={
                    parseGenotoxConclusion(
                      data.genotoxicity.conclusion,
                    ).label
                  }
                  isNegative={
                    !parseGenotoxConclusion(
                      data.genotoxicity.conclusion,
                    ).isClean
                  }
                />
              </div>
            </div>
          </details>

          {/* Group banner */}
          {hasGroup && (
            <div className="section-card bg-status-approved-bg border-brand/20">
              <span className="text-sm font-medium text-txt-primary">
                Part of group:{" "}
              </span>
              {data.group.members.map((m: GroupMember) => (
                <Link
                  key={m.as_id}
                  to="/substances/$identifier"
                  params={{ identifier: m.name ?? String(m.as_id) }}
                  className="inline-block badge badge-approved mr-1 mb-1 cursor-pointer"
                >
                  {m.name ?? `#${m.as_id}`}
                </Link>
              ))}
            </div>
          )}

          {/* Section 1: Toxicology */}
          <div
            ref={(el) => {
              sectionRefs.current["toxicology"] = el;
            }}
            className="section-card"
          >
            <SectionHeader title="Toxicological Reference Values" />
            <div className="md:hidden space-y-2">
              <ToxMobileRow label="ADI" tox={data.tox_eu.adi} />
              <ToxMobileRow label="ARfD" tox={data.tox_eu.arfd} />
              <ToxMobileRow label="AOEL" tox={data.tox_eu.aoel} />
              <ToxMobileRow label="AAOEL" tox={data.tox_eu.aaoel} />
              <div className="p-3 border border-border rounded-lg">
                <div className="text-xs text-txt-tertiary mb-1">
                  Genotoxicity
                </div>
                <div
                  className={`font-mono text-sm ${parseGenotoxConclusion(data.genotoxicity.conclusion).isClean ? "text-brand" : "text-status-withdrawn-text"}`}
                >
                  {
                    parseGenotoxConclusion(
                      data.genotoxicity.conclusion,
                    ).label
                  }
                </div>
                {(data.genotoxicity.in_vitro_link ||
                  data.genotoxicity.in_vivo_link) && (
                  <div className="text-xs text-txt-tertiary mt-1">
                    {data.genotoxicity.in_vitro_link && "In vitro"}
                    {data.genotoxicity.in_vitro_link &&
                      data.genotoxicity.in_vivo_link &&
                      " / "}
                    {data.genotoxicity.in_vivo_link && "In vivo"}
                  </div>
                )}
              </div>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Value</th>
                    <th>Source</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  <ToxRow label="ADI" tox={data.tox_eu.adi} />
                  <ToxRow label="ARfD" tox={data.tox_eu.arfd} />
                  <ToxRow label="AOEL" tox={data.tox_eu.aoel} />
                  <ToxRow label="AAOEL" tox={data.tox_eu.aaoel} />
                  <tr className="border-t-2 border-border-strong">
                    <td className="font-medium">Genotoxicity</td>
                    <td
                      className={`font-mono text-sm ${parseGenotoxConclusion(data.genotoxicity.conclusion).isClean ? "text-brand" : "text-status-withdrawn-text"}`}
                    >
                      {
                        parseGenotoxConclusion(
                          data.genotoxicity.conclusion,
                        ).label
                      }
                    </td>
                    <td className="mono-id">—</td>
                    <td className="text-xs text-txt-tertiary">
                      {data.genotoxicity.in_vitro_link && "In vitro"}
                      {data.genotoxicity.in_vitro_link &&
                        data.genotoxicity.in_vivo_link &&
                        " / "}
                      {data.genotoxicity.in_vivo_link && "In vivo"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {data.tox_oft.length > 0 && (
              <OftExpander entries={data.tox_oft} />
            )}
          </div>

          {/* Section 2: IE Products */}
          <div
            ref={(el) => {
              sectionRefs.current["ie-products"] = el;
            }}
          >
            <ProductSection
              flag="🇮🇪"
              title="Irish Products"
              count={data.ie_product_count}
              items={data.ie_products}
              columns={[
                "product_name",
                "pcs_number",
                "auth_holder",
                "crops",
              ]}
              headers={["Product", "PCS", "Holder", "Crops"]}
              linkBuilder={(p) => ({
                to: "/products/$country/$id" as const,
                params: { country: "ie", id: p.pcs_number ?? "" },
              })}
            />
          </div>

          {/* Section 3: FR Products */}
          <div
            ref={(el) => {
              sectionRefs.current["fr-products"] = el;
            }}
          >
            <ProductSection
              flag="🇫🇷"
              title="French Products"
              count={data.fr_product_count}
              items={data.fr_products}
              columns={[
                "product_name",
                "amm_number",
                "titulaire",
                "etat_autorisation",
              ]}
              headers={["Product", "AMM", "Titulaire", "Status"]}
              linkBuilder={(p: any) => ({
                to: "/products/$country/$id" as const,
                params: { country: "fr", id: p.amm_number ?? "" },
              })}
              renderCell={(col, val) =>
                col === "etat_autorisation" ? (
                  <StatusBadge status={val as string} />
                ) : undefined
              }
            />
          </div>

          {/* Section 4: Emergency Authorizations */}
          <div
            ref={(el) => {
              sectionRefs.current["emergency-auths"] = el;
            }}
          >
            <EmergencyAuthSection auths={data.emergency_auths} />
          </div>

          {/* Section 5: MRL Check */}
          <div
            ref={(el) => {
              sectionRefs.current["mrl-check"] = el;
            }}
          >
            <MrlSection substanceName={data.identity.name} />
          </div>

          {/* Section 6: Member States */}
          <div
            ref={(el) => {
              sectionRefs.current["member-states"] = el;
            }}
          >
            <CountryGridSection
              countries={data.countries}
              total={data.country_count}
              rms={data.identity.rms}
              corms={data.identity.corms}
            />
          </div>

          {/* Section 7: Metabolites (conditional) */}
          {hasMetabolites && (
            <div
              ref={(el) => {
                sectionRefs.current["metabolites"] = el;
              }}
              className="section-card"
            >
              <SectionHeader
                title="Metabolites"
                count={
                  data.metabolites.filter((m: any) => m.name).length
                }
              />
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metabolites
                      .filter((m: any) => m.name)
                      .map((m: Metabolite, i: number) => (
                        <tr key={m.uuid ?? i}>
                          <td className="font-medium">{m.name}</td>
                          <td className="text-xs text-txt-tertiary">
                            {m.remarks ?? "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 8: Documents & Opinions */}
          <div
            ref={(el) => {
              sectionRefs.current["documents"] = el;
            }}
            className="section-card"
          >
            <SectionHeader title="Documents & Opinions" />
            {data.documents.length > 0 && (
              <>
                <p className="text-2xs font-medium uppercase tracking-wider text-txt-tertiary mb-1">
                  Documents ({data.documents.length})
                </p>
                <div className="space-y-1 mb-4">
                  {data.documents.map(
                    (d: SubstanceDocument, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1 border-b border-border text-sm"
                      >
                        <span className="text-txt-tertiary">📄</span>
                        <span className="flex-1 line-clamp-2">
                          {d.filename ?? d.description ?? "Document"}
                        </span>
                        {d.document_type && (
                          <span className="badge badge-neutral">
                            {d.document_type}
                          </span>
                        )}
                        {d.source_url && (
                          <a
                            href={d.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand text-xs"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
            {data.dossiers.length > 0 && (
              <>
                <p className="text-2xs font-medium uppercase tracking-wider text-txt-tertiary mb-1">
                  EFSA Opinions ({data.dossiers.length})
                </p>
                <div className="space-y-1">
                  {data.dossiers.map(
                    (d: SubstanceDossier, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1 border-b border-border text-sm"
                      >
                        <span className="text-txt-tertiary">📋</span>
                        <span className="flex-1 line-clamp-2">
                          {d.output_title ??
                            d.efsa_question_number ??
                            "Opinion"}
                        </span>
                        {d.doi && (
                          <a
                            href={
                              d.doi.startsWith("http")
                                ? d.doi
                                : `https://doi.org/${d.doi.replace(/^doi:/, "")}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand text-xs"
                          >
                            DOI ↗
                          </a>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
            {data.documents.length === 0 &&
              data.dossiers.length === 0 && (
                <p className="text-sm text-txt-tertiary">
                  No documents available.
                </p>
              )}
          </div>

          {/* Section 9: Legislation */}
          <div
            ref={(el) => {
              sectionRefs.current["legislation"] = el;
            }}
            className="section-card"
          >
            <SectionHeader title="Legislation" />
            <LegislationLinks legislation={data.legislation} />
          </div>

          {/* Footer */}
          <p className="text-2xs text-txt-tertiary pb-4">
            Data as of: {data.data_as_of ?? "Unknown"} · EU Pesticides
            DB, EFSA OpenFoodTox, PCS Ireland, ANSES France
          </p>
        </main>
      </div>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-medium text-txt-primary">
        {title}
      </h2>
      {count !== undefined && (
        <span className="badge badge-approved">{count}</span>
      )}
    </div>
  );
}

function MetricChip({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 min-w-[72px] px-3 py-1.5 rounded-lg border border-border bg-surface-card hover:border-brand transition-colors text-center"
    >
      <div className="text-base font-semibold text-txt-primary leading-none">
        {value}
      </div>
      <div className="text-2xs text-txt-tertiary mt-0.5">{label}</div>
    </button>
  );
}

function MetricCard({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="metric-card hover:border-brand transition-colors"
    >
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </button>
  );
}

function ToxSummaryRow({
  label,
  value,
  isNegative = false,
}: {
  label: string;
  value: string | null;
  isNegative?: boolean;
}) {
  const hasValue = value !== null && value !== "";
  return (
    <div className="field-row text-sm">
      <span className="field-label">{label}</span>
      <span
        className={`font-mono text-xs ${isNegative ? "text-status-withdrawn-text" : hasValue ? "text-brand" : "text-txt-tertiary"}`}
      >
        {hasValue ? value : "—"}
        {hasValue && !isNegative && " ✓"}
      </span>
    </div>
  );
}

function ToxMobileRow({
  label,
  tox,
}: {
  label: string;
  tox: {
    value: string | null;
    source: string | null;
    remark: string | null;
  };
}) {
  const hasVal = tox.value !== null && tox.value !== "";
  return (
    <div className="p-3 border border-border rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-txt-primary">
          {label}
        </span>
        <span
          className={`font-mono text-sm ${hasVal ? "text-brand" : "text-txt-tertiary"}`}
        >
          {tox.value ?? "—"}
        </span>
      </div>
      {(tox.source || tox.remark) && (
        <div className="mt-1 text-xs text-txt-tertiary">
          {tox.source && (
            <span className="mono-id">{tox.source}</span>
          )}
          {tox.source && tox.remark && " · "}
          {tox.remark}
        </div>
      )}
    </div>
  );
}

function ToxRow({
  label,
  tox,
}: {
  label: string;
  tox: {
    value: string | null;
    source: string | null;
    remark: string | null;
  };
}) {
  const hasVal = tox.value !== null && tox.value !== "";
  return (
    <tr>
      <td className="font-medium">{label}</td>
      <td
        className={`font-mono text-sm ${hasVal ? "text-brand" : "text-txt-tertiary"}`}
      >
        {tox.value ?? "—"}
      </td>
      <td className="mono-id">{tox.source ?? "—"}</td>
      <td
        className="text-xs text-txt-tertiary max-w-[200px] truncate"
        title={tox.remark ?? ""}
      >
        {tox.remark ?? "—"}
      </td>
    </tr>
  );
}

function OftExpander({
  entries,
}: {
  entries: SubstanceProfile["tox_oft"];
}) {
  const [open, setOpen] = useState(false);

  const useful = entries.filter(
    (e: any) =>
      e.endpoint_type &&
      e.endpoint_type !== "NONE" &&
      (e.value_lower !== null || e.value_upper !== null),
  );

  const hasExtraInfo = useful.some(
    (e: any) =>
      e.assessment_body || e.critical_endpoint || e.justification,
  );

  if (useful.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-brand hover:text-brand-hover transition-colors"
      >
        {open ? "▾" : "▸"} OpenFoodTox: {useful.length} values
        {!hasExtraInfo && (
          <span className="text-txt-tertiary text-xs ml-2">
            (same endpoints, different source)
          </span>
        )}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="data-table mt-2">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Lower</th>
                <th>Upper</th>
                <th>Unit</th>
                <th>Population</th>
                {hasExtraInfo && <th>Critical endpoint</th>}
              </tr>
            </thead>
            <tbody>
              {useful.map((e: ToxOftEntry, i: number) => (
                <tr key={i}>
                  <td className="font-medium">{e.endpoint_type}</td>
                  <td className="mono-id">{e.value_lower ?? "—"}</td>
                  <td className="mono-id">{e.value_upper ?? "—"}</td>
                  <td className="text-xs">{e.unit ?? "—"}</td>
                  <td className="text-xs text-txt-tertiary">
                    {e.population ?? "—"}
                  </td>
                  {hasExtraInfo && (
                    <td className="text-xs text-txt-tertiary">
                      {e.critical_endpoint ?? "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product table (reused for IE and FR)
// ---------------------------------------------------------------------------

function ProductSection<T extends Record<string, any>>({
  flag,
  title,
  count,
  items,
  columns,
  headers,
  linkBuilder,
  renderCell,
}: {
  flag: string;
  title: string;
  count: number;
  items: T[];
  columns: string[];
  headers: string[];
  linkBuilder: (item: T) => {
    to: any;
    params: Record<string, string>;
  };
  renderCell?: (col: string, val: unknown) => ReactNode | undefined;
}) {
  const [page, setPage] = useState(0);
  const ps = PAGINATION.defaultPageSize;
  const paged = items.slice(page * ps, (page + 1) * ps);

  const renderCellValue = (
    col: string,
    val: any,
    item: T,
    ci: number,
  ) => {
    const custom = renderCell?.(col, val);
    if (custom !== undefined) return custom;
    if (col === "auth_holder" || col === "titulaire") {
      return (
        <Link
          to="/companies/$name"
          params={{ name: val ?? "" }}
          className="link-brand text-sm"
        >
          {val ?? "—"}
        </Link>
      );
    }
    if (ci === 0) {
      const link = linkBuilder(item);
      return (
        <Link
          to="/products/$country/$id"
          params={{
            country: link.params.country,
            id: link.params.id,
          }}
          className="link-brand text-sm"
        >
          {val ?? "—"}
        </Link>
      );
    }
    if (col.includes("number") || col === "pcs_number") {
      return <span className="mono-id">{val ?? "—"}</span>;
    }
    return <span className="text-sm">{val ?? "—"}</span>;
  };

  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium text-txt-primary">
          {flag} {title}
        </h2>
        <span className="badge badge-approved">{count} total</span>
      </div>
      <div className="md:hidden space-y-2">
        {paged.map((item, i) => (
          <div
            key={i}
            className="p-3 border border-border rounded-lg space-y-1.5"
          >
            {columns.map((col, ci) => (
              <div key={col} className="flex gap-2 text-sm">
                <span className="text-txt-tertiary flex-shrink-0 w-16">
                  {headers[ci]}
                </span>
                <span className="flex-1 min-w-0 break-words">
                  {renderCellValue(col, item[col], item, ci)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((item, i) => {
              const link = linkBuilder(item);
              return (
                <tr key={i}>
                  {columns.map((col, ci) => {
                    const val = item[col];
                    const custom = renderCell?.(col, val);
                    if (custom !== undefined)
                      return <td key={col}>{custom}</td>;
                    if (
                      col === "auth_holder" ||
                      col === "titulaire"
                    ) {
                      return (
                        <td key={col}>
                          <Link
                            to="/companies/$name"
                            params={{ name: val ?? "" }}
                            className="link-brand text-sm"
                          >
                            {val ?? "—"}
                          </Link>
                        </td>
                      );
                    }
                    if (ci === 0) {
                      return (
                        <td key={col}>
                          <Link
                            to="/products/$country/$id"
                            params={{
                              country: link.params.country,
                              id: link.params.id,
                            }}
                            className="link-brand text-sm"
                          >
                            {val ?? "—"}
                          </Link>
                        </td>
                      );
                    }
                    if (
                      col.includes("number") ||
                      col === "pcs_number"
                    ) {
                      return (
                        <td key={col} className="mono-id">
                          {val ?? "—"}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col}
                        className="text-sm truncate max-w-[180px]"
                        title={val ?? ""}
                      >
                        {val ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalItems={items.length}
        pageSize={ps}
        onPageChange={setPage}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emergency Authorizations
// ---------------------------------------------------------------------------

function EmergencyAuthSection({
  auths,
}: {
  auths: SubstanceProfile["emergency_auths"];
}) {
  const [page, setPage] = useState(0);
  const ps = PAGINATION.defaultPageSize;
  const sorted = [...auths].sort(
    (a: EmergencyAuth, b: EmergencyAuth) =>
      new Date(b.valid_from ?? 0).getTime() -
      new Date(a.valid_from ?? 0).getTime(),
  );
  const paged = sorted.slice(page * ps, (page + 1) * ps);

  const freq: Record<string, number> = {};
  auths.forEach((a: EmergencyAuth) => {
    if (a.country_code)
      freq[a.country_code] = (freq[a.country_code] || 0) + 1;
  });
  const topCountries = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium text-txt-primary">
          Emergency Authorizations
        </h2>
        <span className="badge badge-expiring">{auths.length}</span>
      </div>
      <div className="md:hidden space-y-2">
        {paged.map((a: EmergencyAuth) => (
          <div
            key={a.id}
            className="p-3 border border-border rounded-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-txt-primary">
                {a.country_code ?? "—"}
              </span>
              <span className="text-xs font-mono text-txt-secondary flex-shrink-0">
                {a.valid_from ? formatDateShort(a.valid_from) : "—"}
                {" – "}
                {a.valid_until ? formatDateShort(a.valid_until) : "—"}
              </span>
            </div>
            <div className="text-sm text-txt-secondary mt-1 break-words">
              {a.auth_holder ?? "—"}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Period</th>
              <th>Auth Holder</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((a: EmergencyAuth) => (
              <tr key={a.id}>
                <td className="font-medium">
                  {a.country_code ?? "—"}
                </td>
                <td className="mono-id">
                  {a.valid_from ? formatDate(a.valid_from) : "—"} →{" "}
                  {a.valid_until ? formatDate(a.valid_until) : "—"}
                </td>
                <td className="text-sm truncate max-w-[200px]">
                  {a.auth_holder ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalItems={auths.length}
        pageSize={ps}
        onPageChange={setPage}
      />
      {topCountries.length > 0 && (
        <p className="text-2xs text-txt-tertiary italic mt-2">
          Demand signal →{" "}
          {topCountries
            .map(([c, n]: [string, number]) => `${c} (${n})`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MRL Check
// ---------------------------------------------------------------------------

function MrlSection({ substanceName }: { substanceName: string }) {
  const [commodity, setCommodity] = useState("");
  const [searchCommodity, setSearchCommodity] = useState("");

  const { data: mrlData, isFetching } = useQuery({
    queryKey: ["mrl", substanceName, searchCommodity],
    queryFn: () =>
      serverCheckMrl({
        data: {
          substance: substanceName,
          commodity: searchCommodity,
        },
      }),
    enabled: searchCommodity.length >= 2,
  });

  const handleCheck = () => {
    if (commodity.length >= 2) setSearchCommodity(commodity);
  };

  const commodityResults = mrlData?.commodity_results ?? [];
  const firstCommodity = commodityResults[0];

  return (
    <div className="section-card">
      <SectionHeader title="MRL Compliance Check" />
      <p className="text-xs text-txt-tertiary mb-3">
        Check maximum residue limits for this substance against any
        commodity
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={commodity}
          onChange={(e) => setCommodity(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          placeholder="Commodity e.g. Wheat, Apples, Rice"
          className="flex-1 h-10 sm:h-9 px-3 text-sm border border-border rounded-lg bg-surface-card text-txt-primary placeholder:text-txt-tertiary focus:border-brand outline-none transition-colors"
        />
        <button
          onClick={handleCheck}
          disabled={commodity.length < 2}
          className="h-10 sm:h-9 px-4 text-sm border border-border rounded-lg bg-surface-hover text-txt-primary hover:border-brand transition-colors disabled:opacity-40"
        >
          {isFetching ? "..." : "Check"}
        </button>
      </div>

      {mrlData && (
        <div>
          {commodityResults.length > 0 && firstCommodity ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="text-center p-3 border border-border rounded-lg">
                  <div className="text-xl font-semibold font-mono text-brand">
                    {firstCommodity.mrl?.value ??
                      mrlData.default_mrl?.value ??
                      "—"}
                  </div>
                  <div className="text-2xs text-txt-tertiary mt-1">
                    mg/kg MRL
                  </div>
                </div>
                <div className="text-center p-3 border border-border rounded-lg">
                  <div className="text-sm font-medium text-txt-primary">
                    {firstCommodity.product_name ?? searchCommodity}
                  </div>
                  <div className="text-2xs text-txt-tertiary mt-1">
                    {firstCommodity.product_code ?? ""}
                  </div>
                </div>
                <div className="text-center p-3 border border-border rounded-lg">
                  <div className="text-xs font-mono text-txt-secondary">
                    {firstCommodity.mrl?.regulation_number ?? "—"}
                  </div>
                  <div className="text-2xs text-txt-tertiary mt-1">
                    Regulation
                  </div>
                </div>
              </div>
              {mrlData.residue_definition?.residue_name && (
                <p className="text-2xs text-txt-tertiary italic">
                  Residue: {mrlData.residue_definition.residue_name}
                </p>
              )}
            </>
          ) : mrlData.mrl_type === "default" ? (
            <div className="p-3 border border-border rounded-lg text-center">
              <div className="text-xl font-semibold font-mono text-brand">
                {mrlData.default_mrl?.value ?? "0.01"}
              </div>
              <div className="text-2xs text-txt-tertiary mt-1">
                Default MRL (mg/kg) —{" "}
                {mrlData.default_mrl?.regulation_text ?? ""}
              </div>
            </div>
          ) : (
            <p className="text-sm text-txt-tertiary">
              No MRL data found for this commodity.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Country Grid
// ---------------------------------------------------------------------------

function CountryGridSection({
  countries,
  total,
  rms,
  corms,
}: {
  countries: { country_code: string }[];
  total: number;
  rms: string | null;
  corms: string | null;
}) {
  const authorizedCodes = new Set(
    countries.map((c: { country_code: string }) => c.country_code),
  );
  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium text-txt-primary">
          Member State Authorizations
        </h2>
        <span className="text-sm text-txt-tertiary">
          {total} / {EU_COUNTRIES.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EU_COUNTRIES.map((cc) => (
          <div
            key={cc}
            className={`country-badge ${authorizedCodes.has(cc) ? "country-badge-auth" : "country-badge-no"}`}
            title={
              cc === rms
                ? "Rapporteur MS"
                : cc === corms
                  ? "Co-Rapporteur MS"
                  : cc
            }
          >
            {cc}
            {(cc === rms || cc === corms) && (
              <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-txt-secondary" />
            )}
          </div>
        ))}
      </div>
      {(rms || corms) && (
        <p className="text-2xs text-txt-tertiary mt-2">
          {rms && `RMS: ${rms}`}
          {rms && corms && " · "}
          {corms && `CoRMS: ${corms}`}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legislation
// ---------------------------------------------------------------------------

function LegislationLinks({
  legislation,
}: {
  legislation: SubstanceProfile["legislation"];
}) {
  const parseLinks = (
    html: string | null,
  ): { text: string; href: string }[] => {
    if (!html) return [];
    const matches = [
      ...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g),
    ];
    if (matches.length > 0) {
      return matches.map((m) => ({ href: m[1], text: m[2] }));
    }
    return [{ text: html, href: "" }];
  };

  const activeLinks = parseLinks(legislation.active);
  const residueLinks = parseLinks(legislation.residue_linked);

  return (
    <div className="space-y-1">
      {activeLinks.map((l, i) => (
        <a
          key={i}
          href={l.href || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm link-brand"
        >
          {l.text} {l.href && "↗"}
        </a>
      ))}
      {residueLinks.length > 0 && (
        <hr className="border-border my-2" />
      )}
      {residueLinks.map((l, i) => (
        <a
          key={i}
          href={l.href || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-txt-secondary hover:text-brand"
        >
          Residue: {l.text} {l.href && "↗"}
        </a>
      ))}
      {legislation.mrl_webpage && (
        <a
          href={
            legislation.mrl_webpage.match(/href="([^"]*)"/)?.[1] ??
            "#"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-txt-secondary hover:text-brand"
        >
          MRL webpage ↗
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateShort(dt: string): string {
  try {
    return new Date(dt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return dt;
  }
}

function formatDate(dt: string): string {
  try {
    return new Date(dt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dt;
  }
}

function parseGenotoxConclusion(raw: string | null): {
  label: string;
  isClean: boolean;
} {
  if (!raw) return { label: "No data", isClean: false };

  const parts = raw.split(";").map((s) => s.trim().toLowerCase());

  const hasPositive = parts.some((p) => p.includes("positive"));
  const hasNegative = parts.some((p) => p.includes("negative"));

  if (hasPositive) return { label: "Positive", isClean: false };
  if (hasNegative) return { label: "Negative", isClean: true };
  return { label: "No data", isClean: false };
}
