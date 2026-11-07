import {
  ARTICLE_BODY_FORMAT,
  ARTICLE_BODY_VERSION,
  compactInline,
  finalizeBlock,
  hasInlineText,
  isArticleBlockType,
  mediaCredit,
  mediaKey,
  mediaKindOf,
  safeHref,
  type ArticleBlock,
  type ArticleBody,
  type ArticleBodyNode,
  type ArticleMediaAsset,
  type BlockIssue,
  type Inline,
  type ListItemNode,
  type ListNode,
  type MediaId,
  type PublicArticleBody,
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

/** Every Media ID a body references, for the host to resolve before normalizing. */
export function collectMediaIds(state: unknown): MediaId[] {
  const ids = new Map<string, MediaId>();
  const add = (value: unknown) => {
    const id = mediaIdOf(value);
    if (id !== null) ids.set(mediaKey(id), id);
  };
  for (const node of rootChildren(state)) {
    if (node.type !== "block") continue;
    const fields = asNode(node.fields);
    add(fields.media);
    for (const item of Array.isArray(fields.items) ? fields.items : []) add(asNode(item).media);
  }
  return [...ids.values()];
}

/** A Payload Media document as the renderer's media record. `src` is the host's choice of URL. */
export function articleMediaFromPayload(doc: Record<string, unknown>, src: (doc: Record<string, unknown>) => string | null): ArticleMediaAsset | null {
  const id = mediaIdOf(doc.id);
  const url = src(doc);
  if (id === null || !url) return null;
  const mimeType = typeof doc.mimeType === "string" ? doc.mimeType : "";
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const focalX = number(doc.focalX);
  const focalY = number(doc.focalY);
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
    ...(focalX !== null && focalY !== null && (focalX !== 50 || focalY !== 50) ? { focalPoint: { x: focalX, y: focalY } } : {})
  };
}

/**
 * A stored story's public body. Imported WordPress stories stay `legacy-html`
 * forever and never pass through the Lexical normalizer, whatever else the
 * record holds.
 */
export function normalizePayloadStoryBody(story: { contentFormat?: unknown; body?: unknown; legacyHtml?: unknown }, options: { media: MediaResolver }): { body: PublicArticleBody; issues: NormalizeIssue[] } {
  if (story.contentFormat === "legacy-html") return { body: { format: "legacy-html", html: typeof story.legacyHtml === "string" ? story.legacyHtml : "" }, issues: [] };
  return normalizePayloadArticleBody(story.body, options);
}

export function normalizePayloadArticleBody(state: unknown, options: { media: MediaResolver }): { body: ArticleBody; issues: NormalizeIssue[] } {
  const issues: NormalizeIssue[] = [];
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
        const { block, issues: blockIssues } = finalizeBlock(draft, resolve);
        for (const issue of blockIssues) issues.push({ kind: "block", issue });
        if (block) nodes.push(block);
        return;
      }
      default:
        issues.push({ kind: "unsupported-node", nodeType: String(node.type ?? "unknown"), path });
    }
  });

  // Only media the published nodes still reference stays in the table.
  const used = new Set(collectReferencedMedia(nodes));
  for (const key of Object.keys(media)) if (!used.has(key)) delete media[key];

  return { body: { format: ARTICLE_BODY_FORMAT, version: ARTICLE_BODY_VERSION, nodes, media }, issues };
}

function collectReferencedMedia(nodes: ArticleBodyNode[]): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.type === "photo" || node.type === "document") {
      if (node.media !== null) keys.push(mediaKey(node.media));
    } else if (node.type === "gallery") {
      for (const item of node.items) if (item.media !== null) keys.push(mediaKey(item.media));
    }
  }
  return keys;
}
