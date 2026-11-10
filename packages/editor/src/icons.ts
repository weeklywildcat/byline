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
  timeline: ["M8 3v18", "M8 6h.01", "M8 12h.01", "M8 18h.01", "M12 6h8", "M12 12h6", "M12 18h7"],
  portrait: ["M3 5h8v14H3z", "M14 8h7", "M14 12h7", "M14 16h5", "M7 11.5h.01", "M4.5 17c.5-2 1.5-3 2.5-3s2 1 2.5 3"],
  video: ["M3 6h13v12H3z", "m16 10 5-3v10l-5-3", "m8 10 3 2-3 2z"],
  audio: ["M4 10v4", "M8 7v10", "M12 4v16", "M16 8v8", "M20 10v4"],
  editorsNote: ["M5 4h14v12H9l-4 4z", "M9 9h6", "M9 12h4"],
  marginNote: ["M3 5h12", "M3 9h12", "M3 13h12", "M3 17h12", "M18 6h3v8h-3z"],
  expandable: ["M4 5h16", "m8 10 4 4 4-4", "M4 19h16"],
  chart: ["M4 20h16", "M7 20v-7", "M12 20V6", "M17 20v-10"],
  table: ["M3 5h18v14H3z", "M3 10h18", "M3 15h18", "M9 5v14", "M15 5v14"],
  comparison: ["M3 5h8v14H3z", "M13 5h8v14h-8z", "M5.5 9h3", "M15.5 9h3", "M5.5 13h3", "M15.5 13h3"],
  numbers: ["M5 7h4v10", "M13 7h6v4h-6v6h6", "M3 20h18"],
  annotated: ["M3 5h18v14H3z", "m3 16 5-5 4 4 3-3 6 6", "M14 8.5a1.5 1.5 0 1 0 .01 0"],
  beforeAfter: ["M3 5h18v14H3z", "M12 5v14", "M9 10l-2 2 2 2", "M15 10l2 2-2 2"],
  chapter: ["M3 4h18v16H3z", "M7 15h10", "M7 12h6", "m3 17 4-4 3 3 3-3 8 8"],
  related: ["M5 6h14", "M5 10h9", "M5 15h14", "M5 19h9", "M17 9l3 1.5-3 1.5z"],
  poll: ["M4 5h12", "M4 5v2", "M4 11h16", "M4 17h8", "M4 8h8", "M4 14h14", "M4 20h8"],
  interactive: ["M4 5h16v14H4z", "m10 10 4 2-4 2z", "M4 9h16"],
  social: ["M7 4h10v16H7z", "M10 8h4", "M10 12h4", "M10 16h2", "M3 9v6", "M21 9v6"],
  score: ["M3 6h18", "M3 18h18", "M5 10h6", "M5 14h6", "M15 10h4", "M15 14h4"],
  event: ["M4 6h16v14H4z", "M4 10h16", "M8 3v5", "M16 3v5", "M8 14h3v3H8z"],
  tracker: ["M4 7h16", "M4 17h16", "M6 7v.01", "M11 7v.01", "M16 7v.01", "M6 12h8", "M4 12h1", "M17 12h3"],
  // Lucide's "database": a cylinder, drawn as paths (an ellipse is two arcs).
  database: ["M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0", "M3 5v14a9 3 0 0 0 18 0V5", "M3 12a9 3 0 0 0 18 0"],
  source: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"]
};

export function blockIconSvg(icon: ArticleBlockIcon, color = "currentColor"): string {
  const paths = BLOCK_ICON_PATHS[icon].map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** For Payload's slash menu, which shows a block's icon as an image. */
export function blockIconDataUri(icon: ArticleBlockIcon): string {
  return `data:image/svg+xml,${encodeURIComponent(blockIconSvg(icon, "#3f3f46"))}`;
}
