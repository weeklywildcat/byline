import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []; });
const read = (file: string) => readFileSync(file, "utf8");

describe("one Story Peek", () => {
  it("has exactly one implementation, shared by Home and Planning", () => {
    const definitions = files(src).filter((file) => /export (?:function|const) StoryPeek\b/.test(read(file)));
    expect(definitions.map((file) => path.relative(src, file))).toEqual(["story/StoryPeek.tsx"]);
  });

  it("is mounted by the Planning host and by Home, and nothing else renders a story detail panel", () => {
    expect(read(path.join(src, "story/StoryPeekHost.tsx"))).toContain("<StoryPeek ");
    expect(read(path.join(src, "home/HomeApp.tsx"))).toContain("<StoryPeek ");
    const mounts = files(src).filter((file) => /<StoryPeek[ \n]/.test(read(file))).map((file) => path.relative(src, file)).sort();
    expect(mounts).toEqual(["home/HomeApp.tsx", "story/StoryPeekHost.tsx"]);
  });

  it("left no Planning Quick View behind", () => {
    const leftovers = files(src).filter((file) => /StoryQuickView|story-quick-view|quick-view-model/.test(read(file)) || /StoryQuickView|quick-view/.test(path.basename(file)));
    expect(leftovers.map((file) => path.relative(src, file))).toEqual([]);
  });

  it("has no Planning design system of its own", () => {
    const planning = files(path.join(src, "planning"));
    for (const file of planning) {
      const text = read(file);
      expect(text, path.relative(src, file)).not.toMatch(/byline-planning-/);
      expect(text, path.relative(src, file)).not.toMatch(/@wordpress\/(components|element)/);
    }
    expect(planning.map((file) => path.basename(file))).not.toContain("planning-ui.tsx");
  });
});
