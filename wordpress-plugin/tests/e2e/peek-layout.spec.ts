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
