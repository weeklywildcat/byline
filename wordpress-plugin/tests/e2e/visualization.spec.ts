import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");
const graphic = path.join(repoRoot, "apps/web/public/newsroom/newsroom-meeting-1000.jpg");

type VisualizationBlock = { clientId: string; attributes: Record<string, any> };

function visualizations(page: Page): Promise<VisualizationBlock[]> {
  return page.evaluate(() => (window as any).wp.data.select("core/block-editor").getBlocks()
    .filter((block: any) => block.name === "byline/visualization")
    .map((block: any) => ({ clientId: block.clientId, attributes: block.attributes })));
}

async function openEmptyVisualization(page: Page, adminSession: any, label: string, attributes: Record<string, unknown> = {}) {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  await page.evaluate((attributes) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([wp.blocks.createBlock("byline/visualization", attributes)]);
  }, attributes);
  const editor = await waitForEditorReady(page);
  return { story, editor, block: editor.canvas.locator(".byline-visualization").first() };
}

test("an interactive chart is set up from one address field, with a fallback graphic, on the canvas", async ({ adminPage: page, adminSession }) => {
  const { story, editor, block } = await openEmptyVisualization(page, adminSession, "visualization interactive");
  const attributes = async () => (await visualizations(page))[0].attributes;

  // Empty state: two plain choices, nothing else.
  await expect(block.getByRole("button", { name: /Interactive chart or map/ })).toBeVisible();
  await expect(block.getByRole("button", { name: /Static graphic/ })).toBeVisible();
  await block.getByRole("button", { name: /Interactive chart or map/ }).click();
  const address = block.getByLabel("Chart or map address");
  await expect(address).toBeFocused();

  // Embed code is refused with an explanation; so are addresses outside the allowlist.
  await address.fill('<iframe src="https://datawrapper.dwcdn.net/AbCdE/" width="600"></iframe>');
  await expect(block.getByText(/looks like embed code/)).toBeVisible();
  expect((await attributes()).provider).toBe("");
  await address.fill("https://example.com/chart");
  await expect(block.getByText(/cannot show that address as an interactive/)).toBeVisible();
  await expect(block.getByText(/Which addresses work/)).toBeVisible();
  await expect(block.locator(".byline-visualization-badge")).toContainText("Fallback only");

  // A recognised share link is named and, on leaving the field, replaced by its embed form.
  await address.fill("https://www.datawrapper.de/_/AbCdE/");
  await expect(block.locator(".byline-viz-provider")).toHaveText(/Datawrapper/);
  await page.keyboard.press("Tab");
  await expect.poll(async () => (await attributes()).embedUrl).toBe("https://datawrapper.dwcdn.net/AbCdE/");
  await expect(address).toHaveValue("https://datawrapper.dwcdn.net/AbCdE/");
  await expect(block.locator(".byline-visualization-badge")).toContainText("Preview: interactive Datawrapper chart loads here on the published story");
  await expect(block.locator(".byline-visualization-placeholder")).toContainText("Datawrapper chart");

  // Fallback graphic: upload through the native placeholder; a missing alt text is flagged until written.
  await block.locator('.byline-viz-fallback input[type="file"]').setInputFiles(graphic);
  await expect(block.locator(".byline-visualization-fallback-image img")).toBeVisible();
  await expect(block.getByText(/No alternative text yet/)).toBeVisible();
  await block.getByLabel("Fallback graphic alternative text").fill("Bar chart of lunch minutes by wave.");
  await expect(block.getByText(/No alternative text yet/)).toHaveCount(0);
  expect((await attributes()).image.alt).toBe("Bar chart of lunch minutes by wave.");

  // Title, dek and attribution are typed where they print; Enter never adds a line break.
  const title = block.getByLabel("Title", { exact: true });
  await title.fill("Lunch got shorter for every wave");
  await title.press("Enter");
  await block.getByLabel("Description", { exact: true }).fill("Minutes between the first and last bell, by lunch wave.");
  await block.getByLabel("What the graphic shows").fill("Every wave lost at least four minutes.");
  await block.getByLabel("Source", { exact: true }).fill("District bell schedules");
  await block.getByLabel("Notes", { exact: true }).fill("Passing time is not included.");
  await block.getByLabel("Credit", { exact: true }).fill("Weekly Wildcat staff");
  await expect.poll(async () => (await attributes()).credit).toBe("Weekly Wildcat staff");
  expect((await attributes()).title).toBe("Lunch got shorter for every wave");

  // Height: the choice resizes the frame on the canvas.
  const media = block.locator(".byline-visualization-media");
  await expect(media).toHaveCSS("height", "480px");
  await block.getByLabel(/^Tall/).check();
  await expect(media).toHaveCSS("height", "680px");
  await block.getByLabel(/^Compact/).check();
  await expect(media).toHaveCSS("height", "320px");
  await block.getByLabel(/^Standard/).check();
  await expect(media).toHaveCSS("height", "480px");

  // The editor never reaches a provider.
  await expect(editor.canvas.locator("iframe")).toHaveCount(0);

  // Save, reopen: valid, with the same attributes; then check what readers receive.
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  expect(await attributes()).toMatchObject({ embedUrl: "https://datawrapper.dwcdn.net/AbCdE/", provider: "datawrapper", heightPreset: "standard", source: "District bell schedules" });
  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`);
  const html = response.payload.content.rendered;
  expect(html).toContain('data-src="https://datawrapper.dwcdn.net/AbCdE/"');
  expect(html).toContain('<h3 class="byline-visualization-title">Lunch got shorter for every wave</h3>');
  expect(html).toContain("Open the interactive version");
  expect(html).toContain("Source: District bell schedules");
  expect(html).toContain("Credit: Weekly Wildcat staff");
  expect(html).not.toContain("<iframe");
});

test("a static graphic is a single upload, and the block can be duplicated and removed from the keyboard", async ({ adminPage: page, adminSession }) => {
  const { editor, block } = await openEmptyVisualization(page, adminSession, "visualization static");
  await block.getByRole("button", { name: /Static graphic/ }).click();
  await expect.poll(async () => (await visualizations(page))[0].attributes.mode).toBe("static");
  // No address, no height: only the graphic is asked for.
  await expect(block.getByLabel("Chart or map address")).toHaveCount(0);
  await expect(block.getByText("Height", { exact: true })).toHaveCount(0);
  await block.locator('input[type="file"]').first().setInputFiles(graphic);
  const image = block.locator(".byline-visualization-fallback-image img");
  await expect(image).toBeVisible();
  await expect(block.locator(".byline-visualization-badge")).toHaveCount(0);
  // A static graphic fills the column up to its own width, at its own proportions.
  await expect.poll(async () => (await visualizations(page))[0].attributes.image.width).toBeGreaterThan(0);
  const box = await image.evaluate((img: HTMLImageElement) => ({ slot: img.closest('figure')!.getBoundingClientRect().width, rendered: img.getBoundingClientRect().width, natural: img.naturalWidth, ratio: img.getBoundingClientRect().width / img.getBoundingClientRect().height, naturalRatio: img.naturalWidth / img.naturalHeight }));
  expect(box.rendered).toBeLessThanOrEqual(box.natural + 1);
  // Fills its slot (the canvas is narrower than 1040px in a 1280px window with the sidebar open), never a thumbnail.
  expect(box.rendered).toBeGreaterThan(Math.min(box.natural, box.slot) * 0.95);
  expect(box.ratio).toBeCloseTo(box.naturalRatio, 1);

  // Duplicate with Gutenberg's shortcut and remove from the block menu.
  await block.getByLabel("Title", { exact: true }).fill("First");
  await block.getByLabel("Title", { exact: true }).press("Escape");
  await page.keyboard.press("ControlOrMeta+Shift+d");
  await expect.poll(async () => (await visualizations(page)).length).toBe(2);
  expect((await visualizations(page)).map((item) => item.attributes.title)).toEqual(["First", "First"]);
  await page.getByRole("toolbar", { name: "Block tools" }).getByRole("button", { name: "Options" }).click();
  await page.getByRole("menuitem", { name: /^Delete/ }).click();
  await expect.poll(async () => (await visualizations(page)).length).toBe(1);
  await expect(editor.canvas.locator("iframe")).toHaveCount(0);
});
