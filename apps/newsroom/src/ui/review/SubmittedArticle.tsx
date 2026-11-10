"use client";

import { FileAudio, FileText, FileVideo, ImageIcon, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { buildReviewBlocks, type ReviewBlock, type SubmittedStory } from "../../domain/review-blocks";
import type { BlockChange, RemovedBlock, VisualChange, WordPart } from "../../domain/review-diff";
import type { SubmittedMedia } from "../../newsroom/review";
import { ArticleCanvas } from "../story/ArticleCanvas";
import { legacyHtmlBlocks } from "./legacy-html";
import { Badge } from "@byline/newsroom-ui/ui/badge";

/**
 * The exact version a writer submitted, read-only (docs/review.md#submitted).
 * It renders what a reader reads (headline, deck, the body's paragraphs,
 * headings, quotes and lists) with each text block numbered so a review comment
 * can say exactly which words it is about, and what a reader sees: the lead
 * image, photos and galleries, as the files this version names. Media the
 * review can't show (video, audio, documents) is a labelled file.
 *
 * It never reads the live form: what is reviewed is what was submitted. A
 * Media file edited after submission is flagged on the image, never silently
 * swapped in.
 */

export type { ReviewBlock, SubmittedStory };

/** One reviewable block: its stable index (the anchor) and its plain text. The block model is shared with the server's version comparison. */
export function reviewBlocks(story: SubmittedStory, parseHtml?: (html: string) => Document): ReviewBlock[] {
  // Imported stories: parsed inertly and read back as text, never as markup.
  return buildReviewBlocks(story, (html) => legacyHtmlBlocks(html, parseHtml));
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

export type ReviewChanges = { blocks: Map<string, BlockChange>; removed: RemovedBlock[]; /** Media that moved since the last review: added, replaced in place, removed, or only its alt text changed. */ visuals?: VisualChange[] };

const VISUAL_TAGS = { added: "added", replaced: "replaced", details: "alt text changed" } as const;

/**
 * Which media blocks of the submitted version are a visual change since the
 * last review, matched on what the block shows (its label and files). A
 * removed visual has no block here; it is listed on its own.
 */
export function visualChangesByBlock(blocks: readonly ReviewBlock[], visuals: readonly VisualChange[] | undefined): Map<string, VisualChange> {
  const found = new Map<string, VisualChange>();
  const open = [...(visuals ?? [])].filter((change) => change.change !== "removed");
  for (const block of blocks) {
    if (!block.media) continue;
    const key = block.media.uses.map((use) => use.mediaId).join(",");
    const at = open.findIndex((change) => change.where === block.media!.label && change.after.join(",") === key);
    if (at >= 0) found.set(block.id, open.splice(at, 1)[0]!);
  }
  return found;
}

function Diff({ parts }: { parts: WordPart[] }) {
  // An addition right after a deletion gets a little room, so "~~old~~new" never reads as one run-together word.
  return <>{parts.map((part, index) => part.change === "added"
    ? <ins key={index} className={`rounded-sm bg-emerald-200/60 text-inherit no-underline dark:bg-emerald-400/25${parts[index - 1]?.change === "removed" ? " ml-1" : ""}`}>{part.text}</ins>
    : part.change === "removed"
      ? <del key={index} className="rounded-sm bg-rose-200/60 text-inherit dark:bg-rose-400/25">{part.text}</del>
      : <span key={index}>{part.text}</span>)}</>;
}

const FILE_ICONS = { video: FileVideo, audio: FileAudio, document: FileText, other: FileText, image: ImageIcon } as const;

function MediaFile({ file, alt, fallbackLabel }: { file: SubmittedMedia | undefined; alt: string; fallbackLabel: string }) {
  if (!file || file.state === "missing") {
    return <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><TriangleAlert className="size-4" aria-hidden="true" />This {fallbackLabel.toLowerCase()}’s file was deleted after submission.</div>;
  }
  if (file.kind === "image" && (file.previewUrl ?? file.url)) {
    return <img src={(file.previewUrl ?? file.url)!} alt={alt || file.alt} width={file.width ?? undefined} height={file.height ?? undefined} loading="lazy" className="h-auto max-h-[70vh] w-full rounded-lg border object-contain" />;
  }
  const Icon = FILE_ICONS[file.kind];
  return <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{file.filename}</span><span className="text-muted-foreground">{fallbackLabel}</span></div>;
}

function MediaBlock({ block, media, content, change, diff }: { block: ReviewBlock; media: Map<number, SubmittedMedia>; content: ReactNode; change: BlockChange | undefined; diff: boolean }) {
  const uses = block.media?.uses ?? [];
  const label = block.media?.label ?? "Media";
  const files = uses.map((use) => ({ use, file: media.get(use.mediaId) }));
  const changed = files.filter((entry) => entry.file?.state === "changed");
  const alts = [...new Set(files.map((entry) => entry.use.alt || entry.file?.alt || "").filter(Boolean))];
  const credits = [...new Set(files.map((entry) => entry.file?.credit).filter(Boolean))];
  const many = uses.length > 1;
  // Single pictures carry one note under the picture; a gallery flags the exact picture instead (below).
  const note = changed.length && !many ? (
    <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400" role="note" data-media-changed="">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {changed.length === 1 ? "This file or its crop was edited after it was submitted, so the picture above may differ from what the writer sent." : `${changed.length} of these files, or their crops, were edited after submission, so what is shown may differ from what the writer sent.`}
    </p>
  ) : null;
  const empty = <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><ImageIcon className="size-4" aria-hidden="true" />{block.media ? `${label} without a file.` : "Media in an imported story. Open Preview to see it."}</div>;
  if (many) {
    // A gallery: each picture keeps its own caption, credit and alt text beneath it, so nothing is run together.
    return (
      <figure data-review-block={block.id} data-media-block="" className="grid gap-2">
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3">
          {files.map(({ use, file }, index) => {
            const alt = use.alt || file?.alt || "";
            return (
              <div key={`${use.mediaId}-${index}`} data-gallery-item="" className="grid min-w-0 content-start gap-1">
                <MediaFile file={file} alt={use.alt} fallbackLabel={label} />
                {file?.state === "changed" ? <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400" role="note" data-media-changed=""><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />This file or its crop was edited after it was submitted, so the picture may differ from what the writer sent.</p> : null}
                <p className="text-sm text-muted-foreground">{use.caption || <span className="italic">No caption</span>}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {file?.credit ? <span className="block">Credit: {file.credit}</span> : null}
                  <span className="block">{alt ? `Alt text: ${alt}` : "No alt text"}</span>
                </p>
              </div>
            );
          })}
        </div>
        <figcaption className="grid gap-1 text-xs text-muted-foreground">
          {diff && change?.status === "changed" ? <span className="text-sm">Captions: <Diff parts={change.parts} /></span> : null}
          <span><Badge variant="outline">{label}</Badge></span>
        </figcaption>
      </figure>
    );
  }
  return (
    <figure data-review-block={block.id} data-media-block="" className="grid gap-2">
      {files.length ? <div className="grid">{files.map(({ use, file }, index) => <MediaFile key={`${use.mediaId}-${index}`} file={file} alt={use.alt} fallbackLabel={label} />)}</div> : empty}
      {note}
      <figcaption className="grid gap-1 text-sm text-muted-foreground">
        {block.text ? <span>{diff && change?.status === "changed" ? <Diff parts={change.parts} /> : content}</span> : null}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Badge variant="outline">{label}</Badge>
          {credits.length ? <span>Credit: {credits.join(", ")}</span> : null}
          {alts.length ? <span>Alt text: {alts.join(" · ")}</span> : <span>No alt text</span>}
        </span>
      </figcaption>
    </figure>
  );
}

export function SubmittedArticle({ blocks, marks, onMark, byline, media, changes, changesOnly = false }: {
  blocks: ReviewBlock[];
  /** The names the submitted version carries as its byline. */
  byline?: string[];
  marks: Map<string, BlockMark[]>;
  onMark: (commentId: number) => void;
  media?: Map<number, SubmittedMedia>;
  /** What changed since this reviewer last looked, by block. Shown as edits in the text, and on its own with `changesOnly`. */
  changes?: ReviewChanges | null;
  changesOnly?: boolean;
}) {
  const files = media ?? new Map<number, SubmittedMedia>();
  const removedAfter = new Map<string | null, RemovedBlock[]>();
  for (const entry of changes?.removed ?? []) removedAfter.set(entry.after, [...(removedAfter.get(entry.after) ?? []), entry]);
  const visualFor = visualChangesByBlock(blocks, changes?.visuals);
  const removedVisuals = (changes?.visuals ?? []).filter((change) => change.change === "removed");
  const touched = (block: ReviewBlock) => changes?.blocks.has(block.id) || visualFor.has(block.id) || Boolean(block.media?.uses.some((use) => files.get(use.mediaId)?.state === "changed"));
  const shown = changesOnly ? blocks.filter((block) => touched(block) || removedAfter.has(block.id)) : blocks;
  // The byline sits under the deck (or the headline when there is no deck), where a reader finds it.
  const bylineAt = (blocks.find((block) => block.kind === "deck") ?? blocks.find((block) => block.kind === "headline"))?.id;
  const removedBlocks = (after: string | null) => (removedAfter.get(after) ?? []).map((entry, index) => (
    <div key={`removed-${after}-${index}`} data-review-removed="" className="rounded-lg border border-rose-300/60 bg-rose-50/50 p-3 text-sm dark:border-rose-400/30 dark:bg-rose-950/20">
      <Badge variant="outline" className="mb-1">Removed since your last review</Badge>
      <p className="whitespace-pre-line text-muted-foreground line-through">{entry.text}</p>
    </div>
  ));
  return (
    <ArticleCanvas>
      <div className="flex flex-col gap-5" data-submitted-article="" data-changes-only={changesOnly || undefined}>
        {changesOnly ? removedBlocks(null) : null}
        {changesOnly && removedVisuals.length ? (
          <div data-review-removed="" data-review-removed-visuals="" className="rounded-lg border border-rose-300/60 bg-rose-50/50 p-3 text-sm dark:border-rose-400/30 dark:bg-rose-950/20">
            <Badge variant="outline" className="mb-1">Removed since your last review</Badge>
            <p className="text-muted-foreground">{removedVisuals.map((change) => change.where).join(" · ")}</p>
          </div>
        ) : null}
        {shown.map((block) => {
          const change = changes?.blocks.get(block.id);
          const content = marked(block.text, marks.get(block.id) ?? [], onMark);
          // In "changes only" the text is the edit itself, word by word; in the whole story it is the submitted words, so comment anchors line up.
          const text = changesOnly && change?.status === "changed" ? <Diff parts={change.parts} /> : content;
          const props = { "data-review-block": block.id };
          const visual = visualFor.get(block.id);
          const tagText = visual ? `${block.media?.label ?? "Media"} ${VISUAL_TAGS[visual.change as keyof typeof VISUAL_TAGS]} since your last review` : change ? (change.status === "added" ? "New since your last review" : "Edited since your last review") : null;
          const tag = tagText ? <Badge variant="secondary" className="mb-1 w-fit" data-change-badge="">{tagText}</Badge> : null;
          let node: ReactNode;
          switch (block.kind) {
            case "headline": node = <h1 {...props} className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{text}</h1>; break;
            case "deck": node = <p {...props} className="text-lg text-muted-foreground">{text}</p>; break;
            case "heading": node = block.level === 3 ? <h3 {...props}>{text}</h3> : <h2 {...props}>{text}</h2>; break;
            case "quote": node = <blockquote {...props} className="whitespace-pre-line">{text}</blockquote>; break;
            case "list": node = <p {...props} className="whitespace-pre-line">{text}</p>; break;
            case "lead":
            case "media": node = <MediaBlock {...props} block={block} media={files} content={content} change={change} diff={changesOnly} />; break;
            default: node = <p {...props}>{text}</p>;
          }
          return (
            <div key={block.id} className={tag ? "grid gap-1 border-l-2 border-emerald-400/70 pl-3" : undefined}>
              {tag}
              {node}
              {byline?.length && !changesOnly && block.id === bylineAt ? <p data-review-byline="" className="mt-2 text-sm text-muted-foreground">By {byline.join(", ")}</p> : null}
              {changesOnly ? removedBlocks(block.id) : null}
            </div>
          );
        })}
        {changesOnly && !shown.length && !removedAfter.size ? <p className="text-sm text-muted-foreground">Nothing has changed in the text since your last review.</p> : null}
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
