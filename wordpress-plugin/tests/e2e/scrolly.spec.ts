import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

/** Real, credited attachments, uploaded fresh for each test (the credit comes from the media library). */
type Photo = { id: number; url: string; alt: string; width: number; height: number };
let PHOTOS: Photo[] = [];
const SOURCES = [
  { name: "meeting", alt: "Two students review a draft.", creator: "Jamal Whitfield" },
  { name: "laughing", alt: "A student laughs at a desk.", creator: "Maya Okafor" },
  { name: "tablet", alt: "A student at a laptop.", creator: "Maya Okafor" }
];
test.beforeEach(async ({ adminPage: page, adminSession }) => {
  await page.goto("/wp-admin/", { waitUntil: "domcontentloaded" });
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  PHOTOS = [];
  for (const source of SOURCES) {
    const response = await page.request.post("/wp-json/wp/v2/media", {
      headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="scrolly-${Date.now()}-${source.name}.jpg"` },
      data: await readFile(path.resolve(__dirname, `../../../tests/fixtures/story-media/newsroom-${source.name}.jpg`))
    });
    expect(response.ok()).toBe(true);
    const media = await response.json() as { id: number; source_url: string; media_details: { width: number; height: number } };
    adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
    expect((await adminSession.rest(`/wp/v2/media/${media.id}`, "POST", { meta: { _ww_image_creator: source.creator } })).ok).toBe(true);
    PHOTOS.push({ id: media.id, url: media.source_url, alt: source.alt, width: media.media_details.width, height: media.media_details.height });
  }
});
type Step = { image?: (typeof PHOTOS)[number]; caption?: string; heading: string; text: string };
const stepList = (): Step[] => [
  { image: PHOTOS[0], caption: "A table of juniors.", heading: "First step", text: "First reporting." },
  { image: PHOTOS[1], caption: "A laugh.", heading: "Second step", text: "Second reporting." },
  { heading: "Third step", text: "Text only." }
];

type Summary = { clientId: string; heading: string; image?: string; caption: string };
/** The steps of the first Scrollytelling block, as the editor holds them. */
const steps = (page: Page): Promise<Summary[]> => page.evaluate(() => {
  const root = (window as any).wp.data.select("core/block-editor").getBlocks().find((block: any) => block.name === "byline/scrolly");
  return root.innerBlocks.map((step: any) => ({ clientId: step.clientId, heading: String(step.innerBlocks.find((b: any) => b.name === "core/heading")?.attributes.content ?? ""), image: step.attributes.image?.url, caption: step.attributes.caption }));
});
const selectedName = (page: Page) => page.evaluate(() => (window as any).wp.data.select("core/block-editor").getSelectedBlock()?.name);

async function openStory(page: Page, adminSession: any, label: string, list: Step[] = stepList(), fit = "contain") {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  await page.evaluate(({ list, fit }) => {
    const wp = (window as any).wp;
    const step = (s: any) => wp.blocks.createBlock("byline/scrolly-step", s.image ? { image: s.image, caption: s.caption || "" } : {}, [wp.blocks.createBlock("core/heading", { level: 2, content: s.heading }), wp.blocks.createBlock("core/paragraph", { content: s.text })]);
    wp.data.dispatch("core/block-editor").resetBlocks([wp.blocks.createBlock("byline/scrolly", { fit }, list.map(step))]);
  }, { list, fit });
  const editor = await waitForEditorReady(page);
  const block = editor.canvas.locator(".byline-scrolly-editor");
  await expect(block.locator(".byline-scrolly-card")).toHaveCount(list.length);
  return { story, editor, block };
}
const cards = (block: Locator) => block.locator(".byline-scrolly-card");
const board = (block: Locator, name: string) => block.getByRole("group", { name: "Story board" }).getByRole("button", { name, exact: true });

test("the story board shows every step in order and drives selection, the canvas and the reader preview", async ({ adminPage: page, adminSession }) => {
  const { block } = await openStory(page, adminSession, "scrolly board");
  // One numbered card per step: thumbnail, heading, and a plain "Text only" for the step without a photograph.
  await expect(cards(block).locator(".byline-scrolly-card-title")).toHaveText(["First step", "Second step", "Third step"]);
  await expect(cards(block).locator(".byline-scrolly-card-number")).toHaveText(["1", "2", "3"]);
  await expect(cards(block).nth(0).locator("img")).toHaveAttribute("src", /meeting\.jpg/);
  await expect(cards(block).nth(2)).toContainText("Text only");
  // The preview shows the real stage for the first step.
  const preview = block.getByRole("region", { name: "As the reader sees it" });
  await expect(preview.locator(".byline-scrolly-progress")).toContainText("Step 1 of 3");
  await expect(preview.locator(".byline-scrolly-frame img")).toHaveAttribute("src", /meeting\.jpg/);
  await expect(preview.locator("figcaption")).toContainText("A table of juniors.");
  await expect(preview.locator(".byline-scrolly-preview-heading")).toHaveText("First step");

  // Choosing a card selects that step and puts the caret in its heading.
  await cards(block).nth(1).click();
  await expect(cards(block).nth(1)).toHaveAttribute("aria-current", "step");
  await expect(preview.locator(".byline-scrolly-progress")).toContainText("Step 2 of 3");
  await expect(preview.locator(".byline-scrolly-frame img")).toHaveAttribute("src", /laughing\.jpg/);
  await expect(block.locator(".byline-scrolly-step-editor").nth(1).locator("h2").first()).toBeFocused();
  // A text-only step keeps the previous photograph on the stage, and says so.
  await page.evaluate((id) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(id), (await steps(page))[2].clientId);
  await expect(preview.locator(".byline-scrolly-progress")).toContainText("Step 3 of 3");
  await expect(preview.locator(".byline-scrolly-frame img")).toHaveAttribute("src", /laughing\.jpg/);
  await expect(preview.getByText("Text-only step: the stage keeps the photograph from step 2.")).toBeVisible();
  // The stepper moves through the story without leaving the board.
  await preview.getByRole("button", { name: "Previous step", exact: true }).click();
  await expect(cards(block).nth(1)).toHaveAttribute("aria-current", "step");
  await expect(preview.getByRole("button", { name: "Previous step", exact: true })).toBeFocused();
  await preview.getByRole("button", { name: "Previous step", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Previous step", exact: true })).toBeDisabled();
});

test("steps are added, duplicated, reordered and removed from the board, and the canvas, board and preview agree", async ({ adminPage: page, adminSession }) => {
  const { block } = await openStory(page, adminSession, "scrolly operations");
  const headings = async () => (await steps(page)).map((step) => step.heading);

  // Add after the active (first) step: it is selected and the caret is in its empty heading, ready to type.
  await cards(block).nth(0).click();
  await board(block, "Add step").click();
  expect(await headings()).toEqual(["First step", "", "Second step", "Third step"]);
  await expect(cards(block)).toHaveCount(4);
  await expect(cards(block).nth(1)).toHaveAttribute("aria-current", "step");
  await expect(cards(block).nth(1).locator(".byline-scrolly-card-title")).toHaveText("Untitled step");
  await page.keyboard.type("Typed straight away");
  await expect(cards(block).nth(1).locator(".byline-scrolly-card-title")).toHaveText("Typed straight away");

  // Duplicate: a copy of the photograph, caption and words, directly after, with its own identity.
  await cards(block).nth(2).click();
  const before = await steps(page);
  await board(block, "Duplicate").click();
  const after = await steps(page);
  expect(after.map((step) => step.heading)).toEqual(["First step", "Typed straight away", "Second step", "Second step", "Third step"]);
  expect(after[3]).toMatchObject({ image: before[2].image, caption: before[2].caption });
  expect(new Set(after.map((step) => step.clientId)).size).toBe(5);
  await expect(cards(block).nth(3)).toHaveAttribute("aria-current", "step");

  // Move earlier / later with the buttons; the first and last steps cannot go further.
  await board(block, "Move step later").click();
  expect(await headings()).toEqual(["First step", "Typed straight away", "Second step", "Third step", "Second step"]);
  await expect(board(block, "Move step later")).toBeDisabled();
  await board(block, "Move step earlier").click();
  expect(await headings()).toEqual(["First step", "Typed straight away", "Second step", "Second step", "Third step"]);
  await expect(cards(block).nth(3)).toHaveAttribute("aria-current", "step");
  await cards(block).nth(0).click();
  await expect(board(block, "Move step earlier")).toBeDisabled();

  // Remove the typed step; the next one is selected, and the numbers close up.
  await cards(block).nth(1).click();
  await board(block, "Remove step").click();
  expect(await headings()).toEqual(["First step", "Second step", "Second step", "Third step"]);
  await expect(cards(block).locator(".byline-scrolly-card-number")).toHaveText(["1", "2", "3", "4"]);
  await expect(cards(block).nth(1)).toHaveAttribute("aria-current", "step");
});

test("the board works from the keyboard alone: browse with arrows, open with Enter, move with Alt + arrows", async ({ adminPage: page, adminSession }) => {
  const { block } = await openStory(page, adminSession, "scrolly keyboard");
  await cards(block).nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(cards(block).nth(1)).toBeFocused();
  // Browsing selects (the preview follows) but leaves the caret on the board.
  await expect(cards(block).nth(1)).toHaveAttribute("aria-current", "step");
  await expect(block.getByRole("region", { name: "As the reader sees it" }).locator(".byline-scrolly-progress")).toContainText("Step 2 of 3");
  await page.keyboard.press("End");
  await expect(cards(block).nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(cards(block).nth(0)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  // Alt + arrow moves the focused step and keeps focus on it.
  await page.keyboard.press("Alt+ArrowRight");
  expect((await steps(page)).map((step) => step.heading)).toEqual(["First step", "Third step", "Second step"]);
  await expect(cards(block).nth(2)).toBeFocused();
  await expect(cards(block).nth(2).locator(".byline-scrolly-card-title")).toHaveText("Second step");
  await page.keyboard.press("Alt+ArrowLeft");
  expect((await steps(page)).map((step) => step.heading)).toEqual(["First step", "Second step", "Third step"]);
  await expect(cards(block).nth(1)).toBeFocused();
  // Only one card is in the tab order.
  await expect(block.locator('.byline-scrolly-card[tabindex="0"]')).toHaveCount(1);
  // Enter opens the step: the caret is in its heading and typing edits it.
  await page.keyboard.press("Enter");
  await page.keyboard.type(" edited");
  await expect(cards(block).nth(1).locator(".byline-scrolly-card-title")).toHaveText(/Second step.*edited/);
  expect(await selectedName(page)).toBe("core/heading");
});

test("each step is a photograph beside its reporting: placeholder, caption in place, alt text and credit in the sidebar, fit as a visual choice", async ({ adminPage: page, adminSession }) => {
  const { block } = await openStory(page, adminSession, "scrolly step authoring");
  const second = block.locator(".byline-scrolly-step-editor").nth(1);
  const third = block.locator(".byline-scrolly-step-editor").nth(2);
  // A step without a photograph offers Gutenberg's own upload / library placeholder and says what leaving it empty means.
  await expect(third.getByText("Leave it empty for a text-only step")).toBeVisible();
  await expect(third.getByRole("button", { name: "Media Library", exact: true })).toBeVisible();
  await expect(second.getByRole("img", { name: "A student laughs at a desk." })).toBeVisible();
  // The caption is typed where it appears; the credit WordPress will print is shown under it, never typed.
  const caption = second.getByLabel("Photograph caption");
  await expect(caption).toHaveValue("A laugh.");
  await caption.fill("A laugh at the desk.");
  expect((await steps(page))[1].caption).toBe("A laugh at the desk.");
  await expect(second.locator(".photo-credit")).toHaveText("Photo: Maya Okafor");
  // Alt text lives in the sidebar, with a warning when it is missing.
  await page.evaluate((id) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(id), (await steps(page))[1].clientId);
  await page.evaluate(() => (window as any).wp.data.dispatch("core/edit-post").openGeneralSidebar("edit-post/block"));
  const alt = page.getByLabel("Alternative text");
  await expect(alt).toHaveValue("A student laughs at a desk.");
  await alt.fill("");
  await expect(page.getByLabel("Editor settings").getByText("No alternative text yet")).toBeVisible();
  await expect(cards(block).nth(1)).toContainText("Needs alt text");
  await alt.fill("Back at the desk.");
  await expect(cards(block).nth(1)).not.toContainText("Needs alt text");
  expect((await steps(page))[1].image).toBeTruthy();

  // The parent's fit choice draws what it does and drives the preview and the saved attribute.
  await block.locator(".byline-scrolly-board").click({ position: { x: 4, y: 4 } });
  await page.evaluate(() => { const wp = (window as any).wp; wp.data.dispatch("core/block-editor").selectBlock(wp.data.select("core/block-editor").getBlocks().find((b: any) => b.name === "byline/scrolly").clientId); });
  const fit = page.getByRole("group", { name: "Photograph fit" });
  await expect(fit.getByRole("radio", { name: /Whole photograph/ })).toBeChecked();
  await expect(fit.locator("svg")).toHaveCount(2);
  const stage = block.locator(".byline-scrolly-preview .byline-scrolly-stage");
  await expect(stage).toHaveAttribute("data-fit", "contain");
  await fit.getByText("Fill the stage", { exact: true }).click();
  await expect(stage).toHaveAttribute("data-fit", "cover");
  await expect(stage.locator("img")).toHaveCSS("object-fit", "cover");
  expect(await page.evaluate(() => (window as any).wp.data.select("core/block-editor").getBlocks().find((b: any) => b.name === "byline/scrolly").attributes.fit)).toBe("cover");
});

test("a saved story reopens without validation errors and publishes credits on their own line", async ({ adminPage: page, adminSession }) => {
  const { story, block } = await openStory(page, adminSession, "scrolly save");
  await cards(block).nth(0).click();
  await board(block, "Duplicate").click();
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  expect((await steps(page)).map((step) => step.heading)).toEqual(["First step", "First step", "Second step", "Third step"]);
  const html = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  // Slim photograph markup; WordPress adds the responsive candidates and the credit when the article renders.
  expect(html).toContain('<figcaption>A table of juniors.<p class="photo-credit">Photo: Jamal Whitfield</p></figcaption>');
  expect(html).toMatch(/<img [^>]*srcset="[^"]+"/);
  expect(html).toMatch(/sizes="(?:auto, )?\(max-width: 899px\) calc\(100vw - 32px\)/);
  expect(html.match(/class="wp-block-byline-scrolly-step byline-scrolly-step"/g)).toHaveLength(4);
  // The text-only step publishes as text only.
  expect(html).toContain('<section class="wp-block-byline-scrolly-step byline-scrolly-step"><div class="byline-scrolly-text">');
});

test("a story saved by Byline 0.3.24 opens, migrates each step and keeps its photograph and words", async ({ adminPage: page, adminSession }) => {
  await createEditorDraft(page, adminSession.registerTestPost, "scrolly legacy");
  const legacy = `<!-- wp:byline/scrolly -->
<section class="wp-block-byline-scrolly alignwide byline-scrolly" data-fit="contain" aria-label="Visual story"><!-- wp:byline/scrolly-step {"image":{"id":10,"url":"http://localhost:8888/wp-content/uploads/2026/10/newsroom-meeting.jpg","alt":"Two students","width":1600,"height":1067,"srcSet":"http://localhost:8888/wp-content/uploads/2026/10/newsroom-meeting.jpg 1600w","sizes":"(max-width: 1600px) 100vw, 1600px","credit":"Jamal Whitfield"},"caption":"A table of juniors."} -->
<section class="wp-block-byline-scrolly-step byline-scrolly-step"><figure class="byline-scrolly-media"><img src="http://localhost:8888/wp-content/uploads/2026/10/newsroom-meeting.jpg" alt="Two students" width="1600" height="1067" srcset="http://localhost:8888/wp-content/uploads/2026/10/newsroom-meeting.jpg 1600w" sizes="(max-width: 1600px) 100vw, 1600px" loading="lazy" class="wp-image-10"/><figcaption>A table of juniors.<p>Photo: Jamal Whitfield</p></figcaption></figure><div class="byline-scrolly-text"><!-- wp:heading -->
<h2 class="wp-block-heading">Legacy step</h2>
<!-- /wp:heading --></div></section>
<!-- /wp:byline/scrolly-step --></section>
<!-- /wp:byline/scrolly -->`;
  const result = await page.evaluate((markup) => {
    const wp = (window as any).wp;
    const [root] = wp.blocks.parse(markup);
    wp.data.dispatch("core/block-editor").resetBlocks([root]);
    return { valid: root.isValid && root.innerBlocks.every((b: any) => b.isValid), image: root.innerBlocks[0].attributes.image, caption: root.innerBlocks[0].attributes.caption };
  }, legacy);
  expect(result.valid).toBe(true);
  expect(result.image).toMatchObject({ id: 10, alt: "Two students", width: 1600 });
  expect(result.image).not.toHaveProperty("srcSet");
  expect(result.image).not.toHaveProperty("credit");
  expect(result.caption).toBe("A table of juniors.");
  const editor = await waitForEditorReady(page);
  await expect(editor.canvas.locator(".byline-scrolly-card-title")).toHaveText(["Legacy step"]);
});
