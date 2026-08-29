/**
 * The golden path through the Gutenberg Story sidebar.
 *
 * These behaviours only exist once WordPress, the block editor, and the
 * protected Byline endpoints are all real:
 *
 *  1. a Stage change and a Visual Notes autosave overlap in one session and
 *     both persist;
 *  2. the More menu contains exactly one "Story" entry;
 *  3. publishing shows a queued/building website state that becomes Live only
 *     when the public manifest proves the expected revision;
 *  4. a failed deployment's Retry is represented as one durable job.
 */
import { expect, test } from "./fixtures";
import type { AdminSession } from "./fixtures";
import {
  openStoryPanel,
  openStorySidebar
} from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

async function ensureTestDeployment(session: AdminSession): Promise<() => Promise<void>> {
  const current = await session.rest<{ configured?: boolean }>("/byline/v1/admin/deployment");
  expect(current.ok, `Deployment status request failed with HTTP ${current.status}.`).toBe(true);
  if (current.payload?.configured) return async () => undefined;

  const configured = await session.rest("/byline/v1/admin/deployment", "POST", {
    provider: "generic-hook",
    hookUrl: "https://example.invalid/byline-e2e-build"
  });
  expect(configured.ok, `Test deployment setup failed with HTTP ${configured.status}.`).toBe(true);

  return async () => {
    const cleared = await session.rest("/byline/v1/admin/deployment", "POST", { clearHook: true });
    expect(cleared.ok, `Test deployment cleanup failed with HTTP ${cleared.status}.`).toBe(true);
  };
}

type ManifestFixture = {
  url: string;
  requests: () => Promise<number>;
  setRevision: (revision: number) => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Use the test-only WordPress HTTP fixture so the production diagnostic still
 * exercises its real wp_safe_remote_get path. Loopback/private hosts are
 * intentionally rejected by WordPress's safe HTTP API, so the fixture
 * preempts one reserved hostname inside the WP environment instead of asking
 * CI networking to bypass that protection.
 */
async function createManifestFixture(session: AdminSession): Promise<ManifestFixture> {
  const current = await session.rest<Record<string, unknown>>("/byline/v1/publication");
  expect(current.ok, `Publication read failed with HTTP ${current.status}.`).toBe(true);
  const currentConfig = current.payload && typeof current.payload === "object" ? current.payload : {};
  const currentUrls = currentConfig.urls && typeof currentConfig.urls === "object" ? currentConfig.urls : {};

  const url = "https://byline-e2e.invalid";
  const configured = await session.rest("/byline/v1/publication", "POST", {
    ...currentConfig,
    urls: { ...currentUrls, publicSite: url }
  });
  expect(configured.ok, `Publication fixture setup failed with HTTP ${configured.status}.`).toBe(true);

  const reset = await session.rest("/byline/v1/e2e/manifest", "POST", { revision: 0, resetRequests: true });
  expect(reset.ok, `Manifest fixture reset failed with HTTP ${reset.status}.`).toBe(true);

  return {
    url,
    requests: async () => {
      const state = await session.rest<{ requests?: number }>("/byline/v1/e2e/manifest");
      expect(state.ok, `Manifest fixture state read failed with HTTP ${state.status}.`).toBe(true);
      return Number(state.payload?.requests ?? 0);
    },
    setRevision: async (nextRevision) => {
      const state = await session.rest("/byline/v1/e2e/manifest", "POST", {
        revision: Number.isFinite(nextRevision) ? Math.max(0, Math.floor(nextRevision)) : 0
      });
      expect(state.ok, `Manifest fixture update failed with HTTP ${state.status}.`).toBe(true);
    },
    close: async () => {
      const restored = await session.rest("/byline/v1/publication", "POST", currentConfig);
      expect(restored.ok, `Publication fixture cleanup failed with HTTP ${restored.status}.`).toBe(true);
      const reset = await session.rest("/byline/v1/e2e/manifest", "POST", { revision: 0, resetRequests: true });
      expect(reset.ok, `Manifest fixture cleanup failed with HTTP ${reset.status}.`).toBe(true);
    }
  };
}

async function persistedStoryState(session: AdminSession, postId: number): Promise<{
  status: string;
  visuals: string;
}> {
  const result = await session.rest<{
    story?: { status?: string; storedStatus?: string; visuals?: string };
  }>(`/byline/v1/editorial/stories/${postId}/bootstrap`);
  if (!result.ok) return { status: `http-${result.status}`, visuals: "" };
  const story = result.payload.story;
  return {
    status: String(story?.storedStatus ?? story?.status ?? ""),
    visuals: String(story?.visuals ?? "")
  };
}

test.describe("Gutenberg Story sidebar", () => {
  test("a Stage change and an overlapping Visual Notes autosave both persist", async ({ adminPage: page, adminSession }) => {
    const story = await createEditorDraft(page, adminSession.registerTestPost, "overlap");
    await openStorySidebar(page);

    // Hold the Stage request open so the autosave provably overlaps it. The
    // route only holds the intended workflow mutation; bootstrap and lazy
    // panel reads remain real requests.
    let releaseStageRequest!: () => void;
    const stageRequestHeld = new Promise<void>((resolve) => {
      releaseStageRequest = resolve;
    });
    let heldOnce = false;
    const storyRoute = "**/byline/v1/editorial/stories/**";
    await page.route(storyRoute, async (route) => {
      if (route.request().method() !== "POST" || heldOnce) return route.continue();
      let body: Record<string, unknown> = {};
      try {
        body = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        // A malformed body should remain a real request and fail normally.
      }
      if (body.status !== "editing") return route.continue();
      heldOnce = true;
      await stageRequestHeld;
      return route.continue();
    });

    try {
      const stage = page.getByLabel("Stage");
      await expect(stage).toBeVisible();
      await stage.selectOption("editing");
      await expect.poll(() => heldOnce).toBe(true);

      await openStoryPanel(page, "visuals");
      const visualNote = page.getByLabel(/visual request or note/i);
      // Typing must not be blocked while a workflow request is in flight.
      await expect(visualNote).toBeEnabled();
      await visualNote.fill("Crowd photo from the east stand");

      // Wait for the debounced autosave to enter the same mutation queue while
      // the Stage request is still held. This proves the test exercises the
      // overlap rather than merely performing two sequential saves.
      await expect(page.getByText(/Saving visual note/i)).toBeVisible();
      expect(heldOnce).toBe(true);
      releaseStageRequest();

      await expect.poll(
        () => persistedStoryState(adminSession, story.id),
        { timeout: 20_000, intervals: [250, 500, 1_000] }
      ).toEqual({ status: "editing", visuals: "Crowd photo from the east stand" });

      await page.reload({ waitUntil: "domcontentloaded" });
      await openStorySidebar(page);
      await expect(page.getByLabel("Stage")).toHaveValue("editing");
      await openStoryPanel(page, "visuals");
      await expect(page.getByLabel(/visual request or note/i)).toHaveValue("Crowd photo from the east stand");
    } finally {
      releaseStageRequest();
      await page.unroute(storyRoute);
    }
  });

  test("secondary panels stay lazy until they are opened", async ({ adminPage: page, adminSession }) => {
    await createEditorDraft(page, adminSession.registerTestPost, "lazy");

    const panelRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/byline/v1/editorial/stories/")) panelRequests.push(request.url());
    });

    await openStorySidebar(page);
    expect(panelRequests.some((url) => url.includes("/tasks"))).toBe(false);

    await openStoryPanel(page, "tasks");
    await expect.poll(() => panelRequests.some((url) => url.includes("/tasks"))).toBe(true);
  });

  test("publishing reports queued, then Live only once the manifest proves the revision", async ({ adminPage: page, adminSession }) => {
    const cleanupDeployment = await ensureTestDeployment(adminSession);
    adminSession.addCleanup(cleanupDeployment);
    const manifest = await createManifestFixture(adminSession);
    adminSession.addCleanup(manifest.close);
    await createEditorDraft(page, adminSession.registerTestPost, "publish");

    let expectedRevision = 0;
    const observedRevisions: Array<{ expected: number; public: number }> = [];
    const observedLifecycles: Array<{ status: string; lifecycle: string }> = [];
    const distributionRoute = "**/byline/v1/editorial/stories/*/distribution**";
    await page.route(distributionRoute, async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const website = payload.channels?.find((channel: { id: string }) => channel.id === "website");
      if (website) {
        const evidence = website.evidence ?? {};
        observedLifecycles.push({
          status: String(website.status ?? ""),
          lifecycle: String(website.lifecycle ?? "")
        });
        const observedExpectedRevision = Number(evidence.expectedRevision ?? 0);
        expectedRevision = Math.max(expectedRevision, observedExpectedRevision);
        const publicRevision = Number(evidence.publicRevision ?? 0);
        observedRevisions.push({ expected: expectedRevision, public: publicRevision });
        if (observedExpectedRevision > 0 && publicRevision === 0) {
          await manifest.setRevision(observedExpectedRevision);
        }
      }
      return route.fulfill({ response, json: payload });
    });

    try {
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).last().click();

      await expect.poll(() => expectedRevision).toBeGreaterThan(0);
      expect(observedRevisions.some((revision) => revision.expected > 0 && revision.public < revision.expected)).toBe(true);
      expect(
        observedLifecycles.some(({ status, lifecycle }) => /queued|building|rebuild_pending/i.test(`${status} ${lifecycle}`)),
        `The first deployment response did not report a queued/building lifecycle: ${JSON.stringify(observedLifecycles)}`
      ).toBe(true);
      await expect(
        page.locator(".byline-postpublish-lifecycle"),
        `Deployment lifecycle responses: ${JSON.stringify(observedLifecycles)}`
      ).toContainText(/building|queued/i);
      await expect.poll(() => manifest.requests()).toBeGreaterThan(0);
      await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/live/i, { timeout: 30_000 });
      expect(observedRevisions.some((revision) => revision.expected > 0 && revision.public >= revision.expected)).toBe(true);
    } finally {
      await page.unroute(distributionRoute);
    }
  });

  test("a failed website update retries through the durable job system", async ({ adminPage: page, adminSession }) => {
    const cleanupDeployment = await ensureTestDeployment(adminSession);
    adminSession.addCleanup(cleanupDeployment);
    await createEditorDraft(page, adminSession.registerTestPost, "retry");

    let failedDistributionResponses = 0;
    const observedFailureLifecycles: Array<{ status: string; lifecycle: string; retryWebsite: unknown }> = [];
    const distributionRoute = "**/byline/v1/editorial/stories/*/distribution**";
    await page.route(distributionRoute, async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const website = payload.channels?.find((channel: { id: string }) => channel.id === "website");
      if (website) {
        website.status = "build_failed";
        website.lifecycle = "failed";
        failedDistributionResponses += 1;
      }
      payload.capabilities = { ...payload.capabilities, retryWebsite: true };
      observedFailureLifecycles.push({
        status: String(website?.status ?? ""),
        lifecycle: String(website?.lifecycle ?? ""),
        retryWebsite: payload.capabilities.retryWebsite
      });
      return route.fulfill({ response, json: payload });
    });

    const triggerRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/byline/v1/admin/deployment/trigger")) triggerRequests.push(request.url());
    });

    try {
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).last().click();
      const retry = page.getByRole("button", { name: /retry website update/i });
      await expect.poll(() => failedDistributionResponses).toBeGreaterThan(0);
      await expect(
        retry,
        `Failed deployment responses: ${JSON.stringify(observedFailureLifecycles)}`
      ).toBeVisible();
      const triggerResponsePromise = page.waitForResponse((response) => (
        response.request().method() === "POST"
        && response.url().includes("/byline/v1/admin/deployment/trigger")
      ));
      await retry.click();
      const triggerResponse = await triggerResponsePromise;
      expect(triggerResponse.ok(), `Deployment retry failed with HTTP ${triggerResponse.status()}.`).toBe(true);
      const triggerPayload = await triggerResponse.json() as { jobId?: string; lifecycle?: string };
      expect(triggerPayload.jobId).toMatch(/^byline:\d+$/);
      // Retry participates in the durable lifecycle, so the panel leaves the
      // failed state immediately instead of waiting on an untracked hook.
      await expect(page.locator(".byline-postpublish-lifecycle")).toContainText(/building|queued/i);
      await expect.poll(() => triggerRequests.length).toBe(1);

      const jobs = await adminSession.rest<{ jobs?: Array<{ id?: number; jobId?: string; type?: string }> }>("/byline/v1/admin/jobs");
      expect(jobs.ok).toBe(true);
      const deploymentJobs = (jobs.payload?.jobs ?? []).filter((job) => job.type === "deployment" && job.jobId === triggerPayload.jobId);
      expect(deploymentJobs).toHaveLength(1);
    } finally {
      await page.unroute(distributionRoute);
    }
  });
});
