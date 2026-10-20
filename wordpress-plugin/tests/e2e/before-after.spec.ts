import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");
const newsroom = (name: string) => path.join(repoRoot, "apps/web/public/newsroom", name);

type Photo = { id?: number; url: string; alt: string; width?: number; height?: number };
type Comparison = { clientId: string; before: Photo; after: Photo; beforeLabel: string; afterLabel: string; fit: string; caption: string };

/** The first Before / After in the document, as the editor holds it. */
function comparison(page: Page): Promise<Comparison> {
  return page.evaluate(() => {
    const block = (window as any).wp.data.select("core/block-editor").getBlocks().find((item: any) => item.name === "byline/before-after");
    return { clientId: block.clientId, ...block.attributes };
  });
}

async function openEmptyComparison(page: Page, adminSession: any, label: string, attributes: Record<string, unknown> = {}) {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  await page.evaluate((attributes) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([wp.blocks.createBlock("byline/before-after", attributes)]);
  }, attributes);
  const editor = await waitForEditorReady(page);
  const block = editor.canvas.locator(".byline-before-after").first();
  await expect(block).toBeVisible();
  return { story, editor, block };
}

/** The attachments the comparison now holds are removed when the test ends. */
const selectBlock = async (page: Page) => { const { clientId } = await comparison(page); await page.evaluate((id) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(id), clientId); };
const registerMedia = async (page: Page, adminSession: any) => {
  const state = await comparison(page);
  for (const id of [state.before?.id, state.after?.id]) if (id) adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${id}?force=true`, "DELETE"); });
};

test("an empty comparison is two drop zones; once both photographs are chosen the canvas is the real, draggable comparison", async ({ adminPage: page, adminSession }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const { story, block } = await openEmptyComparison(page, adminSession, "before after authoring");

  // Two clear drop zones, one per side, and no stray upload fields.
  await expect(block.locator(".components-placeholder")).toHaveCount(2);
  await expect(block.getByText("Before photograph", { exact: true })).toBeVisible();
  await expect(block.getByText("After photograph", { exact: true })).toBeVisible();
  await expect(block.locator("input[type=range]")).toHaveCount(0);

  // Choose Before: it shows at once, labelled, and the After zone waits.
  await block.locator(".byline-comparison-slot").first().locator('input[type="file"]').setInputFiles(newsroom("newsroom-meeting-640.jpg"));
  await expect(block.locator(".byline-comparison-image img")).toHaveCount(1);
  await expect(block.locator(".components-placeholder")).toHaveCount(1);
  await expect(block.getByText("Choose both photographs to complete this comparison.")).toBeVisible();
  await selectBlock(page);
  await expect(page.getByRole("button", { name: "Replace Before" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace After" })).toHaveCount(0);

  // Choose After, a different shape: the comparison appears with its real slider.
  await block.locator(".byline-comparison-slot").first().locator('input[type="file"]').setInputFiles(newsroom("newsroom-laughing-640.jpg"));
  const range = block.locator("input.byline-comparison-range");
  await expect(range).toBeVisible();
  await registerMedia(page, adminSession);
  await expect(block).toHaveClass(/is-enhanced/);
  await expect(block.locator(".byline-comparison-image img")).toHaveCount(2);
  await expect(range).toHaveAccessibleName("Compare Before and After");
  await expect(range).toHaveAttribute("aria-valuetext", "50% Before, 50% After");

  // The slider in the editor is the public control: arrows move the divider and the vars the stylesheet reads.
  await range.focus();
  await page.keyboard.press("ArrowRight");
  await expect(range).toHaveValue("51");
  await expect.poll(() => block.evaluate((node) => (node as HTMLElement).style.getPropertyValue("--comparison-position"))).toBe("51%");
  await expect(range).toHaveAttribute("aria-valuetext", "51% Before, 49% After");
  const box = (await range.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect.poll(async () => Number(await range.inputValue())).toBeLessThan(35);
  // Before is on the left of the divider and After on the right, as it will be published.
  const order = await block.evaluate((node) => {
    const rect = (selector: string) => node.querySelector(selector)!.getBoundingClientRect();
    const labels = Array.from(node.querySelectorAll<HTMLElement>(".byline-comparison-labels > span"), (chip) => chip.getBoundingClientRect().x);
    return { labels, divider: rect(".byline-comparison-divider").x };
  });
  expect(order.labels[0]).toBeLessThan(order.labels[1]);

  // Different shapes: the decision is offered on the canvas, and one click shows both complete.
  await expect(block.getByText("These photographs are different shapes")).toBeVisible();
  await block.getByRole("button", { name: "Show both complete" }).click();
  expect((await comparison(page)).fit).toBe("contain");
  await expect(block).toHaveAttribute("data-fit", "contain");
  await expect(block.getByText("These photographs are different shapes")).toHaveCount(0);

  // Labels are typed where they appear; the caption too.
  await block.getByLabel("Left label", { exact: true }).fill("Spring 2019");
  await block.getByLabel("Right label", { exact: true }).fill("Fall 2026");
  await block.getByLabel("Caption", { exact: true }).fill("The gym, seven years apart.");
  await expect.poll(async () => (await comparison(page))).toMatchObject({ beforeLabel: "Spring 2019", afterLabel: "Fall 2026", caption: "The gym, seven years apart." });
  await expect(range).toHaveAccessibleName("Compare Spring 2019 and Fall 2026");

  // Swap exchanges the photographs and leaves the labels where they are.
  const before = await comparison(page);
  await page.getByRole("button", { name: "Swap Before and After" }).click();
  await expect.poll(async () => (await comparison(page)).before.id).toBe(before.after.id);
  expect((await comparison(page)).after.id).toBe(before.before.id);
  expect((await comparison(page)).beforeLabel).toBe("Spring 2019");
  await expect(block.locator('[role="status"][aria-live="polite"]')).toContainText("swapped");

  // Alt text for each photograph lives in the sidebar, which also offers the labels and the fit.
  await page.evaluate(() => (window as any).wp.data.dispatch("core/edit-post").openGeneralSidebar("edit-post/block"));
  const alts = page.getByRole("textbox", { name: "Alternative text" });
  await expect(alts).toHaveCount(2);
  await alts.nth(0).fill("Players warming up");
  await alts.nth(1).fill("An empty gym");
  await expect.poll(async () => { const state = await comparison(page); return [state.before.alt, state.after.alt]; }).toEqual(["Players warming up", "An empty gym"]);
  await expect(page.getByRole("combobox", { name: "Photograph fit" })).toHaveValue("contain");
  await expect(page.getByRole("textbox", { name: "Left label" })).toHaveValue("Spring 2019");

  // Save, reload without a validation error, and read what readers get.
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  const saved = await comparison(page);
  expect(saved).toMatchObject({ fit: "contain", beforeLabel: "Spring 2019", afterLabel: "Fall 2026" });
  await expect(reopened.canvas.locator("input.byline-comparison-range")).toBeVisible();

  const html = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  expect(html).toContain('data-fit="contain"');
  expect(html).toMatch(/--comparison-aspect:0\.8/);
  expect(html.indexOf('data-before="true">Spring 2019')).toBeGreaterThan(-1);
  expect(html.indexOf("Spring 2019")).toBeLessThan(html.indexOf("Fall 2026"));
  expect(html).toContain("The gym, seven years apart.");
  expect(html).not.toContain("Choose both photographs");
});

test("either photograph can be replaced from the toolbar without touching the other", async ({ adminPage: page, adminSession }) => {
  const nonce = async () => page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const story = await createEditorDraft(page, adminSession.registerTestPost, "before after replace");
  const uploaded: { id: number; source_url: string; media_details: { width: number; height: number } }[] = [];
  for (const file of ["newsroom-meeting-640.jpg", "newsroom-tablet-640.jpg", "newsroom-laughing-640.jpg"]) {
    const response = await page.request.post("/wp-json/wp/v2/media", {
      headers: { "X-WP-Nonce": await nonce(), "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="before-after-${file}"` },
      data: await readFile(newsroom(file))
    });
    expect(response.ok()).toBe(true);
    const media = await response.json();
    adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
    uploaded.push(media);
  }
  const photo = (media: (typeof uploaded)[number], alt: string) => ({ id: media.id, url: media.source_url, alt, width: media.media_details.width, height: media.media_details.height });
  await page.evaluate(({ before, after }) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([wp.blocks.createBlock("byline/before-after", { before, after })]);
  }, { before: photo(uploaded[0], "Original before"), after: photo(uploaded[1], "Original after") });
  const editor = await waitForEditorReady(page);
  const block = editor.canvas.locator(".byline-before-after").first();
  await expect(block.locator("input.byline-comparison-range")).toBeVisible();

  // Replace After: Gutenberg's own replace flow, named for the side it replaces.
  await selectBlock(page);
  await page.getByRole("button", { name: "Replace After" }).click();
  await page.locator('.block-editor-media-replace-flow__media-upload-menu input[type="file"], .components-dropdown-menu__menu input[type="file"], .components-popover input[type="file"]').first().setInputFiles(newsroom("newsroom-laughing-640.jpg"));
  await expect.poll(async () => (await comparison(page)).after.id, { timeout: 30_000 }).not.toBe(uploaded[1].id);
  const replaced = await comparison(page);
  adminSession.addCleanup(async () => { if (replaced.after.id) await adminSession.rest(`/wp/v2/media/${replaced.after.id}?force=true`, "DELETE"); });
  expect(replaced.before.id).toBe(uploaded[0].id);
  expect(replaced.before.alt).toBe("Original before");
  await expect(block.locator(".byline-comparison-image img").nth(1)).toHaveAttribute("src", replaced.after.url);

  // A removed attachment is a warning on the canvas, not a silent blank: replace it from the toolbar.
  await adminSession.rest(`/wp/v2/media/${uploaded[0].id}?force=true`, "DELETE");
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  await expect(reopened.canvas.getByText("The Before photograph could not be loaded.")).toBeVisible();
  expect(story.id).toBeGreaterThan(0);
});

test("older saved comparisons and annotated images open without a validation error and are written back slim", async ({ adminPage: page, adminSession }) => {
  await createEditorDraft(page, adminSession.registerTestPost, "before after legacy");
  const corpus = await readFile(path.join(repoRoot, "tests/fixtures/storytelling/legacy-0.3.24-lunch-squeeze.html"), "utf8");
  await page.evaluate((markup) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks(wp.blocks.parse(markup));
  }, corpus);
  const editor = await waitForEditorReady(page);
  const state = await page.evaluate(() => {
    const walk = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...walk(node.innerBlocks || [])]);
    return walk((window as any).wp.data.select("core/block-editor").getBlocks())
      .filter((block) => ["byline/before-after", "byline/annotated-image"].includes(block.name))
      .map((block) => ({ name: block.name, valid: block.isValid, fit: block.attributes.fit, srcSet: block.attributes.image?.srcSet ?? block.attributes.before?.srcSet, html: (window as any).wp.blocks.serialize(block) }));
  });
  expect(state.length).toBeGreaterThanOrEqual(2);
  for (const block of state) {
    expect(block.valid, block.name).toBe(true);
    expect(block.srcSet, block.name).toBeUndefined();
    expect(block.html).not.toContain("srcset=");
  }
  await expect(editor.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  await expect(editor.canvas.locator(".byline-before-after input.byline-comparison-range").first()).toBeVisible();
  await expect(editor.canvas.locator(".byline-annotated-image .byline-annotation-marker").first()).toBeVisible();
});
