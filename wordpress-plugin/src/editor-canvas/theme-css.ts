import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";

/**
 * The theme tokens as custom properties on the editor canvas. This is the same
 * mapping the Astro site and the Article Preview use, so a token change in
 * packages/theme-weekly-wildcat reaches the editor with no further edits.
 */
export function editorThemeCss(): string {
  const declarations = Object.entries(themeTokensToCssVariables(weeklyWildcatTheme.tokens))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  return `.editor-styles-wrapper { ${declarations} }`;
}
