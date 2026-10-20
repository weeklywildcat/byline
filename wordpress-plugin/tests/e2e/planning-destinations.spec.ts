import { expect, test } from "./fixtures";
import { createPlanningStory, currentUserId, siteToday, addDays, token } from "./planning-fixture";

const planning = (tab: string) => `/wp-admin/admin.php?page=byline-planning&tab=${tab}`;

test.describe("Planning destinations are one design system", () => {
  for (const [tab, heading] of [["media", "Media Desk"], ["coverage", "Coverage"], ["performance", "Performance"], ["content-health", "Content Health"], ["feedback", "Feedback"]] as const) {
    test(`${heading} renders in the shared Nova root without errors and without WordPress controls`, async ({ adminPage: page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(planning(tab));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.locator("#byline-admin-root .byline-ui-root")).toBeVisible();
      expect(await page.locator("#byline-admin-root [class*='components-']").count()).toBe(0);
      expect(await page.locator(".nav-tab-wrapper").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("Media Desk edits an assignment in place and opens the same Story Peek", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const { day } = await siteToday(session);
    const me = await currentUserId(session);
    const title = `${unique} Media story`;
    const id = await createPlanningStory(session, { title, status: "reporting", writers: [me] });
    const created = await session.rest<{ assignmentId: string }>(`/byline/v1/editorial/stories/${id}/media-assignments`, "POST", { title: `${unique} Photos`, type: "photo", assigneeId: me, dueAt: `${addDays(day, 2)}T17:00` });
    expect(created.ok).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(planning("media"));
    await page.getByRole("searchbox", { name: "Find a story or assignment" }).fill(unique);
    const row = page.getByRole("row", { name: new RegExp(`${unique} Photos`) });
    await expect(row).toBeVisible();
    await row.getByRole("combobox", { name: `Status: ${unique} Photos` }).click();
    await page.getByRole("option", { name: "In progress" }).click();
    await expect.poll(async () => (await session.rest<{ mediaAssignments: Array<{ status: string }> }>(`/byline/v1/editorial/stories/${id}/workspace`)).payload.mediaAssignments[0]?.status).toBe("in-progress");
    await row.getByRole("button", { name: `Actions for ${unique} Photos` }).click();
    // The domain rule is the server's: no file linked, no completion. The desk says so and changes nothing.
    await page.getByRole("menuitem", { name: "Mark complete" }).click();
    await expect(page.getByText(/needs a linked attachment/i).first()).toBeVisible();
    expect((await session.rest<{ mediaAssignments: Array<{ status: string }> }>(`/byline/v1/editorial/stories/${id}/workspace`)).payload.mediaAssignments[0]?.status).toBe("in-progress");
    await row.getByRole("button", { name: title }).click();
    await expect(page.getByRole("dialog", { name: title, exact: true }).getByRole("link", { name: "Open workspace" })).toBeVisible();
  });

  test("Coverage creates a package, links a story in one step and removes it with Undo available", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const me = await currentUserId(session);
    const title = `${unique} Coverage story`;
    await createPlanningStory(session, { title, status: "reporting", writers: [me] });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(planning("coverage"));
    await page.getByRole("button", { name: "New coverage" }).click();
    const coverageTitle = `${unique} Package`;
    const dialog = page.getByRole("dialog", { name: "New coverage" });
    await dialog.getByLabel("Coverage title").fill(coverageTitle);
    await dialog.getByRole("button", { name: "Create coverage" }).click();
    // New coverage starts as a draft: show every status.
    await page.getByRole("button", { name: "All", exact: true }).click();
    const card = page.getByRole("region", { name: coverageTitle });
    await expect(card).toBeVisible();
    session.addCleanup(async () => {
      const list = await session.rest<{ coverage: Array<{ id: number; title: string }> }>("/byline/v1/admin/coverage");
      for (const item of list.payload?.coverage ?? []) if (item.title === coverageTitle) await session.rest(`/wp/v2/byline_coverage/${item.id}?force=true`, "DELETE");
    });
    await card.getByRole("combobox", { name: "Add an existing story" }).fill(unique);
    await page.getByRole("option", { name: title }).click();
    await expect(card.getByRole("button", { name: title, exact: true })).toBeVisible();
    await card.getByRole("button", { name: `Remove ${title}` }).click();
    await expect(card.getByRole("button", { name: title, exact: true })).toHaveCount(0);
    await expect(page.getByText("Story removed from coverage.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  });
});
