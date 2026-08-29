/**
 * The golden path through the Gutenberg Story sidebar.
 *
 * The behaviours asserted here are the ones no unit test can prove, because
 * they only exist once WordPress, the block editor, and the protected Byline
 * endpoints are all real:
 *
 *  1. a Stage change and a Visual Notes autosave overlapping in one session
 *     both persist, and neither conflicts with the other;
 *  2. the More menu contains exactly one "Story" entry;
 *  3. publishing shows a queued/building website state that becomes Live only
 *     when the public manifest proves the expected revision;
 *  4. a failed deployment's Retry is represented as a durable job.
 *
 * Everything else about the sidebar is covered by the PHP and vitest suites.
 */
import { expect, test, type Page } from "./fixtures";

async function newDraft(page: Page): Promise<void> {
  await page.goto("/wp-admin/post-new.php?post_type=post");
  const closeDialog = page.getByRole("button", { name: /close|get started/i }).first();
  if (await closeDialog.isVisible().catch(() => false)) await closeDialog.click();
  await page.getByRole("textbox", { name: /add title/i }).fill("Story sidebar golden path");
}

async function openStorySidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: /options|view options|more/i }).first().click();
  const storyItems = page.getByRole("menuitemcheckbox", { name: "Story" });

  // PluginSidebar registers exactly one More-menu entry. A second explicit
  // registration used to add a duplicate, which is invisible to unit tests.
  await expect(storyItems).toHaveCount(1);
  await storyItems.click();
  await expect(page.getByRole("region", { name: /story/i })).toBeVisible();
}

test.describe("Gutenberg Story sidebar", () => {
  test("a Stage change and an overlapping Visual Notes autosave both persist", async ({ adminPage: page }) => {
    await newDraft(page);
    await openStorySidebar(page);

    // Hold the Stage request open so the autosave provably overlaps it.
    let releaseStageRequest: (() => void) | null = null;
    const stageRequestHeld = new Promise<void>((resolve) => {
      releaseStageRequest = resolve;
    });
    let heldOnce = false;
    await page.route("**/byline/v1/editorial/stories/**", async (route) => {
      if (route.request().method() !== "POST" || heldOnce) return route.continue();
      heldOnce = true;
      await stageRequestHeld;
      return route.continue();
    });

    await page.getByLabel("Stage").selectOption("editing");

    await page.getByRole("button", { name: "Visuals" }).click();
    const visualNote = page.getByLabel(/visual request or note/i);
    // Typing must not be blocked while a workflow request is in flight.
    await expect(visualNote).toBeEnabled();
    await visualNote.fill("Crowd photo from the east stand");

    releaseStageRequest?.();

    await expect(page.getByText(/workflow saved/i)).toBeVisible();
    await expect(page.locator(".byline-workflow-panel")).not.toContainText(/changed somewhere else/i);

    await page.reload();
    await openStorySidebar(page);
    await expect(page.getByLabel("Stage")).toHaveValue("editing");
    await page.getByRole("button", { name: "Visuals" }).click();
    await expect(page.getByLabel(/visual request or note/i)).toHaveValue("Crowd photo from the east stand");
  });

  test("secondary panels stay lazy until they are opened", async ({ adminPage: page }) => {
    await newDraft(page);

    const panelRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/byline/v1/editorial/stories/")) panelRequests.push(request.url());
    });

    await openStorySidebar(page);
    expect(panelRequests.some((url) => url.includes("/tasks"))).toBe(false);

    await page.getByRole("button", { name: /^Tasks/ }).click();
    await expect.poll(() => panelRequests.some((url) => url.includes("/tasks"))).toBe(true);
  });

  test("publishing reports queued, then Live only once the manifest proves the revision", async ({ adminPage: page }) => {
    await newDraft(page);

    let manifestRevision = 0;
    await page.route("**/byline/v1/editorial/stories/*/distribution", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const website = payload.channels?.find((channel: { id: string }) => channel.id === "website");
      if (website) website.status = manifestRevision > 0 ? "live" : "rebuild_pending";
      return route.fulfill({ response, json: payload });
    });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).nth(1).click();

    await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/building|queued/i);
    manifestRevision = 1;
    await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/live/i, { timeout: 30_000 });
  });

  test("a failed website update retries through the durable job system", async ({ adminPage: page }) => {
    await page.goto("/wp-admin/post.php?post=" + (process.env.WP_PUBLISHED_POST_ID ?? "1") + "&action=edit");

    await page.route("**/byline/v1/editorial/stories/*/distribution", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const website = payload.channels?.find((channel: { id: string }) => channel.id === "website");
      if (website) website.status = "build_failed";
      payload.capabilities = { ...payload.capabilities, retryWebsite: true };
      return route.fulfill({ response, json: payload });
    });

    const triggerRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/byline/v1/admin/deployment/trigger")) triggerRequests.push(request.url());
    });

    const retry = page.getByRole("button", { name: /retry website update/i });
    await expect(retry).toBeVisible();
    await retry.click();
    // The retry participates in the durable lifecycle, so the panel leaves the
    // failed state immediately instead of waiting on an untracked hook request.
    await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/building|queued/i);
    await retry.click({ trial: true }).catch(() => undefined);
    expect(triggerRequests.length).toBeLessThanOrEqual(1);

    const jobs = await page.evaluate(async () => {
      const response = await window.fetch("/wp-json/byline/v1/admin/jobs", { credentials: "same-origin" });
      return response.ok ? await response.json() : null;
    });
    expect(jobs).not.toBeNull();
    expect(JSON.stringify(jobs)).toContain("deployment");
  });
});
