import type { ArticleBlockIcon } from "@byline/article-body";

/**
 * One drawing per block, used by Payload's slash menu (as a data URI) and by
 * the Byline Add menu (as inline SVG), so a block looks the same wherever a
 * writer finds it. 24px grid, 1.75 stroke, no fill.
 */
export const BLOCK_ICON_PATHS: Record<ArticleBlockIcon, readonly string[]> = {
  photo: ["M4 5h16v14H4z", "m4 16 4.5-4.5 3.5 3.5 2.5-2.5L20 18", "M9 9.5h.01"],
  gallery: ["M3 6h11v12H3z", "M17 6h4v12h-4", "m3 15 3.5-3.5L10 15l1.5-1.5L14 16"],
  quote: ["M6 10h4v4c0 2-1 3.5-3 4", "M14 10h4v4c0 2-1 3.5-3 4", "M6 6h4M14 6h4"],
  pullQuote: ["M3 4h18", "M3 20h18", "M7 9h3v3c0 1.5-.8 2.6-2.3 3", "M14 9h3v3c0 1.5-.8 2.6-2.3 3"],
  facts: ["M9 6h11", "M9 12h11", "M9 18h11", "m4 6 1 1 2-2", "m4 12 1 1 2-2", "m4 18 1 1 2-2"],
  context: ["M4 4h16", "M4 9h7", "M4 13h16", "M4 17h16", "M4 21h10"],
  document: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M9 12h6", "M9 16h6"],
  timeline: ["M8 3v18", "M8 6h.01", "M8 12h.01", "M8 18h.01", "M12 6h8", "M12 12h6", "M12 18h7"]
};

export function blockIconSvg(icon: ArticleBlockIcon, color = "currentColor"): string {
  const paths = BLOCK_ICON_PATHS[icon].map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** For Payload's slash menu, which shows a block's icon as an image. */
export function blockIconDataUri(icon: ArticleBlockIcon): string {
  return `data:image/svg+xml,${encodeURIComponent(blockIconSvg(icon, "#3f3f46"))}`;
}
