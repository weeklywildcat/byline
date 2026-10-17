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
  for (const name of ['byline/qa-interview','byline/what-we-know','byline/pros-cons','byline/three-things','byline/source-highlight','byline/document-evidence']) {
    const pattern = patterns.payload.find((item) => item.name === name);
    expect(pattern, name).toBeTruthy();
    const valid = await page.evaluate((content) => {
      const wp = (window as any).wp;
      const walk = (nodes: any[]): boolean => nodes.every((node) => node.isValid && walk(node.innerBlocks || []));
      return walk(wp.blocks.parse(content));
    }, pattern!.content);
    expect(valid, name).toBe(true);
  }
  await page.evaluate(({ definitions, relatedIds, essayPattern }) => {
    const wp = (window as any).wp;
    const titles = ["Portrait + Text", "Photo Pair", "Photo Gallery", "Reported Quote", "Pull Quote", "Key Facts", "Document Viewer", "Related Coverage", "Story Audio", "Story Video", "Visual Chapter", "Wide Photo", "Full-Bleed Photo", "Full-Bleed Video", "Context", "Why It Matters", "What's Next", "How We Know", "Editor's Note", "Margin Note", "Data Table", "Comparison Table", "Read More", "Methodology", "Full Statement", "Comparison", "Main + Aside", "Three Key Numbers", "Map"];
    const names = ["core/media-text", "core/gallery", "core/quote", "core/pullquote", "core/group", "core/file", "byline/stories", "core/audio", "core/video", "core/cover", "core/image", "core/table", "core/details", "core/columns", "byline/visualization"];
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
    for (const name of ['byline/table-of-contents','byline/visualization','byline/annotated-image','byline/before-after','byline/scrolly','byline/scrolly-step']) {
      if (!wp.blocks.getBlockType(name)) throw new Error(`Missing block ${name}`);
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
  // Wait for the real TOC editor effect to assign native stable heading anchors.
  await expect.poll(() => page.evaluate(() => {
    const wp = (window as any).wp;
    const walk = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...walk(node.innerBlocks || [])]);
    return walk(wp.data.select('core/block-editor').getBlocks()).filter((block: any) => block.name === 'core/heading' && [2,3].includes(block.attributes.level) && !block.attributes.anchor).length;
  })).toBe(0);
  // Add a real native Footnote using Gutenberg's formatting UI. Core creates
  // its reference, footnotes block and canonical post meta in both versions.
  const authored = await waitForEditorReady(page);
  const sourceParagraph = authored.canvas.getByText('A footnote adds the source behind this claim.', { exact: true });
  await sourceParagraph.click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: /More.*(rich text|format|toolbar)|More$/i }).last().click();
  await page.getByRole('menuitem', { name: 'Footnote', exact: true }).click();
  await page.keyboard.insertText('District budget records, reviewed by the newsroom. https://example.com/a-very-long-source-url-that-must-wrap-on-a-small-phone-without-overflow');
  const saved = await page.evaluate(() => (window as any).wp.data.select('core/editor').getEditedPostContent());
  expect(saved).toContain("wp:byline/timeline");
  expect(saved).toContain("wp:footnotes");
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
  expect(rendered).toContain('byline-table-of-contents');
  expect(rendered).toContain('District budget records, reviewed by the newsroom.');
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
      await expect(frame.locator('.byline-before-after input[type=range]')).toHaveValue('50');
      await expect(frame.locator('.byline-annotations > li')).toHaveCount(2);
      if (width >= 900) await expect(frame.locator('.byline-scrolly')).toHaveClass(/is-enhanced/);
      else await expect(frame.locator('.byline-scrolly')).not.toHaveClass(/is-enhanced/);
      await expect(frame.locator('.byline-visualization iframe')).toHaveCount(0);
      await expect(frame.locator('.byline-visualization-placeholder').first()).toHaveCSS('height', '480px');
      await expect(frame.locator('.article-body iframe').first()).toHaveAttribute('sandbox', '');
      await expect(frame.locator('.article-body iframe[srcdoc], .article-body script')).toHaveCount(0);
      await expect(frame.locator('.article-body .byline-newsroom-stories-related article')).toHaveCount(3);
      const geometry = await frame.locator('.article-body').evaluate((body) => {
        const pair = body.querySelector('.is-style-byline-photo-pair')!;
        const document = body.ownerDocument;
        return { width: document.defaultView!.innerWidth, overflow: document.documentElement.scrollWidth > document.defaultView!.innerWidth + 1, columns: getComputedStyle(pair).gridTemplateColumns.split(" ").length, pdfRatio: getComputedStyle(body.querySelector('.wp-block-file__embed')!).aspectRatio, fullWidth: body.querySelector('.wp-block-image.alignfull')!.getBoundingClientRect().width, layoutWidth: document.documentElement.clientWidth };
      });
      expect(geometry.fullWidth).toBeCloseTo(Math.min(1440, geometry.layoutWidth - 40), 0);
      expect(geometry).toMatchObject({ width, overflow: false, columns: width < 540 ? 1 : 2, pdfRatio: "auto" });
      await frame.locator('.is-style-byline-document > a:not([download])').first().click();
      await expect(frame.locator('.article-body .byline-timeline')).toBeVisible();
      await expect(frame.locator('.byline-before-after input[type=range]')).toHaveValue('50');
      await expect(frame.locator('.byline-annotations > li')).toHaveCount(2);
      if (width >= 900) await expect(frame.locator('.byline-scrolly')).toHaveClass(/is-enhanced/);
      else await expect(frame.locator('.byline-scrolly')).not.toHaveClass(/is-enhanced/);
      await expect(frame.locator('.byline-visualization iframe')).toHaveCount(0);
      await expect(frame.locator('.byline-visualization-placeholder').first()).toHaveCSS('height', '480px');
      expect(await frame.locator('body').evaluate((body) => body.ownerDocument.location.href)).toBe('about:srcdoc');
    }
    // The private preview runs the same enhancer in its own document: the local controls work
    // there while outgoing navigation stays blocked.
    await preview.getByRole("button", { name: "Desktop", exact: true }).click();
    const frame = preview.frameLocator('iframe[title="Byline article preview"]');
    const methodology = frame.locator('.is-style-byline-methodology');
    await methodology.scrollIntoViewIfNeeded();
    await expect(methodology).not.toHaveAttribute('open');
    await methodology.locator('summary').click();
    await expect(methodology).toHaveAttribute('open', '');

    const range = frame.locator('.byline-before-after input[type=range]');
    await range.scrollIntoViewIfNeeded();
    await range.focus(); await preview.keyboard.press('ArrowRight');
    await expect(range).toHaveValue('51');
    await expect.poll(() => frame.locator('.byline-before-after').evaluate((node) => (node as HTMLElement).style.getPropertyValue('--comparison-position'))).toBe('51%');
    const rangeBox = (await range.boundingBox())!;
    await preview.mouse.click(rangeBox.x + rangeBox.width * 0.75, rangeBox.y + rangeBox.height / 2);
    await expect.poll(async () => Number(await range.inputValue())).toBeGreaterThan(65);
    await expect(frame.locator('.byline-before-after .byline-comparison-control')).toHaveCount(0);

    const markers = frame.locator('.byline-annotation-marker');
    await markers.nth(1).click();
    await expect(frame.locator('.byline-annotations > li').nth(1)).toHaveClass(/is-active/);
    await expect(markers.nth(1)).toHaveAttribute('aria-current', 'true');
    expect(await frame.locator('body').evaluate((body) => body.ownerDocument.location.href)).toBe('about:srcdoc');

    const scrolly = frame.locator('.byline-scrolly');
    await expect(scrolly).toHaveClass(/is-enhanced/);
    const stage = scrolly.locator('.byline-scrolly-stage');
    await expect(stage).toHaveAttribute('data-step', '0');
    // Scroll inside the preview document until step 3 crosses the reading line the stage advertises.
    await scrolly.evaluate((story) => {
      const view = story.ownerDocument.defaultView!;
      const line = Number((story.querySelector('.byline-scrolly-stage') as HTMLElement).dataset.activationLine);
      const step = story.querySelectorAll(':scope > .byline-scrolly-step')[2];
      view.scrollTo({ top: step.getBoundingClientRect().top + view.scrollY - (view.innerHeight * line) / 100 + 20, behavior: 'instant' });
    });
    await expect(stage).toHaveAttribute('data-step', '2');
    await expect(stage.locator('img')).toHaveAttribute('src', /panorama\.svg/);
  } finally { await preview.close(); }
});

test('story authoring preserves native anchors, precise annotations and normal step reordering', async ({ adminPage: page, adminSession }) => {
  await createEditorDraft(page, adminSession.registerTestPost, 'story authoring controls');
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const upload = await page.request.post('/wp-json/wp/v2/media', {
    headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="story-annotation.jpg"' },
    data: await readFile(path.join(repoRoot, 'apps/web/public/newsroom/newsroom-meeting-640.jpg'))
  });
  expect(upload.ok()).toBe(true);
  const media = await upload.json() as { id: number };
  adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, 'DELETE'); });
  const selected = blocks.filter((block) => ['byline/table-of-contents','byline/annotated-image','byline/scrolly'].includes(block.name));
  await page.evaluate((definitions) => {
    const wp = (window as any).wp;
    const make = (definition: any): any => wp.blocks.createBlock(definition.name, definition.attributes, (definition.innerBlocks || []).map(make));
    wp.data.dispatch('core/block-editor').resetBlocks(definitions.map(make));
  }, selected);
  const editor = await waitForEditorReady(page);
  const annotation = editor.canvas.locator('.byline-annotated-image');
  await annotation.getByRole('button', { name: 'Replace annotation image', exact: true }).click();
  await page.locator('.media-modal').getByRole('tab', { name: 'Media Library', exact: true }).click();
  await page.locator(`.media-modal [data-id="${media.id}"]`).click();
  await page.locator('.media-modal').getByRole('button', { name: 'Select', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).wp.data.select('core/block-editor').getBlocks().find((block: any) => block.name === 'byline/annotated-image').attributes.image.id)).toBe(media.id);
  await annotation.locator('.components-range-control input[type="number"]').first().fill('33');
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => (window as any).wp.data.select('core/block-editor').getBlocks().find((block: any) => block.name === 'byline/annotated-image').attributes.annotations[0].x)).toBe(33);
  await expect.poll(() => page.evaluate(() => (window as any).wp.data.select('core/block-editor').getBlocks().find((block: any) => block.name === 'byline/scrolly').innerBlocks[0].innerBlocks[0].attributes.anchor)).not.toBe('');
  const initialAnchor = await page.evaluate(() => {
    const wp = (window as any).wp;
    const scrolly = wp.data.select('core/block-editor').getBlocks().find((block: any) => block.name === 'byline/scrolly');
    const heading = scrolly.innerBlocks[0].innerBlocks[0];
    wp.data.dispatch('core/block-editor').updateBlockAttributes(heading.clientId, { content: 'Edited first scene' });
    wp.data.dispatch('core/block-editor').selectBlock(scrolly.innerBlocks[1].clientId);
    return heading.attributes.anchor;
  });
  // Use Gutenberg's ordinary mover control; the parent never serializes its
  // steps as a separate proprietary JSON model.
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).wp.data.select('core/block-editor').getBlocks().find((block: any) => block.name === 'byline/scrolly').innerBlocks[0].attributes.image.url)).toContain('landscape-after.svg');
  await saveEditorDraft(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  const state = await page.evaluate(() => {
    const nodes = (window as any).wp.data.select('core/block-editor').getBlocks();
    const story = nodes.find((block: any) => block.name === 'byline/scrolly');
    const image = nodes.find((block: any) => block.name === 'byline/annotated-image');
    return { x: image.attributes.annotations[0].x, id: image.attributes.image.id, first: story.innerBlocks[0].attributes.image.url, anchor: story.innerBlocks[1].innerBlocks[0].attributes.anchor };
  });
  expect(state).toMatchObject({ x: 33, id: media.id, anchor: initialAnchor });
  expect(state.first).toContain('landscape-after.svg');
});
