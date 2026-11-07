import type { ArticleBody } from "@byline/article-body";
import { ArticleBodyContent } from "@byline/ui/article-body";

/**
 * SNAPSHOT V1 COMPATIBILITY SERIALIZATION ONLY (Phase 9 removes it).
 *
 * Snapshot v1 carries a story body as `content.rendered` HTML, but new
 * Payload stories are structured `byline-v1` bodies. This renders the
 * canonical `ArticleBody` through the canonical `@byline/ui` renderer
 * (`ArticleBodyContent`, the same registry `StructuredArticleBody` and Live
 * Preview use), producing the body's INNER markup. The public site's legacy
 * body path wraps it in its one `.article-body` element, so
 * `<div class="article-body">` + this === `StructuredArticleBody`.
 *
 * There is no second block switch here: a block added to the registry is
 * rendered by the registry. Snapshot v2 (Phase 9) carries the structured body
 * itself and this bridge disappears.
 *
 * `react-dom/server` is loaded at run time through a specifier the bundler
 * cannot see: `payload.config.ts` (and so the snapshot task) is part of
 * Next's route graph, and Next refuses a static `react-dom/server` import
 * there. The renderer is Node's own react-dom, used only here, on the server,
 * for static markup; the blocks use no hooks.
 */
const REACT_DOM_SERVER = ["react-dom", "server"].join("/");
let renderer: Promise<(element: unknown) => string> | undefined;

function loadRenderer() {
  renderer ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ REACT_DOM_SERVER).then((module: { renderToStaticMarkup?: (element: unknown) => string; default?: { renderToStaticMarkup?: (element: unknown) => string } }) => {
    const render = module.renderToStaticMarkup ?? module.default?.renderToStaticMarkup;
    if (!render) throw new Error("react-dom/server has no renderToStaticMarkup.");
    return render;
  });
  return renderer;
}

export async function articleBodyCompatibilityHtml(body: ArticleBody): Promise<string> {
  return (await loadRenderer())(<ArticleBodyContent body={body} />);
}
