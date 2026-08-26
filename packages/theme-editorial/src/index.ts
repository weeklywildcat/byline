import { BYLINE_THEME_API_VERSION } from "@byline/core";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme } from "@byline/theme-contract";

export const editorialTheme = defineBylineTheme({
  id: "byline-editorial", name: "Editorial", version: 1, themeApiVersion: BYLINE_THEME_API_VERSION,
  tokens: {
    background: "#f8f5ef", surface: "#fffdf8", text: "#191714", mutedText: "#645f57", mutedTextSoft: "#81796e",
    accent: "#9a2725", accentStrong: "#721b1a", link: "#254e70", border: "#cec5b7", borderStrong: "#191714",
    fontDisplay: "Georgia, 'Times New Roman', serif", fontHeadline: "Georgia, 'Times New Roman', serif",
    fontBody: "Georgia, 'Times New Roman', serif", fontUI: "Arial, Helvetica, sans-serif", fontEditorial: "Georgia, 'Times New Roman', serif",
    contentWidth: "1160px", articleWidth: "720px", radiusSmall: "0px", radiusMedium: "0px", density: "compact"
  },
  renderers: {}, variants: {}, defaults: {},
  capabilities: { supportedBlocks: CORE_BYLINE_BLOCK_IDS, optionalModules: ["sports", "events", "polls", "newsletter"] }
});
