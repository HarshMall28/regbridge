import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "~/lib/api";
import { CommandPalette } from "~/components/CommandPalette";
import appCss from "~/styles/app.css?url";
import { usePalette, PaletteContext } from "~/hooks/usePalette";

// ---------------------------------------------------------------------------
// Palette open/close context (shared across all routes)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Query client (stable across renders)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RootComponent() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K global listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PaletteContext.Provider
        value={{ open: paletteOpen, setOpen: setPaletteOpen }}
      >
        <RootDocument>
          <TopBar />
          <Outlet />
          <FloatingFooter />
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
          />
        </RootDocument>
      </PaletteContext.Provider>
    </QueryClientProvider>
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

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar() {
  const { setOpen } = usePalette();
  const [dismissed, setDismissed] = useState(false);

  return (
    <>
      {/* Mobile banner */}
      {!dismissed && (
        <div className="block lg:hidden bg-brand/10 border-b border-brand/20 px-4 py-2 text-center text-xs text-txt-secondary">
          <span>For the full ⌘K experience, open on desktop</span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-3 text-txt-tertiary hover:text-txt-primary"
          >
            ✕
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border bg-surface-card">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-2.5">
          {/* Logo */}
          <Link
            to="/"
            className="text-brand font-bold text-lg tracking-tight"
          >
            LS
          </Link>

          {/* Centered Search trigger with Ctrl/⌘ + K */}
          <button
            onClick={() => setOpen(true)}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-txt-tertiary hover:text-txt-secondary transition-colors text-sm"
          >
            {/* Search icon visible on mobile only */}
            <svg
              className="w-5 h-5 lg:hidden"
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
            {/* ⌘K hint visible on desktop only */}
            <span className="hidden lg:flex items-center gap-1">
              <kbd className="kbd">Ctrl</kbd>
              <span className="text-txt-tertiary">/</span>
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          {/* Right tabs */}
          <nav className="flex items-center gap-6 text-sm">
            <Link
              to="/"
              className="hidden sm:block text-brand font-medium"
              activeProps={{ className: "text-brand font-medium" }}
              inactiveProps={{
                className:
                  "text-txt-secondary hover:text-txt-primary",
              }}
            >
              Explorer
            </Link>
            <button className="hidden sm:block text-txt-secondary hover:text-txt-primary transition-colors">
              MCP
            </button>
            <button className="hidden sm:block text-txt-secondary hover:text-txt-primary transition-colors">
              Architecture
            </button>
          </nav>
        </div>
      </header>
    </>
  );
}

// ---------------------------------------------------------------------------
// Floating footer
// ---------------------------------------------------------------------------

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
