// Manual ambient types for `import { env } from "cloudflare:workers"`.
// This project relies on this file (not worker-configuration.d.ts) for the
// module — keep secrets/bindings listed here so IDE + tsc resolve them.
declare module "cloudflare:workers" {
  const env: {
    API: Fetcher;
    API_KEY: string;
    OPENROUTER_API_KEY: string;
  };
  export { env };
}
