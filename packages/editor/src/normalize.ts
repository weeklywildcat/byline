import { normalizeArtDirectionIntent } from "@byline/core";
import {
  ARTICLE_BODY_FORMAT,
  ARTICLE_BODY_VERSION,
  ARTICLE_BLOCK_LIMITS,
  blockLabel,
  blockEventIds,
  blockMediaIds,
  blockPollIds,
  blockStoryIds,
  bodyMediaIds,
  cleanText,
  compactInline,
  finalizeBlock,
  finalizeSourceRef,
  hasInlineText,
  isArticleBlock,
  isArticleBlockType,
  mediaCredit,
  mediaKey,
  mediaKindOf,
  safeHref,
  type ArticleBlock,
  type ArticleBody,
  type ArticleBodyNode,
  type ArticleMediaAsset,
  type ArticleReferences,
  type BlockIssue,
  type Inline,
  type ListItemNode,
  type ListNode,
  type MediaId,
  type PublicArticleBody,
  type ReferenceLookup,
  type SourceRef,
  type TextRun
} from "@byline/article-body";
import { articleBlockFromFields, mediaIdOf } from "./fields";

/**
 * Payload Lexical → canonical `byline-v1` ArticleBody.
 *
 * This is the content boundary between Payload and everything that renders:
 * Live Preview, the public snapshot and the parity harness consume its output
 * and never see Lexical JSON. It maps the allowed prose, the Byline blocks
 * and their Media references, keeps order, finalizes every block (unfinished
 * parts are left out and reported), reports anything it does not know rather
 * than dropping it silently, and copies only allowlisted fields, so editor
 * metadata (`blockName`, form state, populated documents) never leaks.
 *
 * Imported WordPress stories (`legacy-html`) never come here.
 */

export type NormalizeIssue =
  | { kind: "unsupported-node"; nodeType: string; path: string }
  | { kind: "unsupported-format"; format: string; path: string }
  | { kind: "unsafe-link"; href: string; path: string }
  | { kind: "footnote"; code: "footnote-empty" | "footnote-duplicate"; path: string }
  /** A Source reference that is not finished (left out) or a copied one (renamed). An incomplete source blocks publishing. */
  | { kind: "source"; code: "source-incomplete" | "source-duplicate"; message: string; path: string }
  | { kind: "block"; issue: BlockIssue };

export type MediaResolver = (id: MediaId) => ArticleMediaAsset | null | undefined;

type LexicalNode = { type?: unknown; children?: unknown; [key: string]: unknown };

const asNode = (value: unknown): LexicalNode => (value && typeof value === "object" ? (value as LexicalNode) : {});
const childrenOf = (node: LexicalNode): LexicalNode[] => (Array.isArray(node.children) ? node.children.map(asNode) : []);

// Lexical's text format bits. Only bold and italic are writers' meaning here.
const BOLD = 1;
const ITALIC = 2;
const OTHER_FORMATS: Array<[number, string]> = [[4, "strikethrough"], [8, "underline"], [16, "code"], [32, "subscript"], [64, "superscript"], [128, "highlight"]];

/** The root node list of a stored body, whatever wrapper it arrives in. */
function rootChildren(state: unknown): LexicalNode[] {
  const value = asNode(state);
  const root = value.root ? asNode(value.root) : value;
  return childrenOf(root);
}

/** The stored blocks of a body as semantic (unfinalized) blocks, in order. */
function storedBlocks(state: unknown): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  rootChildren(state).forEach((node, index) => {
    if (node.type !== "block") return;
    const fields = asNode(node.fields);
    if (!isArticleBlockType(fields.blockType)) return;
    const id = typeof fields.id === "string" && fields.id ? fields.id : `block-${index}`;
    blocks.push(articleBlockFromFields(fields.blockType, id, fields) as ArticleBlock);
  });
  return blocks;
}

/** A stored Source reference's fields as the semantic reference (unfinished). */
function storedSource(fields: LexicalNode, id: string): SourceRef {
  const label = typeof fields.label === "string" ? fields.label : "";
  const note = typeof fields.note === "string" && fields.note.trim() ? { note: fields.note } : {};
  if (fields.kind === "document") {
    const page = typeof fields.page === "number" ? fields.page : typeof fields.page === "string" && /^\d+$/.test(fields.page) ? Number(fields.page) : undefined;
    return { type: "source", id, kind: "document", media: mediaIdOf(fields.media) as MediaId, ...(page ? { page } : {}), label, ...note };
  }
  return { type: "source", id, kind: "web", url: typeof fields.url === "string" ? fields.url : "", label, ...note };
}

/** Every inline Source reference stored anywhere in the body, in reading order. */
function storedSources(state: unknown): SourceRef[] {
  const found: SourceRef[] = [];
  const visit = (node: LexicalNode) => {
    if (node.type === "inlineBlock") {
      const fields = asNode(node.fields);
      if (fields.blockType === "source") found.push(storedSource(fields, typeof fields.id === "string" ? fields.id : ""));
      return;
    }
    if (node.type === "block") return;
    childrenOf(node).forEach(visit);
  };
  rootChildren(state).forEach(visit);
  return found;
}

/** Every Media ID a body references (every block that names Media, and the PDFs inline sources point at), for the host to resolve before normalizing. */
export function collectMediaIds(state: unknown): MediaId[] {
  return [...new Map(collectMediaUses(state).map(({ id }) => [mediaKey(id), id])).values()];
}

export type StoredMediaUse = { id: MediaId; hasAltOverride: boolean };

/**
 * Every stored Media use, before finalization, including whether this story
 * supplies its own alt text for that particular image use. Publication
 * readiness uses this instead of treating the asset's global alt as the only
 * valid source: the public renderer already gives an `altOverride` precedence.
 */
export function collectMediaUses(state: unknown): StoredMediaUse[] {
  const use = (id: MediaId | null, altOverride?: string): StoredMediaUse[] => id === null ? [] : [{ id, hasAltOverride: Boolean(altOverride?.trim()) }];
  const blockUses = storedBlocks(state).flatMap((block): StoredMediaUse[] => {
    switch (block.type) {
      case "photo":
      case "portraitText":
      case "visualChapter":
      case "annotatedImage":
        return use(block.media, block.altOverride);
      case "gallery":
        return block.items.flatMap((item) => use(item.media, item.altOverride));
      case "timeline":
        return block.items.flatMap((event) => [...(event.image ? use(event.image.media, event.image.altOverride) : []), ...(event.document ? use(event.document.media) : [])]);
      case "chartMap":
        return use(block.image, block.altOverride);
      default:
        return blockMediaIds(block).map((id) => ({ id, hasAltOverride: false }));
    }
  });
  const sourceUses = storedSources(state).flatMap((ref) => ref.kind === "document" ? use(ref.media) : []);
  return [...blockUses, ...sourceUses];
}

/** Editorial labels for each block type that uses a Media asset. */
export function collectMediaUsageLabels(state: unknown, id: MediaId): string[] {
  return [...new Set(storedBlocks(state)
    .filter((block) => blockMediaIds(block).some((value) => mediaKey(value) === mediaKey(id)))
    .map((block) => blockLabel(block.type)))];
}

/** Every Story, Poll and Event a body names, for the host to resolve into public-safe references before normalizing. */
export function collectReferenceIds(state: unknown): { stories: MediaId[]; polls: MediaId[]; events: MediaId[] } {
  const blocks = storedBlocks(state);
  const unique = (ids: MediaId[]) => [...new Map(ids.map((id) => [mediaKey(id), id])).values()];
  return { stories: unique(blocks.flatMap(blockStoryIds)), polls: unique(blocks.flatMap(blockPollIds)), events: unique(blocks.flatMap(blockEventIds)) };
}

/** A Payload Media document as the renderer's media record. `src` is the host's choice of URL. */
export function articleMediaFromPayload(doc: Record<string, unknown>, src: (doc: Record<string, unknown>) => string | null): ArticleMediaAsset | null {
  const id = mediaIdOf(doc.id);
  const url = src(doc);
  if (id === null || !url) return null;
  const mimeType = typeof doc.mimeType === "string" ? doc.mimeType : "";
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  // Byline's art-direction intent is the only focal point (Payload's native one is off).
  const focal = normalizeArtDirectionIntent(doc.artDirection).focalPoint;
  return {
    id,
    kind: mediaKindOf(mimeType),
    src: url,
    width: number(doc.width),
    height: number(doc.height),
    mimeType,
    filename: typeof doc.filename === "string" ? doc.filename : "",
    filesize: number(doc.filesize),
    alt: typeof doc.alt === "string" ? doc.alt.trim() : "",
    credit: mediaCredit({ creator: doc.creator, credit: doc.credit }),
    ...(focal.x !== 50 || focal.y !== 50 ? { focalPoint: focal } : {})
  };
}

/**
 * A stored story's public body. Imported WordPress stories stay `legacy-html`
 * forever and never pass through the Lexical normalizer, whatever else the
 * record holds.
 */
export type NormalizeOptions = {
  media: MediaResolver;
  /** Public-safe Story, Poll and Event facts, and the registered repository interactives and trackers. Without it, blocks that need them are left out. */
  references?: ReferenceLookup;
};

export function normalizePayloadStoryBody(story: { contentFormat?: unknown; body?: unknown; legacyHtml?: unknown }, options: NormalizeOptions): { body: PublicArticleBody; issues: NormalizeIssue[] } {
  if (story.contentFormat === "legacy-html") return { body: { format: "legacy-html", html: typeof story.legacyHtml === "string" ? story.legacyHtml : "" }, issues: [] };
  return normalizePayloadArticleBody(story.body, options);
}

export function normalizePayloadArticleBody(state: unknown, options: NormalizeOptions): { body: ArticleBody; issues: NormalizeIssue[] } {
  const issues: NormalizeIssue[] = [];
  const references: ArticleReferences = {};
  const footnoteIds = new Set<string>();
  const sourceIds = new Set<string>();
  const media: ArticleBody["media"] = {};
  const resolve = (id: MediaId): ArticleMediaAsset | null => {
    const asset = options.media(id) ?? null;
    if (asset) media[mediaKey(id)] = asset;
    return asset;
  };

  const inline = (nodes: LexicalNode[], path: string): Inline[] => {
    const out: Inline[] = [];
    nodes.forEach((node, index) => {
      const here = `${path}.${index}`;
      switch (node.type) {
        case "text":
        case "tab": {
          const text = typeof node.text === "string" ? node.text : "";
          const format = typeof node.format === "number" ? node.format : 0;
          for (const [bit, name] of OTHER_FORMATS) if (format & bit) issues.push({ kind: "unsupported-format", format: name, path: here });
          const run: TextRun = { type: "text", text: node.type === "tab" ? " " : text };
          if (format & BOLD) run.bold = true;
          if (format & ITALIC) run.italic = true;
          out.push(run);
          break;
        }
        case "linebreak":
          out.push({ type: "lineBreak" });
          break;
        case "inlineBlock": {
          const fields = asNode(node.fields);
          if (fields.blockType === "source") {
            let id = typeof fields.id === "string" && fields.id ? fields.id : `source-${here}`;
            const { ref, problem } = finalizeSourceRef(storedSource(fields, id), resolve);
            if (!ref) {
              issues.push({ kind: "source", code: "source-incomplete", message: problem ?? "This source is not finished.", path: here });
              break;
            }
            if (sourceIds.has(id)) {
              issues.push({ kind: "source", code: "source-duplicate", message: "A copied source was renumbered.", path: here });
              let suffix = 2;
              while (sourceIds.has(`${id}-${suffix}`)) suffix += 1;
              id = `${id}-${suffix}`;
            }
            sourceIds.add(id);
            out.push({ ...ref, id });
            break;
          }
          if (fields.blockType !== "footnote") {
            issues.push({ kind: "unsupported-node", nodeType: `inlineBlock:${String(fields.blockType)}`, path: here });
            break;
          }
          const note = cleanText(fields.text, ARTICLE_BLOCK_LIMITS.footnote);
          if (!note) {
            issues.push({ kind: "footnote", code: "footnote-empty", path: here });
            break;
          }
          let id = typeof fields.id === "string" && fields.id ? fields.id : `footnote-${here}`;
          // A copied reference keeps its id in the editor; an anchor id must be unique.
          if (footnoteIds.has(id)) {
            issues.push({ kind: "footnote", code: "footnote-duplicate", path: here });
            let suffix = 2;
            while (footnoteIds.has(`${id}-${suffix}`)) suffix += 1;
            id = `${id}-${suffix}`;
          }
          footnoteIds.add(id);
          out.push({ type: "footnote", id, text: note });
          break;
        }
        case "link":
        case "autolink": {
          const fields = asNode(node.fields);
          const runs = inline(childrenOf(node), here).filter((child): child is TextRun => child.type === "text");
          const href = fields.linkType === "internal" ? null : safeHref(fields.url);
          if (href) out.push({ type: "link", href, children: runs });
          else {
            issues.push({ kind: "unsafe-link", href: typeof fields.url === "string" ? fields.url : String(fields.linkType ?? ""), path: here });
            out.push(...runs);
          }
          break;
        }
        default:
          issues.push({ kind: "unsupported-node", nodeType: String(node.type ?? "unknown"), path: here });
      }
    });
    return compactInline(out);
  };

  const list = (node: LexicalNode, path: string): ListNode => {
    const items: ListItemNode[] = [];
    childrenOf(node).forEach((child, index) => {
      const here = `${path}.${index}`;
      if (child.type !== "listitem") {
        issues.push({ kind: "unsupported-node", nodeType: String(child.type ?? "unknown"), path: here });
        return;
      }
      const nested = childrenOf(child).filter((grand) => grand.type === "list");
      const content = inline(childrenOf(child).filter((grand) => grand.type !== "list"), here);
      // Lexical nests a sub-list in its own list item; it belongs to the item before it.
      if (nested.length && !hasInlineText(content) && items.length) {
        items[items.length - 1] = { ...items[items.length - 1], list: list(nested[0], `${here}.0`) };
        return;
      }
      if (!hasInlineText(content) && !nested.length) return;
      items.push({ children: content, ...(nested.length ? { list: list(nested[0], `${here}.0`) } : {}) });
    });
    return { type: "list", ordered: node.listType === "number" || node.tag === "ol", items };
  };

  // Story and Poll facts a finalized block names, resolved once and kept for the body's reference table.
  const lookup: ReferenceLookup = {
    story: (id) => {
      const story = options.references?.story?.(id) ?? null;
      if (story) (references.stories ??= {})[mediaKey(id)] = story;
      return story;
    },
    poll: (id) => {
      const poll = options.references?.poll?.(id) ?? null;
      if (poll) (references.polls ??= {})[mediaKey(id)] = poll;
      return poll;
    },
    event: (id) => {
      const event = options.references?.event?.(id) ?? null;
      if (event) (references.events ??= {})[mediaKey(id)] = event;
      return event;
    },
    interactive: (key) => options.references?.interactive?.(key) === true,
    tracker: (key) => options.references?.tracker?.(key) === true
  };

  const nodes: ArticleBodyNode[] = [];
  rootChildren(state).forEach((node, index) => {
    const path = `root.${index}`;
    switch (node.type) {
      case "paragraph": {
        const children = inline(childrenOf(node), path);
        if (hasInlineText(children)) nodes.push({ type: "paragraph", children });
        return;
      }
      case "heading": {
        const children = inline(childrenOf(node), path);
        if (!hasInlineText(children)) return;
        if (node.tag === "h2" || node.tag === "h3") nodes.push({ type: "heading", level: node.tag === "h3" ? 3 : 2, children });
        else {
          // Only H2 and H3 exist; anything else reads as the nearest allowed level.
          issues.push({ kind: "unsupported-node", nodeType: `heading:${String(node.tag)}`, path });
          nodes.push({ type: "heading", level: node.tag === "h1" ? 2 : 3, children });
        }
        return;
      }
      case "list": {
        if (node.listType === "check") issues.push({ kind: "unsupported-node", nodeType: "list:check", path });
        const value = list(node, path);
        if (value.items.length) nodes.push(value);
        return;
      }
      case "block": {
        const fields = asNode(node.fields);
        const type = fields.blockType;
        if (!isArticleBlockType(type)) {
          issues.push({ kind: "unsupported-node", nodeType: `block:${String(type)}`, path });
          return;
        }
        const id = typeof fields.id === "string" && fields.id ? fields.id : `block-${index}`;
        const draft = articleBlockFromFields(type, id, fields) as ArticleBlock;
        const { block, issues: blockIssues } = finalizeBlock(draft, resolve, lookup);
        for (const issue of blockIssues) issues.push({ kind: "block", issue });
        if (block) nodes.push(block);
        return;
      }
      default:
        issues.push({ kind: "unsupported-node", nodeType: String(node.type ?? "unknown"), path });
    }
  });

  // Only references the published nodes still name stay in the table (a dropped related story leaves none behind).
  const kept = {
    stories: new Set(nodes.flatMap((node) => (isArticleBlock(node) ? blockStoryIds(node) : [])).map(mediaKey)),
    polls: new Set(nodes.flatMap((node) => (isArticleBlock(node) ? blockPollIds(node) : [])).map(mediaKey)),
    events: new Set(nodes.flatMap((node) => (isArticleBlock(node) ? blockEventIds(node) : [])).map(mediaKey))
  };
  for (const key of Object.keys(references.stories ?? {})) if (!kept.stories.has(key)) delete references.stories![key];
  for (const key of Object.keys(references.polls ?? {})) if (!kept.polls.has(key)) delete references.polls![key];
  for (const key of Object.keys(references.events ?? {})) if (!kept.events.has(key)) delete references.events![key];
  if (references.events && !Object.keys(references.events).length) delete references.events;
  // A related story's thumbnail is Media too: resolved like any other, or left off.
  for (const [key, story] of Object.entries(references.stories ?? {})) {
    if (story.thumbnail !== undefined && !resolve(story.thumbnail)) references.stories![key] = { ...story, thumbnail: undefined };
  }

  // Only media the published nodes (and kept thumbnails) still reference stays in the table.
  const used = new Set([...bodyMediaIds(nodes), ...Object.values(references.stories ?? {}).flatMap((story) => (story.thumbnail === undefined ? [] : [story.thumbnail]))].map(mediaKey));
  for (const key of Object.keys(media)) if (!used.has(key)) delete media[key];
  if (references.stories && !Object.keys(references.stories).length) delete references.stories;
  if (references.polls && !Object.keys(references.polls).length) delete references.polls;
  const hasReferences = Boolean(Object.keys(references.stories ?? {}).length || Object.keys(references.polls ?? {}).length || Object.keys(references.events ?? {}).length);
  const body: ArticleBody = { format: ARTICLE_BODY_FORMAT, version: ARTICLE_BODY_VERSION, nodes, media, ...(hasReferences ? { references } : {}) };
  return { body, issues };
}
