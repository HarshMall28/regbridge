// packages/web/src/routes/architecture.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, forwardRef } from "react";
import {
  sectionGroups,
  allSections,
  heroStats,
  pageSubtitle,
  type Section,
  type SectionGroup,
  type ContentBlock,
} from "../content/architecture";

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/architecture")({
  component: ArchitecturePage,
});

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function ArchitecturePage() {
  const [activeSection, setActiveSection] = useState(
    allSections[0]?.id ?? "",
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Derive which group is active from the active section
  const activeGroupId =
    sectionGroups.find((g) =>
      g.sections.some((s) => s.id === activeSection),
    )?.id ?? sectionGroups[0]?.id;

  // Track active section via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const section of allSections) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Hero header */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#16A34A] mb-3">
            Architecture
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#111827] leading-tight max-w-2xl">
            {pageSubtitle}
          </h1>

          {/* Stats strip */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-baseline gap-1.5"
              >
                <span className="font-mono text-sm font-semibold text-[#111827]">
                  {stat.value}
                </span>
                <span className="text-xs text-[#9CA3AF]">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Mobile nav — outside flex container to avoid layout conflicts */}
      <div className="md:hidden sticky top-0 z-20 bg-[#F8F9FA]/95 backdrop-blur-sm border-b border-[#E5E7EB]">
        <div className="mx-auto max-w-6xl px-6 py-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {sectionGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => scrollTo(group.sections[0]?.id ?? "")}
                className={`text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full transition-colors ${
                  group.id === activeGroupId
                    ? "bg-[#16A34A] text-white"
                    : "bg-white text-[#6B7280] border border-[#E5E7EB]"
                }`}
              >
                {group.label}
                <span className="ml-1.5 opacity-60">
                  {group.sections.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Layout: sidebar + content */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="md:flex md:gap-12">
          {/* Accordion sidebar — desktop only */}
          <aside className="hidden md:block w-56 shrink-0">
            <nav className="sticky top-24 py-10 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#9CA3AF] mb-5 pl-4">
                On this page
              </p>

              <div className="space-y-1">
                {sectionGroups.map((group) => (
                  <SidebarGroup
                    key={group.id}
                    group={group}
                    isExpanded={group.id === activeGroupId}
                    activeSection={activeSection}
                    onSectionClick={scrollTo}
                  />
                ))}
              </div>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 py-8 md:py-12 md:border-l md:border-[#E5E7EB] md:pl-12">
            <div className="max-w-[680px]">
              {sectionGroups.map((group) => (
                <div key={group.id}>
                  {/* Group header — chapter break */}
                  <div className="mb-10 first:mt-0 mt-16 md:mt-20">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="h-px flex-1 bg-[#E5E7EB]" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#9CA3AF] whitespace-nowrap">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-[#E5E7EB]" />
                    </div>
                  </div>

                  {group.sections.map((section) => (
                    <SectionRenderer
                      key={section.id}
                      section={section}
                      ref={(el) => {
                        sectionRefs.current[section.id] = el;
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar group — accordion behavior
// ---------------------------------------------------------------------------

function SidebarGroup({
  group,
  isExpanded,
  activeSection,
  onSectionClick,
}: {
  group: SectionGroup;
  isExpanded: boolean;
  activeSection: string;
  onSectionClick: (id: string) => void;
}) {
  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => onSectionClick(group.sections[0]?.id ?? "")}
        className={`
          w-full text-left text-[11px] font-semibold uppercase tracking-[0.08em] py-2 pl-4 pr-2
          transition-colors duration-150
          ${
            isExpanded
              ? "text-[#111827]"
              : "text-[#9CA3AF] hover:text-[#6B7280]"
          }
        `}
      >
        <span className="flex items-center justify-between">
          {group.label}
          <span className="text-[10px] font-normal text-[#D1D5DB]">
            {group.sections.length}
          </span>
        </span>
      </button>

      {/* Section links — visible when expanded */}
      <div
        className={`
          overflow-hidden transition-all duration-200 ease-out
          ${isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <ul className="pb-2">
          {group.sections.map((section) => (
            <li key={section.id}>
              <button
                onClick={() => onSectionClick(section.id)}
                className={`
                  w-full text-left text-[12px] leading-snug py-1.5 pl-7 pr-2
                  border-l-2 transition-colors duration-150
                  ${
                    activeSection === section.id
                      ? "border-[#16A34A] text-[#111827] font-medium"
                      : "border-transparent text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB]"
                  }
                `}
              >
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

const SectionRenderer = forwardRef<HTMLElement, { section: Section }>(
  ({ section }, ref) => {
    return (
      <section
        id={section.id}
        ref={ref}
        className="mb-16 scroll-mt-24"
      >
        <h2 className="text-xl md:text-[22px] font-semibold text-[#111827] leading-snug">
          {section.title}
        </h2>
        {section.subtitle && (
          <p className="mt-2 text-[15px] text-[#6B7280] leading-relaxed">
            {section.subtitle}
          </p>
        )}
        <div className="mt-4 mb-6 h-px bg-[#E5E7EB]" />
        <div className="space-y-5">
          {section.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>
      </section>
    );
  },
);

SectionRenderer.displayName = "SectionRenderer";

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "prose":
      return <ProseBlock text={block.text ?? ""} />;
    case "code":
      return <CodeBlockEl code={block.code!} />;
    case "table":
      return <TableBlock table={block.table!} />;
    case "callout":
      return <CalloutBlock text={block.text ?? ""} />;
    case "diagram":
      return <DiagramBlock block={block} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Prose — renders **bold** as <strong>
// ---------------------------------------------------------------------------

function ProseBlock({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-[15px] leading-[1.75] text-[#374151]">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-[#111827]">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Code block with language tab
// ---------------------------------------------------------------------------

function CodeBlockEl({
  code,
}: {
  code: { language: string; code: string };
}) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] overflow-hidden">
      <div className="px-4 py-1.5 border-b border-[#E5E7EB] bg-[#F3F4F6]">
        <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#9CA3AF]">
          {code.language}
        </span>
      </div>
      <pre className="px-4 py-3 overflow-x-auto">
        <code className="text-[13px] leading-relaxed font-mono text-[#374151]">
          {code.code}
        </code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function TableBlock({
  table,
}: {
  table: { headers: string[]; rows: string[][] };
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
            {table.headers.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2.5 font-medium text-[#6B7280] text-[12px] uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB] transition-colors"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-2.5 whitespace-nowrap ${
                    ci === 0
                      ? "font-medium text-[#111827]"
                      : "text-[#4B5563]"
                  } ${
                    /^[\d~$.,+]+/.test(cell) && ci > 0
                      ? "font-mono text-[12px]"
                      : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Callout — green-bordered insight box
// ---------------------------------------------------------------------------

function CalloutBlock({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="rounded-lg border-l-[3px] border-[#16A34A] bg-[#F0FDF4] px-5 py-4">
      <p className="text-[14px] leading-[1.75] text-[#166534]">
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i} className="font-semibold text-[#14532D]">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagram — relationship diagram image with expand/collapse
// ---------------------------------------------------------------------------

function DiagramBlock({ block }: { block: ContentBlock }) {
  const isOverview = block.text === "overview-diagram";

  const config = isOverview
    ? {
        src: "/overview-diagram.png",
        alt: "RegBridge system architecture showing three Cloudflare Workers (Web, MCP, API) communicating via Service Bindings, with packages/api-client shared between Web and MCP, and only the API Worker holding database credentials",
        caption:
          "System architecture — 3 Workers, 6 packages, 1 database",
        legend: [
          {
            type: "solid" as const,
            color: "#374151",
            label: "Public HTTPS",
          },
          {
            type: "dashed" as const,
            color: "#16A34A",
            label: "Service Binding",
          },
          {
            type: "dotted" as const,
            color: "#F97316",
            label: "Direct Kysely",
          },
        ],
      }
    : {
        src: "/architecture-diagram.png",
        alt: "RegBridge database relationship diagram showing eu_active_substances as the central hub connecting to 32 tables across EU, EFSA OpenFoodTox, Ireland, and France data tiers via four join types",
        caption:
          "Cross-tier relationship diagram — 32 tables, 4 join types",
        legend: [
          {
            type: "solid" as const,
            color: "#374151",
            label: "Integer FK join",
          },
          {
            type: "dashed" as const,
            color: "#3B82F6",
            label: "CAS text match",
          },
          {
            type: "dotted" as const,
            color: "#F97316",
            label: "Name ILIKE fuzzy",
          },
          {
            type: "dashdot" as const,
            color: "#16A34A",
            label: "JSONB containment",
          },
        ],
      };

  return (
    <div className="my-8">
      <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-sm">
        <div className="flex items-center px-4 py-2.5 border-b border-[#F3F4F6] bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span className="text-[11px] font-medium text-[#6B7280]">
              {config.caption}
            </span>
          </div>
        </div>
        <div className="p-3 bg-white">
          <img
            src={config.src}
            alt={config.alt}
            className="w-full rounded-lg"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 px-1">
        {config.legend.map((item) => (
          <LegendItem key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

function LegendItem({
  type,
  color,
  label,
}: {
  type: "solid" | "dashed" | "dotted" | "dashdot";
  color: string;
  label: string;
}) {
  const borderStyle =
    type === "dashed"
      ? "border-dashed"
      : type === "dotted"
        ? "border-dotted"
        : "";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-5 h-0 border-t-[2px] ${borderStyle}`}
        style={{ borderColor: color }}
      />
      <span className="text-[11px] text-[#6B7280]">{label}</span>
    </div>
  );
}
