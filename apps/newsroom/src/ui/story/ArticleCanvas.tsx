"use client";

import { themeTokensToCssVariables } from "@byline/ui";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import type { CSSProperties, ReactNode } from "react";

/** The publication's tokens (colours, type stacks, the 760px measure), as on the public site. */
const THEME_STYLE = themeTokensToCssVariables(weeklyWildcatTheme.tokens) as CSSProperties;

/**
 * The article as readers get it, for the editor to work inside: the public
 * site's theme root, its article shell (the `byline-content` container every
 * wide and full block measures against) and the 760px story column. The
 * shared article CSS does the rest; the editor only adds controls.
 */
/**
 * The article and the Nova design system both name a `--muted` and an
 * `--accent` (muted text and maroon in the article; surface colours in Nova).
 * The outer element keeps Nova's for the editor chrome inside the canvas
 * (canvas.css restores them there); the article's own apply to the article.
 */
const NOVA_TOKENS = { "--byline-ui-muted": "var(--muted)", "--byline-ui-accent": "var(--accent)" } as CSSProperties;

export function ArticleCanvas({ children }: { children: ReactNode }) {
  return (
    <div data-byline-theme={weeklyWildcatTheme.id} style={NOVA_TOKENS}>
      <div className="byline-article-view article-shell byline-article-canvas" style={THEME_STYLE}>
        <div className="article-story">{children}</div>
      </div>
    </div>
  );
}
