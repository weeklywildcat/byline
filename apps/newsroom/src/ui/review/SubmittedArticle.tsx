"use client";

import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArticleCanvas } from "../story/ArticleCanvas";
import { legacyHtmlBlocks } from "./legacy-html";

/**
 * The exact version a writer submitted, read-only (docs/review.md#submitted).
 * It renders the reader-facing words — headline, deck, the body's
 * paragraphs, headings, quotes and lists — with each text block numbered so
 * a review comment can say exactly which words it is about. Media in the
 * body is shown as a labelled placeholder; Preview shows the full layout.
 *
 * It never reads the live form: what is reviewed is what was submitted.
 */

type Node = { type?: string; tag?: string; text?: string; listType?: string; children?: Node[]; fields?: { blockType?: string; caption?: string; text?: string; attribution?: string }; value?: unknown };

export type SubmittedStory = { headline?: string | null; deck?: string | null; kicker?: string | null; body?: { root?: Node } | null; legacyHtml?: string | null; contentFormat?: string | null };

function textOf(node: Node): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "linebreak") return "\n";
  return (node.children ?? []).map(textOf).join("");
}

const MEDIA = /^(upload|image|gallery|video|embed|chart|map|interactive|social|audio)$/i;

/** One reviewable block: its stable index (the anchor) and its plain text. */
export type ReviewBlock = { id: string; kind: "headline" | "deck" | "paragraph" | "heading" | "quote" | "list" | "media"; text: string; level?: number };

export function reviewBlocks(story: SubmittedStory, parseHtml?: (html: string) => Document): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  if (story.headline?.trim()) blocks.push({ id: "headline", kind: "headline", text: story.headline.trim() });
  if (story.deck?.trim()) blocks.push({ id: "deck", kind: "deck", text: story.deck.trim() });
  let index = 0;
  const visit = (node: Node) => {
    const type = node.type ?? "";
    const blockType = node.fields?.blockType ?? "";
    if (MEDIA.test(type) || MEDIA.test(blockType)) {
      blocks.push({ id: `b${index++}`, kind: "media", text: node.fields?.caption ?? "" });
      return;
    }
    if (type === "block" && blockType === "reportedQuote") {
      blocks.push({ id: `b${index++}`, kind: "quote", text: [node.fields?.text, node.fields?.attribution ? `— ${node.fields.attribution}` : ""].filter(Boolean).join(" ") });
      return;
    }
    if (type === "paragraph" || type === "heading" || type === "quote") {
      const text = textOf(node).trim();
      if (text) blocks.push({ id: `b${index++}`, kind: type as ReviewBlock["kind"], text, level: type === "heading" ? Number((node.tag ?? "h2").slice(1)) : undefined });
      return;
    }
    if (type === "list") {
      const items = (node.children ?? []).map((child) => textOf(child).trim()).filter(Boolean);
      if (items.length) blocks.push({ id: `b${index++}`, kind: "list", text: items.join("\n") });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (story.body?.root) visit(story.body.root);
  else if (story.legacyHtml) {
    // Imported stories: parsed inertly and read back as text, never as markup.
    for (const block of legacyHtmlBlocks(story.legacyHtml, parseHtml) ?? []) blocks.push({ id: `b${index++}`, ...block });
  }
  return blocks;
}

/** Highlights for one block: the quoted ranges of comments anchored to it. */
export type BlockMark = { start: number; end: number; commentId: number; pending: boolean };

function marked(text: string, marks: BlockMark[], onMark: (id: number) => void): ReactNode {
  const ordered = [...marks].filter((mark) => mark.end > mark.start && mark.end <= text.length).sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const mark of ordered) {
    if (mark.start < at) continue;
    if (mark.start > at) parts.push(text.slice(at, mark.start));
    parts.push(
      <mark key={`${mark.commentId}-${mark.start}`} className={mark.pending ? "rounded-sm bg-amber-200/60 text-inherit dark:bg-amber-400/30" : "rounded-sm bg-sky-200/50 text-inherit dark:bg-sky-400/25"}>
        <button type="button" className="text-inherit" onClick={() => onMark(mark.commentId)} aria-label="Show comment">{text.slice(mark.start, mark.end)}</button>
      </mark>
    );
    at = mark.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

export function SubmittedArticle({ blocks, marks, onMark }: { blocks: ReviewBlock[]; marks: Map<string, BlockMark[]>; onMark: (commentId: number) => void }) {
  return (
    <ArticleCanvas>
      <div className="flex flex-col gap-5" data-submitted-article="">
        {blocks.map((block) => {
          const content = marked(block.text, marks.get(block.id) ?? [], onMark);
          const props = { "data-review-block": block.id, key: block.id };
          switch (block.kind) {
            case "headline": return <h1 {...props} className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{content}</h1>;
            case "deck": return <p {...props} className="text-lg text-muted-foreground">{content}</p>;
            case "heading": return block.level === 3 ? <h3 {...props}>{content}</h3> : <h2 {...props}>{content}</h2>;
            case "quote": return <blockquote {...props} className="whitespace-pre-line">{content}</blockquote>;
            case "list": return <p {...props} className="whitespace-pre-line">{content}</p>;
            case "media": return (
              <figure {...props} className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <ImageIcon className="size-4" aria-hidden="true" />
                <figcaption>{block.text ? content : "Media (see Preview)"}</figcaption>
              </figure>
            );
            default: return <p {...props}>{content}</p>;
          }
        })}
      </div>
    </ArticleCanvas>
  );
}

/** The selection inside one review block, as block id and character offsets, or null. */
export function selectionAnchor(root: HTMLElement): { block: string; start: number; end: number; quote: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const element = (node: Node | globalThis.Node | null) => (node && (node as globalThis.Node).nodeType === 1 ? (node as HTMLElement) : (node as globalThis.Node | null)?.parentElement ?? null);
  const startBlock = element(range.startContainer as globalThis.Node)?.closest<HTMLElement>("[data-review-block]");
  const endBlock = element(range.endContainer as globalThis.Node)?.closest<HTMLElement>("[data-review-block]");
  if (!startBlock || startBlock !== endBlock || !root.contains(startBlock)) return null;
  const before = document.createRange();
  before.selectNodeContents(startBlock);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const quote = range.toString();
  if (!quote.trim()) return null;
  return { block: startBlock.dataset.reviewBlock!, start, end: start + quote.length, quote: quote.trim().slice(0, 1000), rect: range.getBoundingClientRect() };
}
