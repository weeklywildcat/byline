import { BYLINE_THEME_API_VERSION } from "@byline/core";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme } from "@byline/theme-contract";

export const weeklyWildcatTheme = defineBylineTheme({
  id: "weekly-wildcat",
  name: "Weekly Wildcat",
  version: 1,
  themeApiVersion: BYLINE_THEME_API_VERSION,
  stylesheets: ["https://use.typekit.net/zxb8gbj.css"],
  tokens: {
    background: "#fbfaf7",
    surface: "#ffffff",
    text: "#151515",
    mutedText: "#635f59",
    mutedTextSoft: "#8a847c",
    accent: "#b11f24",
    accentStrong: "#821316",
    link: "#155789",
    border: "#d8d0c7",
    borderStrong: "#171717",
    fontDisplay: '"alternate-gothic-condensed-a", "Arial Narrow", Arial, sans-serif',
    fontHeadline: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
    fontBody: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
    fontUI: '"news-gothic-std", Arial, Helvetica, sans-serif',
    fontEditorial: '"Iowan Old Style", "Charter", "Source Serif 4", Georgia, serif',
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
