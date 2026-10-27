import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { addDays, createPlanningStory, currentUserId, siteToday, token } from "./planning-fixture";

const listUrl = "/wp-admin/admin.php?page=byline-planning&tab=stories&view=list";

test("Stories List keeps readable dense rows, separators, horizontal work signals and a compact responsive fallback", async ({ adminPage: page, adminSession: session }, testInfo) => {
  const unique = token();
  const me = await currentUserId(session);
  const { day } = await siteToday(session);
  const titles = ["Canteen could return", "Winter concert", "Robotics prepares for regionals", "Student council budget", "New library hours", "Homecoming preparations", "Campus garden", "Debate team", "The school board considers a new schedule with longer classes and more time for student activities ".repeat(4), "Arts showcase"];
  const ids: number[] = [];
  for (const [index, headline] of titles.entries()) {
    const id = await createPlanningStory(session, { title: `${unique} ${headline}`, status: index % 2 ? "writing" : "reporting", ...(index === 0 ? { deadline: addDays(day, -2), writers: [me] } : {}) });
    ids.push(id);
  }
  const firstId = ids[0]!;
  // Use a real uploaded profile photo through the contributor/Planning API.
  // A local headshot may replace the tiny image fixture for visual review.
  const image = process.env.BYLINE_E2E_PROFILE_PHOTO
    ? await readFile(process.env.BYLINE_E2E_PROFILE_PHOTO)
    : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const nonce = await page.evaluate(() => (window as Window & { wpApiSettings?: { nonce?: string } }).wpApiSettings?.nonce ?? "");
  const uploaded = await page.context().request.post("/wp-json/wp/v2/media", { headers: { "X-WP-Nonce": nonce, "Content-Disposition": `attachment; filename="${unique}-profile.png"`, "Content-Type": "image/png" }, data: image });
  expect(uploaded.ok()).toBe(true);
  const photoId = ((await uploaded.json()) as { id: number }).id;
  session.addCleanup(async () => { await session.rest(`/wp/v2/media/${photoId}?force=true`, "DELETE"); });
  const writerName = `Caroline Elrod ${unique}`;
  const writer = await session.rest<{ id: number }>("/byline/v1/admin/contributors/guests", "POST", { displayName: writerName, imageId: photoId, hasProfilePage: false });
  expect(writer.ok).toBe(true);
  session.addCleanup(async () => { await session.rest(`/byline/v1/admin/contributors/guests/${writer.payload.id}`, "DELETE"); });
  expect((await session.rest(`/byline/v1/editorial/stories/${firstId}/contributors`, "POST", { contributors: [{ id: writer.payload.id, kind: "guest" }] })).ok).toBe(true);
  expect((await session.rest(`/byline/v1/editorial/stories/${firstId}`, "POST", { editorId: me, plannedPublishAt: `${addDays(day, 3)}T12:00` })).ok).toBe(true);
  expect((await session.rest(`/byline/v1/editorial/stories/${firstId}/tasks`, "POST", { title: "Check budget", assigneeId: me })).ok).toBe(true);
  expect((await session.rest(`/byline/v1/editorial/stories/${firstId}/media-assignments`, "POST", { title: "Campus photo", type: "photo" })).ok).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listUrl);
  await page.getByRole("searchbox", { name: "Search stories" }).fill(unique);
  const table = page.getByRole("table", { name: "Stories", exact: true });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(10);
  const first = table.locator(`[data-story-id="${firstId}"]`);
  const longTitle = page.getByRole("button", { name: `${unique} ${titles[8]}`, exact: true });
  const avatar = first.getByRole("img", { name: writerName, exact: true });
  await expect(avatar).toBeVisible();
  await expect.poll(() => avatar.locator("img").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect((await avatar.boundingBox())!.width).toBe(24);

  const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    return { height: rect.height, bottom: rect.bottom, separator: style.borderBottomWidth, borderColor: style.borderBottomColor };
  }));
  expect(geometry.every(({ height }) => height >= 46 && height <= 58)).toBe(true);
  expect(geometry.filter(({ bottom }) => bottom <= 900).length).toBeGreaterThanOrEqual(9);
  for (const row of geometry.slice(0, -1)) {
    expect(row.separator).toBe("1px");
    expect(row.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  }
  expect(await table.evaluate((element) => getComputedStyle(element).borderCollapse)).toBe("collapse");
  expect((await table.locator("thead").boundingBox())!.height).toBeLessThanOrEqual(40);
  expect(await longTitle.evaluate((element) => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.clientHeight, fullHeight: element.scrollHeight }))).toMatchObject({ clamp: "2", height: 40 });
  expect(await longTitle.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const badges = first.getByRole("cell").nth(5).locator("[data-work-kind]");
  await expect(badges).toHaveCount(2);
  expect((await badges.nth(0).boundingBox())!.y).toBe((await badges.nth(1).boundingBox())!.y);
  await expect(first).toContainText("2d overdue");
  await expect(first).toContainText("Edited by");
  await expect(first.getByRole("button", { name: `Actions for ${unique} ${titles[0]}` })).toBeVisible();
  const toolbar = page.getByRole("search", { name: "Filter stories" });
  const searchBox = (await toolbar.getByRole("searchbox").boundingBox())!;
  for (const name of ["Workflow", "Writer", "Editor"]) {
    const control = (await toolbar.getByRole("combobox", { name, exact: true }).boundingBox())!;
    expect(control.height).toBeGreaterThanOrEqual(32);
    expect(control.height).toBeLessThanOrEqual(36);
    expect(control.y).toBe(searchBox.y);
  }

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.mouse.move(1000, 210);
    const resting = await first.evaluate((element) => getComputedStyle(element).backgroundColor);
    await first.getByRole("cell").nth(6).hover();
    await expect.poll(() => first.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(resting);
    await page.mouse.move(1000, 210);
    await page.screenshot({ path: testInfo.outputPath(`stories-list-${scheme}-1440.png`), fullPage: true, animations: "disabled" });
  }

  // Just above the existing container breakpoint, the table still stays in bounds.
  await page.setViewportSize({ width: 1052, height: 900 });
  await expect(table).toBeVisible();
  expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("stories-list-1052.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toHaveCount(0);
  await expect(page.locator('[data-story-id]')).toHaveCount(10);
  await expect(page.locator(`[data-story-id="${firstId}"]`).getByRole("img", { name: writerName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `${unique} ${titles[0]}`, exact: true })).toBeVisible();
  expect(await longTitle.evaluate((element) => getComputedStyle(element).webkitLineClamp)).toBe("2");
  expect((await longTitle.boundingBox())!.height).toBeLessThanOrEqual(42);
  expect(await page.locator(`[data-story-id="${firstId}"]`).evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe("1px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("stories-list-390.png"), fullPage: true, animations: "disabled" });
});

test("Stories List opens empty cell space and the keyboard title without stealing inline edits or either actions menu", async ({ adminPage: page, adminSession: session }) => {
  const title = `${token()} Inline controls`;
  const { day } = await siteToday(session);
  const id = await createPlanningStory(session, { title, deadline: day });
  expect((await session.rest(`/byline/v1/editorial/stories/${id}/tasks`, "POST", { title: "Interview students" })).ok).toBe(true);
  expect((await session.rest(`/byline/v1/editorial/stories/${id}/media-assignments`, "POST", { title: "Photos", type: "photo" })).ok).toBe(true);
  expect((await session.rest(`/byline/v1/editorial/stories/${id}/sources`, "POST", { label: "Principal", status: "needs-scheduling" })).ok).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listUrl);
  await page.getByRole("searchbox", { name: "Search stories" }).fill(title);
  const row = page.getByRole("table", { name: "Stories", exact: true }).locator(`[data-story-id="${id}"]`);
  const peek = page.getByRole("dialog", { name: title, exact: true });
  await expect(row).toBeVisible();
  const unchangedPost = (await session.rest<{ status: string; date: string }>(`/wp/v2/posts/${id}?context=edit`)).payload;

  await row.getByRole("button", { name: "1 more work signal", exact: true }).click();
  const moreWork = page.locator('[data-slot="popover-content"]');
  await expect(moreWork).toContainText("Photo needed");
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");

  await row.getByRole("combobox", { name: "Workflow: Reporting" }).click();
  await expect(peek).toHaveCount(0);
  await page.getByRole("option", { name: "Writing", exact: true }).click();
  await expect(row.getByRole("combobox", { name: "Workflow: Writing" })).toBeVisible();
  await expect(peek).toHaveCount(0);

  for (const label of ["Change deadline", "Change planned publication"]) {
    await row.getByRole("button", { name: label, exact: true }).click();
    const popup = page.locator('[data-slot="popover-content"]');
    await expect(popup).toBeVisible();
    await expect(peek).toHaveCount(0);
    await popup.locator('[data-slot="calendar"] button[data-day]:not([disabled])').last().click();
    await expect(popup).toHaveCount(0);
    await expect(peek).toHaveCount(0);
    await expect(row).not.toHaveAttribute("aria-busy", "true");
  }
  await expect.poll(async () => {
    const workspace = await session.rest<{ story: { deadline: string | null; plannedPublication: string | null; workflow: { id: string } } }>(`/byline/v1/editorial/stories/${id}/workspace`);
    return Boolean(workspace.payload.story.deadline && workspace.payload.story.plannedPublication && workspace.payload.story.workflow.id === "writing");
  }).toBe(true);
  const after = (await session.rest<{ status: string; date: string }>(`/wp/v2/posts/${id}?context=edit`)).payload;
  expect({ status: after.status, date: after.date }).toEqual({ status: unchangedPost.status, date: unchangedPost.date });

  await row.getByRole("button", { name: `Actions for ${title}` }).click();
  await expect(page.getByRole("menuitem", { name: "Open workspace", exact: true })).toBeVisible();
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");
  const emptyCell = row.getByRole("cell").nth(6);
  // Hit cell padding, not its timestamp descendant.
  await emptyCell.click({ position: { x: 2, y: 2 } });
  await expect(peek).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  const titleButton = row.getByRole("button", { name: title, exact: true });
  await titleButton.focus();
  await expect(titleButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(peek).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await titleButton.hover();
  await expect(page.locator('[data-slot="story-hover-preview"]')).toBeVisible();
  await titleButton.click();
  await expect(peek).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await emptyCell.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Quick view", exact: true })).toBeVisible();
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");
  await emptyCell.click({ modifiers: ["Control"] });
  await expect(peek).toHaveCount(0);
  await page.keyboard.press("Escape");

  await emptyCell.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Quick view", exact: true }).click();
  await expect(peek).toBeVisible();
});
