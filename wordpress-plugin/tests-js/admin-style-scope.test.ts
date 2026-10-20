import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "..");

/** Compile an entry stylesheet exactly as webpack does: Tailwind, nesting, then the `.byline-ui-root` scoping loader. */
async function compile(entry: string) {
  const postcss = require("postcss");
  const file = path.join(root, entry);
  const result = await postcss([require("@tailwindcss/postcss")(), require("postcss-nesting")(), require("../loaders/ui-scope-postcss")]).process(readFileSync(file, "utf8"), { from: file });
  return result.root as import("postcss").Root;
}

function unscopedSelectors(css: import("postcss").Root): string[] {
  const leaks: string[] = [];
  css.walkRules((rule) => {
    for (let parent: any = rule.parent; parent; parent = parent.parent) if (parent.type === "atrule" && /keyframes$/.test(parent.name)) return;
    for (const selector of rule.selectors) if (!selector.includes(".byline-ui-root")) leaks.push(selector);
  });
  return leaks;
}

describe("the React 19 admin stylesheets stay inside .byline-ui-root", () => {
  for (const entry of ["src/home/style.css", "src/workspace/style.css", "src/planning/style.css"]) {
    it(`${entry} has no selector that can reach wp-admin, Gutenberg, Users or the Media Library`, async () => {
      expect(unscopedSelectors(await compile(entry))).toEqual([]);
    });
  }

  it("the Planning stylesheet carries the Schedule-X theme, scoped and pointed at Nova's tokens", async () => {
    const css = (await compile("src/planning/style.css")).toString();
    expect(css).toContain(".byline-ui-root .sx__calendar-wrapper");
    // Schedule-X's global :root tokens become root-scoped, and are then mapped onto Nova's.
    expect(css).not.toMatch(/(^|\n):root\s*\{/);
    expect(css).toMatch(/--sx-color-primary:\s*var\(--primary\)/);
    expect(css).toMatch(/\.byline-ui-root \.sx__calendar-header\s*\{\s*display:\s*none/);
  });

  it("Schedule-X's keyframes are namespaced like every other keyframe", async () => {
    const css = await compile("src/planning/style.css");
    const names: string[] = [];
    css.walkAtRules(/keyframes$/, (rule) => { names.push(rule.params); });
    expect(names.filter((name) => !name.startsWith("byline-ui-"))).toEqual([]);
  });
});
