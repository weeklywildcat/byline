import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": new URL(
        "./tests/cloudflare-shim.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
    include: ["tests/**/*.test.ts"],
  },
});
