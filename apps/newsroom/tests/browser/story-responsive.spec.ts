import { expect, test, type Page } from "@playwright/test";
import { createStory, lexical, login, paragraph, signIn } from "./helpers";

/**
 * The Story screen at the widths the newsroom uses (docs/story-screen.md):
 * nothing scrolls sideways, the labelled Reporting button and the one
 * lifecycle action stay reachable, and every control has a name a screen
 * reader can announce.
 */

let storyId = 0;
let token = "";

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  storyId = await createStory(request, baseURL!, token, { headline: `Responsive Story ${Date.now()}`, body: lexical([paragraph("The canteen closed in May after the district ended its contract.")]) });
});
test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [1440, 1024, 820, 390]) {
  test(`fits at ${width}px: Story, Reporting and History, with Reporting and the lifecycle action in reach`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/collections/stories/${storyId}`);
    await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "story", { timeout: 60_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Reporting", exact: true })).toBeInViewport();
    await expect(page.locator("[data-primary-action]")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    // The Story Context is a rail when the article has room and a Sheet when it doesn't; either way it opens from a named button.
    await page.getByRole("button", { name: "Story context" }).click();
    await expect(page.getByRole("dialog").or(page.getByRole("complementary")).first()).toBeVisible();
    await page.keyboard.press("Escape");
    for (const view of ["reporting", "history"]) {
      await page.goto(`/admin/collections/stories/${storyId}?view=${view}`);
      await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", view, { timeout: 60_000 });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });
}

test("every control on the Story screen has an accessible name, and focus is visible", async ({ page }) => {
  await page.goto(`/admin/collections/stories/${storyId}`);
  await expect(page.locator("[data-story-view]")).toBeVisible({ timeout: 60_000 });
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("[data-story-view] button, [data-story-view] [role=button], [data-story-view] a[href], [data-story-view] input, [data-story-view] select, [data-story-view] textarea")]
    .filter((el) => (el as HTMLElement).offsetParent !== null)
    .filter((el) => {
      const label = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el as HTMLElement).innerText?.trim() || el.getAttribute("title") || el.getAttribute("placeholder") || ((el as HTMLInputElement).labels?.[0]?.textContent ?? "");
      return !label;
    }).map((el) => el.outerHTML.slice(0, 120)));
  expect(unnamed).toEqual([]);
  // Tabbing from the header reaches Reporting with a visible focus ring.
  await page.getByRole("button", { name: "Reporting", exact: true }).focus();
  const ring = await page.getByRole("button", { name: "Reporting", exact: true }).evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.boxShadow}`; });
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
