import { expect, test, type Page } from "@playwright/test";
import { createStory, lexical, login, paragraph, signIn } from "./helpers";

/**
 * Plan and Write at the widths the newsroom uses (docs/story-screen.md#responsive):
 * nothing scrolls sideways, both tabs and the one lifecycle action stay on
 * screen and directly selectable (never a dropdown), the article keeps a
 * readable measure, and every control has a name a screen reader can announce.
 * Screenshots of both workspaces are attached to the report at each width.
 */

let storyId = 0;
let token = "";

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  storyId = await createStory(request, baseURL!, token, { headline: `Responsive Story ${Date.now()}`, body: lexical([paragraph("The canteen closed in May after the district ended its contract.")]) });
  const appointment = await request.post(`/api/byline/stories/${storyId}/appointments`, {
    headers: { Authorization: `JWT ${token}`, Origin: baseURL! },
    data: { title: "Principal Smith interview", kind: "interview", status: "confirmed", scheduleMode: "unscheduled" }
  });
  expect(appointment.ok()).toBeTruthy();
});
test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tab = (page: Page, name: "Plan" | "Write") => page.getByRole("tablist", { name: "Story workspace" }).getByRole("tab", { name, exact: true });

// Phone, a narrow iPad Split View window, iPad portrait, small laptop, iPad landscape, laptop.
for (const [width, height] of [[390, 844], [600, 900], [820, 1180], [1024, 768], [1194, 834], [1440, 900]] as const) {
  test(`Plan and Write fit at ${width}px with both tabs and the lifecycle action in reach`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    for (const workspace of ["plan", "write"] as const) {
      await page.goto(`/admin/collections/stories/${storyId}?view=${workspace}`);
      await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", workspace, { timeout: 60_000 });
      await expect(tab(page, "Plan")).toBeInViewport();
      await expect(tab(page, "Write")).toBeInViewport();
      await expect(page.locator("[data-primary-action]")).toBeInViewport();
      await expect(page.getByRole("button", { name: "More story actions" })).toBeInViewport();
      // Touch-sized tabs.
      expect((await tab(page, "Plan").boundingBox())!.height).toBeGreaterThanOrEqual(36);
      if (workspace === "write") {
        const measure = (await page.locator("[data-story-article] textarea[aria-label='Headline']").boundingBox())!.width;
        expect(measure).toBeGreaterThanOrEqual(Math.min(width - 72, 440));
        await expect(page.locator("[data-reporting-reference-toggle]")).toBeInViewport();
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await info.attach(`${workspace}-${width}`, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
    }
    await page.goto(`/admin/collections/stories/${storyId}?view=history`);
    await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "history", { timeout: 60_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("Story Context sits beside the article on a wide screen, and Plan has the same information everywhere", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/admin/collections/stories/${storyId}?view=write`);
  const rail = page.locator("[data-story-context-rail]");
  await expect(rail).toBeVisible({ timeout: 60_000 });
  await expect(rail.getByRole("heading", { name: "Angle" })).toBeVisible();
  expect((await page.locator("[data-story-article] textarea[aria-label='Headline']").boundingBox())!.width).toBeGreaterThanOrEqual(700);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(rail).toHaveCount(0);
  await tab(page, "Plan").click();
  await expect(page.locator("#plan-brief").getByRole("heading", { name: "Angle and assignment" })).toBeVisible();
});

test("every control on the Story screen has an accessible name, and focus is visible", async ({ page }) => {
  for (const workspace of ["plan", "write"]) {
    await page.goto(`/admin/collections/stories/${storyId}?view=${workspace}`);
    await expect(page.locator("[data-story-view]")).toBeVisible({ timeout: 60_000 });
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("[data-story-view] button, [data-story-view] [role=button], [data-story-view] [role=tab], [data-story-view] a[href], [data-story-view] input, [data-story-view] select, [data-story-view] textarea")]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => {
        const label = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el as HTMLElement).innerText?.trim() || el.getAttribute("title") || el.getAttribute("placeholder") || ((el as HTMLInputElement).labels?.[0]?.textContent ?? "");
        return !label;
      }).map((el) => el.outerHTML.slice(0, 120)));
    expect(unnamed, workspace).toEqual([]);
  }
  await tab(page, "Write").focus();
  const ring = await tab(page, "Write").evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.boxShadow}`; });
  expect(ring).not.toBe("none|none");
});

test("the overflow menu and Story details return focus to what opened them", async ({ page }) => {
  await page.goto(`/admin/collections/stories/${storyId}`);
  await expect(page.locator("[data-story-view]")).toBeVisible({ timeout: 60_000 });
  const more = page.getByRole("button", { name: "More story actions" });
  await more.click();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("menuitem", { name: /Story details/ }).click();
  await expect(page.getByRole("dialog", { name: "Story details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Story details" })).toBeHidden();
  await expect(more).toBeFocused();
});
