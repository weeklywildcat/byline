/**
 * The page Payload's Live Preview frames: its own root layout, separate from
 * Payload's admin, carrying the real Weekly Wildcat publication stylesheets
 * (the same files the public site's layout imports) but none of its SEO
 * shell. Nothing here is a site header, footer, canonical, Open Graph or
 * structured data.
 */
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";
import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";

import "@byline/theme-weekly-wildcat/styles.css";
import "@byline/ui/page-blocks.css";
import "@byline/ui/newsroom-blocks.css";
import "@byline/ui/article.css";
import "@byline/ui/hero-reveal.css";
import "@byline/ui/immersive-article.css";
import "../../../../web/views/fonts.css";
import "../../../../web/views/globals.css";
import "@byline/ui/contributor-profile.css";
import "@byline/data-presentations/data-project.css";
import "@byline/data-presentations/data-embed.css";
import "../../preview/preview.css";

export const metadata: Metadata = {
  title: "Story preview",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function PreviewLayout({ children }: { children: ReactNode }) {
  const style = themeTokensToCssVariables(weeklyWildcatTheme.tokens) as CSSProperties;
  return (
    <html lang="en" data-byline-theme={weeklyWildcatTheme.id} data-byline-density={weeklyWildcatTheme.tokens.density} style={style}>
      <body>{children}</body>
    </html>
  );
}
