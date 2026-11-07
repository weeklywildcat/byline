import { safeHref } from "@byline/article-body";
import { escapeHtml } from "@byline/content/story";
import { convertLexicalToHTML, type HTMLConverters } from "@payloadcms/richtext-lexical/html";
import { PublicSnapshotError } from "./errors";

/**
 * A published Page's bounded prose (`proseEditor`: paragraph, H2/H3, bold,
 * italic, web links, bulleted and numbered lists) as v1 `content.rendered`,
 * converted on demand with Payload's supported Lexical HTML converter and
 * never stored. Only those nodes and formats are converted; anything else in
 * a published Page fails preparation rather than being dropped or emitted as
 * raw HTML. There is no page builder and no HTML node.
 */
type Node = { type?: unknown; children?: unknown; tag?: unknown; format?: unknown; listType?: unknown; fields?: Record<string, unknown>; [key: string]: unknown };

const BOLD = 1;
const ITALIC = 2;
const ALLOWED = new Set(["root", "paragraph", "heading", "text", "link", "autolink", "list", "listitem", "linebreak", "tab"]);

function check(node: Node, path: string, problems: string[]) {
  const type = String(node.type ?? "unknown");
  if (!ALLOWED.has(type)) problems.push(`${path}: unsupported node "${type}"`);
  if (type === "heading" && node.tag !== "h2" && node.tag !== "h3") problems.push(`${path}: unsupported heading ${String(node.tag)}`);
  if (type === "list" && node.listType === "check") problems.push(`${path}: unsupported checklist`);
  if (type === "text" && typeof node.format === "number" && (node.format & ~(BOLD | ITALIC)) !== 0) problems.push(`${path}: unsupported text format`);
  if ((type === "link" || type === "autolink") && !safeHref(node.fields?.url)) problems.push(`${path}: unsafe or internal link`);
  if (Array.isArray(node.children)) node.children.forEach((child, index) => check((child ?? {}) as Node, `${path}.${index}`, problems));
}

const kids = (node: unknown) => ((node as { children?: unknown[] }).children ?? []) as never[];

const converters: HTMLConverters = {
  text: ({ node }) => {
    const value = escapeHtml(String((node as Node).text ?? ""));
    const format = typeof (node as Node).format === "number" ? ((node as Node).format as number) : 0;
    const italic = format & ITALIC ? `<em>${value}</em>` : value;
    return format & BOLD ? `<strong>${italic}</strong>` : italic;
  },
  linebreak: () => "<br>",
  tab: () => " ",
  paragraph: ({ node, nodesToHTML }) => `<p>${nodesToHTML({ nodes: kids(node) }).join("")}</p>`,
  heading: ({ node, nodesToHTML }) => {
    const tag = (node as Node).tag === "h3" ? "h3" : "h2";
    return `<${tag}>${nodesToHTML({ nodes: kids(node) }).join("")}</${tag}>`;
  },
  list: ({ node, nodesToHTML }) => {
    const tag = (node as Node).listType === "number" ? "ol" : "ul";
    return `<${tag}>${nodesToHTML({ nodes: kids(node) }).join("")}</${tag}>`;
  },
  listitem: ({ node, nodesToHTML }) => `<li>${nodesToHTML({ nodes: kids(node) }).join("")}</li>`,
  link: ({ node, nodesToHTML }) => {
    const href = safeHref((node as Node).fields?.url) ?? "";
    const external = /^https?:\/\//i.test(href);
    return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ""}>${nodesToHTML({ nodes: kids(node) }).join("")}</a>`;
  },
  autolink: ({ node, nodesToHTML }) => {
    const href = safeHref((node as Node).fields?.url) ?? "";
    return `<a href="${escapeHtml(href)}">${nodesToHTML({ nodes: kids(node) }).join("")}</a>`;
  }
};

/** HTML for a Page body, or a `unsupported-story-content` error naming the page and node. */
export function pageBodyHtml(body: unknown, page: { id: number; title: string }): string {
  if (!body || typeof body !== "object" || !(body as { root?: unknown }).root) return "";
  const root = (body as { root: Node }).root;
  const problems: string[] = [];
  check(root, "root", problems);
  if (problems.length) {
    throw new PublicSnapshotError("unsupported-story-content", `Page ${page.id} (“${page.title.slice(0, 80)}”) has content the public site cannot carry: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}.`, problems.slice(0, 10));
  }
  return convertLexicalToHTML({ data: body as never, converters, disableContainer: true, disableIndent: true, disableTextAlign: true });
}
