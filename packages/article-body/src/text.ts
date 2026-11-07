import type { Inline, ParagraphNode, TextRun } from "./types";

/** Text as a writer meant it: no control characters, Windows line endings or outer whitespace. */
export function cleanText(value: unknown, max?: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return max === undefined ? text : text.slice(0, max);
}

/** One line of text (labels, headings, attributions): inner line breaks become spaces. */
export function cleanLine(value: unknown, max?: number): string {
  return cleanText(typeof value === "string" ? value.replace(/\s*\n\s*/g, " ") : value, max);
}

/** Plain text split into paragraphs at blank lines; single line breaks are kept inside a paragraph. */
export function paragraphsFromText(value: unknown, max?: number): ParagraphNode[] {
  const text = cleanText(value, max);
  if (!text) return [];
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const children: Inline[] = [];
    part.split("\n").forEach((line, index) => {
      if (index > 0) children.push({ type: "lineBreak" });
      children.push({ type: "text", text: line.trim() });
    });
    return { type: "paragraph", children };
  });
}

/** The reading text of inline content (for search, readiness and accessible names). */
export function inlineText(children: readonly Inline[]): string {
  return children.map((child) => (child.type === "text" ? child.text : child.type === "link" ? child.children.map((run) => run.text).join("") : child.type === "footnote" ? "" : "\n")).join("");
}

export function hasInlineText(children: readonly Inline[]): boolean {
  return inlineText(children).trim() !== "";
}

/** Merge adjacent runs with the same marks and drop empty ones, so equal content has one shape. */
export function compactInline(children: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const child of children) {
    if (child.type === "text" && child.text === "") continue;
    if (child.type === "link") {
      const runs = compactInline(child.children).filter((run): run is TextRun => run.type === "text");
      if (runs.length) out.push({ type: "link", href: child.href, children: runs });
      continue;
    }
    const previous = out[out.length - 1];
    if (child.type === "text" && previous?.type === "text" && Boolean(previous.bold) === Boolean(child.bold) && Boolean(previous.italic) === Boolean(child.italic)) {
      out[out.length - 1] = { ...previous, text: previous.text + child.text };
      continue;
    }
    out.push(child);
  }
  // A break at either edge of a paragraph is invisible noise.
  while (out[0]?.type === "lineBreak") out.shift();
  while (out[out.length - 1]?.type === "lineBreak") out.pop();
  return out;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * A link a reader can safely follow, or null. Relative links to this site and
 * in-page anchors are allowed; `javascript:`, `data:` and the like never are.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href) return null;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  try {
    const url = new URL(href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
