import { BYLINE_THEME_API_VERSION } from "@byline/core";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme } from "@byline/theme-contract";

export const magazineTheme = defineBylineTheme({
  id: "byline-magazine", name: "Magazine", version: 1, themeApiVersion: BYLINE_THEME_API_VERSION,
  tokens: {
    background: "#f4f1ec", surface: "#ffffff", text: "#171717", mutedText: "#68625c", mutedTextSoft: "#89817a",
    accent: "#d94b32", accentStrong: "#a83422", link: "#1f5f7a", border: "#ddd5cc", borderStrong: "#171717",
    fontDisplay: "Arial Black, Arial, Helvetica, sans-serif", fontHeadline: "Arial, Helvetica, sans-serif",
    fontBody: "Arial, Helvetica, sans-serif", fontUI: "Arial, Helvetica, sans-serif", fontEditorial: "Georgia, 'Times New Roman', serif",
    contentWidth: "1240px", articleWidth: "780px", radiusSmall: "3px", radiusMedium: "10px", density: "spacious"
  },
  renderers: {}, variants: {}, defaults: {},
  capabilities: { supportedBlocks: CORE_BYLINE_BLOCK_IDS, optionalModules: ["sports", "events", "polls", "newsletter"] }
});
