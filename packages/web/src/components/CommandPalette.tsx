import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isToolUIPart, getToolName } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SearchResult } from "~/lib/types";
import {
  serverPaletteSearch,
  serverGetSubstanceProfile,
} from "../lib/server-fns";
import { usePalette } from "~/hooks/usePalette";

/* ─────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────── */
const CSS = `
@property --snake-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes snake-spin { to { --snake-angle: 360deg; } }
@keyframes pill-in {
  0%   { opacity:0; transform:translateY(-8px) scale(0.97); }
  100% { opacity:1; transform:translateY(0)    scale(1);    }
}
@keyframes spin-arc { to { transform: rotate(360deg); } }

/* ── desktop pill wrapper ── */
.rb-wrap { position:relative; }
.rb-wrap::before {
  content:''; position:absolute; inset:-2px; border-radius:28px;
  background: conic-gradient(
    from var(--snake-angle,0deg) at 50% 26px,
    transparent 0deg, transparent 278deg,
    rgba(22,163,74,0) 292deg, rgba(74,222,128,.8) 310deg,
    rgba(167,243,208,1) 326deg, rgba(74,222,128,.8) 342deg,
    rgba(22,163,74,0) 356deg, transparent 360deg
  );
  z-index:0; opacity:0; pointer-events:none; transition:opacity .3s ease;
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude; padding:2px;
}
.rb-wrap.drawer-open::before { border-radius:28px 28px 16px 16px; }
.rb-wrap.snake::before { opacity:1; animation:snake-spin 2s linear infinite; }
.rb-wrap.snake { filter:drop-shadow(0 0 7px rgba(74,222,128,.18)); }

/* ── desktop pill ── */
.rb-pill {
  position:relative; z-index:2;
  display:flex; align-items:center; gap:10px;
  height:52px; padding:0 18px;
  background:rgba(250,250,250,.88); backdrop-filter:blur(40px) saturate(180%);
  border-radius:26px; border:.5px solid rgba(255,255,255,.6);
  box-shadow:0 2px 12px rgba(0,0,0,.12),0 8px 32px rgba(0,0,0,.08);
  transition:border-radius .2s ease; animation:pill-in .18s ease forwards;
}
.rb-pill.open { border-radius:26px 26px 0 0; }

/* ── desktop drawer ── */
.rb-drawer {
  position:relative; z-index:1; overflow:hidden;
  background:rgba(252,252,252,.97); backdrop-filter:blur(40px) saturate(180%);
  border:.5px solid rgba(255,255,255,.6); border-top:none;
  border-radius:0 0 16px 16px;
  box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);
  max-height:0; opacity:0;
  transition:max-height .26s cubic-bezier(.4,0,.2,1), opacity .08s ease;
}
.rb-drawer.open {
  max-height:480px; opacity:1;
  transition:max-height .28s cubic-bezier(0,0,.2,1), opacity .12s ease;
}

/* ── mobile upward drawer ── */
.rb-drawer-up {
  overflow:hidden;
  background:rgba(252,252,252,.97); backdrop-filter:blur(20px);
  border:.5px solid rgba(255,255,255,.6); border-bottom:none;
  border-radius:16px 16px 0 0;
  box-shadow:0 -6px 24px rgba(0,0,0,.10);
  max-height:0; opacity:0;
  transition:max-height .26s cubic-bezier(.4,0,.2,1), opacity .08s ease;
}
.rb-drawer-up.open {
  max-height:60vh; opacity:1;
  transition:max-height .28s cubic-bezier(0,0,.2,1), opacity .12s ease;
}

/* ── mobile bottom area ── */
.rb-mob-wrap {
  position:relative; flex-shrink:0;
  padding:0 12px 28px;
  background:rgba(242,242,242,.96); backdrop-filter:blur(16px);
  border-top:.5px solid rgba(0,0,0,.10);
}
.rb-mob-wrap::before {
  content:''; position:absolute;
  top:2px; left:10px; right:10px; bottom:24px; border-radius:50px;
  background: conic-gradient(
    from var(--snake-angle,0deg) at 50% 50%,
    transparent 0deg, transparent 278deg,
    rgba(22,163,74,0) 292deg, rgba(74,222,128,.8) 310deg,
    rgba(167,243,208,1) 326deg, rgba(74,222,128,.8) 342deg,
    rgba(22,163,74,0) 356deg, transparent 360deg
  );
  z-index:0; opacity:0; pointer-events:none; transition:opacity .3s ease;
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude; padding:2px;
}
.rb-mob-wrap.snake::before { opacity:1; animation:snake-spin 2s linear infinite; }
.rb-mob-wrap.snake { filter:drop-shadow(0 0 5px rgba(74,222,128,.18)); }

/* ── mobile pill ── */
.rb-mob-pill {
  position:relative; z-index:1;
  display:flex; align-items:center; gap:10px;
  height:46px; padding:0 16px; background:white;
  border-radius:50px; border:.5px solid rgba(0,0,0,.14);
  transition:border-color .2s;
}
.rb-mob-pill.ai { border-color:rgba(22,163,74,.4); }

/* ── stop button ── */
.rb-stop {
  width:26px; height:26px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; flex-shrink:0; position:relative;
  background:transparent; border:none; padding:0;
}
.rb-stop-arc {
  position:absolute; inset:0; border-radius:50%;
  border:2px solid transparent;
  border-top-color:#16a34a; border-right-color:#16a34a;
  animation:spin-arc .8s linear infinite;
}
.rb-stop-sq { width:7px; height:7px; border-radius:1.5px; background:#16a34a; }
.rb-stop.idle .rb-stop-arc { display:none; }
.rb-stop.idle .rb-stop-sq  { background:#ddd; cursor:default; }

/* ── follow-up chip ── */
.rb-fu-chip {
  display:inline-flex; align-items:center; gap:5px;
  font-size:12px; color:#16a34a;
  border:.5px solid rgba(22,163,74,.35); border-radius:20px;
  padding:5px 12px; cursor:pointer;
  background:rgba(22,163,74,.06); margin:0 12px 6px;
  transition:all .25s ease;
}
.rb-fu-chip:hover { background:rgba(22,163,74,.12); }
.rb-fu-chip-alt {
  color:#888; border-color:rgba(0,0,0,.15);
  background:rgba(0,0,0,.04);
}
.rb-fu-chip-alt:hover { background:rgba(0,0,0,.08); color:#555; }

/* ── shared rows ── */
.rb-row {
  display:flex; align-items:center; gap:10px;
  padding:8px 18px; cursor:pointer;
  border-left:2px solid transparent; transition:background .1s;
}
.rb-row:hover,.rb-row[data-hi=true] { background:rgba(22,163,74,.06); border-left-color:rgba(22,163,74,.45); }
.rb-mob-row {
  display:flex; align-items:center; gap:10px;
  padding:10px 16px; cursor:pointer;
  border-bottom:.5px solid rgba(0,0,0,.06); transition:background .1s;
}
.rb-mob-row:last-child { border-bottom:none; }
.rb-mob-row[data-hi=true] { background:rgba(22,163,74,.05); }
.rb-icon { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
.rb-icon-s { background:rgba(22,163,74,.12);  color:#16a34a; }
.rb-icon-p { background:rgba(59,130,246,.12); color:#2563eb; }
.rb-icon-c { background:rgba(124,58,237,.12); color:#7c3aed; }
.rb-section { font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:#aaa; padding:8px 18px 4px; }
.rb-divider { height:.5px; background:rgba(0,0,0,.07); }
.rb-ai-hint { display:flex; align-items:center; gap:6px; padding:10px 18px; background:rgba(22,163,74,.05); border-top:.5px solid rgba(22,163,74,.12); font-size:12px; color:#16a34a; }
.rb-footer { display:flex; align-items:center; justify-content:center; gap:16px; padding:7px 18px; border-top:.5px solid rgba(0,0,0,.07); font-size:11px; color:#bbb; }
.rb-kbd { display:inline-block; background:rgba(0,0,0,.06); border:.5px solid rgba(0,0,0,.14); border-radius:4px; padding:1px 5px; font-size:10px; font-family:monospace; margin-right:2px; }

/* mobile prose */
.rb-mob-prose p     { font-size:13px; line-height:1.7; color:#111; margin-bottom:10px; }
.rb-mob-prose strong { font-weight:600; }
.rb-mob-prose h3    { font-size:14px; font-weight:600; margin:10px 0 3px; }
.rb-mob-prose table { width:100%; border-collapse:collapse; margin:10px 0 16px; font-size:12px; }
.rb-mob-prose th    { font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:#999; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.1); text-align:left; }
.rb-mob-prose td    { padding:7px 8px; border-bottom:.5px solid rgba(0,0,0,.06); color:#111; }
.rb-mob-prose a     { color:#16a34a; }
.rb-mob-prose ul,.rb-mob-prose ol { padding-left:18px; margin-bottom:8px; font-size:13px; }
.rb-mob-prose code  { font-size:11px; font-family:monospace; background:rgba(0,0,0,.04); padding:1px 3px; border-radius:3px; }
`;

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */
const QUESTION_RE =
  /^(what|which|how|compare|find|show|is|can|does|are|list|analyse|analyze|check|tell|who|where|why|should|could|would|give|summarize|summarise|explain|describe)/i;

function isQuestion(q: string): boolean {
  const t = q.trim();
  if (t.length < 5) return false;
  if (/^\d{1,7}-\d{2}-\d$/.test(t)) return false;
  if (/^\d{4,7}$/.test(t)) return false;
  if (t.endsWith("?")) return true;
  if (QUESTION_RE.test(t)) return true;
  if (t.length > 40) return true;
  return false;
}

/* ─────────────────────────────────────────────
   PROPS
   ───────────────────────────────────────────── */
interface Props {
  open: boolean;
  onClose: () => void;
  onAiSubmit: () => void; /* tells root to show the AI layer */
}

/* ─────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────── */
export function CommandPalette({ open, onClose, onAiSubmit }: Props) {
  /* ── read AI state from context (no useChat here) ── */
  const {
    messages,
    sendMessage,
    stop,
    status,
    setMessages,
    hasChat,
    isBusy,
  } = usePalette();

  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobInputRef = useRef<HTMLInputElement>(null);
  const drawerUpRef = useRef<HTMLDivElement>(null);
  const mobChatRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /* mobile-specific state: "new" = default (typing clears on submit), "followup" = appends */
  const [mobMode, setMobMode] = useState<"new" | "followup">("new");

  const mode = useMemo(
    () => (isQuestion(query) ? "llm" : "lookup"),
    [query],
  );
  const isLlmMode = mode === "llm" || hasChat;
  const snakeOn =
    (mode === "llm" && !hasChat && query.trim().length >= 5) ||
    mobMode === "followup";
  const drawerOn =
    (mode === "lookup" &&
      mobMode !== "followup" &&
      query.length >= 2) ||
    (mode === "llm" && !hasChat && query.trim().length >= 5);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (mode !== "lookup" || mobMode === "followup") return;
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query, mode, mobMode]);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>(
    {
      queryKey: ["search", debouncedQuery],
      queryFn: () =>
        serverPaletteSearch({
          data: { query: debouncedQuery, limit: 20 },
        }),
      enabled:
        mode === "lookup" &&
        mobMode !== "followup" &&
        debouncedQuery.length >= 2,
      staleTime: 1000 * 60 * 2,
    },
  );

  /* reset on open — desktop only; mobile stays open */
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      /* do NOT reset messages here — context holds them */
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setHighlightIdx(0), [results]);

  /* scroll mobile drawer-up to visual bottom (best match) — column-reverse means scrollTop=0 is the bottom */
  useEffect(() => {
    if (results.length > 0 && drawerUpRef.current) {
      drawerUpRef.current.scrollTop = 0;
    }
  }, [results]);

  /* scroll mobile chat to bottom on new messages */
  useEffect(() => {
    if (mobChatRef.current)
      mobChatRef.current.scrollTop = mobChatRef.current.scrollHeight;
  }, [messages]);

  /* prefetch on highlight */
  useEffect(() => {
    if (mode !== "lookup" || !results[highlightIdx]) return;
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
  }, [highlightIdx, results, queryClient, mode]);

  const selectResult = useCallback(
    (r: SearchResult) => {
      onClose();
      if (r.type === "substance")
        navigate({
          to: "/substances/$identifier",
          params: { identifier: r.entity.name },
        });
      else if (r.type === "product")
        navigate({
          to: "/products/$country/$id",
          params: {
            country: (r.entity.country || "ie").toLowerCase(),
            id: r.entity.identifier,
          },
        });
      else if (r.type === "company")
        navigate({
          to: "/companies/$name",
          params: { name: r.entity.company_name },
        });
    },
    [navigate, onClose],
  );

  /* desktop submit */
  const handleDesktopSubmit = useCallback(() => {
    if (!isLlmMode && results[highlightIdx]) {
      selectResult(results[highlightIdx]);
    } else if (
      isLlmMode &&
      query.trim().length >= 5 &&
      status === "ready"
    ) {
      setMessages([]); /* always fresh from the palette */
      sendMessage({ text: query.trim() });
      setQuery("");
      onAiSubmit();
    }
  }, [
    isLlmMode,
    results,
    highlightIdx,
    selectResult,
    query,
    sendMessage,
    setMessages,
    status,
    onAiSubmit,
  ]);

  const handleMobSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;

    /* followup mode — everything goes to AI, no lookup */
    if (mobMode === "followup") {
      if (status !== "ready") return;
      sendMessage({ text: q });
      setQuery("");
      setMobMode("new");
      return;
    }

    /* default "new" mode */
    if (mode === "lookup" && results[highlightIdx]) {
      setMessages([]);
      selectResult(results[highlightIdx]);
      return;
    }
    if (mode === "llm" && q.length >= 5 && status === "ready") {
      setMessages([]);
      sendMessage({ text: q });
      setQuery("");
    }
  }, [
    mode,
    mobMode,
    results,
    highlightIdx,
    selectResult,
    query,
    status,
    sendMessage,
    setMessages,
  ]);

  /* keyboard */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!isLlmMode) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleDesktopSubmit();
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleDesktopSubmit();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    open,
    isLlmMode,
    results,
    highlightIdx,
    handleDesktopSubmit,
    onClose,
  ]);

  const handleLinkClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLAnchorElement;
      if (
        t.tagName === "A" &&
        t.getAttribute("href")?.startsWith("/")
      ) {
        e.preventDefault();
        onClose();
        navigate({ to: t.getAttribute("href")! });
      }
    },
    [navigate, onClose],
  );

  /* chip toggle: "Ask a follow-up" ↔ "New question" */
  function handleChipTap() {
    if (mobMode === "new") {
      setMobMode("followup");
      mobInputRef.current?.focus();
    } else {
      /* switch back to new mode — do NOT clear messages */
      setMobMode("new");
    }
  }

  if (!open) return null;

  return (
    <>
      <style>{CSS}</style>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[4px]"
        onClick={onClose}
      />

      {/* ══════════════ DESKTOP ══════════════ */}
      <div
        className="hidden sm:block fixed z-50"
        style={{
          top: 100,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(640px, calc(100vw - 48px))",
        }}
      >
        <div
          className={`rb-wrap${snakeOn ? " snake" : ""}${drawerOn ? " drawer-open" : ""}`}
        >
          <div className={`rb-pill${drawerOn ? " open" : ""}`}>
            <span
              style={{
                flexShrink: 0,
                lineHeight: 1,
                color: snakeOn ? "#16a34a" : "#aaa",
                transition: "color .18s",
              }}
            >
              {snakeOn ? <SparkleIcon /> : <SearchIcon />}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isLlmMode
                  ? "Ask a regulatory question…"
                  : "Search substances, products, companies…"
              }
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontSize: 16,
                outline: "none",
                fontFamily: "inherit",
                color: "#111",
                letterSpacing: "-0.1px",
              }}
            />
            {snakeOn && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "rgba(22,163,74,.10)",
                  color: "#16a34a",
                  border: ".5px solid rgba(22,163,74,.30)",
                  flexShrink: 0,
                }}
              >
                AI
              </span>
            )}
            <span
              style={{ fontSize: 11, color: "#ccc", flexShrink: 0 }}
            >
              esc
            </span>
          </div>

          <div className={`rb-drawer${drawerOn ? " open" : ""}`}>
            {mode === "lookup" && debouncedQuery.length >= 2 && (
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {isFetching && results.length === 0 && (
                  <Empty>Searching…</Empty>
                )}
                {!isFetching && results.length === 0 && (
                  <Empty>No results for "{debouncedQuery}"</Empty>
                )}
                {results.map((r, i) => (
                  <PaletteRow
                    key={`${r.type}-${r.entity?.name ?? i}`}
                    result={r}
                    highlighted={i === highlightIdx}
                    onSelect={() => selectResult(r)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    mobile={false}
                  />
                ))}
              </div>
            )}
            {snakeOn && (
              <div className="rb-ai-hint">
                <span style={{ fontSize: 14 }}>✦</span>
                <span>
                  Press{" "}
                  <span
                    style={{
                      background: "rgba(22,163,74,.12)",
                      padding: "1px 5px",
                      borderRadius: 4,
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    ↵ Enter
                  </span>{" "}
                  to ask RegBridge AI
                </span>
              </div>
            )}
            <div className="rb-footer">
              {isLlmMode ? (
                <>
                  <span>
                    <span className="rb-kbd">↵</span>ask
                  </span>
                  <span>
                    <span className="rb-kbd">esc</span>close
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <span className="rb-kbd">↑</span>
                    <span className="rb-kbd">↓</span>navigate
                  </span>
                  <span>
                    <span className="rb-kbd">↵</span>select
                  </span>
                  <span>
                    <span className="rb-kbd">esc</span>close
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ MOBILE ══════════════ */}
      <div
        className="sm:hidden fixed inset-0 z-50 flex flex-col"
        style={{
          background: "rgba(245,245,245,.97)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* scrollable area: chat OR empty hint */}
        <div
          ref={mobChatRef}
          onClick={handleLinkClick}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 16px 8px",
          }}
        >
          {hasChat && (
            <MobChatStream messages={messages} isBusy={isBusy} />
          )}
          {!hasChat && !query && (
            <div
              style={{
                paddingTop: 60,
                textAlign: "center",
                fontSize: 13,
                color: "#bbb",
              }}
            >
              Type to search substances, products, companies
            </div>
          )}
          {snakeOn && !hasChat && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 16px",
                marginTop: 16,
                background: "rgba(22,163,74,.06)",
                borderRadius: 12,
                border: ".5px solid rgba(22,163,74,.15)",
                fontSize: 13,
                color: "#16a34a",
              }}
            >
              <span>✦</span>
              <span>
                Press <strong>Enter</strong> to ask RegBridge AI
              </span>
            </div>
          )}
        </div>

        {/* two-state chip: shown only when AI has answered and not busy */}
        {hasChat && !isBusy && (
          <button
            className={
              mobMode === "new"
                ? "rb-fu-chip"
                : "rb-fu-chip rb-fu-chip-alt"
            }
            onClick={handleChipTap}
          >
            {mobMode === "new" ? (
              <>
                <span>↑</span>
                <span>Ask a follow-up</span>
              </>
            ) : (
              <>
                <span>⌘</span>
                <span>New question</span>
              </>
            )}
          </button>
        )}

        {/* upward drawer for lookup results */}
        <div
          className={`rb-drawer-up${drawerOn && mode === "lookup" ? " open" : ""}`}
        >
          {/* column-reverse: DOM order matches original array (index 0 = best match)
              but renders visually bottom-up so best match sits closest to pill.
              highlightIdx and keyboard nav work without any inversion. */}
          <div
            ref={drawerUpRef}
            style={{
              maxHeight: "55vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column-reverse",
            }}
          >
            {isFetching && results.length === 0 && (
              <Empty>Searching…</Empty>
            )}
            {!isFetching &&
              debouncedQuery.length >= 2 &&
              results.length === 0 && (
                <Empty>No results for "{debouncedQuery}"</Empty>
              )}
            {results.map((r, i) => (
              <PaletteRow
                key={`mob-${r.type}-${r.entity?.name ?? i}`}
                result={r}
                highlighted={i === highlightIdx}
                onSelect={() => selectResult(r)}
                onMouseEnter={() => setHighlightIdx(i)}
                mobile
              />
            ))}
          </div>
        </div>

        {/* mobile pill — always at bottom */}
        <div className={`rb-mob-wrap${snakeOn ? " snake" : ""}`}>
          <div className={`rb-mob-pill${snakeOn ? " ai" : ""}`}>
            <span
              style={{
                flexShrink: 0,
                lineHeight: 1,
                color:
                  snakeOn || mobMode !== "new" ? "#16a34a" : "#aaa",
                transition: "color .18s",
              }}
            >
              {snakeOn || mobMode !== "new" ? (
                <SparkleIcon size={16} />
              ) : (
                <SearchIcon size={16} />
              )}
            </span>
            <input
              ref={mobInputRef}
              type="text"
              value={query}
              disabled={isBusy}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleMobSubmit();
                }
              }}
              placeholder={
                mobMode === "followup"
                  ? "Ask a follow-up…"
                  : "Search substances, products, companies…"
              }
              autoFocus
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontSize: 15,
                outline: "none",
                fontFamily: "inherit",
                color: isBusy ? "#aaa" : "#111",
                transition: "color .2s",
              }}
            />
            {/* Stop button while busy, AI badge when idle with chat */}
            {isBusy ? (
              <button
                className="rb-stop"
                onClick={stop}
                title="Stop generation"
                aria-label="Stop generation"
              >
                <span className="rb-stop-arc" />
                <span className="rb-stop-sq" />
              </button>
            ) : snakeOn || hasChat ? (
              <button
                className="rb-stop idle"
                aria-label="Generation complete"
                title="Done"
              >
                <span className="rb-stop-sq" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── mobile chat stream ── */
function MobChatStream({
  messages,
  isBusy,
}: {
  messages: any[];
  isBusy: boolean;
}) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === "user" && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  background: "rgba(22,163,74,.10)",
                  color: "#16a34a",
                  fontSize: 13,
                  padding: "8px 12px",
                  borderRadius: 12,
                  maxWidth: "85%",
                }}
              >
                {msg.parts
                  .filter((p: any) => p.type === "text")
                  .map((p: any, i: number) => (
                    <span key={i}>{p.text}</span>
                  ))}
              </div>
            </div>
          )}
          {msg.role === "assistant" && (
            <div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginBottom: 10,
                }}
              >
                {msg.parts
                  ?.filter(isToolUIPart)
                  .map((part: any, i: number) => {
                    const isDone = part.state === "output-available";
                    const isRunning =
                      part.state === "input-streaming" ||
                      part.state === "input-available";
                    return (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: isDone
                            ? "rgba(22,163,74,.10)"
                            : "rgba(245,158,11,.10)",
                          color: isDone ? "#16a34a" : "#b45309",
                          border: `.5px solid ${isDone ? "rgba(22,163,74,.25)" : "rgba(245,158,11,.25)"}`,
                        }}
                      >
                        {isDone ? (
                          "✓ "
                        ) : (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#d97706",
                              display: "inline-block",
                              marginRight: 4,
                            }}
                          />
                        )}
                        {getToolName(part)}
                      </span>
                    );
                  })}
              </div>
              <div className="rb-mob-prose">
                {msg.parts
                  ?.filter((p: any) => p.type === "text" && p.text)
                  .map((p: any, i: number) => (
                    <ReactMarkdown
                      key={i}
                      remarkPlugins={[remarkGfm]}
                    >
                      {p.text}
                    </ReactMarkdown>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {isBusy &&
        !messages.some(
          (m) =>
            m.role === "assistant" &&
            m.parts?.some((p: any) => p.type === "text"),
        ) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 0",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#16a34a",
              }}
              className="animate-pulse"
            />
            <span style={{ fontSize: 13, color: "#666" }}>
              Analysing…
            </span>
          </div>
        )}
    </div>
  );
}

/* ── result row (shared desktop + mobile) ── */
function PaletteRow({
  result,
  highlighted,
  onSelect,
  onMouseEnter,
  mobile,
}: {
  result: SearchResult;
  highlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  mobile: boolean;
}) {
  const e = result.entity;
  const iconClass =
    result.type === "substance"
      ? "rb-icon-s"
      : result.type === "product"
        ? "rb-icon-p"
        : "rb-icon-c";
  const label =
    e?.name ?? e?.product_name ?? e?.company_name ?? "Unknown";
  const sub =
    result.type === "substance" && e?.cas_number
      ? `CAS ${e.cas_number}`
      : result.type === "product"
        ? `${e?.country === "ie" ? "🇮🇪 " : e?.country === "fr" ? "🇫🇷 " : ""}${e?.pcs_number ?? e?.amm_number ?? ""}`
        : [
            e?.ie_product_count > 0 && `IE: ${e.ie_product_count}`,
            e?.fr_product_count > 0 && `FR: ${e.fr_product_count}`,
          ]
            .filter(Boolean)
            .join(" · ");

  return (
    <div
      className={mobile ? "rb-mob-row" : "rb-row"}
      data-hi={highlighted}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <div
        className={`rb-icon ${iconClass}`}
        style={mobile ? { width: 26, height: 26, fontSize: 12 } : {}}
      >
        {result.type === "substance" && <FlaskIcon />}
        {result.type === "product" && <PackageIcon />}
        {result.type === "company" && <BuildingIcon />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: mobile ? 13 : 14,
            fontWeight: 500,
            color: "#111",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        fontSize: 13,
        color: "#bbb",
      }}
    >
      {children}
    </div>
  );
}

/* ── icons ── */
function SearchIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
function SparkleIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    </svg>
  );
}
function FlaskIcon() {
  return (
    <svg
      width={14}
      height={14}
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
      width={14}
      height={14}
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
      width={14}
      height={14}
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
