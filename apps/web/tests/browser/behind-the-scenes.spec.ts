import { expect, test } from "@playwright/test";

const TITLE = "Building the newsroom website";
const ARTICLE = "/2026/08/22/news/building-the-newsroom/";

for (const width of [390, 1280]) {
  test(`BTS archive and homepage placement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/off-deadline/");
    await expect(page.getByRole("heading", { level: 1, name: "Off Deadline" })).toBeVisible();
    // Three Off Deadline stories, the presentation-preset feature fixture and the six story-opening fixtures (the oldest).
    await expect(page.locator("main .story-teaser")).toHaveCount(10);
    await expect(page.locator("main .story-teaser").first()).toContainText(TITLE);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("index,follow");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("https://weeklywildcat.com/off-deadline/");
    const archiveOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(archiveOverflow).toBe(false);

    await page.goto("/");
    const section = page.getByRole("region", { name: "Off Deadline" });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("link", { name: TITLE })).toBeVisible();
    await expect(section.locator(".story-teaser")).toHaveCount(2);
    await expect(page.locator('main > section:not(.home-bts-section)').filter({ hasText: TITLE })).toHaveCount(0);
    const cards = await section.locator(".story-teaser").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      const body = element.querySelector(".story-teaser-body")!.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bodyY: body.y };
    }));
    if (width === 390) {
      expect(cards[1].y).toBeGreaterThan(cards[0].y);
      expect(Math.abs(cards[1].x - cards[0].x)).toBeLessThan(1);
    } else {
      expect(Math.abs(cards[1].y - cards[0].y)).toBeLessThan(1);
      expect(Math.abs(cards[1].bodyY - cards[0].bodyY)).toBeLessThan(1);
      expect(cards[1].x).toBeGreaterThan(cards[0].right);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/byline-bts-home-${width}.png`, fullPage: false });
  });
}

test("BTS articles remain discoverable through search, author profiles and Google metadata", async ({ page, request }) => {
  await page.goto(ARTICLE);
  await expect(page.locator("main")).toContainText(TITLE);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("index,follow");
  const authorHref = await page.locator('main a[href^="/author/"]').first().getAttribute("href");
  expect(authorHref).toBeTruthy();
  await page.goto(authorHref!);
  await expect(page.locator("main").getByRole("link", { name: TITLE })).toBeVisible();
  const index = await (await request.get("/_byline/search-index.json")).json();
  expect(index.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: TITLE, section: "behind-the-scenes", sectionLabel: "Off Deadline" })]));
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`https://weeklywildcat.com${ARTICLE}`);
  expect(sitemap).toContain("https://weeklywildcat.com/off-deadline/");
  expect(sitemap).not.toContain("<loc>https://weeklywildcat.com/category/behind-the-scenes/</loc>");
  for (const path of ["/stories/", "/category/news/", "/watch/", "/feed.xml"]) {
    const body = await (await request.get(path)).text();
    expect(body).not.toContain(TITLE);
    expect(body).not.toContain("Fixture video story");
  }
  expect(await (await request.get("/video-sitemap.xml")).text()).toContain("/weekly-wildcat-fixture-video/");
  for (const path of ["/behind-the-scenes/", "/category/behind-the-scenes/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/off-deadline\/$/);
  }
});
