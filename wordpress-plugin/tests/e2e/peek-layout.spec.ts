import { expect, test } from "./fixtures";
import { boardUrl, createPlanningStory, currentUserId, token } from "./planning-fixture";

/**
 * Story Peek is a side sheet everywhere it opens. Each admin screen is its own
 * Tailwind build, and one that does not register `../story` as a source loses the
 * Peek's width and padding, so it fills the screen like a page.
 */
test("clicking a task opens Story Peek in the side sheet on Today and Stories", async ({ adminPage: page, adminSession: session }) => {
  const unique = token();
  const title = `${unique} Peek layout`;
  const id = await createPlanningStory(session, { title, status: "reporting" });
  const today = new Date().toISOString().slice(0, 10);
  const task = await session.rest(`/byline/v1/editorial/stories/${id}/tasks`, "POST", { title: `${unique} Interview the principal`, storyId: id, dueAt: `${today}T15:00`, priority: "normal", assigneeId: await currentUserId(session) });
  expect(task.ok).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  const expectSide = async () => {
    const peek = page.getByRole("dialog");
    await expect(peek).toBeVisible();
    await expect(peek).toContainText(title);
    const box = (await peek.boundingBox())!;
    expect(box.width, "the sheet must not fill the screen").toBeLessThanOrEqual(480);
    expect(box.x + box.width).toBeGreaterThanOrEqual(1440 - 1);
    // Padded content, not text flush against the edge.
    const content = await page.getByText("Story details").boundingBox();
    expect(content!.x - box.x).toBeGreaterThanOrEqual(8);
    await page.keyboard.press("Escape");
    await expect(peek).toBeHidden();
  };

  await page.goto("/wp-admin/admin.php?page=byline-planning&tab=today");
  await page.getByRole("button", { name: `${unique} Interview the principal` }).first().click();
  await expectSide();

  await page.goto(boardUrl(unique));
  await page.getByRole("button", { name: title, exact: true }).click();
  await expectSide();
});

test("clicking a story title the cursor has rested on still opens Story Peek", async ({ adminPage: page, adminSession: session }) => {
  const unique = token();
  const title = `${unique} Rested cursor`;
  await createPlanningStory(session, { title, status: "reporting" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(boardUrl(unique));
  const heading = page.getByRole("button", { name: title, exact: true });
  await expect(heading).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Resting on the title opens its hover preview; the click that follows used to be swallowed.
    await heading.hover();
    await expect(page.locator("[data-slot=hover-card-content]")).toBeVisible();
    await heading.click();
    await expect(page.getByRole("dialog")).toContainText(title);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.mouse.move(5, 5);
  }
});

test("collection context stays compact until expanded at desktop and phone widths", async ({ adminPage: page, adminSession: session }) => {
  const unique = token();
  const title = `${unique} Compact context`;
  const id = await createPlanningStory(session, { title, status: "reporting" });
  const collection = { id: 90001, name: "Election coverage and community reporting with a very long collection name", archived: false, canEdit: true };
  const interview = { id: 90002, collectionId: collection.id, interviewee: "School principal", canEdit: true };
  await page.route(new RegExp(`/byline/v1/editorial/stories/${id}/collections(?:\\?.*)?$`), (route) => route.fulfill({ json: {
    canManage: true, collections: [collection], interviews: [interview], availableInterviews: [],
    resources: [{ id: 90003, label: "Interview recording", url: "https://example.test/recording", kind: "Audio" }],
  } }));
  await page.route(/\/byline\/v1\/editorial\/collections(?:\?.*)?$/, (route) => route.fulfill({ json: { collections: [collection], pages: 1 } }));
  const fs = await import("node:fs/promises");
  await fs.mkdir("/tmp/byline-peek-qa", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(boardUrl(unique));
    await page.getByRole("button", { name: title, exact: true }).click();
    const peek = page.getByRole("dialog", { name: title, exact: true });
    const section = peek.getByRole("region", { name: "Story Collections", exact: true });
    const toggle = section.getByRole("button", { name: /Collections & interviews/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(section).toContainText("1 shared interview · 1 shared resource");
    await expect(section.getByLabel("Story collections", { exact: true })).toBeHidden();
    await expect(section.getByText("School principal", { exact: false })).toBeHidden();
    const box = (await section.boundingBox())!;
    expect(box.height).toBeLessThan(105);
    const tasks = (await peek.getByRole("region", { name: "Tasks", exact: true }).boundingBox())!;
    expect(tasks.y + tasks.height).toBeLessThanOrEqual(box.y);
    await peek.screenshot({ path: `/tmp/byline-peek-qa/collapsed-${width}.png` });

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(section.getByRole("link", { name: /School principal/ })).toHaveAttribute("href", /collection=90001&interview=90002/);
    await expect(section.getByRole("link", { name: /Interview recording/ })).toHaveAttribute("target", "_blank");
    await section.getByLabel("Add from Collection", { exact: true }).click();
    await page.getByLabel("Search add from collection", { exact: true }).fill("principal");
    const option = page.getByRole("option", { name: "School principal", exact: true });
    await expect(option).toBeVisible();
    const popup = (await option.boundingBox())!;
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(option).toBeHidden();
    await expect(peek).toBeVisible();
    expect(await peek.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await peek.screenshot({ path: `/tmp/byline-peek-qa/expanded-${width}.png` });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(peek).toBeHidden();
  }
});
