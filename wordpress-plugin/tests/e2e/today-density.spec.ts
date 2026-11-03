import { expect, test } from "./fixtures";
import { addDays, createPhotoContributor, createPlanningStory, currentUserId, siteToday, token } from "./planning-fixture";
import type { HomeBootstrap } from "../../src/home/newsroom-model";

const todayUrl = "/wp-admin/admin.php?page=byline-planning&tab=today";

test("Today keeps compact separated work queues, profile photos and safe inline task controls", async ({ adminPage: page, adminSession: session }, testInfo) => {
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
  for (const title of ["Interview principal", "Check budget", "Get student quotes", "Confirm library hours", "Finish first draft", "Choose photos", "Check final facts", "Send to editor"]) {
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
  const work = page.getByRole("region", { name: "Up Next", exact: true });
  const stories = page.getByRole("region", { name: "My Stories", exact: true });
  await expect(work.locator("[data-task-id]")).toHaveCount(7);
  const first = work.locator(`[data-task-id="${taskIds[0]}"]`);
  const taskTitle = first.locator('[data-slot="item-title"]');
  const quickFields = first.locator("[data-task-quick-fields]");
  const geometry = await first.boundingBox();
  expect(geometry!.height).toBeLessThanOrEqual(66);
  expect((await quickFields.boundingBox())!.x).toBeGreaterThanOrEqual((await taskTitle.boundingBox())!.x + (await taskTitle.boundingBox())!.width);
  expect((await stories.boundingBox())!.y).toBeLessThan(900);
  const separators = await work.locator("[data-task-id]").evaluateAll((elements) => elements.slice(0, -1).map((element) => getComputedStyle(element).borderBottomWidth));
  expect(separators).toEqual(Array(6).fill("1px"));
  const gaps = await work.locator("[data-task-id]").evaluateAll((elements) => elements.slice(1).map((element, index) => element.getBoundingClientRect().top - elements[index]!.getBoundingClientRect().bottom));
  expect(gaps.every((gap) => Math.abs(gap) <= 1)).toBe(true);
  expect((await work.locator('[data-slot="card-header"]').boundingBox())!.height).toBeLessThanOrEqual(54);
  // Forty pixels of header content/padding plus its one-pixel separator.
  expect((await stories.locator('[data-slot="card-header"]').boundingBox())!.height).toBeLessThanOrEqual(41);
  const portrait = stories.getByRole("img", { name: photoWriter.name, exact: true });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.locator("img").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const longStory = stories.getByRole("button", { name: new RegExp("^The school board") });
  expect((await longStory.locator('[data-slot="item-title"]').boundingBox())!.height).toBeLessThanOrEqual(40);
  const background = await first.evaluate((element) => getComputedStyle(element).backgroundColor);
  await first.hover();
  await expect.poll(() => first.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(background);
  await page.mouse.move(1100, 210);
  await page.screenshot({ path: testInfo.outputPath("today-light-1440.png"), fullPage: true, animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("today-dark-1440.png"), fullPage: true, animations: "disabled" });

  await work.getByRole("button", { name: "View all work", exact: true }).click();
  const allWork = page.getByRole("dialog", { name: "All my work", exact: true });
  await expect(allWork.locator("[data-task-id]")).toHaveCount(8);
  await page.keyboard.press("Escape");
  await expect(allWork).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Photo & Visual Work", exact: true })).toContainText("Cafeteria photos");

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
    expect((await longStory.locator('[data-slot="item-title"]').boundingBox())!.height).toBeLessThanOrEqual(40);
    await expect(first.getByRole("combobox", { name: "Task priority: high" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true, animations: "disabled" });
  }
  await stories.getByRole("button", { name: /^Canteen could return Due/ }).focus();
  await page.keyboard.press("Enter");
  await expect(peek).toBeVisible();
  expect(data.currentUser.id).toBe(me);
});
