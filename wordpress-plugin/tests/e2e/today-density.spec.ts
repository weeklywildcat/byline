import { expect, test } from "./fixtures";
import { addDays, createPhotoContributor, createPlanningStory, currentUserId, siteToday, token } from "./planning-fixture";
import type { HomeBootstrap } from "../../src/home/newsroom-model";

const todayUrl = "/wp-admin/admin.php?page=byline-planning&tab=today";

test("Today is a morning desk: week strip, one compact work queue, Desk and Budget at desktop and phone widths", async ({ adminPage: page, adminSession: session }, testInfo) => {
  const unique = token();
  const me = await currentUserId(session);
  const { day } = await siteToday(session);
  const photoWriter = await createPhotoContributor(page, session, `Caroline Elrod ${unique}`);
  const titles = ["Canteen could return", "Student council budget", "Campus garden", "Winter concert", "Debate team", "The school board considers a new schedule with longer classes and more time for student activities ".repeat(4)];
  const ids: number[] = [];
  for (const [index, title] of titles.entries()) {
    const id = await createPlanningStory(session, { title, status: index === 3 ? "ready" : "reporting", writers: [me], deadline: addDays(day, index - 1) });
    ids.push(id);
  }
  expect((await session.rest(`/byline/v1/editorial/stories/${ids[0]}/contributors`, "POST", { contributors: [{ id: me, kind: "user" }, photoWriter] })).ok).toBe(true);
  const taskIds: number[] = [];
  for (const title of ["Interview principal", "Check budget", "Get student quotes", "Confirm library hours", "Finish first draft", "Choose photos", "Check final facts", "Send to editor", "Review captions", "Verify spelling", "Submit final copy"]) {
    const task = await session.rest<{ id: number }>("/byline/v1/editorial/tasks", "POST", { title, storyId: ids[0], assigneeId: me, dueAt: `${addDays(day, 1)}T12:00:00`, priority: "normal" });
    expect(task.ok).toBe(true);
    taskIds.push(task.payload.id);
    session.addCleanup(async () => { await session.rest(`/byline/v1/editorial/tasks/${task.payload.id}`, "DELETE"); });
  }
  expect((await session.rest(`/byline/v1/editorial/stories/${ids[0]}/media-assignments`, "POST", { title: "Cafeteria photos", type: "photo", status: "assigned", assigneeId: me, dueAt: `${addDays(day, 1)}T12:00:00` })).ok).toBe(true);
  const data = (await session.rest<HomeBootstrap>("/byline/v1/editorial/home")).payload;
  // Isolate this fixture from other local newsroom records without mocking mutations.
  await page.route(/\/byline\/v1\/editorial\/home(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as HomeBootstrap;
    await route.fulfill({ response, json: { ...body, stories: body.stories.filter((story) => ids.includes(story.id)), tasks: body.tasks.filter((task) => taskIds.includes(Number(task.id))), visualWork: body.visualWork.filter((media) => ids.includes(media.story.id)), appointments: [], activity: body.activity.filter((item) => ids.includes(Number(item.storyId || item.story?.id))), errors: {} } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(todayUrl);
  const week = page.getByRole("region", { name: "This week", exact: true });
  const work = page.getByRole("region", { name: "My Work", exact: true });
  const desk = page.getByRole("region", { name: "Desk", exact: true });
  const budget = page.getByRole("region", { name: "Budget", exact: true });
  // An editor scopes the newsroom cards; Newsroom is the default.
  const scope = page.getByRole("group", { name: "Show stories for" });
  await expect(scope.getByRole("button", { name: /^Newsroom/ })).toHaveAttribute("aria-pressed", "true");
  // Seven site days, today marked, and the legend's four fixed categories.
  await expect(week.locator("[data-week-day]")).toHaveCount(7);
  await expect(week.locator(`[data-week-day="${day}"]`)).toHaveAttribute("aria-current", "date");
  await expect(week.getByText("Story deadline", { exact: true })).toBeVisible();
  await expect(week.locator('[data-week-event="deadline"]').first()).toBeVisible();
  // Desk: this fixture's active stories by stage, Reporting before Ready.
  await expect(desk.locator("[data-desk-stage]")).toHaveText([/Reporting\s*5/, /Ready for Review\s*1/]);
  await expect(desk.locator("[data-desk-segment]")).toHaveCount(2);
  // The ten-item preview includes the overdue-story action and review alongside tasks.
  await expect(work.getByRole("group", { name: "Needs attention", exact: true })).toContainText("Winter concert");
  const previewRows = work.locator('[data-slot="item-group"] > *');
  await expect(previewRows).toHaveCount(10);
  expect(await previewRows.evaluateAll((rows) => Math.max(...rows.map((row) => row.getBoundingClientRect().height)))).toBeLessThanOrEqual(66);
  await expect(work.locator("[data-task-id]")).toHaveCount(8);
  const first = work.locator(`[data-task-id="${taskIds[0]}"]`);
  const taskTitle = first.locator('[data-slot="item-title"]');
  const quickFields = first.locator("[data-task-quick-fields]");
  const geometry = await first.boundingBox();
  expect(geometry!.height).toBeLessThanOrEqual(66);
  expect((await quickFields.boundingBox())!.x).toBeGreaterThanOrEqual((await taskTitle.boundingBox())!.x + (await taskTitle.boundingBox())!.width);
  // Wide: My Work and the Desk share a row; This week leads and Budget follows.
  const workBox = (await work.boundingBox())!;
  const deskBox = (await desk.boundingBox())!;
  expect(deskBox.x).toBeGreaterThan(workBox.x + workBox.width - 1);
  expect(Math.abs(deskBox.y - workBox.y)).toBeLessThanOrEqual(1);
  expect((await week.boundingBox())!.y).toBeLessThan(workBox.y);
  expect((await budget.boundingBox())!.y).toBeGreaterThan(workBox.y + workBox.height);
  // Quiet top separators between rows; the first row in a group has none.
  const separators = await work.locator("[data-task-id]").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).borderTopWidth));
  expect(separators.filter((width) => width === "1px").length).toBeGreaterThanOrEqual(separators.length - 2);
  const gaps = await work.locator("[data-task-id]").evaluateAll((elements) => elements.slice(1).map((element, index) => element.getBoundingClientRect().top - elements[index]!.getBoundingClientRect().bottom));
  expect(gaps.every((gap) => Math.abs(gap) <= 1)).toBe(true);
  // Every card header is one compact icon, title, description and action row.
  for (const card of [week, work, desk, budget]) expect((await card.locator('[data-slot="card-header"]').boundingBox())!.height).toBeLessThanOrEqual(72);
  // Budget: This week (nothing planned in this fixture), My stories, Unscheduled, each with its count.
  const budgetTabs = budget.getByRole("tablist", { name: "Budget" });
  await expect(budgetTabs.getByRole("tab")).toHaveText([/This week\s*0/, /My stories\s*6/, /Unscheduled\s*6/]);
  await expect(budget.getByText("Nothing is planned or scheduled to publish this week.")).toBeVisible();
  await budgetTabs.getByRole("tab", { name: /^Unscheduled/ }).click();
  await expect(budget.getByRole("table", { name: "Budget: Unscheduled" }).locator("tbody tr")).toHaveCount(6);
  await budgetTabs.getByRole("tab", { name: /^My stories/ }).click();
  const budgetTable = budget.getByRole("table", { name: "Budget: My stories" });
  await expect(budgetTable.locator("tbody tr")).toHaveCount(6);
  await expect(budgetTable.locator("tbody tr").first().getByText("Not scheduled")).toBeVisible();
  const portrait = budgetTable.getByRole("img", { name: photoWriter.name, exact: true });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.locator("img").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  // A long headline stays one truncated line in the Budget table.
  const longStory = budgetTable.getByRole("button", { name: new RegExp("^The school board") });
  expect((await longStory.boundingBox())!.height).toBeLessThanOrEqual(24);
  const background = await first.evaluate((element) => getComputedStyle(element).backgroundColor);
  await first.hover();
  await expect.poll(() => first.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(background);
  await page.mouse.move(1100, 210);
  await page.screenshot({ path: testInfo.outputPath("today-light-1440.png"), fullPage: true, animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("today-dark-1440.png"), fullPage: true, animations: "disabled" });

  await work.getByRole("button", { name: "View all work", exact: true }).click();
  const allWork = page.getByRole("dialog", { name: "All my work", exact: true });
  await expect(allWork.locator("[data-task-id]")).toHaveCount(11);
  await expect(allWork.getByText("Cafeteria photos", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(allWork).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Photo & Visual Work", exact: true })).toHaveCount(0);

  const peek = page.getByRole("dialog", { name: titles[0], exact: true });
  await first.getByRole("combobox", { name: "Task priority: normal" }).click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await expect(first.getByRole("combobox", { name: "Task priority: high" })).toBeVisible();
  await expect(peek).toHaveCount(0);
  await first.getByRole("button", { name: "Change task due date", exact: true }).click();
  await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: "Edit Interview principal", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit task", exact: true })).toBeVisible();
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");

  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(first.getByRole("combobox", { name: "Task priority: high" })).toBeVisible();
    // Narrow: the cards stack and the week strip scrolls sideways inside its card instead of squeezing seven columns.
    const stackedWork = (await work.boundingBox())!;
    expect((await desk.boundingBox())!.y).toBeGreaterThan(stackedWork.y + stackedWork.height);
    if (width === 390) {
      expect(await week.locator('ol[aria-label="Days"]').evaluate((list) => list.parentElement!.scrollWidth > list.parentElement!.clientWidth)).toBe(true);
      // Budget lists stories as rows, headline first.
      const rows = budget.getByRole("list", { name: "Budget: My stories" });
      await expect(rows.locator("[data-story-id]")).toHaveCount(6);
      expect((await rows.locator("[data-story-id]").first().locator('[data-slot="item-title"]').boundingBox())!.height).toBeLessThanOrEqual(40);
    }
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true, animations: "disabled" });
  }
  // Mine narrows the newsroom cards to the reader's stories (all of this fixture's), and is remembered.
  await scope.getByRole("button", { name: /^Mine/ }).click();
  await expect(scope.getByRole("button", { name: /^Mine/ })).toHaveAttribute("aria-pressed", "true");
  await expect(desk.locator("[data-desk-stage]")).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("group", { name: "Show stories for" }).getByRole("button", { name: /^Mine/ })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await budget.getByRole("tablist", { name: "Budget" }).getByRole("tab", { name: /^My stories/ }).click();
  await budget.getByRole("table", { name: "Budget: My stories" }).getByRole("button", { name: /^Canteen could return/ }).focus();
  await page.keyboard.press("Enter");
  await expect(peek).toBeVisible();
  expect(data.currentUser.id).toBe(me);
});
