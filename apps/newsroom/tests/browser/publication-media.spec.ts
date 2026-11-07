import { readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createStory, FIXTURE_DIR, login, signIn } from "./helpers";

/**
 * Phase 5 publication media in a real browser (docs/publication-media.md):
 * the art-direction editor from the Media inspector and the Story lead image,
 * focal point and custom crops, Reset to Auto, low-resolution warnings,
 * Preparing → Ready without a reload, Retry, the Story header's readiness
 * line, the narrow dialog, and unsaved file details surviving a crop save.
 *
 * Needs a running newsroom AND its media worker (`npm run jobs:media`) with
 * the STAFF and EDITOR accounts. The Retry case also needs the newsroom's
 * private upload directory (BYLINE_E2E_MEDIA_DIR) to make a source go missing.
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3021 BYLINE_E2E_MEDIA_DIR=... npm run test:browser --workspace @byline/newsroom -- publication-media
 */
test.describe.configure({ mode: "serial" });

let staffToken = "";
let editorToken = "";
const ids: Record<string, number> = {};
const auth = (baseURL: string, token: string) => ({ Authorization: `JWT ${token}`, Origin: baseURL });

async function upload(request: APIRequestContext, baseURL: string, file: string, name: string) {
  const response = await request.post("/api/byline/media/upload", { headers: auth(baseURL, staffToken), multipart: { file: { name, mimeType: "image/jpeg", buffer: readFileSync(new URL(file, FIXTURE_DIR)) }, folderId: "" } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).id as number;
}

async function waitForState(request: APIRequestContext, baseURL: string, id: number, state: string) {
  await expect.poll(async () => (await (await request.get(`/api/byline/media/${id}`, { headers: auth(baseURL, staffToken) })).json()).publication.state, { timeout: 60_000 }).toBe(state);
}

async function openInspector(page: Page, id: number) {
  await page.goto(`/admin/media?asset=${id}`);
  await expect(page.locator(`[data-media-inspector][data-asset-id="${id}"]`)).toBeVisible({ timeout: 60_000 });
}

const dialog = (page: Page) => page.locator("[data-media-art-direction-dialog]");

test.beforeAll(async ({ request, baseURL }) => {
  staffToken = await login(request, baseURL!, "STAFF");
  editorToken = await login(request, baseURL!, "EDITOR");
  const stamp = Date.now();
  ids.panorama = await upload(request, baseURL!, "newsroom-panorama.jpg", `e2e-${stamp}-panorama.jpg`);
  ids.laughing = await upload(request, baseURL!, "newsroom-laughing.jpg", `e2e-${stamp}-laughing.jpg`);
  for (const id of Object.values(ids)) await waitForState(request, baseURL!, id, "ready");
});

test("the Media inspector edits the focal point and crops, and the asset prepares again without a reload", async ({ page, context, baseURL, request }) => {
  await signIn(context, baseURL!, staffToken);
  await openInspector(page, ids.panorama);
  const publication = page.locator("[data-media-publication]");
  await expect(publication).toHaveAttribute("data-media-publication", "ready");
  // An honest warning for a 1600px source: search engines prefer 1200px+ for every ratio.
  await expect(page.locator("[data-media-publication-warnings]")).toContainText("search engines prefer");

  await page.locator("[data-media-art-direction]").click();
  await expect(dialog(page)).toBeVisible();
  const focal = page.locator("[data-art-focal]");
  await focal.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(focal).toHaveAttribute("data-art-focal", "40,40");

  // A custom Square crop, then Reset back to Auto, then a custom crop again.
  await page.locator("[data-art-tab=square]").click();
  await expect(page.locator("[data-art-status]")).toHaveAttribute("data-art-status", "auto");
  const area = page.locator("[data-art-workspace]");
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-art-status]")).toHaveAttribute("data-art-status", "custom");
  await expect(page.locator("[data-art-placement=square]")).toContainText("Custom");
  await page.locator("[data-art-reset]").click();
  await expect(page.locator("[data-art-status]")).toHaveAttribute("data-art-status", "auto");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-art-low-resolution=square]")).toHaveCount(0);
  // Zoomed all the way in, the square is narrower than the smallest file the site wants (320px): say so.
  await page.getByRole("slider", { name: "Zoom" }).fill("5");
  await expect(page.locator("[data-art-low-resolution=square]")).toBeVisible();
  await expect(page.locator("[data-art-placement=square]")).toContainText("Low resolution");

  await page.locator("[data-art-save]").click();
  await expect(dialog(page)).toBeHidden();
  await expect(publication).toHaveAttribute("data-media-publication", "preparing");
  await expect(publication).toHaveAttribute("data-media-publication", "ready", { timeout: 60_000 });
  await expect(publication).toContainText("version 2");

  const saved = await (await request.get(`/api/byline/media/${ids.panorama}/art-direction`, { headers: auth(baseURL!, staffToken) })).json();
  expect(saved.intent.focalPoint).toEqual({ x: 40, y: 40 });
  expect(Object.keys(saved.intent.crops)).toEqual(["square"]);
});

test("unsaved file details survive the reader's own crop save and then save without a conflict", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, staffToken);
  await openInspector(page, ids.laughing);
  const alt = page.locator("textarea[id^='media-alt-']");
  await alt.fill("A junior laughs with friends at lunch.");
  await page.locator("[data-media-art-direction]").click();
  await page.locator("[data-art-focal]").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.locator("[data-art-save]").click();
  await expect(dialog(page)).toBeHidden();
  await expect(alt).toHaveValue("A junior laughs with friends at lunch.");
  await page.locator("[data-media-save-bar] button[type=submit]").click();
  await expect(page.locator("[data-media-save-bar]")).toHaveClass(/hidden/);
  await expect(page.locator("[data-media-inspector] [role=alert]").filter({ hasText: "Someone else" })).toHaveCount(0);
});

test("closing with unsaved crop changes asks first, and the editor is usable on a phone", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, staffToken);
  await page.setViewportSize({ width: 375, height: 812 });
  await openInspector(page, ids.laughing);
  await page.locator("[data-media-art-direction]").click();
  await expect(dialog(page)).toBeVisible();
  const workspace = (await page.locator("[data-art-workspace]").boundingBox())!;
  expect(workspace.width).toBeGreaterThan(300);
  expect(workspace.height).toBeGreaterThan(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator("[data-art-focal]").focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toContainText("Discard your crop changes?");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).last().click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(dialog(page)).toBeHidden();
});

test("the Story lead image opens the same editor, and the header explains media readiness and Retry", async ({ page, context, baseURL, request }) => {
  const mediaDir = process.env.BYLINE_E2E_MEDIA_DIR;
  test.skip(!mediaDir, "Set BYLINE_E2E_MEDIA_DIR to the newsroom's private upload directory for the Retry case.");
  const id = await upload(request, baseURL!, "newsroom-tablet.jpg", `e2e-${Date.now()}-tablet.jpg`);
  await waitForState(request, baseURL!, id, "ready");
  await request.patch(`/api/byline/media/${id}`, { headers: auth(baseURL!, staffToken), data: { alt: "A worker checks a tablet.", credit: "Jordan Lee", copyright: "© 2026" } });
  const detail = await (await request.get(`/api/byline/media/${id}/art-direction`, { headers: auth(baseURL!, staffToken) })).json();
  // Make the next preparation fail: the original disappears, then the focal point changes.
  const original = path.join(mediaDir!, detail.filename);
  renameSync(original, `${original}.hidden`);
  try {
    await request.put(`/api/byline/media/${id}/art-direction`, { headers: auth(baseURL!, staffToken), data: { focalPoint: { x: 30, y: 30 }, expectedUpdatedAt: detail.updatedAt } });
    await waitForState(request, baseURL!, id, "failed");
  } finally {
    renameSync(`${original}.hidden`, original);
  }
  const storyId = await createStory(request, baseURL!, editorToken, { headline: "E2E lead image readiness", featuredMedia: id });

  await signIn(context, baseURL!, editorToken);
  await page.goto(`/admin/collections/stories/${storyId}`);
  const readiness = page.locator("[data-story-media-readiness]");
  await expect(readiness).toContainText("Publication file preparation failed", { timeout: 60_000 });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Can't publish yet: .*tablet\.jpg/)).toBeVisible();

  await page.locator("[data-lead-art-direction]").click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("[data-art-focal]")).toHaveAttribute("data-art-focal", "30,30");
  await page.getByRole("button", { name: "Cancel" }).last().click();

  await readiness.getByRole("button", { name: "Retry" }).click();
  await expect(readiness).toContainText("Preparing 1 file");
  await expect(readiness).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator("dl")).toContainText("Published", { timeout: 30_000 });
});
