import { readFile } from "node:fs/promises";
import postcss from "postcss";

/*
 * The WordPress editor canvas (wordpress-plugin/src/editor-canvas) mirrors how an
 * article looks on the site without sharing code with it. This keeps the two in
 * step: every pair below must declare the same value, so changing article
 * typography in packages/ui/article.css fails here until the editor follows.
 */

const articlePath = "packages/ui/article.css";
const editorPath = "wordpress-plugin/src/editor-canvas/editor-canvas.css";
const entryPath = "wordpress-plugin/src/editor-canvas/index.ts";

const article = postcss.parse(await readFile(articlePath, "utf8"), { from: articlePath });
const editor = postcss.parse(await readFile(editorPath, "utf8"), { from: editorPath });

const view = ".byline-article-view";
const themed = (selector) => `html[data-byline-theme="weekly-wildcat"] ${selector}`;
const canvas = ".editor-styles-wrapper";

// [article.css selector, editor selector, properties, media query (optional)]
const pairs = [
  [`${view} .article-body`, `${canvas} .is-root-container`, ["font-size", "line-height"]],
  [`${view} .article-body`, `${canvas} .is-root-container`, ["font-size"], "(max-width: 640px)"],
  [themed(`${view} .article-body`), `${canvas} .is-root-container`, ["font-family"]],
  [`${view} .article-body a`, `${canvas} .is-root-container a`, ["color", "text-decoration", "text-decoration-thickness", "text-underline-offset"]],
  [`${view} .article-body p`, `${canvas} .is-root-container p`, ["margin"]],
  [`${view} .article-body ul`, `${canvas} .is-root-container ul`, ["padding-left"]],
  [`${view} .article-body li + li`, `${canvas} .is-root-container li + li`, ["margin-top"]],
  [`${view} .article-body h2`, `${canvas} .is-root-container h2`, ["line-height", "margin"]],
  [`${view} .article-body h2`, `${canvas} .is-root-container h2`, ["font-size"]],
  [`${view} .article-body h3`, `${canvas} .is-root-container h3`, ["font-size"]],
  [themed(`${view} .article-body h2`), `${canvas} .is-root-container h2`, ["font-family", "font-weight", "letter-spacing"]],
  [`${view} .article-body blockquote`, `${canvas} .is-root-container blockquote`, ["border-left", "color", "font-size", "line-height", "padding-left"]],
  [`${view} .article-body .wp-block-pullquote`, `${canvas} .is-root-container .wp-block-pullquote`, ["border-bottom", "border-top", "font-size", "line-height", "margin", "padding", "text-align"]],
  [`${view} .article-body .wp-block-pullquote blockquote`, `${canvas} .is-root-container .wp-block-pullquote blockquote`, ["border-left", "margin-bottom", "padding-left"]],
  [`${view} .article-body .wp-block-image img`, `${canvas} .is-root-container .wp-block-image img`, ["border"]],
  [`${view} .article-body figcaption`, `${canvas} .is-root-container figcaption`, ["color", "font-family", "font-size", "line-height", "margin-top"]],
  [`${view} .article-header h1`, `${canvas} .editor-post-title__input`, ["font-size"]],
  [`${view} .article-header h1`, `${canvas} .editor-post-title__input`, ["font-size"], "(max-width: 640px)"],
  [themed(`${view} .article-header h1`), `${canvas} .editor-post-title__input`, ["font-family", "font-weight", "letter-spacing", "line-height"]]
];

// article.css only sets the body size under max-width: 640px, so the media query is
// matched on that rule's at-rule params.
const normalize = (value) => value.replace(/\s+/g, " ").replace(/\b0\./g, ".").trim();
const rootFontSizeFixups = new Map([["font-size", normalize]]);

function declaration(root, selector, property, media) {
  let found;
  root.walkRules((rule) => {
    const inMedia = rule.parent?.type === "atrule" && rule.parent.name === "media" ? rule.parent.params : undefined;
    if ((inMedia ?? null) !== (media ?? null)) return;
    if (!postcss.list.comma(rule.selector).map((part) => part.replace(/\s+/g, " ").trim()).includes(selector)) return;
    rule.walkDecls(property, (decl) => { found = decl.value; });
  });
  return found === undefined ? undefined : (rootFontSizeFixups.get(property) ?? normalize)(found);
}

const failures = [];
for (const [articleSelector, editorSelector, properties, media] of pairs) {
  for (const property of properties) {
    const expected = declaration(article, articleSelector, property, media);
    const actual = declaration(editor, editorSelector, property, media);
    if (expected === undefined) {
      failures.push(`${articlePath} no longer declares ${property} for "${articleSelector}"${media ? ` in @media ${media}` : ""}. Update the mapping in scripts/verify-editor-canvas-contract.mjs.`);
    } else if (expected !== actual) {
      failures.push(`${editorPath}: ${property} for "${editorSelector}" is ${actual ?? "missing"}, but the site uses ${expected} ("${articleSelector}").`);
    }
  }
}

// Every rule must be prefixed here, because enqueue_block_assets does not do it.
editor.walkRules((rule) => {
  for (const selector of postcss.list.comma(rule.selector)) {
    if (!selector.startsWith(canvas)) failures.push(`${editorPath}: selector is not scoped to ${canvas}: ${selector}`);
  }
});

// Fonts and tokens come from their canonical sources, never from a copy.
editor.walkAtRules("font-face", () => failures.push(`${editorPath} defines its own @font-face; fonts come from apps/web/views/fonts.css.`));
const entry = await readFile(entryPath, "utf8");
if (!entry.includes("apps/web/views/fonts.css")) failures.push(`${entryPath} must import apps/web/views/fonts.css.`);

if (failures.length > 0) {
  console.error(`Editor canvas drifted from the article styles:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Editor canvas matches the article typography, scoping, and font sources.");
