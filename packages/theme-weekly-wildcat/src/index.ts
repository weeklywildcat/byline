import { BYLINE_THEME_API_VERSION } from "@byline/core";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme } from "@byline/theme-contract";

export const weeklyWildcatTheme = defineBylineTheme({
  id: "weekly-wildcat",
  name: "Weekly Wildcat",
  version: 1,
  themeApiVersion: BYLINE_THEME_API_VERSION,
  stylesheets: [
    "https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..100,400..900&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap",
    "https://api.fontshare.com/v2/css?f[]=erode@400,500,600,700,401,501,601&display=swap"
  ],
  tokens: {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#121212",
    mutedText: "#545454",
    mutedTextSoft: "#737373",
    accent: "#73192a",
    accentStrong: "#4a0f1a",
    link: "#73192a",
    border: "#e2e2e2",
    borderStrong: "#121212",
    fontDisplay: '"Mona Sans", "Arial Narrow", Arial, sans-serif',
    fontHeadline: '"Erode", Georgia, "Times New Roman", serif',
    fontBody: '"Mona Sans", Arial, Helvetica, sans-serif',
    fontUI: '"Mona Sans", Arial, Helvetica, sans-serif',
    fontEditorial: '"Newsreader", Georgia, "Times New Roman", serif',
    contentWidth: "1180px",
    articleWidth: "760px",
    radiusSmall: "0px",
    radiusMedium: "0px",
    density: "compact"
  },
  renderers: {},
  variants: {
    "story-lead": ["default", "opinion"],
    "story-grid": ["default", "brief"],
    "story-list": ["default", "compact"],
    "photo-feature": ["default", "in-focus"]
  },
  defaults: {},
  capabilities: {
    supportedBlocks: CORE_BYLINE_BLOCK_IDS,
    optionalModules: ["sports", "events", "polls", "newsletter"]
  }
});
