import type { ArticleBlock, ArticleBody, Inline, ListNode } from "@byline/article-body";

/**
 * The inverse of the normalizer: a byline-v1 body as the
 * Lexical JSON Payload stores, with the block fields the Byline editor
 * writes (and the `blockName` Payload adds). Controlled migrations and
 * round-trip tests use this one serializer so stored bodies stay identical.
 */
type Json = Record<string, unknown>;

const text = (value: string, format = 0): Json => ({ type: "text", text: value, format, detail: 0, mode: "normal", style: "", version: 1 });

function inline(children: readonly Inline[]): Json[] {
  return children.map((child) => {
    if (child.type === "footnote") return { type: "inlineBlock", version: 1, fields: { id: child.id, blockType: "footnote", blockName: "", text: child.text } };
    if (child.type === "lineBreak") return { type: "linebreak", version: 1 };
    if (child.type === "link") return { type: "link", version: 3, direction: "ltr", format: "", indent: 0, fields: { url: child.href, linkType: "custom", newTab: false }, children: child.children.map((run) => text(run.text, (run.bold ? 1 : 0) | (run.italic ? 2 : 0))) };
    return text(child.text, (child.bold ? 1 : 0) | (child.italic ? 2 : 0));
  });
}

const element = (type: string, children: Json[], extra: Json = {}): Json => ({ type, children, direction: "ltr", format: "", indent: 0, version: 1, ...extra });

function list(node: ListNode): Json {
  return element("list", node.items.map((item, index) => element("listitem", [...inline(item.children), ...(item.list ? [list(item.list)] : [])], { value: index + 1 })), { listType: node.ordered ? "number" : "bullet", tag: node.ordered ? "ol" : "ul", start: 1 });
}

/** Block paragraphs as the plain text a block stores (blank lines between paragraphs). */
const bodyText = (body: readonly { children: readonly Inline[] }[]): string => body.map((paragraph) => paragraph.children.map((child) => (child.type === "text" ? child.text : child.type === "lineBreak" ? "\n" : "")).join("")).join("\n\n");

export function blockFields(block: ArticleBlock): Json {
  const base = { id: block.id, blockType: block.type, blockName: "" };
  switch (block.type) {
    case "photo":
      return { ...base, media: block.media, caption: block.caption, altOverride: block.altOverride ?? "", placement: block.placement };
    case "gallery":
      return { ...base, fit: block.fit, items: block.items.map((item) => ({ id: item.id, media: item.media, caption: item.caption, altOverride: item.altOverride ?? "" })) };
    case "reportedQuote":
      return { ...base, text: block.text, attribution: block.attribution };
    case "pullQuote":
      return { ...base, text: block.text, attribution: block.attribution ?? "" };
    case "keyFacts":
      return { ...base, heading: block.heading, facts: block.facts.map((fact) => ({ ...fact })) };
    case "context":
      return { ...base, heading: block.heading, body: bodyText(block.body) };
    case "document":
      return { ...base, media: block.media, title: block.title ?? "", context: block.context ?? "", source: block.source ?? "", pages: block.pages.map((ref) => ({ ...ref })) };
    case "timeline":
      return { ...base, items: block.items.map((item) => ({ ...item })) };
    case "portraitText":
      return { ...base, media: block.media, altOverride: block.altOverride ?? "", heading: block.heading ?? "", body: bodyText(block.body), caption: block.caption ?? "", side: block.side };
    case "visualChapter":
      return { ...base, media: block.media, altOverride: block.altOverride ?? "", eyebrow: block.eyebrow ?? "", heading: block.heading, dek: block.dek ?? "", placement: block.placement, align: block.align };
    case "video":
      return { ...base, url: block.videoId ? `https://www.youtube.com/watch?v=${block.videoId}` : "", title: block.title, caption: block.caption ?? "", captionsConfirmed: block.captionsConfirmed ?? true };
    case "audio":
      return { ...base, media: block.media, title: block.title, caption: block.caption ?? "", transcript: block.transcript };
    case "editorsNote":
      return { ...base, body: bodyText(block.body) };
    case "marginNote":
      return { ...base, heading: block.heading ?? "", body: bodyText(block.body) };
    case "expandable":
      return { ...base, heading: block.heading, body: bodyText(block.body) };
    case "chartMap":
      return { ...base, mode: block.mode, url: block.url ?? "", image: block.image, altOverride: block.altOverride ?? "", title: block.title, dek: block.dek ?? "", summary: block.summary, source: block.source ?? "", notes: block.notes ?? "", credit: block.credit ?? "", height: block.height };
    case "dataTable":
      return { ...base, title: block.title, description: block.description ?? "", columns: block.columns.map((column) => ({ ...column })), rows: block.rows.map((row) => ({ id: row.id, cells: [...row.cells] })), presentation: block.presentation, rowHeaders: block.rowHeaders, source: block.source ?? "", notes: block.notes ?? "" };
    case "comparison":
      return { ...base, heading: block.heading ?? "", leftLabel: block.left.label, leftTitle: block.left.title, leftBody: bodyText(block.left.body), rightLabel: block.right.label, rightTitle: block.right.title, rightBody: bodyText(block.right.body) };
    case "keyNumbers":
      return { ...base, heading: block.heading ?? "", source: block.source ?? "", items: block.items.map((item) => ({ id: item.id, value: item.value, label: item.label, context: item.context ?? "" })) };
    case "annotatedImage":
      return { ...base, media: block.media, altOverride: block.altOverride ?? "", caption: block.caption, placement: block.placement, markers: block.markers.map((marker) => ({ ...marker })) };
    case "beforeAfter":
      return { ...base, before: block.before, after: block.after, beforeLabel: block.beforeLabel, afterLabel: block.afterLabel, fit: block.fit, caption: block.caption, placement: block.placement };
    case "relatedCoverage":
      return { ...base, heading: block.heading, stories: block.stories.map((item) => ({ id: item.id, story: item.story })) };
    case "poll":
      return { ...base, poll: block.poll };
    case "repositoryInteractive":
      return { ...base, key: block.key, title: block.title, description: block.description };
  }
}

export function lexicalFromArticleBody(body: ArticleBody): { root: Json } {
  const children = body.nodes.map((node): Json => {
    switch (node.type) {
      case "paragraph":
        return element("paragraph", inline(node.children), { textFormat: 0, textStyle: "" });
      case "heading":
        return element("heading", inline(node.children), { tag: `h${node.level}` });
      case "list":
        return list(node);
      default:
        return { type: "block", version: 2, format: "", fields: blockFields(node) };
    }
  });
  return { root: element("root", children) };
}
