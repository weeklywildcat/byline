import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  editEditorBlockText,
  insertEditorBlock,
  openStorySidebar,
  readEditedPostContent
} from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

test.describe("Preview as Byline", () => {
  test("saves the draft, renders it privately, and blocks public actions", async ({ adminPage: page, adminSession, request }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "preview");
    await insertEditorBlock(page, { name: "core/paragraph" });
    await editEditorBlockText(page, "core/paragraph", "Unsaved preview body from the browser golden path.");
    await expect.poll(() => readEditedPostContent(page)).toContain("Unsaved preview body from the browser golden path.");

    const sidebar = await openStorySidebar(page);
    const previewButton = sidebar.getByRole("button", { name: "Preview as Byline", exact: true });
    await expect(previewButton).toBeVisible();

    let preview: Page | null = null;
    try {
      const saveResponsePromise = page.waitForResponse((response) => (
        response.request().method() === "POST"
        && response.url().includes(`/wp-json/wp/v2/posts/${story.id}`)
      ));
      const popupPromise = page.waitForEvent("popup");
      await previewButton.click();
      const [saveResponse, openedPreview] = await Promise.all([saveResponsePromise, popupPromise]);
      preview = openedPreview;
      expect(saveResponse.ok(), `Preview save failed with HTTP ${saveResponse.status()}.`).toBe(true);

      await preview.waitForURL(/page=byline-article-preview/, { waitUntil: "domcontentloaded" });
      expect(preview.url(), "Preview navigated before the edited post save completed.").toContain("page=byline-article-preview");
      await expect(preview.getByRole("heading", { name: "Preview as Byline", exact: true })).toBeVisible();

      const previewFrame = preview.frameLocator('iframe[title="Byline article preview"]');
      await expect(previewFrame.getByRole("heading", { name: story.title, exact: true })).toBeVisible();
      await expect(previewFrame.getByText("Unsaved preview body from the browser golden path.", { exact: true }).first()).toBeVisible();

      const previewUrl = preview.url();
      const contactLink = previewFrame.getByRole("link", { name: "Contact the newsroom", exact: true });
      await expect(contactLink).toBeVisible();
      await contactLink.click();
      expect(preview.url()).toBe(previewUrl);

      const anonymousResponse = await request.get(previewUrl, { maxRedirects: 0 });
      expect(anonymousResponse.status(), "The draft preview is anonymously accessible.").not.toBe(200);

      const savedPost = await adminSession.rest<{ content?: { rendered?: string }; title?: { rendered?: string } }>(`/wp/v2/posts/${story.id}`);
      expect(savedPost.ok).toBe(true);
      expect(savedPost.payload.title?.rendered).toContain(story.title);
      expect(savedPost.payload.content?.rendered).toContain("Unsaved preview body from the browser golden path.");
    } finally {
      await preview?.close();
    }
  });
});
