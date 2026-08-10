// Augment Wrangler-generated Cloudflare.Env from worker-configuration.d.ts.
// Must use `declare global` so this merges with the generated Env
// ({ API, API_KEY }) instead of creating a separate module-local namespace.
declare global {
  namespace Cloudflare {
    interface Env {
      OPENROUTER_API_KEY: string;
    }
  }
}

export {};
