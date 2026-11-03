import { expect, test } from "@playwright/test";

const ARTICLE = "/2026/08/15/news/weekly-wildcat-browser-fixture-six/";
const STATIC_FEED = "/_byline/live/9.json";

test("the permanent archive and pinned permalink are complete without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(new URL(ARTICLE, test.info().project.use.baseURL).href);
    await expect(page.locator(".article-live-updates [data-update-id]")).toHaveCount(3);
    await expect(page.locator("#update-902 time")).toHaveAttribute("datetime", "2026-08-15T13:05:00.000Z");
    await expect(page.locator("#update-903 .article-live-update-name a")).toHaveAttribute("href", "/author/weekly-wildcat-staff/");
    await expect(page.locator("#update-903 img.article-live-update-avatar")).toBeVisible();
    await expect(page.locator("#update-901")).toContainText("Fixture Reporter");
    await expect(page.locator(".article-live-key-points")).toContainText("Bring a clear bag.");
    const feed = await (await request.get(STATIC_FEED)).json();
    expect(feed.updates.map((update: { id: number }) => update.id)).toEqual([903, 902, 901]);
    const schema = JSON.parse(await page.locator("#newsarticle-json-ld").textContent() ?? "{}");
    expect(schema["@type"]).toEqual(["NewsArticle", "LiveBlogPosting"]);
  } finally { await context.close(); }
});

for (const width of [390, 1280]) {
  test(`live updates wait for the reader and end quietly at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    const feed = await (await request.get(STATIC_FEED)).json();
    const update = { id: 904, html: '<article class="article-live-update" id="update-904" data-update-id="904"><header><time datetime="2026-08-15T14:12:00Z" data-live-relative>Aug 15, 10:12 AM</time></header><h3>New from the field</h3><p>A fresh update between static builds.</p></article>' };
    let polls = 0;
    let ended = false;
    await page.route('**/api/live/9', (route) => {
      polls++;
      return route.fulfill({ json: { ...feed, status: ended ? "ended" : "live", endedLabel: ended ? "Aug 15, 10:15 AM" : null, updates: [...(ended ? [{ id: 905, html: '<article class="article-live-update" id="update-905" data-update-id="905"><p>Final update.</p></article>' }] : []), update, ...feed.updates] } });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(ARTICLE);
    await expect(page.locator('[data-byline-live]')).toBeVisible();
    // Wait for the dynamic enhancement to install its timer before moving the clock.
    await expect(page.locator('time[data-live-updated]')).toHaveAttribute('data-live-absolute', /Aug/);
    await page.locator('#update-901').scrollIntoViewIfNeeded();
    const before = await page.locator('#update-901').boundingBox();
    await page.clock.fastForward(15_000);
    await expect(page.getByRole('button', { name: '1 new update', exact: true })).toBeVisible();
    await expect(page.locator('#update-904')).toHaveCount(0);
    const after = await page.locator('#update-901').boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: '1 new update', exact: true }).click();
    await expect(page.locator('#update-904')).toBeFocused();
    await expect(page.locator('.article-live-updates [data-update-id]')).toHaveCount(4);
    await page.clock.fastForward(15_000);
    await expect(page.locator('.article-live-new')).toHaveAttribute('hidden');
    await page.locator('#update-901').scrollIntoViewIfNeeded();
    const beforeEnd = await page.locator('#update-901').boundingBox();
    ended = true;
    await page.clock.fastForward(15_000);
    await expect(page.locator('[data-byline-live]')).toHaveAttribute('data-status', 'ended');
    await expect(page.locator('.article-live-badge')).toHaveCount(0);
    await expect(page.locator('#update-905')).toHaveCount(0);
    const afterEnd = await page.locator('#update-901').boundingBox();
    expect(Math.abs(afterEnd!.y - beforeEnd!.y)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: '1 new update', exact: true }).click();
    await expect(page.locator('#update-905')).toBeFocused();
    await expect(page.locator('.article-live-updates [data-update-id]')).toHaveCount(5);
    const finalPolls = polls;
    await page.clock.fastForward(120_000);
    expect(polls).toBe(finalPolls);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("ordinary articles do not download or run the live enhancement", async ({ page }) => {
  const liveRequests: string[] = [];
  page.on('request', (request) => { if (/live-updates|\/api\/live\//.test(request.url())) liveRequests.push(request.url()); });
  await page.goto('/2026/08/20/news/weekly-wildcat-fixture-story/');
  await expect(page.locator('article h1')).toBeVisible();
  expect(liveRequests).toEqual([]);
});

for (const width of [320, 768, 1280]) {
  test(`live reporting keeps a readable newspaper layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ARTICLE);
    await page.evaluate(() => document.fonts.ready);
    const update = page.locator('#update-903');
    const time = await update.locator('.article-live-update-time').boundingBox();
    const author = await update.locator('.article-live-update-author').boundingBox();
    const body = await update.locator('.article-live-update-body').boundingBox();
    expect(author!.y).toBeGreaterThanOrEqual(time!.y + time!.height);
    expect(body!.y - (author!.y + author!.height)).toBeGreaterThanOrEqual(20);
    const typography = await update.locator('.article-live-update-body').evaluate((node) => {
      const style = getComputedStyle(node);
      return { family: style.fontFamily, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
    });
    expect(typography.family).toContain('Newsreader');
    expect(typography.size).toBeGreaterThanOrEqual(20);
    expect(typography.lineHeight / typography.size).toBeGreaterThanOrEqual(1.5);
    const first = await update.boundingBox();
    const second = await page.locator('#update-902').boundingBox();
    expect(second!.y - (body!.y + body!.height)).toBeGreaterThanOrEqual(28);
    expect(first!.width).toBeLessThanOrEqual(760);
    await update.locator('.article-live-update-body').evaluate((node) => {
      const link = document.createElement('a');
      link.href = 'https://example.test/';
      link.textContent = `https://example.test/${'long-reporting-link-'.repeat(15)}`;
      node.append(link);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
