import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@byline/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@byline/content": fileURLToPath(new URL("../../packages/content/src/index.ts", import.meta.url)),
      "@byline/design": fileURLToPath(new URL("../../packages/design/src/index.ts", import.meta.url)),
      "@byline/studio-contract": fileURLToPath(new URL("../../packages/studio-contract/src/index.ts", import.meta.url)),
      "@byline/theme-contract": fileURLToPath(new URL("../../packages/theme-contract/src/index.ts", import.meta.url)),
      "@byline/theme-editorial": fileURLToPath(new URL("../../packages/theme-editorial/src/index.ts", import.meta.url)),
      "@byline/theme-magazine": fileURLToPath(new URL("../../packages/theme-magazine/src/index.ts", import.meta.url)),
      "@byline/theme-modern": fileURLToPath(new URL("../../packages/theme-modern/src/index.ts", import.meta.url)),
      "@byline/theme-weekly-wildcat": fileURLToPath(
        new URL("../../packages/theme-weekly-wildcat/src/index.ts", import.meta.url)
      ),
      "@byline/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
