import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/editorial-workflow.css", import.meta.url), "utf8");

describe("Story sidebar width", () => {
  it("widens the plugin sidebar beyond WordPress's fixed 280px, only for the Story sidebar", () => {
    const rule = css.match(/\.interface-complementary-area\.byline-editorial-sidebar[^{]*\{[^}]*width:\s*min\((\d+)px,\s*(\d+)vw\)/);
    expect(rule, "the widening rule is missing").not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThan(280);
    // Every selector must be tied to the Story sidebar class so other sidebars keep their width.
    const selectors = css.slice(css.indexOf(".interface-complementary-area.byline-editorial-sidebar")).split("{")[0];
    for (const selector of selectors.split(",")) expect(selector).toContain("byline-editorial-sidebar");
  });

  it("restores the native width on small screens", () => {
    expect(css).toMatch(/@media \(max-width: 782px\)\s*\{\s*\.interface-complementary-area\.byline-editorial-sidebar[\s\S]*?width:\s*auto/);
  });
});
