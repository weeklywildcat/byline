import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  // Workers Builds natively persists node_modules/.astro at the repository
  // root. Keep Astro's incremental route cache and Byline's media cache there
  // directly instead of mirroring a second workspace-local cache.
  cacheDir: new URL("../../node_modules/.astro/", import.meta.url),
  experimental: {
    incrementalBuild: true,
    // Astro 7.4 can prerender independent routes on worker threads. Keep this
    // modest on shared CI runners; route-level incremental caching still skips
    // unchanged pages before work reaches the workers.
    parallelPrerender: { workers: 2 }
  },
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
