import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform";
import { Layer } from "effect";
import { ApiLive } from "./handlers.js";
import { initDb } from "@regbridge/db";

// ApiLive feeds into Swagger — dependency resolved via provideMerge
const ServerLive = HttpApiSwagger.layer({ path: "/docs" }).pipe(
  Layer.provideMerge(ApiLive),
) as Layer.Layer<any, never, never>;

interface Env {
  DATABASE_URL: string;
  API_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, ngrok-skip-browser-warning, x-api-key",
};

let webHandler: ((request: Request) => Promise<Response>) | null =
  null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight — return immediately, never touch Effect
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // API key check — only for /api/*, docs stay open
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/") &&
      request.headers.get("x-api-key") !== env.API_KEY
    ) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Initialize DB once per isolate
    initDb(env.DATABASE_URL);

    // Build handler once per isolate
    if (!webHandler) {
      const result = HttpApiBuilder.toWebHandler(
        ServerLive,
      ) as unknown;
      // Handle both return shapes: direct handler or { handler, dispose }
      webHandler =
        result && typeof result === "object" && "handler" in result
          ? (
              result as {
                handler: (req: Request) => Promise<Response>;
              }
            ).handler
          : (result as (req: Request) => Promise<Response>);
    }

    // Effect handles the request
    const response = await webHandler!(request);

    // Append CORS headers to every response (bypasses Effect serialization bug)
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) =>
      headers.set(k, v),
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
