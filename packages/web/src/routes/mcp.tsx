// packages/web/src/routes/mcp.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useEffect, useCallback, useState } from "react";
import {
  heroHeadline,
  heroSubtitle,
  mcpEndpoint,
  videoIntro,
  youtubeVideoId,
  dailyWorkflows,
  strategicScenarios,
  tools,
  categoryLabels,
  categoryColors,
  type Scenario,
  type ToolDef,
} from "../content/mcp";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/mcp")({
  component: McpPage,
});

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function McpPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <HeroSection />
      <VideoSection />

      <div className="mx-auto max-w-4xl px-6">
        <ScenarioSection
          id="daily"
          label="Daily workflows"
          heading="From hours of cross-referencing to a single conversation."
          subtitle="Tasks your regulatory team does every week, answered by Claude in seconds."
          scenarios={dailyWorkflows}
        />

        <ScenarioSection
          id="strategic"
          label="Strategic intelligence"
          heading="The questions that drive registration decisions."
          subtitle="Market entry, competitive analysis, portfolio risk. Claude reasons across the full dataset."
          scenarios={strategicScenarios}
        />

        <ToolReferenceSection />
        <TryItSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero — dark green, full-width
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="bg-[#052E16] border-b border-[#16A34A]/20">
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4ADE80] mb-4">
          MCP Server
        </p>
        <h1 className="text-2xl md:text-4xl font-semibold text-white leading-tight max-w-2xl">
          {heroHeadline}
        </h1>
        <p className="mt-5 text-[15px] md:text-[17px] leading-relaxed text-[#A7F3D0] max-w-xl">
          {heroSubtitle}
        </p>
        <div className="mt-8 inline-flex items-center gap-2 bg-[#14532D] rounded-lg px-4 py-2.5">
          <div className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
          <code className="text-[13px] text-[#86EFAC] font-mono">
            {mcpEndpoint}
          </code>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Video — YouTube embed with pause on route change
// ---------------------------------------------------------------------------

function VideoSection() {
  const playerRef = useRef<YT.Player | null>(null);
  const iframeRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load YouTube iframe API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    (window as any).onYouTubeIframeAPIReady = () => {
      initPlayer();
    };

    return () => {
      (window as any).onYouTubeIframeAPIReady = undefined;
    };
  }, []);

  const initPlayer = useCallback(() => {
    if (!iframeRef.current || playerRef.current) return;

    playerRef.current = new YT.Player(iframeRef.current, {
      videoId: youtubeVideoId,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
    });
  }, []);

  // Pause video on route change
  useEffect(() => {
    const unsub = router.subscribe("onBeforeNavigate", () => {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        // Player not ready yet
      }
    });
    return unsub;
  }, [router]);

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <p className="text-[15px] text-[#6B7280] mb-6 max-w-xl">
        {videoIntro}
      </p>
      <div className="rounded-xl overflow-hidden border border-[#E5E7EB] shadow-sm bg-black aspect-video">
        <div ref={iframeRef} className="w-full h-full" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Scenario section — reusable for daily + strategic
// ---------------------------------------------------------------------------

function ScenarioSection({
  id,
  label,
  heading,
  subtitle,
  scenarios,
}: {
  id: string;
  label: string;
  heading: string;
  subtitle: string;
  scenarios: Scenario[];
}) {
  return (
    <section id={id} className="py-12 md:py-16">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#16A34A] mb-3">
        {label}
      </p>
      <h2 className="text-xl md:text-2xl font-semibold text-[#111827] leading-snug max-w-lg">
        {heading}
      </h2>
      <p className="mt-2 text-[15px] text-[#6B7280]">{subtitle}</p>

      <div className="mt-8 space-y-4">
        {scenarios.map((s, i) => (
          <ScenarioCard key={i} scenario={s} />
        ))}
      </div>
    </section>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 md:p-6 hover:shadow-sm transition-shadow">
      {/* Question */}
      <p className="text-[15px] font-semibold text-[#111827] leading-snug">
        "{scenario.question}"
      </p>

      {/* Tool chain */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {scenario.tools.map((tool, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono bg-[#F3F4F6] text-[#374151] px-2 py-0.5 rounded">
              {tool}
            </span>
            {i < scenario.tools.length - 1 && (
              <span className="text-[#D1D5DB] text-xs">→</span>
            )}
          </span>
        ))}
      </div>

      {/* Outcome */}
      <p className="mt-3 text-[14px] leading-relaxed text-[#4B5563]">
        {scenario.outcome}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool reference — compact grid
// ---------------------------------------------------------------------------

function ToolReferenceSection() {
  const grouped = tools.reduce<Record<string, ToolDef[]>>(
    (acc, tool) => {
      (acc[tool.category] ??= []).push(tool);
      return acc;
    },
    {},
  );

  return (
    <section
      id="tools"
      className="py-12 md:py-16 border-t border-[#E5E7EB]"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#9CA3AF] mb-3">
        Tool reference
      </p>
      <h2 className="text-xl font-semibold text-[#111827]">
        9 tools, 4 categories
      </h2>
      <p className="mt-2 text-[14px] text-[#6B7280] max-w-lg">
        Each tool wraps a typed Kysely query function. Claude reads
        all descriptions at initialization and composes multi-tool
        chains based on the question.
      </p>

      <div className="mt-8 space-y-6">
        {Object.entries(grouped).map(([category, categoryTools]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: categoryColors[category] }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                {categoryLabels[category]}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categoryTools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-3">
      <code className="text-[13px] font-mono font-semibold text-[#111827]">
        {tool.name}
      </code>
      <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280]">
        {tool.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Try it — CTA section
// ---------------------------------------------------------------------------

function TryItSection() {
  return (
    <section className="py-12 md:py-16 border-t border-[#E5E7EB]">
      <div className="rounded-xl bg-[#052E16] px-6 py-8 md:px-10 md:py-10">
        <h2 className="text-xl md:text-2xl font-semibold text-white">
          Try it now
        </h2>
        <p className="mt-3 text-[15px] text-[#A7F3D0] max-w-lg leading-relaxed">
          Connect this MCP server to Claude and start asking
          regulatory questions against live EU data. Streamable HTTP
          transport, no auth required for demo.
        </p>

        <div className="mt-8 space-y-4">
          <Step
            number="1"
            text="Open Claude → Settings → Connectors"
          />
          <Step number="2" text="Click Add Custom Connector" />
          {/* <Step
            number="3"
            text="Select Streamable HTTP as the transport"
          /> */}
          <Step
            number="3"
            text={`Paste the URL: `}
            copyText={`https://${mcpEndpoint}`}
          />
          <Step
            number="4"
            text="Claude discovers 9 tools automatically"
          />
        </div>

        {/* Suggested first question */}
        <div className="mt-8 border-t border-[#16A34A]/30 pt-6">
          <p className="text-[13px] text-[#A7F3D0] mb-2">
            Suggested first question:
          </p>
          <p className="text-[15px] text-white font-medium italic">
            "Analyse Comapny's product portfolio and find market entry
            opportunities for substances with healthy EU approval
            runways where they don't have products yet."
          </p>
        </div>
      </div>
    </section>
  );
}

function Step({
  number,
  text,
  copyText,
}: {
  number: string;
  text: string;
  copyText?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#16A34A] text-white text-[12px] font-semibold flex items-center justify-center">
        {number}
      </span>
      <div className="pt-0.5">
        <p className="text-[14px] text-[#D1FAE5] leading-relaxed">
          {text}
        </p>
        {copyText && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-1.5 flex items-center gap-2 bg-[#052E16] rounded px-3 py-1.5 hover:bg-[#0A3D1E] transition-colors"
          >
            <code className="text-[12px] font-mono text-[#86EFAC]">
              {copyText}
            </code>
            <span className="text-[11px] text-[#4ADE80]">
              {copied ? "✓ Copied" : "Copy"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// YouTube IFrame API type declaration
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }

  namespace YT {
    class Player {
      constructor(
        el: HTMLElement | string,
        config: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: Record<string, (event: any) => void>;
        },
      );
      pauseVideo(): void;
      playVideo(): void;
      destroy(): void;
    }
  }
}
