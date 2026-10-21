import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test, type AdminSession } from "./fixtures";
import { seedCanteenStory } from "./story-workspace-fixture";
import type { HomeBootstrap } from "../../src/home/newsroom-model";
import type { StoryWorkspace } from "../../src/workspace/workspace-types";

/**
 * The second Nova pass: Story Peek and the Story Workspace use shadcn's own
 * Avatar group, Item, Field, Empty, RadioGroup choice cards, range Date Picker,
 * Attachment and AlertDialog. These specs pin the behaviour of each one and
 * leave screenshots of the sparse and dense states for visual review.
 */
const homeUrl = "/wp-admin/admin.php?page=byline-planning&tab=today";
const qa = "/tmp/byline-nova-qa";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function uploadImage(page: Page, name: string): Promise<number> {
  const nonce = await page.evaluate(() => (window as Window & { wpApiSettings?: { nonce?: string } }).wpApiSettings?.nonce ?? "");
  const base = process.env.WP_BASE_URL ?? "http://localhost:8888";
  const response = await page.context().request.post(new URL("/wp-json/wp/v2/media", base).toString(), {
    headers: { "X-WP-Nonce": nonce, "Content-Disposition": `attachment; filename="${name}"`, "Content-Type": "image/png" },
    data: png
  });
  expect(response.ok()).toBe(true);
  const id = ((await response.json()) as { id: number }).id;
  return id;
}

async function openPeek(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+k");
  const command = page.getByRole("dialog", { name: "Search Byline", exact: true });
  await command.getByRole("combobox").fill(title);
  await expect(command.getByRole("option", { name: title })).toBeVisible();
  await page.keyboard.press("Enter");
  const peek = page.getByRole("dialog", { name: title, exact: true });
  await expect(peek).toBeVisible();
  await expect(peek).toHaveCSS("opacity", "1");
  return peek;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function sparseCanteen(session: AdminSession) {
  const base = (await session.rest<HomeBootstrap>("/byline/v1/editorial/home")).payload;
  const created = await session.rest<{ story: { id: number } }>("/byline/v1/editorial/stories", "POST", { title: `Canteen ${Date.now()}` });
  expect(created.ok).toBe(true);
  const id = created.payload.story.id;
  session.registerTestPost(id);
  await session.rest(`/byline/v1/editorial/stories/${id}`, "POST", { status: "reporting", deadline: "2026-10-21" });
  for (const [title, dueAt] of [["Interview 3 students", "2026-10-19T15:00:00Z"], ["Finish first draft", "2026-10-20T17:00:00Z"]] as const) {
    const task = await session.rest<{ id: number }>("/byline/v1/editorial/tasks", "POST", { title, storyId: id, assigneeId: base.currentUser.id, dueAt, priority: "normal" });
    session.addCleanup(async () => { await session.rest(`/byline/v1/editorial/tasks/${task.payload.id}`, "DELETE"); });
  }
  await session.rest(`/byline/v1/editorial/stories/${id}/media-assignments`, "POST", { title: "Photo request", type: "photo", status: "assigned", assigneeId: base.currentUser.id, dueAt: "2026-10-21T14:00" });
  const title = (await session.rest<StoryWorkspace>(`/byline/v1/editorial/stories/${id}/workspace`)).payload.story.title;
  return { id, title, user: base.currentUser };
}

test("Story Peek, sparse: calm header, native sections, no dead space, clear footer, focus returns", async ({ adminPage: page, adminSession: session }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  const canteen = await sparseCanteen(session);
  // A fresh story already has creation activity; the sparse state is the one with none.
  await page.route(`**/byline/v1/editorial/stories/${canteen.id}/workspace*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, activity: [] } });
  });
  await fs.mkdir(qa, { recursive: true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(homeUrl);
    await expect(page.getByRole("heading", { name: "Up Next", exact: true })).toBeVisible();
    const peek = await openPeek(page, canteen.title);

    // Identity lives in the header: workflow and section, and the writer as an Avatar.
    await expect(peek.getByText(/^Reporting/).first()).toBeVisible();
    await expect(peek.getByRole("img", { name: canteen.user.name }).first()).toBeVisible();
    // Sections with nothing to show are not rendered; the rest are compact.
    await expect(peek.getByRole("region", { name: "Recent activity" })).toHaveCount(0);
    await expect(peek.getByRole("region", { name: "Reporting" }).getByText("No sources or interviews yet.")).toBeVisible();
    await expect(peek.getByRole("region", { name: "Reporting" }).getByRole("link", { name: "Add source" })).toBeVisible();
    const reportingBox = await peek.getByRole("region", { name: "Reporting" }).boundingBox();
    expect(reportingBox!.height).toBeLessThan(140);
    // Tasks align and overdue reads as text, not only colour.
    await expect(peek.getByRole("checkbox", { name: /Complete Interview 3 students/ })).toBeVisible();
    await expect(peek.getByText("1d overdue")).toBeVisible();
    await expect(peek.getByText("Today", { exact: true })).toBeVisible();
    // Production shows who has it.
    const production = peek.getByRole("region", { name: "Production" });
    // The assignee is named in words. Without a real photo there is no placeholder avatar, only the kind of work.
    await expect(production.getByText(new RegExp(`Photo · ${canteen.user.name}`))).toBeVisible();
    await expect(production.locator('[data-slot="avatar"]')).toHaveCount(0);
    await expect(production.getByText(/Due Oct 21/)).toBeVisible();
    // Empty links are compact.
    await expect(peek.getByRole("region", { name: "Files & links" }).getByRole("button", { name: "Add link" })).toBeVisible();
    // The footer reads: workspace on the left, Preview then Edit article on the right.
    const [open, preview, edit] = await Promise.all(["Open workspace", /^Preview/, "Edit article"].map((name) => peek.getByRole("link", { name }).boundingBox()));
    expect(open!.x).toBeLessThan(preview!.x);
    expect(preview!.x).toBeLessThan(edit!.x);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${qa}/peek-sparse-${width}.png`, animations: "disabled" });

    if (width === 1440) {
      // A tooltip names an avatar and never traps focus.
      await peek.getByRole("img", { name: canteen.user.name }).first().hover();
      await page.clock.runFor(1000);
      await expect(page.locator("[data-slot=tooltip-content]")).toContainText(canteen.user.name);
      await page.mouse.move(5, 5);
      await peek.getByRole("checkbox", { name: /Complete Interview 3 students/ }).focus();
      await page.keyboard.press("Tab");
      expect(await peek.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(peek).toBeHidden();
    await expect(page.locator("[data-home-search]")).toBeFocused();
  }
  expect(pageErrors).toEqual([]);
});

test("Story Peek, dense: four writers collapse to a +N count, links live in a menu, activity is capped", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session);
  const extras: number[] = [];
  for (const name of ["Dana Reyes", "Sam Ortiz", "Lee Park"]) {
    const username = `qa-${randomUUID().slice(0, 8)}`;
    const user = await session.rest<{ id: number }>("/wp/v2/users", "POST", { username, name, email: `${username}@example.test`, password: randomUUID(), roles: ["author"] });
    expect(user.ok).toBe(true);
    extras.push(user.payload.id);
    session.addCleanup(async () => { await session.rest(`/wp/v2/users/${user.payload.id}?force=true&reassign=1`, "DELETE"); });
  }
  const story = `/byline/v1/editorial/stories/${fixture.storyId}`;
  await session.rest(`${story}/contributors`, "POST", { contributors: [fixture.users.caroline, fixture.users.gibson, ...extras].map((id) => ({ id, kind: "user" })) });
  for (let index = 0; index < 7; index++) await session.rest(`${story}/tasks`, "POST", { title: `Extra task ${index + 1}`, storyId: fixture.storyId, assigneeId: fixture.users.gibson, dueAt: `${fixture.days.interview}T09:00` });
  for (const label of ["Budget memo", "Lunch menu"]) await session.rest(`${story}/resources`, "POST", { label, url: `https://docs.google.com/spreadsheets/d/${label.replace(/\W/g, "")}/edit`, purpose: "data" });
  await fs.mkdir(qa, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(homeUrl);
    const peek = await openPeek(page, fixture.title);
    const header = peek.locator("[data-slot=sheet-header]");
    await expect(header.locator("[data-slot=avatar-group] [data-slot=avatar]")).toHaveCount(3);
    await expect(header.locator("[data-slot=avatar-group-count]")).toHaveText(/^\+[2-3]$/);
    await expect(header.getByRole("img", { name: /and [23] more/ })).toBeVisible();
    await expect(peek.getByRole("region", { name: "Recent activity" }).locator("[data-slot=item-group] [data-slot=item]")).toHaveCount(3);
    await expect(peek.getByRole("link", { name: "View activity" })).toBeVisible();
    // Five links, none with its own always-visible trash button.
    await expect(peek.getByRole("region", { name: "Files & links" }).locator("a[target=_blank]")).toHaveCount(5);
    await expect(peek.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${qa}/peek-dense-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
  }
});

test("Story Peek: removing a link is immediate and Undo restores it", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(homeUrl);
  const peek = await openPeek(page, fixture.title);
  const actions = peek.getByRole("button", { name: "Actions for Research folder" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Remove link" }).click();
  await expect(peek.getByRole("link", { name: /Research folder/ })).toHaveCount(0);
  await expect(page.getByText("Link removed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(peek.getByRole("link", { name: /Research folder/ })).toBeVisible();
  await expect.poll(async () => (await session.rest<StoryWorkspace>(`/byline/v1/editorial/stories/${fixture.storyId}/workspace`)).payload.resources.some((resource) => resource.label === "Research folder")).toBe(true);
  await peek.getByRole("button", { name: "Actions for Research folder" }).click();
  await page.getByRole("menuitem", { name: "Remove link" }).click();
  await expect(peek.getByRole("link", { name: /Research folder/ })).toHaveCount(0);
  await expect.poll(async () => (await session.rest<StoryWorkspace>(`/byline/v1/editorial/stories/${fixture.storyId}/workspace`)).payload.resources.some((resource) => resource.label === "Research folder")).toBe(false);
});

test("Appointments: three choice cards, one range calendar writing windowStart/windowEnd, exact date and time, and a confirmed delete", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(fixture.workspaceUrl);
  const reporting = page.getByRole("region", { name: "Reporting", exact: true });
  const workspace = () => session.rest<StoryWorkspace>(`/byline/v1/editorial/stories/${fixture.storyId}/workspace`).then((result) => result.payload);

  // A target window: one range, picked on one calendar.
  await reporting.getByRole("button", { name: "Add appointment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add appointment" });
  await dialog.getByLabel("Title").fill("Call the athletic director");
  await expect(dialog.getByRole("radio", { name: /Not scheduled/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /Target date range/ }).click();
  await expect(dialog.getByRole("button", { name: "This week" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^First day|^Last day/ })).toHaveCount(0);
  const range = dialog.getByRole("button", { name: "Target dates" });
  await expect(range).toContainText("Choose target dates");
  await range.click();
  const days = page.locator("[data-slot=popover-content] td[data-day]:not([data-outside]) button");
  const from = await days.nth(8).locator("xpath=..").getAttribute("data-day");
  const to = await days.nth(11).locator("xpath=..").getAttribute("data-day");
  await days.nth(8).click();
  await days.nth(11).click();
  await expect(page.locator("[data-slot=popover-content]")).toBeHidden();
  await expect(range).toContainText("–");
  await dialog.getByRole("button", { name: "Add appointment", exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = (await workspace()).appointments.find((appointment) => appointment.title === "Call the athletic director")!;
  expect(saved).toMatchObject({ scheduleMode: "window", windowStart: from, windowEnd: to, startAt: null, endAt: null });

  // The same appointment, now exact: date and a time range, in the site timezone.
  await reporting.getByRole("button", { name: /Call the athletic director/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit appointment" });
  await edit.getByRole("radio", { name: /Exact date & time/ }).click();
  await expect(edit.getByRole("button", { name: "This week" })).toHaveCount(0);
  await edit.getByRole("button", { name: "Date", exact: true }).click();
  await page.locator("[data-slot=popover-content] td[data-day]:not([data-outside]) button").nth(14).click();
  await edit.getByLabel("Start time").fill("10:15");
  await edit.getByLabel("End time (optional)").fill("10:35");
  await expect(edit.getByText(/Times are in the site's timezone/)).toBeVisible();
  await edit.getByRole("button", { name: "Save appointment", exact: true }).click();
  await expect(edit).toBeHidden();
  const exact = (await workspace()).appointments.find((appointment) => appointment.title === "Call the athletic director")!;
  expect(exact).toMatchObject({ scheduleMode: "exact", windowStart: null, windowEnd: null });
  expect(exact.startAt).toBeTruthy();
  await expect(reporting.getByRole("button", { name: /Call the athletic director/ })).toContainText("10:15");

  // Delete asks first. Cancel does nothing and returns focus; confirming deletes.
  await reporting.getByRole("button", { name: /Call the athletic director/ }).click();
  const again = page.getByRole("dialog", { name: "Edit appointment" });
  const del = again.getByRole("button", { name: "Delete appointment" });
  await del.click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this appointment?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(again).toBeVisible();
  await expect(del).toBeFocused();
  expect((await workspace()).appointments.some((appointment) => appointment.title === "Call the athletic director")).toBe(true);
  await del.click();
  await page.getByRole("alertdialog", { name: "Delete this appointment?" }).getByRole("button", { name: "Delete" }).click();
  await expect(again).toBeHidden();
  await expect.poll(async () => (await workspace()).appointments.some((appointment) => appointment.title === "Call the athletic director")).toBe(false);
});

test("Appointment choice cards and the range calendar fit a phone", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(fixture.workspaceUrl);
  await page.getByRole("region", { name: "Reporting", exact: true }).getByRole("button", { name: "Add appointment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add appointment" });
  await dialog.getByRole("radio", { name: /Target date range/ }).click();
  const cards = await dialog.getByRole("radio").evaluateAll((nodes) => nodes.map((node) => node.closest("label")!.getBoundingClientRect()));
  expect(new Set(cards.map((box) => Math.round(box.x))).size).toBe(1);
  await dialog.getByRole("button", { name: "Target dates" }).click();
  const calendar = page.locator("[data-slot=popover-content]");
  const box = await calendar.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await fs.mkdir(qa, { recursive: true });
  await page.screenshot({ path: `${qa}/appointment-range-390.png`, animations: "disabled" });
});

test("Media files are native Attachments; removing one works, and removing an assignment asks first", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session);
  const files = [await uploadImage(page, `e2e-lunch-${Date.now()}.png`), await uploadImage(page, `e2e-line-${Date.now()}.png`)];
  session.addCleanup(async () => { for (const id of files) await session.rest(`/wp/v2/media/${id}?force=true`, "DELETE"); });
  const story = `/byline/v1/editorial/stories/${fixture.storyId}`;
  const assignment = await session.rest<{ assignmentId: string }>(`${story}/media-assignments`, "POST", { title: "Lunch line photos", type: "photo", assigneeId: fixture.users.maycie, attachmentIds: files });
  expect(assignment.ok).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(fixture.workspaceUrl);
  const production = page.getByRole("region", { name: "Media & Production", exact: true });
  await production.getByRole("button", { name: /Lunch line photos/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit assignment" });
  const attachments = dialog.locator("[data-slot=attachment]");
  await expect(attachments).toHaveCount(2);
  await expect(attachments.first().locator("[data-slot=attachment-media][data-variant=image] img")).toBeVisible();
  await attachments.first().getByRole("button", { name: /^Remove / }).click();
  await expect(attachments).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save assignment" }).click();
  await expect(dialog).toBeHidden();
  const saved = (await session.rest<StoryWorkspace>(`${story}/workspace`)).payload.mediaAssignments.find((item) => item.title === "Lunch line photos")!;
  expect(saved.attachmentIds).toEqual([files[1]]);

  await production.getByRole("button", { name: /Lunch line photos/ }).click();
  const again = page.getByRole("dialog", { name: "Edit assignment" });
  await again.getByRole("button", { name: "Remove assignment" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove this assignment?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(again).toBeVisible();
  await expect(again.getByRole("button", { name: "Remove assignment" })).toBeFocused();
  await again.getByRole("button", { name: "Remove assignment" }).click();
  await page.getByRole("alertdialog", { name: "Remove this assignment?" }).getByRole("button", { name: "Remove" }).click();
  await expect(again).toBeHidden();
  await expect.poll(async () => (await session.rest<StoryWorkspace>(`${story}/workspace`)).payload.mediaAssignments.some((item) => item.title === "Lunch line photos")).toBe(false);
});
