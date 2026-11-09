import type { ArticleBodyNode, Inline, MediaChapter, SourceRef } from "./types";

/**
 * Shared evidence helpers: the public web address boundary (quote sources,
 * timeline links, Source references, chart sources), media chapter times and
 * the inline Source list. Pure and CMS-free.
 */

/**
 * An absolute http(s) address a reader can follow, normalized, or null.
 * Stricter than `safeHref` (no mail, phone, relative or in-page links, no
 * credentials): it is for pointing at public evidence on the web.
 */
export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The host a reader will land on ("district.example.org"), for a link without its own label. */
export function webUrlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** `1:24`, `01:24`, `1:02:03` or plain seconds (`84`) as whole seconds, or null. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{1,6}$/.test(text)) return Number(text);
  const match = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [, hours = "0", minutes, seconds] = match;
  if (Number(seconds) > 59 || (match[1] !== undefined && Number(minutes) > 59)) return null;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Whole seconds as a reader reads them: `1:24`, `1:02:03`. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Chapters in time order; a repeated time keeps its first label. */
export function sortChapters(chapters: readonly MediaChapter[]): MediaChapter[] {
  const seen = new Set<number>();
  return [...chapters].sort((a, b) => a.time - b.time).filter((chapter) => (seen.has(chapter.time) ? false : (seen.add(chapter.time), true)));
}

// ---------------------------------------------------------------------------
// Inline Source references: numbered by document order, separately from footnotes.
// ---------------------------------------------------------------------------

export type ArticleSource = SourceRef & { number: number };

function* inlineSources(children: readonly Inline[]): Generator<SourceRef> {
  for (const child of children) if (child.type === "source") yield child;
}

function* nodeSources(node: ArticleBodyNode): Generator<SourceRef> {
  switch (node.type) {
    case "paragraph":
    case "heading":
      yield* inlineSources(node.children);
      return;
    case "list":
      for (const item of node.items) {
        yield* inlineSources(item.children);
        if (item.list) yield* nodeSources(item.list);
      }
      return;
    default:
  }
}

/** Every Source reference in reading order, numbered from 1. A repeated id is kept once, at its first place. */
export function collectSources(nodes: readonly ArticleBodyNode[]): ArticleSource[] {
  const seen = new Set<string>();
  const sources: ArticleSource[] = [];
  for (const node of nodes) {
    for (const ref of nodeSources(node)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      sources.push({ ...ref, number: sources.length + 1 });
    }
  }
  return sources;
}

/** Every Source reference, in any prose node (repeats included). */
export function sourceRefs(nodes: readonly ArticleBodyNode[]): SourceRef[] {
  return nodes.flatMap((node) => [...nodeSources(node)]);
}

/** Anchor ids: the inline marker and the entry it points to. */
export const sourceRefAnchor = (id: string): string => `srcref-${id}`;
export const sourceAnchor = (id: string): string => `src-${id}`;

/** Where a source sends the reader: the web page, or the PDF (at its page). `pdf` is the PDF's own address. */
export function sourceHref(source: SourceRef, pdf?: string): string | null {
  if (source.kind === "web") return safeWebUrl(source.url);
  if (!pdf) return null;
  return source.page ? `${pdf}#page=${source.page}` : pdf;
}
