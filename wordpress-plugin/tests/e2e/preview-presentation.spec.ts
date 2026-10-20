/**
 * Preview as Byline must show the story the way it will publish: the author's
 * Standard or Immersive choice decides the opening, exactly as on the public
 * article route (both go through PresentedArticleView).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");
type Rest = (path: string, method?: string, body?: unknown) => Promise<{ ok: boolean; payload: any }>;

async function uploadFeaturedImage(page: Page, adminSession: { rest: Rest; addCleanup: (cleanup: () => Promise<void>) => void }, label: string) {
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const upload = await page.request.post("/wp-json/wp/v2/media", {
    headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${label.replace(/\W+/g, "-")}.jpg"` },
    data: await readFile(path.join(repoRoot, "apps/web/public/newsroom/newsroom-meeting-1000.jpg"))
  });
  expect(upload.ok()).toBe(true);
  const media = (await upload.json()) as { id: number };
  adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
  return media.id;
}

async function openPreview(page: Page, postId: number) {
  await page.goto(`/wp-admin/admin.php?page=byline-article-preview&post=${postId}`, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('iframe[title="Byline article preview"]');
  await expect(frame.locator("h1").first()).toBeVisible();
  return frame;
}

test.describe("Preview as Byline presentation", () => {
  test("an Immersive story previews with its hero, a Standard story without it, and Immersive without a photograph falls back with an explanation", async ({ adminPage: page, adminSession }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "preview presentation");
    const imageId = await uploadFeaturedImage(page, adminSession as any, "preview-presentation");
    const save = (data: unknown) => adminSession.rest(`/wp/v2/posts/${story.id}`, "POST", data);

    // Immersive with a featured image: the opening is the photograph under the headline.
    expect((await save({ featured_media: imageId, meta: { byline_story_presentation: "immersive", byline_story_immersive_alignment: "center" } })).ok).toBe(true);
    let frame = await openPreview(page, story.id);
    await expect(frame.locator(".immersive-article.immersive-article-center")).toBeVisible();
    await expect(frame.locator(".hero-reveal-image")).toBeVisible();
    await expect(frame.getByRole("heading", { level: 1, name: story.title })).toBeVisible();
    await expect(page.getByText("Presentation: Immersive. The featured image opens the story.")).toBeVisible();
    // The hero fills the first screen of the previewed device, not a collapsed strip.
    const hero = await frame.locator(".hero-reveal").boundingBox();
    expect(hero?.height ?? 0).toBeGreaterThan(400);
    // The scroll cue is an in-page anchor and still works inside the sandboxed preview.
    await frame.locator(".hero-reveal-scroll").click();
    await expect.poll(() => frame.locator("body").evaluate((body) => body.ownerDocument.defaultView!.scrollY)).toBeGreaterThan(200);

    // Standard: the normal article, no hero.
    expect((await save({ meta: { byline_story_presentation: "standard" } })).ok).toBe(true);
    frame = await openPreview(page, story.id);
    await expect(frame.locator(".article-header")).toBeVisible();
    await expect(frame.locator(".immersive-article")).toHaveCount(0);
    await expect(page.getByText("Presentation: Standard.", { exact: true })).toBeVisible();

    // Immersive without a featured image cannot open on a photograph: shown as Standard, and the editor is told.
    expect((await save({ featured_media: 0, meta: { byline_story_presentation: "immersive" } })).ok).toBe(true);
    frame = await openPreview(page, story.id);
    await expect(frame.locator(".immersive-article")).toHaveCount(0);
    await expect(page.getByText("Presentation: Standard. Immersive needs a featured image.")).toBeVisible();
  });
});
