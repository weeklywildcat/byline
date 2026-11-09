import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@byline/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@byline/content/redirect-path": fileURLToPath(new URL("../../packages/content/src/redirect-path.ts", import.meta.url)),
      "@byline/content/story": fileURLToPath(new URL("../../packages/content/src/story/index.ts", import.meta.url)),
      "@byline/content": fileURLToPath(new URL("../../packages/content/src/index.ts", import.meta.url)),
      "@byline/design": fileURLToPath(new URL("../../packages/design/src/index.ts", import.meta.url)),
      "@byline/theme-contract": fileURLToPath(new URL("../../packages/theme-contract/src/index.ts", import.meta.url)),
      "@byline/theme-weekly-wildcat/publication": fileURLToPath(new URL("../../packages/theme-weekly-wildcat/src/publication.ts", import.meta.url)),
      "@byline/theme-weekly-wildcat": fileURLToPath(
        new URL("../../packages/theme-weekly-wildcat/src/index.ts", import.meta.url)
      ),
      // Subpath exports before the package root, which would otherwise match first.
      "@byline/ui/contributor-profile": fileURLToPath(new URL("../../packages/ui/src/contributor-profile.tsx", import.meta.url)),
      "@byline/ui/live-feed": fileURLToPath(new URL("../../packages/ui/src/live-feed.ts", import.meta.url)),
      "@byline/ui/live-updates": fileURLToPath(new URL("../../packages/ui/src/live-updates.ts", import.meta.url)),
      "@byline/ui/homepage": fileURLToPath(new URL("../../packages/ui/src/homepage/index.ts", import.meta.url)),
      "@byline/ui/article-body": fileURLToPath(new URL("../../packages/ui/src/article-body/index.ts", import.meta.url)),
      "@byline/ui/article-enhancement-selector": fileURLToPath(new URL("../../packages/ui/src/article-enhancements/selector.ts", import.meta.url)),
      "@byline/ui/article-enhancements": fileURLToPath(new URL("../../packages/ui/src/article-enhancements/index.ts", import.meta.url)),
      "@byline/article-body/fixtures": fileURLToPath(new URL("../../packages/article-body/src/fixtures.ts", import.meta.url)),
      "@byline/article-body": fileURLToPath(new URL("../../packages/article-body/src/index.ts", import.meta.url)),
      "@byline/story-presentations/interactives": fileURLToPath(new URL("../../packages/story-presentations/src/interactives/registry.ts", import.meta.url)),
      "@byline/story-presentations/trackers": fileURLToPath(new URL("../../packages/story-presentations/src/trackers/registry.ts", import.meta.url)),
      "@byline/story-presentations": fileURLToPath(new URL("../../packages/story-presentations/src/index.ts", import.meta.url)),
      "@byline/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    environment: "node",
    // Story presentations import their stylesheet as a string (`?inline`); the
    // default would hand tests an empty one.
    css: { include: [/\.css\?inline/] },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
