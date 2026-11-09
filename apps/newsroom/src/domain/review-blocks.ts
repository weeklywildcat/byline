/**
 * The reviewable shape of a Story version (docs/review.md#submitted): its
 * headline, deck and body as numbered blocks, with the Media each block shows.
 * Pure and shared: the review view renders these blocks, and the server
 * compares two versions' blocks to say what changed since a reviewer last
 * looked. The block ids are positions in that version, so a comment's anchor
 * always means the words it was made on.
 */

export type BodyNode = {
  type?: string;
  tag?: string;
  text?: string;
  listType?: string;
  children?: BodyNode[];
  fields?: Record<string, unknown> & { blockType?: string; caption?: string; text?: string; attribution?: string };
  value?: unknown;
};

export type SubmittedStory = {
  headline?: string | null;
  deck?: string | null;
  kicker?: string | null;
  body?: { root?: BodyNode } | null;
  legacyHtml?: string | null;
  contentFormat?: string | null;
  featuredMedia?: unknown;
  featuredCaption?: string | null;
};

/** One use of a Media file in the version: which block, which file, what its caption says. */
export type ReviewMediaUse = { mediaId: number; caption: string; alt: string };

export type ReviewBlock = {
  id: string;
  kind: "headline" | "deck" | "lead" | "paragraph" | "heading" | "quote" | "list" | "media";
  text: string;
  level?: number;
  /** For media blocks: what the block is ("Photo", "Gallery") and the files it shows, in order. */
  media?: { label: string; uses: ReviewMediaUse[] };
};

export type LegacyBlockSource = (html: string) => Array<{ kind: "paragraph" | "heading" | "quote" | "list" | "media"; text: string; level?: number }> | null;

const MEDIA = /^(upload|image|gallery|video|embed|chart|map|interactive|social|audio)$/i;

/** Body block types that show Media, with the label a reviewer reads. Types not listed here are text. */
export const MEDIA_BLOCK_LABELS: Record<string, string> = {
  photo: "Photo",
  gallery: "Gallery",
  document: "Document",
  portraitText: "Portrait",
  visualChapter: "Visual chapter",
  annotatedImage: "Annotated image",
  audio: "Audio",
  video: "Video",
  embed: "Embed",
  chart: "Chart",
  map: "Map",
  interactive: "Interactive"
};

export function mediaIdOf(value: unknown): number | null {
  if (value && typeof value === "object" && "id" in value) return mediaIdOf((value as { id: unknown }).id);
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The Media a stored block names, in reading order, with each use's caption and per-use alt text. */
export function blockMediaUses(fields: Record<string, unknown>): ReviewMediaUse[] {
  const uses: ReviewMediaUse[] = [];
  const add = (media: unknown, caption: unknown, alt: unknown) => {
    const id = mediaIdOf(media);
    if (id !== null) uses.push({ mediaId: id, caption: str(caption), alt: str(alt) });
  };
  if (Array.isArray(fields.items)) {
    for (const row of fields.items) {
      if (row && typeof row === "object") add((row as Record<string, unknown>).media, (row as Record<string, unknown>).caption, (row as Record<string, unknown>).altOverride);
    }
  } else add(fields.media ?? fields.image, fields.caption, fields.altOverride);
  return uses;
}

function textOf(node: BodyNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "linebreak") return "\n";
  return (node.children ?? []).map(textOf).join("");
}

/**
 * The reviewable blocks of one version. `legacy` reads an imported story's
 * HTML into text blocks (a browser concern: it needs an inert DOM parse); the
 * server passes nothing and gets no body blocks for legacy-only stories.
 */
export function buildReviewBlocks(story: SubmittedStory, legacy?: LegacyBlockSource): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  if (story.headline?.trim()) blocks.push({ id: "headline", kind: "headline", text: story.headline.trim() });
  if (story.deck?.trim()) blocks.push({ id: "deck", kind: "deck", text: story.deck.trim() });
  const lead = mediaIdOf(story.featuredMedia);
  if (lead !== null) blocks.push({ id: "lead", kind: "lead", text: str(story.featuredCaption), media: { label: "Lead image", uses: [{ mediaId: lead, caption: str(story.featuredCaption), alt: "" }] } });
  let index = 0;
  const visit = (node: BodyNode) => {
    const type = node.type ?? "";
    const blockType = node.fields?.blockType ?? "";
    // Stored body blocks: a block node whose fields say what it is.
    if (type === "block" && blockType in MEDIA_BLOCK_LABELS) {
      const uses = blockMediaUses(node.fields ?? {});
      const caption = str(node.fields?.caption) || uses.map((use) => use.caption).filter(Boolean).join(" · ");
      blocks.push({ id: `b${index++}`, kind: "media", text: caption, media: { label: MEDIA_BLOCK_LABELS[blockType]!, uses } });
      return;
    }
    if (MEDIA.test(type) || MEDIA.test(blockType)) {
      const id = mediaIdOf(node.value);
      blocks.push({ id: `b${index++}`, kind: "media", text: str(node.fields?.caption), media: { label: "Media", uses: id === null ? [] : [{ mediaId: id, caption: str(node.fields?.caption), alt: "" }] } });
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
  else if (story.legacyHtml && legacy) {
    for (const block of legacy(story.legacyHtml) ?? []) blocks.push({ id: `b${index++}`, ...block });
  }
  return blocks;
}

/** Every Media id a set of blocks shows, once each, in order. */
export function mediaIdsOf(blocks: readonly ReviewBlock[]): number[] {
  return [...new Set(blocks.flatMap((block) => block.media?.uses.map((use) => use.mediaId) ?? []))];
}
