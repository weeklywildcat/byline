import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_PAGES } from "../../byline/lib/static-pages.ts";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function content(page) {
  return page.sections.map((section) => {
    const paragraphs = (Array.isArray(section.body) ? section.body : [section.body])
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("\n");
    const actions = section.actions?.length
      ? `<div class="byline-page-section-actions">${section.actions.map((action) => `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`).join("")}</div>`
      : "";
    return `<section class="byline-page-section"><h2>${escapeHtml(section.title)}</h2>\n<div class="byline-page-section-body">${paragraphs}${actions ? `\n${actions}` : ""}</div></section>`;
  }).join("\n\n");
}

const pages = STATIC_PAGES.map((page) => ({
  slug: page.slug,
  title: page.title,
  eyebrow: page.eyebrow,
  description: page.description,
  content: content(page),
  actions: page.actions ?? []
}));

await writeFile(
  path.join(pluginRoot, "migrations", "weekly-wildcat-pages.json"),
  `${JSON.stringify({ version: 1, pages }, null, 2)}\n`,
  "utf8"
);

console.log(`Exported ${pages.length} Weekly Wildcat page seeds.`);
