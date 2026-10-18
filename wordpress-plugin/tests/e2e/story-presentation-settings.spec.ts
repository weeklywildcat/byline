/**
 * The Story presentation panel in the block editor: two plain post-meta
 * choices (Standard / Immersive, and where an immersive headline sits) that
 * save with the post and come back through the Byline REST settings.
 */
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { saveEditorDraft } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

type PostSettings = { byline?: { presentation?: string; immersiveAlignment?: string }; meta?: Record<string, string> };

async function openPresentationPanel(page: Page) {
  const toggle = page.getByRole("button", { name: /^Story presentation$/ });
  if (!(await toggle.isVisible().catch(() => false))) {
    // The panel lives in the document Settings sidebar.
    const settings = page.getByRole("button", { name: /^Settings$/ }).first();
    if ((await settings.getAttribute("aria-pressed")) !== "true") await settings.click();
  }
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  return page.locator(".byline-story-presentation");
}

test.describe("Story presentation panel", () => {
  test("offers only Standard and Immersive, then Bottom left and Center, and saves the choice", async ({ adminPage: page, adminSession }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "presentation");
    const panel = await openPresentationPanel(page);

    // Defaults: Standard, and no headline position until Immersive is chosen.
    await expect(panel.getByRole("radio")).toHaveCount(2);
    await expect(panel.getByRole("radio", { name: "Standard" })).toBeChecked();
    await expect(panel.getByRole("radio", { name: "Immersive" })).not.toBeChecked();
    await expect(panel.getByText("Headline position")).toHaveCount(0);

    await panel.getByRole("radio", { name: "Immersive" }).check();
    await expect(panel.getByText("Headline position")).toBeVisible();
    await expect(panel.getByRole("radio")).toHaveCount(4);
    await expect(panel.getByRole("radio", { name: "Bottom left" })).toBeChecked();
    // No featured image yet: the author is told what will happen.
    await expect(panel.getByText(/Add a featured image/)).toBeVisible();

    await panel.getByRole("radio", { name: "Center" }).check();
    await saveEditorDraft(page);

    const saved = await adminSession.rest<PostSettings>(`/wp/v2/posts/${story.id}?context=edit`);
    expect(saved.ok).toBe(true);
    expect(saved.payload.byline).toMatchObject({ presentation: "immersive", immersiveAlignment: "center" });
    expect(saved.payload.meta).toMatchObject({ byline_story_presentation: "immersive", byline_story_immersive_alignment: "center" });

    // Reopening the editor shows what was saved.
    await page.reload({ waitUntil: "domcontentloaded" });
    const reopened = await openPresentationPanel(page);
    await expect(reopened.getByRole("radio", { name: "Immersive" })).toBeChecked();
    await expect(reopened.getByRole("radio", { name: "Center" })).toBeChecked();

    // Back to Standard hides the headline position; the stored choice follows.
    await reopened.getByRole("radio", { name: "Standard" }).check();
    await expect(reopened.getByText("Headline position")).toHaveCount(0);
    await saveEditorDraft(page);
    const standard = await adminSession.rest<PostSettings>(`/wp/v2/posts/${story.id}?context=edit`);
    expect(standard.payload.byline?.presentation).toBe("standard");
  });

  test("a new story is Standard, bottom left, in the Byline settings", async ({ adminPage: page, adminSession }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "presentation-default");
    const settings = await adminSession.rest<PostSettings>(`/wp/v2/posts/${story.id}?context=edit`);

    expect(settings.payload.byline).toMatchObject({ presentation: "standard", immersiveAlignment: "bottom-left" });
  });

  test("the server refuses a value outside the two presentations", async ({ adminPage: page, adminSession }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "presentation-invalid");
    const rejected = await adminSession.rest(`/wp/v2/posts/${story.id}`, "POST", { meta: { byline_story_presentation: "fullbleed" } });

    expect(rejected.ok).toBe(false);
    const settings = await adminSession.rest<PostSettings>(`/wp/v2/posts/${story.id}?context=edit`);
    expect(settings.payload.byline?.presentation).toBe("standard");
  });
});
