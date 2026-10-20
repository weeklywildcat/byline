import { createRequire } from "node:module";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const homeScope = require("../loaders/home-postcss.js");

describe("Home's WordPress stylesheet boundary", () => {
  it("scopes theme, utilities, generated property resets and media rules without a global reset", async () => {
    const result = await postcss([homeScope]).process(`
      @layer theme { :root, :host { --color-primary: #333; } }
      @layer utilities { .flex { display: flex; } button, input { color: inherit; } }
      @supports (display: grid) { *, ::before, ::after { --tw-shadow: none; } }
      @media (max-width: 600px) { .grid > * { display: block; } }
      .byline-home-root .home-row { color: #333; }
    `, { from: undefined });
    result.root.walkRules((rule) => {
      for (const selector of rule.selectors) expect(selector.startsWith(".byline-home-root")).toBe(true);
    });
    expect(result.css).not.toContain("@layer utilities");
    expect(result.css).toContain(".byline-home-root .flex");
    expect(result.css).not.toContain(".byline-home-root .byline-home-root");
  });
  it("namespaces animation definitions/references while preserving keyframe percentages", async () => {
    const result = await postcss([homeScope]).process("@keyframes pulse { 50% { opacity: .5; } } :root { --animate-pulse: pulse 2s infinite; } .animate-pulse { animation: pulse 2s infinite; }", { from: undefined });
    expect(result.css).toContain("@keyframes byline-home-pulse");
    expect(result.css).toContain("50% { opacity: .5; }");
    expect(result.css).not.toContain(".byline-home-root 50%");
    expect(result.css).toContain("animation: byline-home-pulse 2s infinite");
  });
});
