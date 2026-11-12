import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ArticleBody } from "@byline/article-body";
import { lexicalFromArticleBody } from "@byline/editor/serialize";
import { addWithMenu, block, body, createStory, ensureMedia, login, pageOverflow, readDraft, signIn, waitForSaved } from "./helpers";

/**
 * Story presentation in the real editor (docs/story-presentation.md): the
 * Presentation surface on each visual block, old blocks still editable,
 * reporter language in the Add menu, and Preview as a direct header action
 * on Payload's own Live Preview state. Like the other editor specs it runs
 * against a running newsroom:
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3010 npx playwright test --config playwright.editor.config.ts tests/browser/story-presentation.spec.ts
 */
test.describe.configure({ mode: "serial" });

let token = "";
let storyId = 0;
const run = Date.now().toString(36);

/** Blocks saved before presets existed: no presentation fields at all. */
function legacyBody(media: Record<string, number>): ArticleBody {
  const p = (text: string) => ({ type: "paragraph" as const, children: [{ type: "text" as const, text }] });
  return {
    format: "byline-v1", version: 1, media: {},
    nodes: [
      p("At 11:52 a.m., the bell for third lunch rings."),
      { type: "photo", id: "e2e-photo", media: media["newsroom-panorama.jpg"]!, caption: "Third lunch.", placement: "wide" },
      p("From above, the problem is a geometry problem."),
      { type: "portraitText", id: "e2e-feature", media: media["newsroom-laughing.jpg"]!, heading: "Ana Ruiz, junior", body: [p("Ruiz started timing the line.")], side: "left" },
      p("Her numbers matched the register logs."),
      { type: "pullQuote", id: "e2e-quote", text: "It isn't the food. It's the door." },
      p("That pattern pointed to a fix."),
      { type: "visualChapter", id: "e2e-chapter", media: media["newsroom-meeting.jpg"]!, heading: "The third window", placement: "full", align: "bottom-left" },
      p("The district approved the counter.")
    ]
  };
}

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  const media = await ensureMedia(request, baseURL!, token);
  storyId = await createStory(request, baseURL!, token, { headline: `Presentation presets ${run}`, body: lexicalFromArticleBody(legacyBody(media)) });
});

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

async function openStory(page: Page) {
  await page.goto(`/admin/collections/stories/${storyId}?view=write`);
  await expect(body(page)).toBeVisible({ timeout: 60_000 });
  await expect(body(page)).toHaveAttribute("contenteditable", "true");
}

/** Selects a block the way a keyboard user does: focus one of its fields, which shows its toolbar. */
async function select(frame: Locator, field: string) {
  await frame.scrollIntoViewIfNeeded();
  await frame.getByRole("textbox", { name: field }).first().focus();
  await expect(frame.locator(".byline-block-chrome")).toBeVisible();
}

const surface = (page: Page) => page.locator("[data-presentation-surface]");
const preset = (page: Page, name: string) => surface(page).locator(`[data-preset="${name}"]`);
const choose = (page: Page, name: string, value: string) => preset(page, name).locator(`[data-value="${value}"]`).click();
async function openPresentation(frame: Locator) {
  await frame.locator("[data-presentation-trigger]").click();
  await expect(frame.page().locator("[data-presentation-surface]")).toBeVisible();
}
async function stored(page: Page, request: Parameters<typeof readDraft>[0], baseURL: string, id: string) {
  await waitForSaved(page);
  const draft = (await readDraft(request, baseURL, token, storyId)) as { body: { root: { children: Array<{ fields?: Record<string, unknown> }> } } };
  return draft.body.root.children.find((node) => node.fields?.id === id)?.fields ?? {};
}

test.describe("Preview is a first-class action", () => {
  const previewButton = (page: Page) => page.locator("header [data-story-preview]");
  const pane = (page: Page) => page.locator(".live-preview-window, [class*='live-preview-window']").first();

  test("is visible in the header, opens Payload's Live Preview and becomes Close preview", async ({ page }) => {
    await openStory(page);
    await expect(previewButton(page)).toBeVisible();
    await expect(previewButton(page)).toHaveAccessibleName("Preview");
    // Never in the overflow menu.
    await page.getByRole("button", { name: "More story actions" }).click();
    await expect(page.getByRole("menuitem", { name: /preview/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await previewButton(page).click();
    await expect(pane(page)).toBeVisible();
    await expect(previewButton(page)).toHaveAccessibleName("Close preview");
    // Focus stays on the one button as it changes name.
    await expect(previewButton(page)).toBeFocused();

    await previewButton(page).click();
    await expect(pane(page)).toBeHidden();
    await expect(previewButton(page)).toHaveAccessibleName("Preview");
    await expect(previewButton(page)).toBeFocused();
  });

  test("follows Payload's own preview state when it changes elsewhere", async ({ page }) => {
    await openStory(page);
    await previewButton(page).click();
    await expect(pane(page)).toBeVisible();
    // Payload remembers that the preview was open: a fresh load opens it again, and the button agrees.
    await page.reload();
    await expect(body(page)).toBeVisible({ timeout: 60_000 });
    await expect(pane(page)).toBeVisible();
    await expect(previewButton(page)).toHaveAccessibleName("Close preview");
    await previewButton(page).click();
    await expect(pane(page)).toBeHidden();
  });

});

test.describe("Preview on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const previewButton = (page: Page) => page.locator("header [data-story-preview]");

  test("keeps a direct close on a narrow screen, icon only with its name and a touch-sized target", async ({ page }) => {
    await openStory(page);
    await expect(previewButton(page)).toBeVisible();
    await expect(previewButton(page)).toHaveAttribute("aria-label", "Preview");
    await expect(previewButton(page).locator("span")).toHaveClass(/max-sm:sr-only/);
    const target = (await previewButton(page).boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
    await previewButton(page).click();
    await expect(previewButton(page)).toHaveAttribute("aria-label", "Close preview");
    await expect(previewButton(page)).toBeVisible();
    await previewButton(page).click();
    await expect(previewButton(page)).toHaveAttribute("aria-label", "Preview");
  });
});

test.describe("Presentation", () => {
  test("an old Portrait + Text opens as a Split, and only Spotlight's own choices appear for Spotlight", async ({ page, request, baseURL }) => {
    await openStory(page);
    const frame = block(page, "portraitText");
    await expect(frame.locator(".byline-portrait-text")).not.toHaveAttribute("data-presentation");
    await select(frame, "Heading (optional)");
    await expect(frame.locator(".byline-block-chrome-label")).toHaveText("Feature Media");
    await openPresentation(frame);
    await expect(preset(page, "layout").locator('[data-value="split"]')).toHaveAttribute("aria-pressed", "true");
    await expect(preset(page, "phoneOrder")).toBeVisible();
    await expect(preset(page, "side")).toBeVisible();
    await expect(preset(page, "scrim")).toHaveCount(0);

    await choose(page, "layout", "spotlight");
    await expect(preset(page, "layout").locator('[data-value="spotlight"]')).toHaveAttribute("aria-pressed", "true");
    await expect(preset(page, "tone")).toBeVisible();
    await expect(preset(page, "scrim")).toBeVisible();
    await expect(preset(page, "side")).toHaveCount(0);
    await expect(preset(page, "phoneOrder")).toHaveCount(0);
    await choose(page, "scrim", "strong");
    // The canvas draws the public primitive: the same attributes, the same full-width frame.
    await expect(frame.locator(".byline-portrait-text")).toHaveAttribute("data-presentation", "spotlight");
    await expect(frame.locator(".byline-portrait-text")).toHaveAttribute("data-scrim", "strong");
    await expect(frame).toHaveClass(/alignfull/);
    expect(await stored(page, request, baseURL!, "e2e-feature")).toMatchObject({ presentation: "spotlight", scrim: "strong" });

    // Back to Split: the old look, the Spotlight-only choices gone again.
    await choose(page, "layout", "split");
    await expect(frame).toHaveClass(/alignwide/);
    await page.keyboard.press("Escape");
    await expect(surface(page)).toBeHidden();
  });

  test("Photo: edge to edge on phones is a choice in Presentation, with a route to Crops", async ({ page, request, baseURL }) => {
    await openStory(page);
    const frame = block(page, "photo");
    // A wide photo already reaches a phone's edges by default (Auto).
    await expect(frame).toHaveClass(/byline-frame-bleed/);
    await select(frame, "Caption");
    await openPresentation(frame);
    await expect(preset(page, "phone").locator('[data-value="auto"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Crops and focal point" })).toBeVisible();
    await choose(page, "phone", "inset");
    await expect(frame).not.toHaveClass(/byline-frame-bleed/);
    expect(await stored(page, request, baseURL!, "e2e-photo")).toMatchObject({ phone: "inset" });
  });

  test("Chapter: a text chapter needs no photograph; a photo chapter offers heights and scrims", async ({ page, request, baseURL }) => {
    await openStory(page);
    const frame = block(page, "visualChapter");
    await select(frame, "Chapter heading");
    await expect(frame.locator(".byline-block-chrome-label")).toHaveText("Chapter");
    await openPresentation(frame);
    // A chapter saved before heights keeps its proportion until a height is chosen.
    await expect(surface(page)).toContainText("keeps the proportion it was published with");
    await choose(page, "height", "full");
    await expect(frame.locator(".byline-visual-chapter")).toHaveAttribute("data-height", "full");
    await choose(page, "kind", "text");
    await expect(preset(page, "height")).toHaveCount(0);
    await expect(preset(page, "scrim")).toHaveCount(0);
    await expect(frame.locator(".byline-visual-chapter")).toHaveAttribute("data-kind", "text");
    await expect(frame.locator(".byline-visual-chapter img")).toHaveCount(0);
    await expect(frame.getByRole("button", { name: "Replace" })).toHaveCount(0);
    expect(await stored(page, request, baseURL!, "e2e-chapter")).toMatchObject({ kind: "text", height: "full" });
  });

  test("Pull Quote: Breakout and Full widen the quote in the canvas", async ({ page, request, baseURL }) => {
    await openStory(page);
    const frame = block(page, "pullQuote");
    await select(frame, "Pull quote");
    await openPresentation(frame);
    await expect(preset(page, "presentation").locator('[data-value="standard"]')).toHaveAttribute("aria-pressed", "true");
    await choose(page, "presentation", "full");
    await expect(frame).toHaveClass(/alignwide/);
    await expect(frame.locator(".byline-pull-quote")).toHaveAttribute("data-presentation", "full");
    expect(await stored(page, request, baseURL!, "e2e-quote")).toMatchObject({ presentation: "full" });
  });

  test("opens in a bottom Sheet with touch-sized targets on a phone, and keeps the page from scrolling sideways", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await signIn(context, baseURL!, token);
    const page = await context.newPage();
    await openStory(page);
    const frame = block(page, "pullQuote");
    await select(frame, "Pull quote");
    await openPresentation(frame);
    await expect(surface(page).locator("xpath=ancestor::*[@data-slot='sheet-content']")).toHaveCount(1);
    for (const option of await preset(page, "presentation").locator("[data-value]").all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(surface(page)).toBeHidden();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe("the Add menu speaks the newsroom's language", () => {
  test("finds Feature Media and Chapter by what reporters call them", async ({ page }) => {
    await openStory(page);
    await page.getByRole("button", { name: "Add photo, quote, facts…" }).click();
    const input = page.getByRole("combobox", { name: "Find a story tool" });
    for (const [search, label] of [["feature image", "Feature Media"], ["image and text", "Feature Media"], ["sticky image", "Feature Media"], ["chapter break", "Chapter"], ["section break", "Chapter"], ["edge to edge", "Photo"], ["photo essay", "Photo Gallery"]] as const) {
      await input.fill(search);
      await expect(page.locator("[data-slot=command-item]").first()).toContainText(label);
    }
    await page.keyboard.press("Escape");
  });

  test("a new Chapter starts at Half screen", async ({ page, request, baseURL }) => {
    await openStory(page);
    await body(page).getByText("The district approved the counter.").click();
    await page.keyboard.press("End");
    await addWithMenu(page, "chapter", /^Chapter/);
    const chapters = body(page).locator(":scope > .byline-block-visualChapter");
    await expect(chapters).toHaveCount(2);
    await waitForSaved(page);
    const draft = (await readDraft(request, baseURL!, token, storyId)) as { body: { root: { children: Array<{ fields?: Record<string, unknown> }> } } };
    const created = draft.body.root.children.filter((node) => node.fields?.blockType === "visualChapter").find((node) => node.fields?.id !== "e2e-chapter");
    expect(created?.fields).toMatchObject({ kind: "media", height: "half" });
  });
});
