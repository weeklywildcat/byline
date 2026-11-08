/**
 * The live desk writes updates as plain text, the way the WordPress panel did:
 * paragraphs separated by a blank line, line breaks within one, `- ` bullet
 * lists and bare http(s) links. This converts that text to the bounded prose
 * Lexical state a `live-updates` body stores (`proseEditor`: paragraph,
 * bulleted list, link, line break) and back, so there is no editor markup,
 * HTML or formatting a writer can smuggle in and the public projection is
 * built from escaped text only.
 */

type Node = { type: string; version: 1; [key: string]: unknown };

const text = (value: string): Node => ({ type: "text", version: 1, text: value, format: 0, detail: 0, mode: "normal", style: "" });
const linebreak = (): Node => ({ type: "linebreak", version: 1 });
const link = (url: string): Node => ({ type: "link", version: 1, direction: "ltr", format: "", indent: 0, fields: { linkType: "custom", url, newTab: true }, children: [text(url)] });
const paragraph = (children: Node[]): Node => ({ type: "paragraph", version: 1, direction: "ltr", format: "", indent: 0, textFormat: 0, textStyle: "", children });
const listItem = (children: Node[], value: number): Node => ({ type: "listitem", version: 1, direction: "ltr", format: "", indent: 0, value, children });
const list = (items: Node[]): Node => ({ type: "list", version: 1, listType: "bullet", start: 1, tag: "ul", direction: "ltr", format: "", indent: 0, children: items });

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
/** Trailing punctuation belongs to the sentence, not the link. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** A line's inline content: text with each http(s) URL turned into a link node. */
function inline(line: string): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = raw.replace(TRAILING, "");
    const start = match.index ?? 0;
    try {
      const parsed = new URL(url);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) continue;
    } catch {
      continue;
    }
    if (start > last) nodes.push(text(line.slice(last, start)));
    nodes.push(link(url));
    last = start + url.length;
  }
  if (last < line.length) nodes.push(text(line.slice(last)));
  return nodes;
}

function lines(block: string[]): Node[] {
  const out: Node[] = [];
  block.forEach((line, index) => {
    if (index > 0) out.push(linebreak());
    out.push(...inline(line));
  });
  return out;
}

export const LIVE_TEXT_MAX = 5000;

/** Plain text to a prose body. Empty text gives an empty body (the caller rejects it). */
export function plainTextToLexical(input: string): { root: Node } {
  const normalized = input.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, LIVE_TEXT_MAX).trim();
  const children: Node[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const rows = block.split("\n").map((row) => row.trimEnd());
    if (!rows.some((row) => row.trim())) continue;
    const bullets = rows.every((row) => /^[-*•]\s+\S/.test(row.trim()));
    if (bullets) {
      children.push(list(rows.map((row, index) => listItem(inline(row.trim().replace(/^[-*•]\s+/, "")), index + 1))));
      continue;
    }
    // A run of bullets inside a paragraph block still reads as a list; keep mixed blocks as lines.
    children.push(paragraph(lines(rows)));
  }
  return { root: { type: "root", version: 1, direction: "ltr", format: "", indent: 0, children } };
}

const isNode = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function inlineText(node: Record<string, unknown>): string {
  if (node.type === "text") return String(node.text ?? "");
  if (node.type === "linebreak") return "\n";
  if (node.type === "tab") return " ";
  return Array.isArray(node.children) ? node.children.filter(isNode).map(inlineText).join("") : "";
}

/** A prose body back to the desk's plain text (headings and formatting flatten to text). */
export function lexicalToPlainText(body: unknown): string {
  const root = isNode(body) && isNode(body.root) ? body.root : null;
  const blocks = Array.isArray(root?.children) ? (root!.children as unknown[]).filter(isNode) : [];
  return blocks
    .map((block) => {
      if (block.type === "list") {
        const items = Array.isArray(block.children) ? (block.children as unknown[]).filter(isNode) : [];
        return items.map((item) => `${block.listType === "number" ? `${item.value ?? ""}.` : "-"} ${inlineText(item)}`.trim()).join("\n");
      }
      return inlineText(block);
    })
    .filter((block) => block.trim())
    .join("\n\n");
}
