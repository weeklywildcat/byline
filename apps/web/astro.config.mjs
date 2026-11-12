import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import siteConfig from "@byline/site/config";
import { assertSiteCompatible } from "@byline/site-contract";
import { bylineSite } from "./site-integration.mjs";

export default defineConfig({
  output: "static",
  experimental: { incrementalBuild: true },
  outDir: "./out",
  trailingSlash: "always",
  integrations: [react(), bylineSite({ config: siteConfig, assertSiteCompatible })],
  vite: {
    resolve: {
      alias: {
        "@": new URL("./", import.meta.url).pathname
      }
    }
  }
});
