import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tailwind only emits a utility when its file is a registered `@source`. A screen
 * that renders a component from another folder without registering that folder
 * silently loses the utilities only that component uses; Story Peek on Home
 * rendered full-screen and unpadded because Home never registered `../story`.
 */
const src = path.resolve(__dirname, "../src");
const read = (file: string) => readFileSync(file, "utf8");

function resolveImport(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts"), base]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

/** Every local .tsx/.ts file reachable from an entry. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of read(file).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const next = resolveImport(file, match[1]!);
      if (next) visit(next);
    }
  };
  visit(entry);
  return [...seen];
}

/** Directories and files a stylesheet registers, following its `@import` of shared CSS. */
function sources(css: string, seen = new Set<string>()): string[] {
  if (seen.has(css)) return [];
  seen.add(css);
  const text = read(css);
  const own = [...text.matchAll(/@source\s+"([^"]+)"/g)].map((match) => path.resolve(path.dirname(css), match[1]!));
  const imported = [...text.matchAll(/@import\s+"(\.{1,2}\/[^"]+\.css)"/g)].flatMap((match) => sources(path.resolve(path.dirname(css), match[1]!), seen));
  return [...own, ...imported];
}

const covered = (file: string, registered: string[]) => registered.some((source) => file === source || file.startsWith(source.endsWith(path.sep) ? source : `${source}${path.sep}`) || path.dirname(file) === source);

describe("Tailwind @source coverage", () => {
  for (const [name, entry, css] of [
    ["Home", "home-entry.tsx", "home/style.css"],
    ["Story Workspace", "story-workspace-entry.tsx", "workspace/style.css"],
    ["Planning", "planning-entry.tsx", "planning/style.css"]
  ] as const) {
    it(`${name} registers every folder whose components it renders`, () => {
      const registered = sources(path.join(src, css));
      const files = closure(path.join(src, entry)).filter((file) => file.endsWith(".tsx") && path.dirname(file) !== src);
      expect(files.length).toBeGreaterThan(5);
      const missing = [...new Set(files.filter((file) => !covered(file, registered)).map((file) => path.relative(src, path.dirname(file))))];
      expect(missing, `${css} must @source: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
