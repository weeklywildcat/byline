import { expect, test, type AdminSession } from "./fixtures";
import {
  openStorySidebar,
  waitForBylineEditorReady
} from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

async function openPlanningStory(page: Parameters<typeof openStorySidebar>[0], title: string) {
  await page.goto("/wp-admin/admin.php?page=byline-planning&tab=stories", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "Planning views", exact: true })).toBeVisible();

  const storyLink = page.getByRole("link", { name: title, exact: true });
  await expect(storyLink).toBeVisible();
  await storyLink.click();

  const dialog = page.getByRole("dialog").filter({ hasText: title }).first();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function workflowStatus(session: AdminSession, postId: number): Promise<string> {
  const response = await session.rest<{ story?: { status?: string } }>(`/byline/v1/editorial/stories/${postId}/quick-view`);
  expect(response.ok, `Quick View request failed with HTTP ${response.status}.`).toBe(true);
  return String(response.payload.story?.status ?? "");
}

async function closeQuickView(dialog: Awaited<ReturnType<typeof openPlanningStory>>): Promise<void> {
  const close = dialog.getByRole("button", { name: /close/i }).first();
  await expect(close).toBeVisible();
  await close.click();
  await expect(dialog).not.toBeVisible();
}

test.describe("Planning Story Quick View", () => {
  test("moves a story optimistically, persists it, rolls back failures, and opens the full editor", async ({ adminPage: page, adminSession }) => {
    const first = await createEditorDraft(page, adminSession.registerTestPost, "quick-view-first");
    const second = await createEditorDraft(page, adminSession.registerTestPost, "quick-view-second");

    let firstDialog = await openPlanningStory(page, first.title);
    const firstMove = firstDialog.getByRole("combobox", { name: "Move stage", exact: true });
    await expect(firstMove).toHaveValue("pitch");

    let releaseFirstMove!: () => void;
    const firstMoveHeld = new Promise<void>((resolve) => {
      releaseFirstMove = resolve;
    });
    let firstMoveStarted = false;
    const firstStoryRoute = `**/byline/v1/editorial/stories/${first.id}**`;
    await page.route(firstStoryRoute, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      let body: Record<string, unknown> = {};
      try {
        body = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        // Let WordPress return its real response for an unreadable body.
      }
      if (body.status !== "editing") return route.continue();
      firstMoveStarted = true;
      await firstMoveHeld;
      return route.continue();
    });

    try {
      await firstMove.selectOption("editing");
      await expect.poll(() => firstMoveStarted).toBe(true);
      await expect(firstDialog.locator(".byline-planning-status").filter({ hasText: "Editing" })).toBeVisible();
      releaseFirstMove();
      await expect.poll(() => workflowStatus(adminSession, first.id)).toBe("editing");
    } finally {
      releaseFirstMove();
      await page.unroute(firstStoryRoute);
    }

    await closeQuickView(firstDialog);
    const secondDialog = await openPlanningStory(page, second.title);
    const secondMove = secondDialog.getByRole("combobox", { name: "Move stage", exact: true });
    await secondMove.selectOption("editing");
    await expect.poll(() => workflowStatus(adminSession, second.id)).toBe("editing");
    await closeQuickView(secondDialog);

    firstDialog = await openPlanningStory(page, first.title);
    const failedMove = firstDialog.getByRole("combobox", { name: "Move stage", exact: true });
    await expect(failedMove).toHaveValue("editing");

    let releaseFailedMove!: () => void;
    const failedMoveHeld = new Promise<void>((resolve) => {
      releaseFailedMove = resolve;
    });
    let failedMoveStarted = false;
    await page.route(firstStoryRoute, async (route) => {
      if (route.request().method() === "POST") {
        failedMoveStarted = true;
        await failedMoveHeld;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "byline_e2e_failed_move", message: "The simulated move failed." })
        });
      }
      return route.continue();
    });

    try {
      await failedMove.selectOption("reporting");
      await expect.poll(() => failedMoveStarted).toBe(true);
      await expect(firstDialog.locator(".byline-planning-status").filter({ hasText: "Reporting" })).toBeVisible();
      releaseFailedMove();
      await expect(firstDialog.getByRole("alert")).toContainText(/failed|could not|previous stage/i);
      await expect(failedMove).toHaveValue("editing");
      await expect.poll(() => workflowStatus(adminSession, first.id)).toBe("editing");

      // The second story was updated independently. A failed first-story
      // mutation must not replace its current Planning state with an older
      // collection snapshot.
      await closeQuickView(firstDialog);
      const secondCard = page.locator(".byline-planning-story-card").filter({ hasText: second.title });
      await expect(secondCard.locator(".byline-planning-status").filter({ hasText: "Editing" })).toBeVisible();
      await expect.poll(() => workflowStatus(adminSession, second.id)).toBe("editing");

      firstDialog = await openPlanningStory(page, first.title);
      const openArticle = firstDialog.getByRole("link", { name: "Open article", exact: true });
      await expect(openArticle).toBeVisible();
      await Promise.all([
        page.waitForURL(new RegExp(`post\\.php\\?post=${first.id}(?:&|$)`)),
        openArticle.click()
      ]);
      await waitForBylineEditorReady(page);
    } finally {
      releaseFailedMove();
      await page.unroute(firstStoryRoute);
    }
  });
});
