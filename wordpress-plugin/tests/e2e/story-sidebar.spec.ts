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

type AdminRestResult = { ok: boolean; status: number; payload: unknown };

async function adminRest(page: Page, path: string, method: "GET" | "POST" = "GET", data?: Record<string, unknown>): Promise<AdminRestResult> {
  return page.evaluate(async ({ path: requestPath, method: requestMethod, data: requestData }) => {
    const settings = (window as Window & { wpApiSettings?: { nonce?: string } }).wpApiSettings;
    const response = await window.fetch(`/wp-json${requestPath}`, {
      method: requestMethod,
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": settings?.nonce ?? "",
        ...(requestData ? { "Content-Type": "application/json" } : {})
      },
      body: requestData ? JSON.stringify(requestData) : undefined
    });
    return { ok: response.ok, status: response.status, payload: await response.json().catch(() => null) };
  }, { path, method, data });
}

async function ensureTestDeployment(page: Page): Promise<() => Promise<void>> {
  const current = await adminRest(page, "/byline/v1/admin/deployment");
  expect(current.ok, `Deployment status request failed with HTTP ${current.status}.`).toBe(true);
  const status = (current.payload ?? {}) as { configured?: boolean };
  if (status.configured) return async () => undefined;

  const configured = await adminRest(page, "/byline/v1/admin/deployment", "POST", {
    provider: "generic-hook",
    hookUrl: "https://example.invalid/byline-e2e-build"
  });
  expect(configured.ok, `Test deployment setup failed with HTTP ${configured.status}.`).toBe(true);
  return async () => {
    await adminRest(page, "/byline/v1/admin/deployment", "POST", {
      provider: "generic-hook",
      clearHook: true
    });
  };
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
    let expectedRevision = 0;
    const observedRevisions: Array<{ expected: number; public: number }> = [];
    await page.route("**/byline/v1/editorial/stories/*/distribution", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const website = payload.channels?.find((channel: { id: string }) => channel.id === "website");
      if (website) {
        const evidence = website.evidence ?? {};
        expectedRevision = Math.max(expectedRevision, Number(evidence.expectedRevision ?? 0));
        const publicRevision = manifestRevision;
        observedRevisions.push({ expected: expectedRevision, public: publicRevision });
        website.status = expectedRevision > 0 && publicRevision >= expectedRevision ? "live" : "rebuild_pending";
        website.evidence = { ...evidence, expectedRevision, publicRevision };
      }
      return route.fulfill({ response, json: payload });
    });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).nth(1).click();

    await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/building|queued/i);
    await expect.poll(() => expectedRevision).toBeGreaterThan(0);
    manifestRevision = expectedRevision;
    await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/live/i, { timeout: 30_000 });
    expect(observedRevisions.some((revision) => revision.expected > 0 && revision.public >= revision.expected)).toBe(true);
  });

  test("a failed website update retries through the durable job system", async ({ adminPage: page }) => {
    const cleanupDeployment = await ensureTestDeployment(page);
    try {
      await newDraft(page);

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
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).nth(1).click();
      await expect(retry).toBeVisible();
      await retry.click();
      // The retry participates in the durable lifecycle, so the panel leaves the
      // failed state immediately instead of waiting on an untracked hook request.
      await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/building|queued/i);
      await expect(retry).toBeEnabled();
      await retry.click();
      expect(triggerRequests.length).toBe(2);

      const jobs = await page.evaluate(async () => {
        const response = await window.fetch("/wp-json/byline/v1/admin/jobs", { credentials: "same-origin" });
        return response.ok ? await response.json() : null;
      });
      expect(jobs).not.toBeNull();
      const deploymentJobs = (jobs.jobs ?? []).filter((job: { type?: string }) => job.type === "deployment");
      expect(deploymentJobs).toHaveLength(1);
    } finally {
      await cleanupDeployment();
    }
  });
});
