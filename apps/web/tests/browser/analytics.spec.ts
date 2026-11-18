import { expect, test, type Page } from "@playwright/test";

/**
 * Byline-managed Google Analytics on the real built pages (docs/google-analytics.md). Built with
 * `npm run build:analytics-fixture` (a native snapshot whose publication has consent mode "ask"). Google's script is never fetched: the
 * request is fulfilled with an empty script, so what is asserted is exactly what Byline puts on the
 * data layer and when it asks Google for anything.
 */
const ARTICLE = "/2026/11/10/news/where-the-sidewalk-stands/";
const GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;
const CONSENT_KEY = "byline:analytics-consent:v1";

type Command = unknown[];

async function watch(page: Page, mode: "ask" | "always" | "external" = "ask") {
  const googleRequests: string[] = [];
  await page.route(GOOGLE, async (route) => {
    googleRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  if (mode !== "ask") {
    // Same page, different publication setting: rewrite the config JSON the build embedded.
    await page.route(`**${ARTICLE}`, async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      body = mode === "external"
        ? body.replace(/<script type="application\/json" id="byline-analytics-config">.*?<\/script>/s, "")
        : body.replace('"consentMode":"ask"', '"consentMode":"always"');
      await route.fulfill({ response, body });
    });
  }
  return googleRequests;
}

const dataLayer = (page: Page) => page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => Array.from(entry)));
const events = async (page: Page, name?: string) => (await dataLayer(page)).filter((entry: Command) => entry[0] === "event" && (!name || entry[1] === name)) as Array<["event", string, Record<string, unknown>]>;
const commands = async (page: Page, name: string) => (await dataLayer(page)).filter((entry: Command) => entry[0] === name);

test.describe("Byline-managed Google Analytics", () => {
  test("Ask mode: nothing goes to Google, and nothing is counted, until the reader allows", async ({ page }) => {
    const google = await watch(page);
    await page.goto(ARTICLE, { waitUntil: "load" });
    const prompt = page.getByRole("region", { name: "Audience analytics" });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("We use Google Analytics to understand how readers use the site.");
    await expect(prompt.getByRole("button", { name: "Allow analytics" })).toBeVisible();
    await expect(prompt.getByRole("button", { name: "No thanks" })).toBeVisible();
    expect(google).toEqual([]);
    expect(await events(page)).toEqual([]);
    expect(await commands(page, "consent")).toEqual([["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]]);
    expect(await page.evaluate(() => document.querySelectorAll('script[src*="googletagmanager"]').length)).toBe(0);
    // Fixed-position: showing it moves nothing.
    expect(await prompt.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  });

  test("Allow loads the tag once and sends this page's one Story pageview, and the choice persists", async ({ page }) => {
    const google = await watch(page);
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
    await expect.poll(() => google.length).toBe(1);
    expect(google[0]).toContain("id=G-FIXTURE123");
    expect(await commands(page, "config")).toEqual([["config", "G-FIXTURE123", { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }]]);
    const views = await events(page, "page_view");
    expect(views).toHaveLength(1);
    expect(views[0]![2]).toMatchObject({ page_title: await page.title(), page_location: expect.stringContaining(ARTICLE), content_id: expect.stringMatching(/^story:\d+$/), content_type: "story", content_group: "news" });
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), CONSENT_KEY)).toMatchObject({ v: 1, choice: "granted" });
    expect((await commands(page, "consent")).at(-1)).toEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);

    // The next page remembers, asks nothing and sends exactly one pageview of its own.
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
    await expect.poll(async () => (await events(page, "page_view")).length).toBe(1);
    expect(google).toHaveLength(2);
  });

  test("No thanks sends nothing now or later, and the footer reopens the choice", async ({ page }) => {
    const google = await watch(page);
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.getByRole("button", { name: "No thanks" }).click();
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
    expect(google).toEqual([]);
    expect(await events(page)).toEqual([]);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), CONSENT_KEY)).toMatchObject({ choice: "denied" });

    const privacy = page.getByRole("button", { name: "Privacy settings" });
    await privacy.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Audience analytics" })).toContainText("Analytics are off.");
    await expect(page.getByRole("button", { name: "Allow analytics" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
    await expect(privacy).toBeFocused();
  });

  test("revoking stops collection immediately and on later pages", async ({ page }) => {
    const google = await watch(page);
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect.poll(async () => (await events(page, "page_view")).length).toBe(1);
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await expect(page.getByRole("region", { name: "Audience analytics" })).toContainText("Analytics are on.");
    await page.getByRole("button", { name: "No thanks" }).click();
    expect((await commands(page, "consent")).at(-1)).toEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)["ga-disable-G-FIXTURE123"])).toBe(true);
    const sent = (await events(page)).length;
    await page.getByRole("button", { name: "Copy link" }).click();
    expect((await events(page)).length).toBe(sent);
    const requests = google.length;
    await page.reload({ waitUntil: "load" });
    expect(google).toHaveLength(requests);
    expect(await events(page)).toEqual([]);
  });

  test("the choice is reachable by keyboard, right after the skip link", async ({ page }) => {
    await watch(page);
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Allow analytics" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "No thanks" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Audience analytics" })).toBeHidden();
  });

  test("Always mode: no prompt, one tag, one config, one pageview, advertising denied", async ({ page }) => {
    const google = await watch(page, "always");
    await page.goto(ARTICLE, { waitUntil: "load" });
    await expect(page.getByRole("region", { name: "Audience analytics" })).toHaveCount(0);
    await expect.poll(() => google.length).toBe(1);
    expect(await commands(page, "config")).toHaveLength(1);
    expect((await events(page, "page_view"))).toHaveLength(1);
    expect((await commands(page, "consent"))[0]).toEqual(["consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    await page.waitForTimeout(500);
    expect((await events(page, "page_view"))).toHaveLength(1);
  });

  test("reads: each threshold once, no duplicate of Google's own 90% scroll event", async ({ page }) => {
    // The page's own progress measure needs an article taller than the screen; the fixture's is short.
    await page.setViewportSize({ width: 900, height: 300 });
    await watch(page, "always");
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.evaluate(async () => {
      const steps = 24;
      const max = document.documentElement.scrollHeight;
      // The site scrolls smoothly; jump instead so every position is really visited.
      const jump = (top: number) => window.scrollTo({ top, behavior: "instant" });
      for (let step = 1; step <= steps; step++) {
        jump((max * step) / steps);
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      }
      // Scrolling back up and down again must not repeat any threshold.
      for (let step = steps; step >= 0; step -= 3) jump((max * step) / steps);
      jump(max);
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const names = (await events(page)).map((entry) => entry[1]);
    for (const name of ["byline_read_25", "byline_read_50", "byline_read_75", "byline_read_100"]) expect(names.filter((value) => value === name), name).toHaveLength(1);
    expect(names).not.toContain("scroll");
    expect((await events(page, "byline_read_50"))[0]![2]).toMatchObject({ content_type: "story", content_group: "news" });
  });

  test("a successful share is measured once, with the Story", async ({ page }) => {
    await watch(page, "always");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect.poll(async () => (await events(page, "share")).length).toBe(1);
    expect((await events(page, "share"))[0]![2]).toMatchObject({ method: "copy_link", content_type: "story", item_id: expect.stringMatching(/^story:\d+$/) });
  });

  test("external measurement: no tag, no data layer, no request, no prompt", async ({ page }) => {
    const google = await watch(page, "external");
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(300);
    expect(google).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { dataLayer?: unknown }).dataLayer)).toBeUndefined();
    await expect(page.getByRole("region", { name: "Audience analytics" })).toHaveCount(0);
  });

  test("a page that isn't a Story is measured without a content identity", async ({ page }) => {
    const google = await watch(page);
    await page.goto("/about/", { waitUntil: "load" });
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect.poll(() => google.length).toBe(1);
    const view = (await events(page, "page_view"))[0]![2];
    expect(view).not.toHaveProperty("content_id");
    expect(view).toMatchObject({ page_title: await page.title() });
  });
});
