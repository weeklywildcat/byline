import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { componentName, createStoryPresentation, registerInSource, registryHasId, visualClientSource, visualIndexSource, visualStylesSource } from "./story-presentation.mjs";

const registry = `import type { StoryPresentationRegistry } from "./types";
import Fixture from "./stories/reveal-fixture";

export const storyPresentations: StoryPresentationRegistry = {
};

export const fixtureStoryPresentations: StoryPresentationRegistry = {
  8: Fixture
};
`;

async function workspace(source = registry) {
  const root = await mkdtemp(path.join(os.tmpdir(), "story-presentation-"));
  await mkdir(path.join(root, "apps/web/story-presentations"), { recursive: true });
  await writeFile(path.join(root, "apps/web/story-presentations/registry.ts"), source);
  return root;
}

test("component names are PascalCase and never start with a digit", () => {
  assert.equal(componentName("need-a-lift"), "NeedALift");
  assert.equal(componentName("2026-recap"), "Story2026Recap");
});

test("creates the files and registers the post ID without touching the fixture registry", async () => {
  const root = await workspace();
  try {
    const result = await createStoryPresentation({ id: "384", name: "need-a-lift", root });
    const base = path.join(root, "apps/web/story-presentations");
    const index = await readFile(path.join(base, "stories/need-a-lift/index.tsx"), "utf8");
    const styles = await readFile(path.join(base, "stories/need-a-lift/styles.css"), "utf8");
    const updated = await readFile(path.join(base, "registry.ts"), "utf8");

    assert.equal(result.registered, true);
    assert.match(index, /export default function NeedALift\(/);
    assert.match(index, /WordPress post 384/);
    assert.match(index, /<ArticleBody presentation=\{presentation\}/);
    assert.match(styles, /\.story-need-a-lift /);
    assert.match(updated, /import NeedALift from "\.\/stories\/need-a-lift";/);
    assert.match(updated, /storyPresentations: StoryPresentationRegistry = \{\n  384: NeedALift,\n\};/);
    assert.match(updated, /fixtureStoryPresentations: StoryPresentationRegistry = \{\n  8: Fixture\n\};/);
    assert.equal(registryHasId(updated, "384"), true);

    await createStoryPresentation({ id: "385", name: "second-story", root });
    const twice = await readFile(path.join(base, "registry.ts"), "utf8");
    assert.match(twice, /\{\n  384: NeedALift,\n  385: SecondStory,\n\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("without --visual, the presentation keeps the WordPress body and gets no client code", async () => {
  const root = await workspace();
  try {
    await createStoryPresentation({ id: "384", name: "need-a-lift", root });
    const directory = path.join(root, "apps/web/story-presentations/stories/need-a-lift");
    const index = await readFile(path.join(directory, "index.tsx"), "utf8");
    assert.doesNotMatch(index, /defineVisualStory/);
    assert.equal(existsSync(path.join(directory, "client.ts")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--visual creates a flagship visual story: its own narrative, styles and client, registered by post ID", async () => {
  const root = await workspace();
  try {
    const result = await createStoryPresentation({ id: "402", name: "lunch-line", visual: true, root });
    const base = path.join(root, "apps/web/story-presentations");
    const index = await readFile(path.join(base, "stories/lunch-line/index.tsx"), "utf8");
    const styles = await readFile(path.join(base, "stories/lunch-line/styles.css"), "utf8");
    const client = await readFile(path.join(base, "stories/lunch-line/client.ts"), "utf8");
    const updated = await readFile(path.join(base, "registry.ts"), "utf8");

    assert.equal(result.registered, true);
    assert.match(index, /export default defineVisualStory\(\{ name: "lunch-line", Component: LunchLine \}\);/);
    assert.match(index, /WordPress post 402/);
    // The WordPress body is never printed by a visual story; the standard systems are.
    assert.doesNotMatch(index, /ArticleBody/);
    for (const piece of ["ArticleHeadline", "ArticleMeta", "ArticleFeaturedImage", "ArticleStoryFooter", "ArticleStandardEnding"]) assert.match(index, new RegExp(`<${piece} `));
    assert.match(styles, /\.story-lunch-line \.story-lunch-line-sequence/);
    assert.doesNotMatch(styles.replace(/\.story-lunch-line\b[^{]*\{/g, ""), /^[^\s/@}][^{]*\{/m);
    assert.match(client, /export default enhance;/);
    assert.match(client, /IntersectionObserver/);
    assert.doesNotMatch(client, /addEventListener\(["']scroll|scrollTo|scrollBy/);
    assert.match(updated, /import LunchLine from "\.\/stories\/lunch-line";/);
    assert.match(updated, /\{\n  402: LunchLine,\n\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the fixture visual story is exactly what --visual generates", async () => {
  const directory = fileURLToPath(new URL("../apps/web/story-presentations/stories/visual-fixture/", import.meta.url));
  const args = { id: 10, name: "visual-fixture" };
  assert.equal(await readFile(path.join(directory, "index.tsx"), "utf8"), visualIndexSource(args));
  assert.equal(await readFile(path.join(directory, "styles.css"), "utf8"), visualStylesSource(args));
  assert.equal(await readFile(path.join(directory, "client.ts"), "utf8"), visualClientSource(args));
});

test("refuses bad input and duplicates before writing anything", async () => {
  const root = await workspace();
  try {
    await assert.rejects(createStoryPresentation({ id: "abc", name: "story", root }), /post id/);
    await assert.rejects(createStoryPresentation({ id: "0", name: "story", root }), /post id/);
    await assert.rejects(createStoryPresentation({ id: "5", name: "Need A Lift", root }), /kebab-case/);
    await createStoryPresentation({ id: "5", name: "first", root });
    await assert.rejects(createStoryPresentation({ id: "5", name: "other", root }), /already has a presentation/);
    await assert.rejects(createStoryPresentation({ id: "6", name: "first", root }), /already exists/);
    assert.equal(existsSync(path.join(root, "apps/web/story-presentations/stories/other")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prints the lines to add when the registry has an unexpected shape", async () => {
  const root = await workspace("export const somethingElse = {};\n");
  try {
    const result = await createStoryPresentation({ id: "9", name: "odd", root });
    assert.equal(result.registered, false);
    assert.equal(result.entryLine, "9: Odd,");
    assert.equal(registerInSource("nothing", { id: "9", name: "odd" }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registryHasId reads entries without building a pattern from its input", () => {
  const source = registry.replace("storyPresentations: StoryPresentationRegistry = {\n}", "storyPresentations: StoryPresentationRegistry = {\n  384: NeedALift,\n  // 500: Commented,\n}");
  assert.equal(registryHasId(source, "384"), true);
  assert.equal(registryHasId(source, 384), true);
  assert.equal(registryHasId(source, "500"), false);
  assert.equal(registryHasId(source, "38"), false);
  assert.equal(registryHasId(source, "8"), false);
  // Regex metacharacters are inert: they are not a number, so they never match.
  assert.equal(registryHasId(source, "3.*"), false);
  assert.equal(registryHasId(source, ".*"), false);
  assert.equal(registryHasId("nothing", "1"), false);
});
