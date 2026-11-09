/**
 * Reviewable blocks from an imported (WordPress) story's legacy HTML
 * (docs/review.md#submitted). The HTML is parsed into an inert document —
 * DOMParser never runs scripts, loads images or fires handlers — and only
 * its text is read back out; nothing from it is ever inserted as markup.
 * The review view renders these strings as React text.
 */

export type LegacyBlock = { kind: "paragraph" | "heading" | "quote" | "list" | "media"; text: string; level?: number };

/** Content that is never reader text: its contents are dropped entirely. */
const SKIPPED = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed", "svg", "math", "head", "title", "link", "meta", "button", "select", "textarea", "input"]);
/** Elements that are media in the reader's article. */
const MEDIA = new Set(["img", "figure", "video", "audio", "picture"]);
const HEADINGS = /^h([1-6])$/;
const TEXT_BLOCKS = new Set(["p", "pre", "address", "dt", "dd", "figcaption", "caption", "td", "th"]);
const CONTAINERS = new Set(["div", "section", "article", "main", "aside", "header", "footer", "body", "table", "thead", "tbody", "tfoot", "tr", "dl", "center", "details", "summary"]);

type ParseHtml = (html: string) => Document;

function browserParser(): ParseHtml | null {
  if (typeof DOMParser === "undefined") return null;
  const parser = new DOMParser();
  return (html) => parser.parseFromString(html, "text/html");
}

const ELEMENT = 1;
const TEXT = 3;

/** The visible words inside an element, with skipped elements removed and whitespace collapsed. */
function textOf(node: Node): string {
  let out = "";
  const walk = (current: Node) => {
    if (current.nodeType === TEXT) { out += current.nodeValue ?? ""; return; }
    if (current.nodeType !== ELEMENT) return;
    const tag = (current as Element).localName;
    if (SKIPPED.has(tag)) return;
    if (tag === "br") { out += "\n"; return; }
    for (const child of Array.from(current.childNodes)) walk(child);
  };
  walk(node);
  return out.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function captionOf(element: Element): string {
  const caption = element.localName === "figure" ? element.querySelector("figcaption") : null;
  if (caption) return textOf(caption);
  const image = element.localName === "img" ? element : element.querySelector("img");
  return image?.getAttribute("alt")?.trim() ?? "";
}

/**
 * Splits legacy HTML into the review's text blocks. Returns null when no
 * HTML parser is available (server rendering); the review is client-fetched,
 * so the browser always has one.
 */
export function legacyHtmlBlocks(html: string, parse: ParseHtml | null = browserParser()): LegacyBlock[] | null {
  if (!parse) return null;
  const doc = parse(html);
  const blocks: LegacyBlock[] = [];
  let loose = "";
  const flush = () => {
    const text = loose.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    if (text) blocks.push({ kind: "paragraph", text });
    loose = "";
  };
  const push = (block: LegacyBlock) => {
    flush();
    if (block.text || block.kind === "media") blocks.push(block);
  };

  const visit = (node: Node) => {
    if (node.nodeType === TEXT) { loose += node.nodeValue ?? ""; return; }
    if (node.nodeType !== ELEMENT) return;
    const element = node as Element;
    const tag = element.localName;
    if (SKIPPED.has(tag)) return;
    if (tag === "br") { loose += "\n"; return; }
    if (MEDIA.has(tag)) { push({ kind: "media", text: captionOf(element) }); return; }
    const heading = HEADINGS.exec(tag);
    if (heading) { push({ kind: "heading", text: textOf(element), level: Number(heading[1]) }); return; }
    if (tag === "blockquote") { push({ kind: "quote", text: textOf(element) }); return; }
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(element.querySelectorAll("li")).map((item) => textOf(item)).filter(Boolean);
      push({ kind: "list", text: items.join("\n") });
      return;
    }
    if (TEXT_BLOCKS.has(tag) && !element.querySelector("img, figure, video, audio, picture")) { push({ kind: "paragraph", text: textOf(element) }); return; }
    if (CONTAINERS.has(tag) || TEXT_BLOCKS.has(tag) || tag === "li") {
      flush();
      for (const child of Array.from(element.childNodes)) visit(child);
      flush();
      return;
    }
    // Inline content (a, em, strong, span…) joins the surrounding paragraph.
    for (const child of Array.from(element.childNodes)) visit(child);
  };

  for (const child of Array.from(doc.body?.childNodes ?? [])) visit(child);
  flush();
  return blocks;
}
