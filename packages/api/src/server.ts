/**
 * RegBridge API — HTTP server
 */

import {
  HttpApiBuilder,
  HttpApiSwagger,
  HttpMiddleware,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { ApiLive } from "./handlers.js";

const PORT = parseInt(Bun.env.PORT ?? "3000", 10);

// ---------------------------------------------------------------------------
// CORS middleware — allows localhost + ngrok origins
// ---------------------------------------------------------------------------
const CorsMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, ngrok-skip-browser-warning",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return HttpServerResponse.empty({
        status: 204,
        headers: corsHeaders,
      });
    }

    // Normal request — run handler then attach CORS headers
    const res = yield* app;
    return res.pipe(
      HttpServerResponse.setHeader(
        "Access-Control-Allow-Origin",
        "*",
      ),
      HttpServerResponse.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS",
      ),
      HttpServerResponse.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, ngrok-skip-browser-warning",
      ),
    );
  }),
);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const ServerLive = HttpApiBuilder.serve((app) =>
  HttpMiddleware.logger(CorsMiddleware(app)),
).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
  Layer.provide(ApiLive),
  Layer.provide(BunHttpServer.layer({ port: PORT })),
);

BunRuntime.runMain(Layer.launch(ServerLive));
console.log(`Server running on port: ${PORT}`);
