import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";
import { waitForEditorReady, openStorySidebar, saveEditorDraft } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";
import blocks from "../../../tests/fixtures/story-presentations-blocks.json";

const repoRoot = path.resolve(__dirname, "../../..");

test("newsroom presets save valid Core content and match the private preview at every frame width", async ({ adminPage: page, adminSession }) => {
  const story = await createEditorDraft(page, adminSession.registerTestPost, "story presentations");
  await page.route("**/test-assets/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const types: Record<string, string> = { svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf", wav: "audio/wav", vtt: "text/vtt", html: "text/html" };
    await route.fulfill({ body: await readFile(path.join(repoRoot, "tests/fixtures/story-media", name)), contentType: types[name.split(".").pop()!] || "text/plain" });
  });
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const uploaded = await page.request.post('/wp-json/wp/v2/media', {
    headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="presentation-related.jpg"' },
    data: await readFile(path.join(repoRoot, 'apps/web/public/newsroom/newsroom-meeting-640.jpg'))
  });
  expect(uploaded.ok()).toBe(true);
  const media = await uploaded.json() as { id: number; source_url: string };
  adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, 'DELETE'); });
  const relatedIds: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const result = await adminSession.rest<{ id: number }>("/wp/v2/posts", "POST", { title: `Presentation related report ${i}`, status: "publish", date: "2026-08-20T12:00:00", content: "A related report.", ...(i !== 2 ? { featured_media: media.id } : {}) });
    expect(result.ok).toBe(true);
    adminSession.registerTestPost(result.payload.id);
    relatedIds.push(result.payload.id);
  }
  const patterns = await adminSession.rest<{ name: string; content: string }[]>("/wp/v2/block-patterns/patterns");
  expect(patterns.ok).toBe(true);
  const essayPattern = patterns.payload.find((pattern) => pattern.name === "byline/photo-essay")!;
  expect(essayPattern).toBeTruthy();
  const saved = await page.evaluate(({ definitions, relatedIds, essayPattern }) => {
    const wp = (window as any).wp;
    const titles = ["Portrait + Text", "Photo Pair", "Photo Gallery", "Reported Quote", "Pull Quote", "Key Facts", "Document Viewer", "Related Coverage", "Story Audio", "Story Video"];
    const names = ["core/media-text", "core/gallery", "core/quote", "core/pullquote", "core/group", "core/file", "byline/stories", "core/audio", "core/video"];
    const variations = names.flatMap((name) => wp.blocks.getBlockVariations(name) || []);
    for (const title of titles) {
      if (!variations.some((variation: any) => variation.title === title && variation.scope.includes("inserter"))) throw new Error(`Missing inserter item: ${title}`);
    }
    function make(definition: any): any {
      const attributes = { ...definition.attributes };
      if (definition.name === "byline/stories") attributes.postIds = relatedIds;
      // Core HTML stores raw inner content in 7.1; parse its saved format so
      // this deterministic embed fixture works with both supported schemas.
      if (definition.name === "core/html") return wp.blocks.parse(`<!-- wp:html -->${attributes.content}<!-- /wp:html -->`)[0];
      return wp.blocks.createBlock(definition.name, attributes, (definition.innerBlocks || []).map(make));
    }
    const parsedPattern = wp.blocks.parse(essayPattern.content);
    function invalidBlocks(block: any): string[] { return [...(!block.isValid ? [block.name] : []), ...block.innerBlocks.flatMap(invalidBlocks)]; }
    if (parsedPattern.flatMap(invalidBlocks).length) throw new Error("Photo Essay pattern does not validate in this WordPress version");
    if (parsedPattern[0].innerBlocks.length !== 5) throw new Error("Photo Essay must remain an editable five-block starter");
    const created = definitions.map(make);
    const serialized = wp.blocks.serialize(created);
    const reopened = wp.blocks.parse(serialized);
    const invalid = reopened.flatMap(function walk(block: any): string[] { return [...(!block.isValid ? [block.name] : []), ...block.innerBlocks.flatMap(walk)]; });
    if (invalid.length) throw new Error(`Invalid saved blocks: ${invalid.join(", ")}`);
    wp.data.dispatch("core/block-editor").resetBlocks(reopened);
    return serialized;
  }, { definitions: blocks, relatedIds, essayPattern });
  expect(saved).toContain("wp:byline/timeline");
  expect(saved).toContain('is-style-byline-document');
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const editor = await waitForEditorReady(page);
  await expect(editor.canvas.locator('.is-style-byline-portrait-text')).toBeVisible();
  await expect(editor.canvas.locator('.byline-timeline-editor')).toBeVisible();
  await expect(editor.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);

  const canvasGeometry = await editor.canvas.locator('.is-style-byline-photo-pair').evaluate((pair) => ({
    columns: getComputedStyle(pair).gridTemplateColumns.split(" ").length,
    width: pair.getBoundingClientRect().width,
    proseWidth: pair.parentElement!.getBoundingClientRect().width
  }));
  expect(canvasGeometry.columns).toBe(2);
  expect(canvasGeometry.width).toBeGreaterThanOrEqual(canvasGeometry.proseWidth);

  // The one custom block can add/reorder/remove inline with focus following it.
  const timeline = editor.canvas.locator('.byline-timeline-editor');
  await timeline.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(timeline.getByLabel("Date or label").last()).toBeFocused();
  await timeline.getByLabel("Date or label").last().fill("Fall 2026");
  await timeline.getByLabel("Event title").last().fill("The next chapter");
  await timeline.getByRole("button", { name: "Move up", exact: true }).last().click();
  await expect(timeline.getByLabel("Date or label").nth(1)).toBeFocused();
  await timeline.getByRole("button", { name: "Remove item", exact: true }).nth(1).click();
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(2);

  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`);
  expect(response.ok).toBe(true);
  const rendered = response.payload.content.rendered;
  expect(rendered).toContain('byline-newsroom-stories-related');
  expect(rendered).toContain('<ol class="wp-block-byline-timeline byline-timeline">');
  if (process.env.BYLINE_UPDATE_STORY_FIXTURE === "1") {
    const clean = rendered.split(media.source_url).join("/newsroom/newsroom-meeting-640.jpg").replace(/http:\/\/localhost:8888/g, "");
    await writeFile(path.join(repoRoot, "tests/fixtures/story-presentations.json"), JSON.stringify({ saved, rendered: clean }, null, 2) + "\n");
  }
  const sidebar = await openStorySidebar(page);
  const popupPromise = page.waitForEvent("popup");
  await sidebar.getByRole("button", { name: "Preview as Byline", exact: true }).click();
  const preview = await popupPromise;
  try {
    await preview.waitForURL(/page=byline-article-preview/);
    await preview.route("**/test-assets/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop()!;
      const type = name.endsWith("svg") ? "image/svg+xml" : name.endsWith("mp4") ? "video/mp4" : name.endsWith("pdf") ? "application/pdf" : "text/plain";
      await route.fulfill({ body: await readFile(path.join(repoRoot, "tests/fixtures/story-media", name)), contentType: type });
    });
    for (const [name, width] of [["Desktop", 1200], ["Tablet", 768], ["Mobile", 390]] as const) {
      await preview.getByRole("button", { name, exact: true }).click();
      const frame = preview.frameLocator('iframe[title="Byline article preview"]');
      await expect(frame.locator('.article-body .byline-timeline')).toBeVisible();
      await expect(frame.locator('.article-body iframe').first()).toHaveAttribute('sandbox', '');
      await expect(frame.locator('.article-body iframe[srcdoc], .article-body script')).toHaveCount(0);
      await expect(frame.locator('.article-body .byline-newsroom-stories-related article')).toHaveCount(3);
      const geometry = await frame.locator('.article-body').evaluate((body) => {
        const pair = body.querySelector('.is-style-byline-photo-pair')!;
        const document = body.ownerDocument;
        return { width: document.defaultView!.innerWidth, overflow: document.documentElement.scrollWidth > document.defaultView!.innerWidth + 1, columns: getComputedStyle(pair).gridTemplateColumns.split(" ").length, pdfRatio: getComputedStyle(body.querySelector('.wp-block-file__embed')!).aspectRatio };
      });
      expect(geometry).toMatchObject({ width, overflow: false, columns: width < 540 ? 1 : 2, pdfRatio: "auto" });
      await frame.locator('.is-style-byline-document > a:not([download])').first().click();
      await expect(frame.locator('.article-body .byline-timeline')).toBeVisible();
      expect(await frame.locator('body').evaluate((body) => body.ownerDocument.location.href)).toBe('about:srcdoc');
    }
  } finally { await preview.close(); }
});
