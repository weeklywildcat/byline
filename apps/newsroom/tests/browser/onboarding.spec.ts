import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { login, markWelcomeSeen, signIn, WELCOME_PREFERENCE } from "./helpers";

/**
 * First-run onboarding (src/ui/onboarding): the welcome, the guided tour over
 * the real interface, and what is remembered. Runs against a newsroom with
 * the local staff account (BYLINE_DEV_STAFF_*), whose welcome record each
 * test resets through its own Payload Preference.
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3010 npx playwright test --config playwright.editor.config.ts onboarding.spec.ts
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const card = (page: Page) => page.locator("[data-byline-tour-card]");
const cardTitle = (page: Page) => card(page).locator("h2");
const welcome = (page: Page) => page.locator("[data-byline-welcome]");
const target = (page: Page, anchor: string) => page.locator(`[data-byline-tour="${anchor}"]:visible`).first();

async function freshStaff(page: Page, request: APIRequestContext, baseURL: string) {
  const token = await login(request, baseURL, "STAFF", { welcome: "fresh" });
  const headers = { Authorization: `JWT ${token}`, Origin: baseURL };
  await request.delete(`/api/payload-preferences/${WELCOME_PREFERENCE}`, { headers });
  await signIn(page.context(), baseURL, token);
  return { token, headers };
}

async function stored(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`/api/payload-preferences/${WELCOME_PREFERENCE}`, { headers });
  return response.ok() ? (((await response.json()).value ?? undefined) as Record<string, unknown> | undefined) : undefined;
}

/** Presses Tab until the given element has focus (at most `max` times); returns everything focused on the way. */
async function tabTo(page: Page, anchor: string, max = 6) {
  const visited: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate((anchor) => {
      const active = document.activeElement;
      if (active?.closest(`[data-byline-tour="${anchor}"]`) || active?.getAttribute("data-byline-tour") === anchor) return "target";
      if (active?.closest("[data-byline-tour-card]")) return "card";
      return `elsewhere:${active?.tagName}:${active?.textContent?.trim().slice(0, 30)}`;
    }, anchor);
    visited.push(where);
    if (where === "target") break;
  }
  return visited;
}

test("first run: a personal welcome, focus on Show me around, and Escape skips for good", async ({ page, request, baseURL }) => {
  const { headers } = await freshStaff(page, request, baseURL!);
  await page.goto("/admin");
  await expect(welcome(page)).toBeVisible({ timeout: 60_000 });
  await expect(welcome(page).getByRole("heading")).toHaveText(/^Welcome to Byline(, \S+)?\.$/);
  await expect(page.getByRole("button", { name: "Show me around" })).toBeFocused();
  // A click outside does not skip by accident.
  await page.mouse.click(5, 5);
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome(page)).toBeHidden();
  await expect.poll(async () => (await stored(request, headers))?.status).toBe("skipped");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await expect(welcome(page)).toHaveCount(0);
});

test("keyboard only: the whole tour, Tab kept to the tour, real navigation, completion and focus restored", async ({ page, request, baseURL }) => {
  const { headers } = await freshStaff(page, request, baseURL!);
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Show me around" })).toBeFocused({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(cardTitle(page)).toHaveText("This is your newsroom", { timeout: 30_000 });
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toHaveAttribute("role", "dialog");
  await expect(card(page).getByRole("button", { name: "Next", exact: true })).toBeFocused();

  // Tab never reaches the dimmed page: only the card's controls.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-byline-tour-card]")))).toBe(true);
  }
  // Pointer input on the dimmed page goes nowhere.
  await page.mouse.click(600, 600);
  await expect(cardTitle(page)).toHaveText("This is your newsroom");

  await page.keyboard.press("ArrowRight");
  await expect(cardTitle(page)).toHaveText("Start something");
  await page.keyboard.press("ArrowLeft");
  await expect(cardTitle(page)).toHaveText("This is your newsroom");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(cardTitle(page)).toHaveText("Find anything");
  await page.keyboard.press("ArrowRight");

  for (const [action, anchor, screen, path] of [["Stories", "nav-stories", "Stories move through the desk", "/admin/stories"], ["Calendar", "nav-calendar", "See the week ahead", "/admin/calendar"], ["Media", "nav-media", "Photos and files", "/admin/media"]] as const) {
    await expect(cardTitle(page)).toHaveText(action);
    await expect(card(page)).toContainText(`Open ${action} to continue.`);
    await expect(card(page).getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    // Tab reaches the real control, and nothing outside the card and that control.
    const visited = await tabTo(page, anchor);
    expect(visited.at(-1)).toBe("target");
    for (const stop of visited) expect(stop === "card" || stop === "target").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 60_000 });
    await expect(cardTitle(page)).toHaveText(screen, { timeout: 60_000 });
    expect(await stored(request, headers)).toBeUndefined();
    await page.keyboard.press("ArrowRight");
  }

  await expect(cardTitle(page)).toHaveText("Your account");
  await page.keyboard.press("ArrowRight");
  const done = page.locator("[data-byline-tour-complete]");
  await expect(done).toContainText("You’re ready.");
  await expect(page.getByRole("button", { name: "Start working" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(done).toBeHidden();
  await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
  await expect.poll(async () => (await stored(request, headers))?.status).toBe("completed");
  // Focus returns to the page, not to a vanished button.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("H1");
});

test("a reload while a step opens another screen resumes the tour there", async ({ page, request, baseURL }) => {
  await freshStaff(page, request, baseURL!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Show me around" }).click({ timeout: 60_000 });
  for (let i = 0; i < 3; i++) await card(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(cardTitle(page)).toHaveText("Stories");
  await target(page, "nav-stories").click();
  await page.waitForURL(/\/admin\/stories$/, { timeout: 60_000 });
  await page.reload();
  await expect(cardTitle(page)).toHaveText("Stories move through the desk", { timeout: 60_000 });
  await expect(welcome(page)).toHaveCount(0);
  await card(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(card(page)).toHaveCount(0);
});

test("reduced motion: no smooth scrolling and no motion on the spotlight or card", async ({ page, request, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __scrolls: string[] }).__scrolls = calls;
    const into = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      calls.push(typeof options === "object" ? String(options.behavior) : "default");
      return into.call(this, options);
    };
    const by = window.scrollBy.bind(window);
    window.scrollBy = ((options: ScrollToOptions) => { calls.push(String(options?.behavior)); by(options); }) as typeof window.scrollBy;
  });
  await page.setViewportSize({ width: 1366, height: 520 });
  await freshStaff(page, request, baseURL!);
  await page.goto("/admin");
  await expect(welcome(page)).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect(cardTitle(page)).toHaveText("This is your newsroom", { timeout: 30_000 });
  const scrolls = await page.evaluate(() => (window as unknown as { __scrolls: string[] }).__scrolls);
  expect(scrolls.length).toBeGreaterThan(0);
  expect(scrolls.every((behavior) => behavior === "auto")).toBe(true);
  const motion = await page.evaluate(() => {
    const pane = document.querySelector("[data-tour-pane]")!;
    const ring = document.querySelector("[data-tour-ring]")!;
    const popup = document.querySelector("[data-byline-tour-card]")!;
    return [getComputedStyle(pane).transitionDuration, getComputedStyle(ring).transitionDuration, getComputedStyle(popup).animationName];
  });
  expect(motion[0]).toMatch(/^0s/);
  expect(motion[1]).toMatch(/^0s/);
  expect(motion[2]).toBe("none");
  await page.keyboard.press("Escape");
});

test("phone: bottom navigation, the card inside the viewport, no sideways scrolling", async ({ page, request, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { headers } = await freshStaff(page, request, baseURL!);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Show me around" }).click({ timeout: 60_000 });
  await expect(cardTitle(page)).toHaveText("This is your newsroom", { timeout: 30_000 });
  for (let i = 0; i < 3; i++) await card(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(cardTitle(page)).toHaveText("Stories");
  // The highlighted Stories is the bottom bar's, not a hidden desktop link.
  expect(await target(page, "nav-stories").evaluate((element) => Boolean(element.closest(".byline-primary-navigation")))).toBe(true);
  const box = (await card(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await target(page, "nav-stories").click();
  await expect(cardTitle(page)).toHaveText("Stories move through the desk", { timeout: 60_000 });
  await card(page).getByRole("button", { name: "Skip tour" }).click();
  await expect.poll(async () => (await stored(request, headers))?.status).toBe("skipped");
});

test.describe("tablet with touch", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("the header's Create and More are the targets, and taps work", async ({ page, request, baseURL }) => {
    await freshStaff(page, request, baseURL!);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Show me around" }).tap({ timeout: 60_000 });
    await expect(cardTitle(page)).toHaveText("This is your newsroom", { timeout: 30_000 });
    await card(page).getByRole("button", { name: "Next", exact: true }).tap();
    await expect(cardTitle(page)).toHaveText("Start something");
    expect(await target(page, "create").evaluate((element) => Boolean(element.closest(".byline-app-header")))).toBe(true);
    const next = await card(page).getByRole("button", { name: "Next", exact: true }).boundingBox();
    // The coarse-pointer size (min-h-11, compiled against Payload's root font).
    expect(next!.height).toBeGreaterThanOrEqual(40);
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
  });
});

test("the account menu replays the welcome without resetting anything", async ({ page, request, baseURL }) => {
  const token = await login(request, baseURL!, "STAFF");
  await signIn(page.context(), baseURL!, token);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Account: / }).click();
  await page.getByRole("menuitem", { name: "Take the Byline tour" }).click();
  await expect(welcome(page)).toBeVisible();
  await expect(welcome(page).getByRole("heading")).toHaveText(/^Welcome back/);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(welcome(page)).toBeHidden();
  await markWelcomeSeen(request, { Authorization: `JWT ${token}`, Origin: baseURL! });
});
