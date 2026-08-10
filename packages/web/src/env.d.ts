// packages/web/src/env.d.ts
declare module "cloudflare:workers" {
  const env: {
    API: Fetcher;
    API_KEY: string;
  };
  export { env };
}
