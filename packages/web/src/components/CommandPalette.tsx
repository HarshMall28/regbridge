import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SearchResult } from "~/lib/api";
import {
  serverPaletteSearch,
  serverGetSubstanceProfile,
} from "../lib/server-fns";

// Keyframe animation for macOS Spotlight-style elastic pop
const palettePopKeyframes = `
@keyframes palette-pop {
  0% {
    opacity: 0;
    transform: scaleX(0.85) scaleY(1.15) translateY(-20px);
  }
  60% {
    opacity: 1;
    transform: scaleX(1.02) scaleY(0.98) translateY(2px);
  }
  100% {
    opacity: 1;
    transform: scaleX(1) scaleY(1) translateY(0);
  }
}
`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>(
    {
      queryKey: ["search", debouncedQuery],
      queryFn: () =>
        serverPaletteSearch({
          data: { query: debouncedQuery, limit: 20 },
        }),
      enabled: debouncedQuery.length >= 2,
      staleTime: 1000 * 60 * 2,
    },
  );

  // Reset highlight when results change
  useEffect(() => setHighlightIdx(0), [results]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Prefetch on highlight — substance profiles
  useEffect(() => {
    if (!results[highlightIdx]) return;
    const r = results[highlightIdx];
    if (r.type === "substance" && r.entity?.name) {
      queryClient.prefetchQuery({
        queryKey: ["substance", r.entity.name],
        queryFn: () =>
          serverGetSubstanceProfile({
            data: { identifier: r.entity.name },
          }),
        staleTime: 1000 * 60 * 5,
      });
    }
  }, [highlightIdx, results, queryClient]);

  // Navigate to selected result
  const selectResult = useCallback(
    (r: SearchResult) => {
      onClose();
      if (r.type === "substance") {
        navigate({
          to: "/substances/$identifier",
          params: { identifier: r.entity.name },
        });
      } else if (r.type === "product") {
        navigate({
          to: "/products/$country/$id",
          params: {
            country: (r.entity.country || "ie").toLowerCase(),
            id: r.entity.identifier,
          },
        });
      } else if (r.type === "company") {
        navigate({
          to: "/companies/$name",
          params: { name: r.entity.company_name },
        });
      }
    },
    [navigate, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[highlightIdx]) {
        e.preventDefault();
        selectResult(results[highlightIdx]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, results, highlightIdx, selectResult]);

  if (!open) return null;

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{palettePopKeyframes}</style>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[17vh] pointer-events-none">
        {/* Modal with elastic scale animation (no backdrop) */}
        <div
          className="relative w-full max-w-[640px] mx-2 sm:mx-4 bg-surface-card border border-border-strong rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
          style={{
            animation:
              "palette-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search substances, products, or companies..."
              className="flex-1 bg-transparent text-base text-txt-primary placeholder:text-txt-tertiary outline-none"
            />
            <kbd className="kbd text-2xs">esc</kbd>
          </div>

          {/* Results */}
          {debouncedQuery.length >= 2 && (
            <div className="max-h-[400px] overflow-y-auto py-1">
              {results.length === 0 && !isFetching && (
                <div className="px-4 py-8 text-center text-sm text-txt-tertiary">
                  No results for "{debouncedQuery}"
                </div>
              )}
              {isFetching && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-txt-tertiary">
                  Searching...
                </div>
              )}
              {results.map((r, i) => (
                <PaletteRow
                  key={`${r.type}-${r.entity?.name ?? r.entity?.product_id ?? i}`}
                  result={r}
                  highlighted={i === highlightIdx}
                  onSelect={() => selectResult(r)}
                  onMouseEnter={() => setHighlightIdx(i)}
                />
              ))}
            </div>
          )}

          {/* Empty state — before typing */}
          {debouncedQuery.length < 2 && (
            <div className="px-4 py-6 text-center text-sm text-txt-tertiary">
              Type at least 2 characters to search
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center gap-5 px-4 py-2 border-t border-border text-2xs text-txt-tertiary">
            <span>
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd ml-0.5">↓</kbd>
              <span className="ml-1">navigate</span>
            </span>
            <span>
              <kbd className="kbd">↵</kbd>
              <span className="ml-1">select</span>
            </span>
            <span>
              <kbd className="kbd">esc</kbd>
              <span className="ml-1">close</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Palette row
// ---------------------------------------------------------------------------

function PaletteRow({
  result,
  highlighted,
  onSelect,
  onMouseEnter,
}: {
  result: SearchResult;
  highlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const e = result.entity;

  return (
    <div
      data-highlighted={highlighted}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={`palette-row mx-1 ${highlighted ? "bg-palette-highlight border-l-2 border-l-palette-border" : "border-l-2 border-l-transparent"}`}
    >
      <span className="w-5 text-center text-txt-tertiary text-sm flex-shrink-0">
        {result.type === "substance" && <FlaskIcon />}
        {result.type === "product" && <PackageIcon />}
        {result.type === "company" && <BuildingIcon />}
      </span>

      <span className="font-medium text-sm text-txt-primary truncate">
        {e?.name ?? e?.product_name ?? e?.company_name ?? "Unknown"}
      </span>

      {/* Type-specific meta */}
      {result.type === "substance" && e?.cas_number && (
        <span className="ml-auto mono-id text-xs">
          {e.cas_number}
        </span>
      )}
      {result.type === "product" && (
        <>
          <span className="text-sm ml-1">
            {e?.country === "ie"
              ? "🇮🇪"
              : e?.country === "fr"
                ? "🇫🇷"
                : ""}
          </span>
          <span className="ml-auto mono-id text-xs">
            {e?.product_id ?? e?.pcs_number ?? e?.amm_number ?? ""}
          </span>
        </>
      )}
      {result.type === "company" && (
        <span className="ml-auto text-xs text-txt-tertiary">
          {e?.ie_product_count > 0 && `IE: ${e.ie_product_count}`}
          {e?.ie_product_count > 0 &&
            e?.fr_product_count > 0 &&
            " · "}
          {e?.fr_product_count > 0 && `FR: ${e.fr_product_count}`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no dependency)
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg
      className="w-4 h-4 text-txt-tertiary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
      />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.3 24.3 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M5 14.5l-1.43 5.14a1.5 1.5 0 001.45 1.86h13.96a1.5 1.5 0 001.45-1.86L19 14.5"
      />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}
