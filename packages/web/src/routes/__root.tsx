import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { isToolUIPart, getToolName } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError } from "~/lib/types";
import { CommandPalette } from "~/components/CommandPalette";
import { PaletteProvider, usePalette } from "~/hooks/usePalette";
import appCss from "~/styles/app.css?url";

/* ─── injected styles for omnibar + answer panel ─── */
const ROOT_CSS = `
@keyframes omnibar-in {
  0%   { transform: translateY(-110%); }
  100% { transform: translateY(0); }
}
@keyframes spin-arc {
  to { transform: rotate(360deg); }
}
.rb-omnibar {
  position: fixed; top: 48px; left: 0; right: 0; z-index: 40;
  background: rgba(245,245,245,0.95);
  backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(0,0,0,0.10);
  animation: omnibar-in 0.25s cubic-bezier(0.4,0,0.2,1) forwards;
}
.rb-omnibar-inner {
  max-width: 80rem; /* matches max-w-7xl from nav */
  margin: 0 auto;
  display: flex; align-items: center; gap: 10px;
  padding: 9px 20px;
}
.rb-omnibar-input {
  flex: 1; border: none; background: transparent;
  font-size: 15px; color: #111; outline: none;
  font-family: inherit;
}
.rb-omnibar-input::placeholder { color: #bbb; }
.rb-stop-btn {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; position: relative;
  background: transparent; border: none; padding: 0;
  transition: background 0.15s ease, color 0.15s ease;
  color: #16a34a;
}
.rb-stop-btn.send-on {
  background: #16a34a;
  color: #fff;
}
.rb-stop-btn.send-off {
  color: #c4c4c4;
  cursor: default;
}
.rb-stop-arc {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #16a34a;
  border-right-color: #16a34a;
  animation: spin-arc 0.8s linear infinite;
}
.rb-stop-sq {
  width: 8px; height: 8px; border-radius: 2px;
  background: #16a34a; flex-shrink: 0;
}
.rb-answer-panel {
  position: fixed; top: 96px; left: 0; right: 0; bottom: 0;
  overflow-y: auto; z-index: 35;
  background: #f5f5f5;
}
.rb-answer-inner {
  max-width: 680px; margin: 0 auto;
  padding: 28px 24px 120px;
}
.rb-tool-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 18px; }
.rb-tool-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-family: monospace; padding: 2px 8px;
  border-radius: 20px;
}
.rb-tool-done    { background: rgba(22,163,74,0.10); color: #16a34a; border: 0.5px solid rgba(22,163,74,0.25); }
.rb-tool-running { background: rgba(245,158,11,0.10); color: #b45309; border: 0.5px solid rgba(245,158,11,0.25); }
.rb-ai-prose p         { font-size: 14px; line-height: 1.75; color: #111; margin-bottom: 12px; }
.rb-ai-prose strong    { font-weight: 600; }
.rb-ai-prose h3        { font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
.rb-ai-prose table     { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 13px; }
.rb-ai-prose th        { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #999; padding: 7px 10px; border-bottom: 1.5px solid rgba(0,0,0,0.12); text-align: left; }
.rb-ai-prose td        { padding: 8px 10px; border-bottom: 0.5px solid rgba(0,0,0,0.07); color: #111; }
.rb-ai-prose tr:last-child td { border-bottom: none; }
.rb-ai-prose a         { color: #16a34a; text-decoration: none; }
.rb-ai-prose ul        { padding-left: 20px; margin-bottom: 10px; font-size: 14px; }
.rb-ai-prose ol        { padding-left: 20px; margin-bottom: 10px; font-size: 14px; }
.rb-ai-prose code      { font-size: 12px; font-family: monospace; background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 4px; }
.rb-ai-prose pre       { background: rgba(0,0,0,0.04); border-radius: 8px; padding: 10px 14px; overflow-x: auto; margin: 8px 0; }
.rb-user-bubble {
  display: flex; justify-content: flex-end; margin-bottom: 16px;
}
.rb-user-bubble-inner {
  background: rgba(22,163,74,0.10); color: #16a34a;
  font-size: 14px; padding: 8px 14px; border-radius: 12px;
  max-width: 85%;
}

/* ── thinking indicator ── */
@keyframes thinking-dot {
  0%, 100% { transform: scale(1);   opacity: 1; }
  50%       { transform: scale(1.5); opacity: 0.6; }
}
.rb-thinking {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 0 10px;
}
.rb-thinking-dots { display: flex; gap: 4px; flex-shrink: 0; }
.rb-thinking-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #16a34a;
  animation: thinking-dot 1.2s ease-in-out infinite;
}
.rb-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.rb-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
.rb-thinking-msg {
  font-size: 13px; color: #888; font-style: italic;
  transition: opacity 0.28s ease, transform 0.28s ease;
}
`;

/* ─── Query client ─── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status === 404)
          return false;
        return count < 3;
      },
    },
  },
});

/* ─── Route ─── */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "LS — Regulatory Intelligence" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <p className="text-lg font-medium text-txt-primary mb-2">
        Page not found
      </p>
      <a href="/" className="text-sm text-brand hover:underline">
        ← Home
      </a>
    </div>
  ),
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <PaletteProvider>
        <RootInner />
      </PaletteProvider>
    </QueryClientProvider>
  );
}

function RootInner() {
  const { open, setOpen, aiMode, setAiMode, resetAi } = usePalette();

  /* ⌘K / Ctrl+K global listener */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        /* if in AI answer mode, open palette on top (lookup) without resetting */
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        if (open) setOpen(false);
        /* Esc does NOT reset aiMode — user must use "New search" */
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  return (
    <RootDocument>
      <style>{ROOT_CSS}</style>
      <TopBar />

      {/* Desktop AI answer layer — only shown when aiMode is true */}
      {aiMode && (
        <DesktopAiLayer
          onNewSearch={() => {
            resetAi();
            setOpen(true);
          }}
        />
      )}

      {/* Mobile bottom search bar clearance */}
      <div className="pb-[88px] sm:pb-0">
        <Outlet />
      </div>
      <FloatingFooter />

      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        onAiSubmit={() => {
          setOpen(false);
          setAiMode(true);
        }}
      />
    </RootDocument>
  );
}

/* ─── Desktop omnibar + answer panel ─── */
function DesktopAiLayer({
  onNewSearch,
}: {
  onNewSearch: () => void;
}) {
  const { messages, sendMessage, stop, status, isBusy } =
    usePalette();
  const [followUp, setFollowUp] = useState("");
  const answerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* scroll to bottom as messages stream */
  useEffect(() => {
    if (answerRef.current)
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [messages]);

  function handleFollowUp(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey || !followUp.trim() || isBusy)
      return;
    sendMessage({ text: followUp.trim() });
    setFollowUp("");
  }

  function submitFollowUp() {
    if (!followUp.trim() || isBusy) return;
    sendMessage({ text: followUp.trim() });
    setFollowUp("");
  }

  const canSendFollowUp =
    !isBusy && status === "ready" && followUp.trim().length > 0;

  function handleLinkClick(e: React.MouseEvent) {
    const t = e.target as HTMLAnchorElement;
    if (
      t.tagName === "A" &&
      t.getAttribute("href")?.startsWith("/")
    ) {
      e.preventDefault();
      navigate({ to: t.getAttribute("href")! });
    }
  }

  return (
    <>
      {/* Omnibar */}
      <div className="rb-omnibar hidden sm:block">
        <div className="rb-omnibar-inner">
          <span
            style={{ fontSize: 14, color: "#16a34a", flexShrink: 0 }}
          >
            ✦
          </span>
          <input
            className="rb-omnibar-input"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={handleFollowUp}
            placeholder="Ask a follow-up…"
            disabled={isBusy}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 20,
              background: "rgba(22,163,74,0.10)",
              color: "#16a34a",
              border: "0.5px solid rgba(22,163,74,0.30)",
              flexShrink: 0,
            }}
          >
            AI
          </span>

          {/* Send when typing · stop while streaming · disabled send when idle */}
          {isBusy ? (
            <button
              className="rb-stop-btn"
              onClick={() => {
                void stop();
              }}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <span className="rb-stop-arc" />
              <span className="rb-stop-sq" />
            </button>
          ) : (
            <button
              className={`rb-stop-btn ${canSendFollowUp ? "send-on" : "send-off"}`}
              onClick={canSendFollowUp ? submitFollowUp : undefined}
              disabled={!canSendFollowUp}
              title="Send"
              aria-label={
                canSendFollowUp ? "Send" : "Send (disabled)"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
              </svg>
            </button>
          )}

          <button
            onClick={onNewSearch}
            style={{
              fontSize: 12,
              color: "#999",
              border: "0.5px solid rgba(0,0,0,0.14)",
              borderRadius: 6,
              padding: "3px 10px",
              background: "transparent",
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            New search ⌘K
          </button>
        </div>
      </div>

      {/* Answer panel */}
      <div
        className="rb-answer-panel hidden sm:block"
        ref={answerRef}
        onClick={handleLinkClick}
      >
        <div className="rb-answer-inner">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" && (
                <div className="rb-user-bubble">
                  <div className="rb-user-bubble-inner">
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
                  <div className="rb-tool-pills">
                    {msg.parts
                      ?.filter(isToolUIPart)
                      .map((part: any, i: number) => {
                        const isDone =
                          part.state === "output-available";
                        const isRunning =
                          part.state === "input-streaming" ||
                          part.state === "input-available";
                        return (
                          <span
                            key={i}
                            className={`rb-tool-pill ${isDone ? "rb-tool-done" : ""} ${isRunning ? "rb-tool-running" : ""}`}
                          >
                            {isDone && "✓ "}
                            {isRunning && (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: "#d97706",
                                  display: "inline-block",
                                }}
                              />
                            )}
                            {getToolName(part)}
                          </span>
                        );
                      })}
                  </div>
                  <div className="rb-ai-prose">
                    {msg.parts
                      ?.filter(
                        (p: any) => p.type === "text" && p.text,
                      )
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

          {/* Thinking indicator */}
          {isBusy && <DesktopThinkingIndicator />}
        </div>
      </div>
    </>
  );
}

/* ── desktop thinking indicator ── */
const THINKING_MSGS = [
  "Querying regulatory database…",
  "Cross-referencing IE product registrations…",
  "Checking EU approval status…",
  "Scanning 480K+ MRL entries…",
  "Analysing substance data…",
  "Computing market coverage…",
  "Reviewing EFSA toxicology records…",
  "Checking expiry timelines…",
  "Mapping IE & FR product registrations…",
  "Aggregating cross-market data…",
];

function DesktopThinkingIndicator() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % THINKING_MSGS.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => clearInterval(cycle);
  }, []);

  return (
    <div className="rb-thinking">
      <div className="rb-thinking-dots">
        <div className="rb-thinking-dot" />
        <div className="rb-thinking-dot" />
        <div className="rb-thinking-dot" />
      </div>
      <span
        className="rb-thinking-msg"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-3px)",
        }}
      >
        {THINKING_MSGS[idx]}
      </span>
    </div>
  );
}

function RootDocument({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/* ─── Top bar ─── */
function TopBar() {
  const { setOpen } = usePalette();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-card">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-2.5">
        <Link
          to="/"
          className="text-brand font-bold text-lg tracking-tight"
        >
          LS
        </Link>
        {/* Desktop only — mobile uses the always-on bottom search bar */}
        <button
          onClick={() => setOpen(true)}
          className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-1.5 text-txt-tertiary hover:text-txt-secondary transition-colors text-sm"
          aria-label="Open search"
        >
          <kbd className="kbd">Ctrl</kbd>
          <span className="text-txt-tertiary">/</span>
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
        </button>
        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm">
          <Link
            to="/"
            activeProps={{ className: "text-brand font-medium" }}
            inactiveProps={{
              className: "text-txt-secondary hover:text-txt-primary",
            }}
          >
            Explorer
          </Link>
          <Link
            to="/mcp"
            activeProps={{ className: "text-brand font-medium" }}
            inactiveProps={{
              className: "text-txt-secondary hover:text-txt-primary",
            }}
          >
            MCP
          </Link>
          <Link
            to="/architecture"
            activeProps={{ className: "text-brand font-medium" }}
            inactiveProps={{
              className:
                "text-txt-secondary hover:text-txt-primary whitespace-nowrap",
            }}
          >
            Architecture
          </Link>
        </nav>
      </div>
    </header>
  );
}

function FloatingFooter() {
  return (
    <div className="hidden lg:block fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <span className="flex items-center gap-1 text-xs text-txt-tertiary">
        <kbd className="kbd">Ctrl</kbd>
        <span>/</span>
        <kbd className="kbd">⌘</kbd>
        <kbd className="kbd">K</kbd>
        <span className="ml-1">to search</span>
      </span>
    </div>
  );
}
