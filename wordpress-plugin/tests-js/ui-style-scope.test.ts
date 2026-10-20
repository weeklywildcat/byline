import { createRequire } from "node:module";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const uiScope = require("../loaders/ui-scope-postcss.js");

describe("The admin UI's WordPress stylesheet boundary", () => {
  it("scopes theme, utilities, generated property resets and media rules without a global reset", async () => {
    const result = await postcss([uiScope]).process(`
      @layer theme { :root, :host { --color-primary: #333; } }
      @layer utilities { .flex { display: flex; } button, input { color: inherit; } }
      @supports (display: grid) { *, ::before, ::after { --tw-shadow: none; } }
      @media (max-width: 600px) { .grid > * { display: block; } }
      .byline-ui-root .row { color: #333; }
    `, { from: undefined });
    result.root.walkRules((rule) => {
      for (const selector of rule.selectors) expect(selector.startsWith(".byline-ui-root")).toBe(true);
    });
    expect(result.css).not.toContain("@layer utilities");
    expect(result.css).toContain(".byline-ui-root .flex");
    expect(result.css).not.toContain(".byline-ui-root .byline-ui-root");
  });
  it("namespaces animation definitions/references while preserving keyframe percentages", async () => {
    const result = await postcss([uiScope]).process("@keyframes pulse { 50% { opacity: .5; } } :root { --animate-pulse: pulse 2s infinite; } .animate-pulse { animation: pulse 2s infinite; }", { from: undefined });
    expect(result.css).toContain("@keyframes byline-ui-pulse");
    expect(result.css).toContain("50% { opacity: .5; }");
    expect(result.css).not.toContain(".byline-ui-root 50%");
    expect(result.css).toContain("animation: byline-ui-pulse 2s infinite");
  });
  it("namespaces every keyframe the animation utilities reference", async () => {
    const result = await postcss([uiScope]).process("@keyframes enter { from { opacity: 0; } } @keyframes exit { to { opacity: 0; } } .animate-in { animation: enter var(--tw-duration, .15s) ease, exit 1s; animation-name: enter; } .no-match { animation: spinner 1s; }", { from: undefined });
    expect(result.css).toContain("@keyframes byline-ui-enter");
    expect(result.css).toContain("@keyframes byline-ui-exit");
    expect(result.css).toContain("animation: byline-ui-enter var(--tw-duration, .15s) ease, byline-ui-exit 1s");
    expect(result.css).toContain("animation-name: byline-ui-enter");
    expect(result.css).toContain("animation: spinner 1s");
  });
});
