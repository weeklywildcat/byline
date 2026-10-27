import { expect, test, type AdminSession } from "./fixtures";
import { addDays, createPlanningStory, currentUserId, siteToday, token } from "./planning-fixture";

const storiesUrl = "/wp-admin/admin.php?page=byline-planning&tab=stories";

async function status(session: AdminSession, id: number): Promise<string> {
  const response = await session.rest<{ story?: { workflow?: { id?: string } } }>(`/byline/v1/editorial/stories/${id}/workspace`);
  return String(response.payload.story?.workflow?.id ?? "");
}

/** Open the board narrowed to one unique token, so only this test's stories are on it. */
async function openBoard(page: Parameters<Parameters<typeof test>[2]>[0]["adminPage"], search: string) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(storiesUrl + "&view=board", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Stories", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search stories" }).fill(search);
}

const column = (page: Parameters<typeof openBoard>[0], id: string) => page.locator(`section[data-status="${id}"]`);
const card = (page: Parameters<typeof openBoard>[0], id: number) => page.locator(`[data-story-id="${id}"]`);

test.describe("Stories board", () => {
  test("drags a story between stages with an optimistic move, an announcement and a rollback on failure", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const id = await createPlanningStory(session, { title: `${unique} Canteen`, status: "reporting" });
    await openBoard(page, unique);
    await expect(column(page, "reporting").locator(`[data-story-id="${id}"]`)).toBeVisible();

    // The destination column answers while the card is held over it.
    const source = card(page, id);
    const box = (await source.boundingBox())!;
    const target = (await column(page, "writing").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + 20, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, target.y + 120, { steps: 12 });
    await expect(column(page, "writing")).toHaveAttribute("data-over", "true");
    await expect(source).toHaveAttribute("data-dragging", "true");

    // Hold the save so the optimistic state is observable.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let saved: Record<string, unknown> | null = null;
    const route = `**/byline/v1/editorial/stories/${id}**`;
    await page.route(route, async (request) => {
      if (request.request().method() !== "POST") return request.continue();
      saved = request.request().postDataJSON() as Record<string, unknown>;
      await held;
      return request.continue();
    });
    await page.mouse.up();
    await expect(column(page, "writing").locator(`[data-story-id="${id}"]`)).toBeVisible();
    await expect(column(page, "reporting").locator(`[data-story-id="${id}"]`)).toHaveCount(0);
    release();
    await expect.poll(() => status(session, id)).toBe("writing");
    await page.unroute(route);
    expect(saved).toEqual({ status: "writing" });
    await expect(page.locator('[role="status"]').filter({ hasText: /moved from Reporting to Writing/ })).toBeAttached();

    // A failed save puts the story back and says so.
    await page.route(route, (request) => request.request().method() === "POST" ? request.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "byline_e2e_failed_move", message: "The simulated move failed." }) }) : request.continue());
    await card(page, id).dragTo(column(page, "editing"));
    await expect(page.getByText("The simulated move failed.").first()).toBeVisible();
    await expect(column(page, "writing").locator(`[data-story-id="${id}"]`)).toBeVisible();
    await expect.poll(() => status(session, id)).toBe("writing");
    await page.unroute(route);
  });

  test("the Move to menu performs the same save as dragging and keeps focus on the story", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const id = await createPlanningStory(session, { title: `${unique} Menu move`, status: "assigned" });
    await openBoard(page, unique);
    const requests: Array<Record<string, unknown>> = [];
    await page.route(`**/byline/v1/editorial/stories/${id}**`, (request) => { if (request.request().method() === "POST") requests.push(request.request().postDataJSON() as Record<string, unknown>); return request.continue(); });
    await page.getByRole("button", { name: `Actions for ${unique} Menu move` }).click();
    await page.getByRole("menuitem", { name: "Move to" }).click();
    await page.getByRole("menuitemradio", { name: "Reporting" }).click();
    await expect(column(page, "reporting").locator(`[data-story-id="${id}"]`)).toBeVisible();
    await expect.poll(() => status(session, id)).toBe("reporting");
    expect(requests).toEqual([{ status: "reporting" }]);
    await expect(page.locator('[role="status"]').filter({ hasText: /moved from Assigned to Reporting/ })).toBeAttached();
    await expect(page.getByRole("button", { name: `${unique} Menu move`, exact: true })).toBeFocused();
  });

  test("right-click and macOS Control-click do not activate the story underneath the context menu", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const title = `${unique} Context menu`;
    const id = await createPlanningStory(session, { title, status: "reporting" });
    await openBoard(page, unique);

    const storyTitle = page.getByRole("button", { name: title, exact: true });
    const beforeUrl = page.url();
    const beforePages = page.context().pages().length;

    // A real secondary click opens Byline's menu and does not navigate or spawn a page.
    await storyTitle.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Quick view" })).toBeVisible();
    expect(page.url()).toBe(beforeUrl);
    expect(page.context().pages().length).toBe(beforePages);
    await page.keyboard.press("Escape");

    // On macOS, Control-click is also a secondary-click gesture. Chromium on
    // Linux does not synthesize the contextmenu event for this, but it does
    // reproduce the dangerous follow-up primary click that must be suppressed.
    await storyTitle.click({ modifiers: ["Control"] });
    await expect(page.getByRole("dialog", { name: title, exact: true })).toHaveCount(0);
    expect(page.url()).toBe(beforeUrl);

    // macOS opens the context menu for Control-click too;
    // dismiss it before targeting the story again (Linux leaves it closed).
    await page.keyboard.press("Escape");
    // The explicit context-menu route itself must still load the real workspace.
    await storyTitle.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open workspace" }).click();
    await page.waitForURL(new RegExp(`page=byline-planning&story=${id}`));
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  });

  test("an empty column accepts a drop, and a published story is not on the board or movable from the list", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const open = await createPlanningStory(session, { title: `${unique} Open`, status: "writing" });
    const published = await createPlanningStory(session, { title: `${unique} Published`, published: true });
    await openBoard(page, unique);
    await expect(column(page, "on-hold").locator("[data-story-id]")).toHaveCount(0);
    await expect(column(page, "on-hold").getByText("No stories")).toBeVisible();
    await card(page, open).dragTo(column(page, "on-hold"));
    await expect.poll(() => status(session, open)).toBe("on-hold");

    // Published is derived from WordPress, so a published story is not a card on the board at all...
    await expect(card(page, published)).toHaveCount(0);
    // ...and in the List its actions never offer a move.
    await page.getByRole("tab", { name: "List" }).click();
    // Finished published stories are left out of the List until asked for.
    await expect(page.getByRole("button", { name: `${unique} Open`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `${unique} Published`, exact: true })).toHaveCount(0);
    await expect(page.getByText(/1 published story with nothing left to do is hidden/)).toBeVisible();
    await page.getByRole("button", { name: /More filters/ }).click();
    await page.getByRole("checkbox", { name: "Show finished published stories" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: `${unique} Published`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Actions for ${unique} Published` }).click();
    await expect(page.getByRole("menuitem", { name: "Open workspace" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Move to" })).toHaveCount(0);
  });

  test("auto-scrolls the board sideways while a story is dragged to its edge", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const id = await createPlanningStory(session, { title: `${unique} Edge`, status: "pitch" });
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(storiesUrl + "&view=board", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
    const scroller = page.locator("[data-board-scroller]");
    await expect(card(page, id)).toBeVisible();
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const from = (await card(page, id).boundingBox())!;
    const area = (await scroller.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + 30, { steps: 4 });
    await page.mouse.move(area.x + area.width - 12, from.y + 40, { steps: 10 });
    await expect.poll(async () => { await page.mouse.move(area.x + area.width - 10, from.y + 40); return scroller.evaluate((element) => element.scrollLeft); }, { timeout: 8_000 }).toBeGreaterThan(0);
    // Cancel the drag: nothing moves when it is abandoned.
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(() => status(session, id)).toBe("pitch");
  });

  test("scrolls sideways on a narrow screen instead of squeezing the stages, with no page overflow", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    await createPlanningStory(session, { title: `${unique} Narrow`, status: "reporting" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(storiesUrl + "&view=board", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
    const scroller = page.locator("[data-board-scroller]");
    await expect(scroller).toBeVisible();
    const metrics = await scroller.evaluate((element) => ({ scrollable: element.scrollWidth > element.clientWidth, firstColumn: element.children[0]!.getBoundingClientRect().width }));
    expect(metrics.scrollable).toBe(true);
    expect(metrics.firstColumn).toBeGreaterThan(240);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe("Story Peek everywhere", () => {
  test("Board, List and Calendar open the one Story Peek, and Peek opens the workspace and the editor", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const { day } = await siteToday(session);
    const me = await currentUserId(session);
    const title = `${unique} Peek`;
    const id = await createPlanningStory(session, { title, status: "reporting", deadline: day, writers: [me] });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const peek = page.getByRole("dialog", { name: title, exact: true });
    const sections = async () => {
      // Collection context loads separately from the workspace. Compare fully
      // loaded Peeks rather than racing that second protected request.
      await expect(peek.getByRole("heading", { name: "Shared interviews", exact: true })).toBeVisible();
      return (await peek.getByRole("heading", { level: 3 }).allTextContents()).join("|");
    };

    await page.goto(storiesUrl + "&view=board");
    await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(peek).toBeVisible();
    const fromBoard = await sections();
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "List" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator("[data-board-scroller]")).toHaveCount(0);
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(peek).toBeVisible();
    expect(await sections()).toBe(fromBoard);
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect(page).toHaveURL(/view=calendar/);
    await page.locator('[data-event-type="deadline"]', { hasText: title }).first().click();
    await expect(peek).toBeVisible();
    expect(await sections()).toBe(fromBoard);
    await expect(peek.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", new RegExp(`page=byline-planning&story=${id}`));
    await expect(peek.getByRole("link", { name: "Edit article" })).toHaveAttribute("href", new RegExp(`post=${id}&action=edit`));
    await peek.getByRole("link", { name: "Open workspace" }).click();
    await page.waitForURL(new RegExp(`story=${id}`));
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  });
});

test.describe("Story Peek actions on Stories", () => {
  test("Add task from Peek uses the shared task dialog and the new task shows in Peek", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const me = await currentUserId(session);
    const title = `${unique} Task story`;
    const id = await createPlanningStory(session, { title, status: "reporting", writers: [me] });
    session.addCleanup(async () => {
      const tasks = await session.rest<{ tasks: Array<{ id: number }> }>(`/byline/v1/editorial/stories/${id}/tasks`);
      for (const task of tasks.payload?.tasks ?? []) await session.rest(`/byline/v1/editorial/tasks/${task.id}`, "DELETE");
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(storiesUrl + "&view=list");
    await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
    await page.getByRole("button", { name: title, exact: true }).click();
    const peek = page.getByRole("dialog", { name: title, exact: true });
    await peek.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByLabel("Task title").fill("Interview three students");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(peek.getByText("Interview three students")).toBeVisible();
    // The list behind the Peek learned about it too.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("1 task");
  });
});

test.describe("Stories views and saved views", () => {
  test("view tabs deep-link, update the address without reloading, and a reload restores the view", async ({ adminPage: page }) => {
    await page.goto(storiesUrl + "&view=list");
    await expect(page.getByRole("tab", { name: "List", selected: true })).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 1; });
    await page.getByRole("tab", { name: "Board" }).click();
    await expect(page).toHaveURL(/tab=stories&view=board/);
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
    await page.goBack();
    await expect(page.getByRole("tab", { name: "List", selected: true })).toBeVisible();
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Calendar", selected: true })).toBeVisible();
    // The sidebar's Calendar entry opens Stories on its Calendar view.
    await page.goto("/wp-admin/admin.php?page=byline-planning&tab=calendar");
    await expect(page.getByRole("tab", { name: "Calendar", selected: true })).toBeVisible();
  });

  test("saves, renames and deletes a saved view, with Undo bringing a deleted one back", async ({ adminPage: page, adminSession: session }) => {
    const name = `View ${token()}`;
    session.addCleanup(async () => {
      const views = await session.rest<{ items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>("/byline/v1/editorial/planning/views");
      const list = Array.isArray(views.payload) ? views.payload : views.payload?.items ?? [];
      for (const view of list.filter((item) => item.name.startsWith("View QA") || item.name.startsWith(name))) await session.rest(`/byline/v1/editorial/planning/views/${view.id}`, "DELETE");
    });
    await page.goto(storiesUrl + "&view=board");
    await page.getByRole("combobox", { name: "Writer" }).waitFor({ state: "visible" });
    await page.getByRole("searchbox", { name: "Search stories" }).fill("budget");
    await page.getByRole("button", { name: /Saved view/ }).click();
    await page.getByRole("menuitem", { name: "Save current view…" }).click();
    const save = page.getByRole("dialog", { name: "Save view" });
    await save.getByLabel("View name").fill(name);
    await save.getByRole("button", { name: "Save view" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`Saved view: ${name}`) })).toBeVisible();

    await page.getByRole("button", { name: /Saved view/ }).click();
    await page.getByRole("menuitem", { name: "Manage views…" }).click();
    const manage = page.getByRole("dialog", { name: "Manage views" });
    await manage.getByRole("button", { name: `Actions for view ${name}` }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = page.getByRole("dialog", { name: "Rename view" });
    await rename.getByLabel("View name").fill(`${name} renamed`);
    await rename.getByRole("button", { name: "Rename" }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Saved view/ }).click();
    await page.getByRole("menuitem", { name: "Manage views…" }).click();
    await page.getByRole("dialog", { name: "Manage views" }).getByRole("button", { name: `Actions for view ${name} renamed` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("View deleted.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("View restored.")).toBeVisible();
  });

  test("New story opens the same creation experience as Home and lands in the Story Workspace", async ({ adminPage: page, adminSession: session }) => {
    await page.goto(storiesUrl + "&view=board");
    await page.getByRole("button", { name: "New story", exact: true }).click();
    const create = page.getByRole("dialog", { name: "New story", exact: true });
    await create.getByLabel("Story title").fill(`Created from Stories ${token()}`);
    await create.getByRole("button", { name: "Create story", exact: true }).click();
    await page.waitForURL(/page=byline-planning&story=\d+/);
    session.registerTestPost(Number(new URL(page.url()).searchParams.get("story")));
  });
});

test.describe("Stories calendar", () => {
  test("shows an exact interview at its site-local time, a deadline as a date, and keeps a fuzzy window under Needs scheduling", async ({ adminPage: page, adminSession: session }) => {
    const unique = token();
    const { day } = await siteToday(session);
    const me = await currentUserId(session);
    const title = `${unique} Calendar`;
    const id = await createPlanningStory(session, { title, status: "reporting", deadline: day, writers: [me] });
    const story = `/byline/v1/editorial/stories/${id}`;
    expect((await session.rest(`${story}/appointments`, "POST", { title: `${unique} Interview Mrs. Hamby`, kind: "interview", status: "confirmed", scheduleMode: "exact", startAt: `${day}T10:15`, endAt: `${day}T10:35`, assigneeIds: [me] })).ok).toBe(true);
    expect((await session.rest(`${story}/appointments`, "POST", { title: `${unique} Interview reporter`, kind: "interview", status: "planned", scheduleMode: "window", windowStart: addDays(day, 3), windowEnd: addDays(day, 5), assigneeIds: [me] })).ok).toBe(true);
    expect((await session.rest(`${story}/media-assignments`, "POST", { title: `${unique} Photos`, type: "photo", assigneeId: me, dueAt: `${addDays(day, 1)}T17:00` })).ok).toBe(true);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(storiesUrl + "&view=calendar");
    await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
    const interview = page.locator('[data-event-type="appointment"]', { hasText: `${unique} Interview Mrs. Hamby` });
    await expect(interview.first()).toBeVisible();
    await expect(interview.first()).toContainText(/10:15\s?AM/);
    // The deadline is a day: no clock time on it.
    const deadline = page.locator('[data-event-type="deadline"]', { hasText: title }).first();
    await expect(deadline).toBeVisible();
    await expect(deadline).not.toContainText(/\d{1,2}:\d{2}/);
    // The fuzzy window is on no day at all.
    await expect(page.locator('[data-event-type]', { hasText: `${unique} Interview reporter` })).toHaveCount(0);
    const needs = page.getByRole("region", { name: "Needs scheduling" });
    await expect(needs).toContainText(`${unique} Interview reporter`);
    await expect(needs.getByRole("link", { name: new RegExp(`Schedule.*${unique} Interview reporter`) })).toHaveAttribute("href", new RegExp(`story=${id}&appointment=`));
    // The month grid fits the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("switches to the month agenda on a phone, and Schedule-X styles stay inside the Byline root", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(storiesUrl + "&view=calendar");
    await expect(page.locator(".sx__calendar-wrapper.is-month-agenda-view")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const leaks = await page.evaluate(() => {
      const outside = Array.from(document.querySelectorAll('[class*="sx__"]')).filter((element) => !element.closest(".byline-ui-root")).length;
      const sheet = Array.from(document.styleSheets).find((candidate) => candidate.href?.includes("style-planning"));
      const rules = sheet ? Array.from(sheet.cssRules).filter((rule) => rule instanceof CSSStyleRule && !rule.selectorText.includes(".byline-ui-root")).length : -1;
      return { outside, rules };
    });
    expect(leaks).toEqual({ outside: 0, rules: 0 });
  });
});

test.describe("CSS isolation", () => {
  test("Planning styles do not reach wp-admin's Users, Media Library or the editor", async ({ adminPage: page }) => {
    for (const path of ["/wp-admin/users.php", "/wp-admin/upload.php", "/wp-admin/post-new.php"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(await page.locator('link[href*="style-planning"], link[href*="planning.css"]').count(), path).toBe(0);
      expect(await page.evaluate(() => document.body.classList.contains("byline-nova-page")), path).toBe(false);
    }
    await page.goto("/wp-admin/users.php");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe("rgb(255, 255, 255)");
    await page.goto(storiesUrl);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  });
});
