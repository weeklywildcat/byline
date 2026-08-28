import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const blockNames = ["stories", "people", "sports-schedule", "events", "poll", "game-score", "correction-notice"];

async function readPlugin(path: string) {
  return readFile(new URL(`../../../wordpress-plugin/${path}`, import.meta.url), "utf8");
}

describe("Gutenberg newsroom library contract", () => {
  it("ships exactly the requested metadata-driven block set", async () => {
    const metadata = await Promise.all(blockNames.map(async (name) => JSON.parse(await readPlugin(`src/blocks/${name}/block.json`))));

    expect(metadata.map((block) => block.name)).toEqual(blockNames.map((name) => `byline/${name}`));
    metadata.forEach((block) => {
      expect(block.apiVersion).toBe(3);
      expect(block.category).toBe("byline");
      expect(block.editorScript).toBe("file:./index.js");
      expect(block.style).toBe("file:./style-index.css");
      expect(block.postTypes).toContain(block.name === "byline/game-score" ? "post" : "page");
    });
    expect(metadata.some((block) => block.name === "byline/game-score" && block.usesContext.includes("postId"))).toBe(true);
  });

  it("keeps public rendering, legacy fallback suppression, and packaging connected", async () => {
    const renderer = await readPlugin("includes/content/newsroom-blocks.php");
    const main = await readPlugin("weekly-wildcat-headless.php");
    const webpack = await readPlugin("webpack.config.js");
    const packageScript = await readFile(new URL("../../../scripts/package-plugin.sh", import.meta.url), "utf8");
    const article = await readFile(new URL("../app/[segment]/[month]/[day]/[category]/[articleSlug]/page.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("../app/[segment]/page.tsx", import.meta.url), "utf8");

    ["byline_newsroom_render_stories", "byline_newsroom_render_people", "byline_newsroom_render_sports_schedule", "byline_newsroom_render_events", "byline_newsroom_render_poll", "byline_newsroom_render_game_score", "byline_newsroom_game_score_game_ids"].forEach((name) => expect(renderer).toContain(name));
    expect(renderer).toContain("register_block_bindings_source");
    expect(renderer).toContain("byline/publication");
    expect(renderer).not.toMatch(/byline\/newsletter|newsletter block/i);
    expect(main).toContain("gameScoreGameIds");
    expect(article).toContain("getPostGameScoreGameIds");
    expect(article).toContain("showLegacyPrimaryGame");
    expect(article).toContain("NewsroomPollHydrator");
    expect(page).toContain("NewsroomPollHydrator");
    blockNames.forEach((name) => expect(webpack).toContain(`blocks/${name}/index`));
    blockNames.forEach((name) => expect(packageScript).toContain(`build/blocks/${name}/block.json`));
  });

  it("does not recreate custom Core FAQ, table, gallery, image, or list blocks", async () => {
    const source = await readPlugin("includes/content/newsroom-blocks.php");

    expect(source).toContain("'core/details' =>");
    expect(source).toContain("'core/table' =>");
    expect(source).toContain("'core/gallery' =>");
    expect(source).toContain("'core/image' =>");
    expect(source).toContain("'core/list' =>");
    expect(source).not.toMatch(/byline\/faq(?:['"]|\s*=>)/);
    expect(source).not.toMatch(/byline\/table(?:['"]|\s*=>)/);
    expect(source).not.toMatch(/byline\/gallery(?:['"]|\s*=>)/);
  });
});
