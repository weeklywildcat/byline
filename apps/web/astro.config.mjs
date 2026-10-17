import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  experimental: { incrementalBuild: true },
  outDir: "./out",
  trailingSlash: "always",
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "@": new URL("./", import.meta.url).pathname
      }
    }
  }
});
