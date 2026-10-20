import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import type { HomeBootstrap } from "../../src/home/newsroom-model";

const homeUrl = "/wp-admin/admin.php?page=byline-planning&tab=today";

test("Home creates real drafts, completes work with rollback, preserves peek context and isolates CSS", async ({ adminPage: page, adminSession: session }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(homeUrl);
  await expect(page.getByRole("heading", { name: /^Today/ })).toBeVisible();
  await page.getByRole("button", { name: "New story", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New story", exact: true });
  const title = `Canteen · Home ${Date.now()}`;
  await create.getByLabel("Story title").fill(title);
  await create.getByRole("button", { name: "Create story", exact: true }).click();
  // Creating a story opens its full Story Workspace; Home's Peek is for existing rows.
  await page.waitForURL(/page=byline-planning&story=\d+/);
  const createdId = Number(new URL(page.url()).searchParams.get("story"));
  await page.goto(homeUrl);
  const peek = page.getByRole("dialog", { name: title, exact: true });
  const home = await session.rest<HomeBootstrap>("/byline/v1/editorial/home");
  expect(home.status).toBe(200);
  const story = home.payload.stories.find((s) => s.title === title)!;
  expect(story).toBeTruthy();
  session.registerTestPost(story.id);
  expect(story.id).toBe(createdId);
  const post = await session.rest<{ status: string; content: { raw: string } }>(`/wp/v2/posts/${story.id}?context=edit`);
  expect(post.payload.status).toBe("draft");
  expect(post.payload.content.raw).toBe("");
  const taskResult = await session.rest<{ id: number }>("/byline/v1/editorial/tasks", "POST", { title: "Interview 3 students", storyId: story.id, assigneeId: home.payload.currentUser.id, dueAt: "2026-10-19T16:00:00Z", priority: "high" });
  expect(taskResult.ok).toBe(true);
  const taskId = taskResult.payload.id;
  session.addCleanup(async () => { await session.rest(`/byline/v1/editorial/tasks/${taskId}`, "DELETE"); });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: `Complete Interview 3 students — ${title}`, exact: true });
  await expect(checkbox).toBeVisible();
  let failRelease!: () => void;
  const held = new Promise<void>((resolve) => { failRelease = resolve; });
  const taskRoute = `**/byline/v1/editorial/tasks/${taskId}*`;
  await page.route(taskRoute, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "byline_e2e_failed_completion", message: "Task couldn't be completed. Try again." }) });
  });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).not.toBeVisible();
  failRelease();
  await expect(checkbox).toBeVisible();
  await expect(page.getByRole("region", { name: "Up Next" }).getByRole("alert")).toContainText("couldn't be completed");
  await page.unroute(taskRoute);
  await checkbox.click();
  await expect(checkbox).not.toBeVisible();
  await expect.poll(async () => (await session.rest<{ state: string }>(`/byline/v1/editorial/tasks/${taskId}`)).payload.state).toBe("completed");
  const row = page.getByRole("region", { name: "My Stories" }).getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await row.click();
  await expect(peek).toBeVisible();
  await peek.getByRole("button", { name: "Add link", exact: true }).click();
  await peek.getByLabel("Label", { exact: true }).fill("Interview notes");
  await peek.getByLabel("URL", { exact: true }).fill("https://docs.google.com/document/d/home-test/edit");
  await peek.locator("form").getByRole("button", { name: "Add link", exact: true }).click();
  await expect(peek.getByRole("link", { name: /Interview notes Google Doc/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  const command = page.getByRole("dialog", { name: "Search Byline", exact: true });
  await command.getByRole("combobox").fill(title);
  await expect(command.getByRole("option", { name: title })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(peek).toBeVisible();
  await peek.getByRole("button", { name: "Remove Interview notes" }).click();
  await expect(peek.getByRole("link", { name: /Interview notes/ })).not.toBeVisible();
  expect(pageErrors).toEqual([]);
  await peek.getByRole("link", { name: "Edit article" }).click();
  await expect(page).toHaveURL(new RegExp(`post.php\\?post=${story.id}&action=edit`));
  expect(await page.locator('link[href*="style-home"],link[href*="/home.css"]').count()).toBe(0);
});

test("Home visual QA and independent optional service failures", async ({ adminPage: page, adminSession: session }) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  const ids: number[] = [];
  const titles = ["Canteen", "Theatre retrospective", "Patriot Games", "Marching band wins at Chesnee", "YouTube block: what the new district policy means for student reporting"];
  const base = (await session.rest<HomeBootstrap>("/byline/v1/editorial/home")).payload;
  for (let i = 0; i < titles.length; i++) {
    const result = await session.rest<{ story: { id: number } }>("/byline/v1/editorial/stories", "POST", { title: titles[i] });
    expect(result.ok).toBe(true);
    const id = result.payload.story.id;
    ids.push(id);
    session.registerTestPost(id);
    await session.rest(`/byline/v1/editorial/stories/${id}`, "POST", { status: ["reporting", "writing", "editing", "ready", "ready"][i], deadline: `2026-10-${21 + i}`, ...(i === 2 ? { plannedPublishAt: "2026-10-23T15:00:00Z" } : {}) });
  }
  for (const [i, title] of ["Interview 3 students", "Finish first draft", "Get theatre quote", "Find district policy"].entries()) {
    const task = await session.rest<{ id: number }>("/byline/v1/editorial/tasks", "POST", { title, storyId: ids[i === 0 ? 0 : i - 1], assigneeId: base.currentUser.id, dueAt: ["2026-10-19T15:00:00Z", "2026-10-20T17:00:00Z", "2026-10-22T16:00:00Z", null][i], priority: i === 0 ? "high" : "normal" });
    session.addCleanup(async () => { await session.rest(`/byline/v1/editorial/tasks/${task.payload.id}`, "DELETE"); });
  }
  await session.rest(`/byline/v1/editorial/stories/${ids[0]}/media`, "POST", { type: "photo", status: "assigned", assigneeId: base.currentUser.id, dueAt: "2026-10-21T14:00:00Z", notes: "Cafeteria photos during lunch" });
  await session.rest(`/byline/v1/editorial/stories/${ids[3]}/media`, "POST", { type: "photo", status: "needed", dueAt: "2026-10-20T16:00:00Z" });
  await fs.mkdir("/tmp/byline-home-qa", { recursive: true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(homeUrl);
    await expect(page.getByRole("heading", { name: "Up Next", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Complete Interview 3 students/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/byline-home-qa/editor-${width}.png`, fullPage: true, animations: "disabled" });
    if (width === 1440 || width === 390) {
      await page.getByRole("region", { name: "My Stories" }).getByRole("button", { name: /^Canteen Due/ }).click();
      const peek = page.getByRole("dialog", { name: "Canteen", exact: true });
      await expect(peek).toBeVisible();
      await expect(peek).toHaveCSS("opacity", "1");
      await page.screenshot({ path: `/tmp/byline-home-qa/peek-${width}.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
    }
  }
  const body = (await session.rest<HomeBootstrap>("/byline/v1/editorial/home")).payload;
  await page.route("**/byline/v1/editorial/home*", (route) => route.fulfill({ json: { ...body, activity: [], errors: { activity: "Activity is temporarily unavailable." } } }));
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Complete Interview 3 students/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent Activity" }).getByRole("alert")).toContainText("Activity is temporarily unavailable.");
});

test("authenticated writers see their work, while private story and review data stay protected", async ({ browser, adminSession: session }) => {
  const username = `home-writer-${Date.now()}`;
  const password = randomUUID();
  const user = await session.rest<{ id: number }>("/wp/v2/users", "POST", { username, password, email: `${username}@example.test`, name: "Caroline Elrod", roles: ["author"] });
  expect(user.status).toBe(201);
  session.addCleanup(async () => { await session.rest(`/wp/v2/users/${user.payload.id}?force=true&reassign=1`, "DELETE"); });
  const foreign = await session.rest<{ story: { id: number } }>("/byline/v1/editorial/stories", "POST", { title: `Private editor planning ${Date.now()}` });
  session.registerTestPost(foreign.payload.story.id);
  const context = await browser.newContext({ baseURL: process.env.WP_BASE_URL || "http://localhost:8888" });
  const page = await context.newPage();
  try {
    expect((await context.request.get("/wp-json/byline/v1/editorial/home")).status()).toBe(401);
    await page.goto("/wp-login.php");
    await page.getByLabel("Username or Email Address").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await page.goto(homeUrl);
    await expect(page.getByRole("heading", { name: "Today / Caroline", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ready for Review", exact: true })).not.toBeVisible();
    await expect(page.getByText("Private editor planning", { exact: false })).not.toBeVisible();
    await page.getByRole("button", { name: "New story", exact: true }).click();
    await page.getByLabel("Story title").fill(`Caroline's reporting ${Date.now()}`);
    await page.getByRole("button", { name: "Create story", exact: true }).click();
    await page.waitForURL(/page=byline-planning&story=\d+/);
    session.registerTestPost(Number(new URL(page.url()).searchParams.get("story")));
    await page.goto(homeUrl);
    const denied = await page.evaluate(async (id) => {
      const response = await fetch(`/wp-json/byline/v1/editorial/stories/${id}/quick-view`, { headers: { "X-WP-Nonce": window.bylineHome!.nonce } });
      return { status: response.status, body: await response.text() };
    }, foreign.payload.story.id);
    expect(denied.status).toBe(403);
    expect(denied.body).not.toContain("Private editor planning");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "/tmp/byline-home-qa/writer-1440.png", fullPage: true, animations: "disabled" });
  } finally { await context.close(); }
});
