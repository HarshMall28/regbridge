import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePalette } from "~/hooks/usePalette";
import { DATA_SOURCES } from "~/lib/tokens";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const STATS = [
  { num: "1,482", label: "Substances", src: "EU Pesticides DB" },
  {
    num: "14,823",
    label: "Products",
    src: "PCS Ireland + ANSES France",
  },
  { num: "480K+", label: "MRL Entries", src: "EU MRL Database" },
  { num: "74K", label: "Tox Values", src: "EFSA OpenFoodTox 3.0" },
  { num: "31", label: "Tables", src: "Neon Postgres" },
];

/* Three curated AI questions — each fires a different tool */
const AI_SUGGESTIONS = [
  {
    label:
      "Which substances in Ireland have more than 50 registered products?",
    icon: "✦",
  },
  {
    label: "Life Scientific portfolio",
    icon: "✦",
  },
  {
    label: "What is the MRL for prothioconazole on wheat?",
    icon: "✦",
  },
];

function HomePage() {
  const { setOpen, requestFocusSearch, setInitialQuery } =
    usePalette();
  const [dismissed, setDismissed] = useState(false);

  function openPalette() {
    setDismissed(true);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      requestFocusSearch();
    } else {
      setOpen(true);
    }
  }

  function handleChip(query: string) {
    setDismissed(true);
    setInitialQuery(query);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      requestFocusSearch();
    } else {
      setOpen(true);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-49px)] px-4">
      {/* Stats strip */}
      <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-10">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-semibold text-txt-primary">
              {s.num}
            </div>
            <div className="text-xs text-txt-tertiary mt-1">
              {s.label}
            </div>
            <div className="text-2xs text-txt-tertiary italic mt-0.5">
              {s.src}
            </div>
          </div>
        ))}
      </div>

      {/* ⌘K hero */}
      <button
        onClick={openPalette}
        className="flex items-center gap-2 mb-4 group cursor-pointer"
      >
        <kbd className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface-hover border border-border-strong text-base font-mono font-medium text-txt-primary group-hover:border-brand transition-colors">
          ⌘
        </kbd>
        <span className="text-txt-tertiary text-lg">+</span>
        <kbd className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface-hover border border-border-strong text-base font-mono font-medium text-txt-primary group-hover:border-brand transition-colors">
          K
        </kbd>
      </button>

      <p className="text-sm text-txt-tertiary mb-8">
        <span className="hidden sm:inline">
          Press to search substances, products, or companies
        </span>
        <span className="sm:hidden">
          Use the search bar below for substances, products, or
          companies
        </span>
      </p>

      {/* AI suggestion chips — hidden after first interaction */}
      {!dismissed && (
        <div className="w-full max-w-lg mb-8">
          {/* label */}
          <div className="flex items-center gap-2 justify-center mb-3">
            <span style={{ color: "#16a34a", fontSize: 13 }}>✦</span>
            <span className="text-xs font-medium text-txt-tertiary tracking-wide uppercase">
              Try AI mode
            </span>
          </div>
          {/* chips */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {AI_SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => handleChip(s.label)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer text-left"
                style={{
                  background: "rgba(22,163,74,0.07)",
                  border: "0.5px solid rgba(22,163,74,0.25)",
                  color: "#16a34a",
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(22,163,74,0.13)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(22,163,74,0.07)";
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>
                  {s.icon}
                </span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Data source chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {DATA_SOURCES.map((ds) => (
          <a
            key={ds.key}
            href={ds.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xs text-txt-secondary bg-surface-hover border border-border rounded-full px-3 py-1 hover:border-brand transition-colors"
          >
            {ds.label}
          </a>
        ))}
      </div>
    </main>
  );
}
