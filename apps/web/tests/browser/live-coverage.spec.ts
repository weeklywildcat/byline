import { readFileSync } from "node:fs";
import path from "node:path";
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
    await page.route('**/_byline/live/9.json', (route) => {
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

test("a running Payload story reads the newsroom directly and loads an undeployed photo from it", async ({ page }) => {
  // The fixture's live story is a legacy post, so mark it the way a Payload story is rendered before the script runs.
  const SOURCE = "https://newsroom.test/api/byline/live/9";
  await page.addInitScript((source) => {
    new MutationObserver((_, observer) => {
      const live = document.querySelector<HTMLElement>("[data-byline-live]");
      if (!live) return;
      Object.assign(live.dataset, { source, locale: "en-US", timeZone: "America/New_York" });
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  }, SOURCE);
  const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/weekly-wildcat-content.json"), "utf8")) as { posts: Array<{ id: number; live?: { updates: unknown[] } }> };
  const coverage = fixture.posts.find((post) => post.id === 9)!.live!;
  const photo = "/_byline/media/images/aa/live-904--1600--0123456789abcdef.jpg";
  const fresh = { id: 904, title: "Kickoff", html: "<p>We are underway.</p>", date: "2026-08-15T14:12:00Z", modified: "2026-08-15T14:12:00Z", pinned: false, author: "Weekly Wildcat Staff", authorSlug: "weekly-wildcat-staff", image: { url: photo, alt: "The opening kickoff", width: 640, height: 427 } };
  let withFresh = false;
  const cors = { "Access-Control-Allow-Origin": "*" };
  let sourcePolls = 0;
  await page.route(SOURCE, (route) => (sourcePolls++, route.fulfill({ headers: cors, json: withFresh ? { ...coverage, updates: [fresh, ...coverage.updates] } : coverage })));
  const served: string[] = [];
  await page.route(`${SOURCE}/media?*`, (route) => {
    served.push(new URL(route.request().url()).searchParams.get("path") ?? "");
    return route.fulfill({ headers: { ...cors, "Content-Type": "image/jpeg" }, body: readFileSync(path.resolve(__dirname, "../../public/newsroom/newsroom-laughing-640.jpg")) });
  });
  let staticPolls = 0;
  await page.route("**/_byline/live/9.json", (route) => { staticPolls++; return route.continue(); });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  // The page opens already behind the newsroom: the fresh update is in the feed, not in the build.
  withFresh = true;
  await page.goto(ARTICLE);
  await expect(page.locator("time[data-live-updated]")).toHaveAttribute("data-live-absolute", /Aug/);

  // The first check is on arrival and applies quietly: no button, the update and its photo are just there.
  await expect.poll(() => sourcePolls).toBe(1);
  await expect(page.locator("#update-904")).toHaveCount(1);
  await expect(page.locator(".article-live-new")).toHaveAttribute("hidden");
  const image = page.locator("#update-904 .article-live-update-image img");
  await expect(image).toHaveAttribute("src", `${SOURCE}/media?path=${encodeURIComponent(photo)}`);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth)).toBeGreaterThan(0);

  // Later changes wait behind the button, as before.
  const another = { ...fresh, id: 905, title: "Halftime", image: null };
  await page.unroute(SOURCE);
  await page.route(SOURCE, (route) => (sourcePolls++, route.fulfill({ headers: cors, json: { ...coverage, updates: [another, fresh, ...coverage.updates] } })));
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("button", { name: "1 new update", exact: true })).toBeVisible();
  await expect(page.locator("#update-905")).toHaveCount(0);
  expect(served).toEqual([photo]);
  expect(staticPolls).toBe(0);
  expect(errors).toEqual([]);
});

test("ordinary articles do not download or run the live enhancement", async ({ page }) => {
  const liveRequests: string[] = [];
  page.on('request', (request) => { if (/live-updates|\/api\/byline\/live\//.test(request.url())) liveRequests.push(request.url()); });
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
