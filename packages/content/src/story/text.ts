import { inlineText, isArticleBlock, type ArticleBodyNode, type ListNode, type PublicArticleBody } from "@byline/article-body";

const ENTITIES: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };

/** Decodes the HTML entities a CMS emits in plain-text positions (titles, labels). */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Rendered HTML as one line of plain text. */
export function plainTextFromHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

/** Escapes plain text for an HTML position (a provider whose fields are plain text). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function listText(list: ListNode): string[] {
  return list.items.flatMap((item) => [inlineText(item.children), ...(item.list ? listText(item.list) : [])]);
}

function nodeText(node: ArticleBodyNode): string[] {
  if (!isArticleBlock(node)) {
    if (node.type === "list") return listText(node);
    return [inlineText(node.children)];
  }
  switch (node.type) {
    case "photo":
      return [node.caption];
    case "gallery":
      return node.items.map((item) => item.caption);
    case "reportedQuote":
      return [node.text, node.attribution];
    case "pullQuote":
      return [node.text, node.attribution ?? ""];
    case "keyFacts":
      return [node.heading, ...node.facts.map((fact) => fact.text)];
    case "context":
      return [node.heading, ...node.body.map((paragraph) => inlineText(paragraph.children))];
    case "document":
      return [node.title ?? "", node.context ?? "", node.source ?? ""];
    case "timeline":
      return node.items.flatMap((item) => [item.label, item.title, item.body]);
    default:
      return [];
  }
}

/** The reader-visible words of a body, as plain text. */
export function articleBodyPlainText(body: PublicArticleBody): string {
  if (body.format === "legacy-html") return plainTextFromHtml(body.html);
  return body.nodes.flatMap(nodeText).join(" ").replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
