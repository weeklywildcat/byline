import type { ArticleBodyNode, FootnoteRef, Inline } from "./types";

/**
 * Footnotes are inline references. Display numbers are derived from document
 * order every time: moving or deleting a reference renumbers the rest, and
 * writers never keep the numbers in step by hand. The stable id anchors the
 * note and its backlink.
 */
export type Footnote = { id: string; number: number; text: string };

function* inlineRefs(children: readonly Inline[]): Generator<FootnoteRef> {
  for (const child of children) if (child.type === "footnote") yield child;
}

function* nodeRefs(node: ArticleBodyNode): Generator<FootnoteRef> {
  switch (node.type) {
    case "paragraph":
    case "heading":
      yield* inlineRefs(node.children);
      return;
    case "list": {
      for (const item of node.items) {
        yield* inlineRefs(item.children);
        if (item.list) yield* nodeRefs(item.list);
      }
      return;
    }
    default:
  }
}

/** Every footnote in reading order, numbered from 1. A repeated id is kept once, at its first place. */
export function collectFootnotes(nodes: readonly ArticleBodyNode[]): Footnote[] {
  const seen = new Set<string>();
  const notes: Footnote[] = [];
  for (const node of nodes) {
    for (const ref of nodeRefs(node)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      notes.push({ id: ref.id, number: notes.length + 1, text: ref.text });
    }
  }
  return notes;
}

/** Anchor ids: the superscript reference and the note it points to. */
export const footnoteRefAnchor = (id: string): string => `fnref-${id}`;
export const footnoteAnchor = (id: string): string => `fn-${id}`;

/** The headings "In This Story" lists: every H2, and every Visual Chapter's heading. */
export type OutlineEntry = { id: string; text: string; source: "heading" | "visualChapter" };

export function articleOutline(nodes: readonly ArticleBodyNode[], textOf: (children: readonly Inline[]) => string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  nodes.forEach((node, index) => {
    if (node.type === "heading" && node.level === 2) entries.push({ id: `heading-${index}`, text: textOf(node.children), source: "heading" });
    else if (node.type === "visualChapter") entries.push({ id: `chapter-${node.id}`, text: node.heading, source: "visualChapter" });
  });
  return entries.filter((entry) => entry.text.trim() !== "");
}
