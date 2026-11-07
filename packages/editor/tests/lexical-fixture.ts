import type { ArticleBlock, ArticleBody, Inline, ListNode } from "@byline/article-body";

/**
 * The inverse of the normalizer, for tests only: a byline-v1 body as the
 * Lexical JSON Payload stores, with the block fields the Byline editor
 * writes (and the `blockName` Payload adds). Used to prove the round trip and
 * to seed the browser parity story.
 */
type Json = Record<string, unknown>;

const text = (value: string, format = 0): Json => ({ type: "text", text: value, format, detail: 0, mode: "normal", style: "", version: 1 });

function inline(children: readonly Inline[]): Json[] {
  return children.map((child) => {
    if (child.type === "lineBreak") return { type: "linebreak", version: 1 };
    if (child.type === "link") return { type: "link", version: 3, direction: "ltr", format: "", indent: 0, fields: { url: child.href, linkType: "custom", newTab: false }, children: child.children.map((run) => text(run.text, (run.bold ? 1 : 0) | (run.italic ? 2 : 0))) };
    return text(child.text, (child.bold ? 1 : 0) | (child.italic ? 2 : 0));
  });
}

const element = (type: string, children: Json[], extra: Json = {}): Json => ({ type, children, direction: "ltr", format: "", indent: 0, version: 1, ...extra });

function list(node: ListNode): Json {
  return element("list", node.items.map((item, index) => element("listitem", [...inline(item.children), ...(item.list ? [list(item.list)] : [])], { value: index + 1 })), { listType: node.ordered ? "number" : "bullet", tag: node.ordered ? "ol" : "ul", start: 1 });
}

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
      return { ...base, heading: block.heading, body: block.body.map((paragraph) => paragraph.children.map((child) => (child.type === "text" ? child.text : child.type === "lineBreak" ? "\n" : "")).join("")).join("\n\n") };
    case "document":
      return { ...base, media: block.media, title: block.title ?? "", context: block.context ?? "", source: block.source ?? "", pages: block.pages.map((ref) => ({ ...ref })) };
    case "timeline":
      return { ...base, items: block.items.map((item) => ({ ...item })) };
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
