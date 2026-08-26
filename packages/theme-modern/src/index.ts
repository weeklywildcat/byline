import { BYLINE_THEME_API_VERSION } from "@byline/core";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme } from "@byline/theme-contract";

export const modernTheme = defineBylineTheme({
  id: "byline-modern",
  name: "Modern",
  version: 1,
  themeApiVersion: BYLINE_THEME_API_VERSION,
  tokens: {
    background: "#f7f9fa", surface: "#ffffff", text: "#14212b", mutedText: "#5f6d76", mutedTextSoft: "#7a878f",
    accent: "#008b95", accentStrong: "#006b73", link: "#075c78", border: "#d9e0e3", borderStrong: "#14212b",
    fontDisplay: "Arial, Helvetica, sans-serif", fontHeadline: "Arial, Helvetica, sans-serif",
    fontBody: "Arial, Helvetica, sans-serif", fontUI: "Arial, Helvetica, sans-serif", fontEditorial: "Georgia, 'Times New Roman', serif",
    contentWidth: "1180px", articleWidth: "760px", radiusSmall: "4px", radiusMedium: "8px", density: "comfortable"
  },
  renderers: {}, variants: {}, defaults: {},
  capabilities: { supportedBlocks: CORE_BYLINE_BLOCK_IDS, optionalModules: ["sports", "events", "polls", "newsletter"] }
});
