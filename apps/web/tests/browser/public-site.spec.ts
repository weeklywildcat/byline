import { expect, test, type Browser, type Page } from "@playwright/test";

const ARTICLE_PATH = "/2026/08/20/news/weekly-wildcat-fixture-story/";
const PUBLIC_ORIGIN = process.env.BYLINE_BROWSER_ORIGIN || `http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || "4173"}`;

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    const sourceUrl = message.location().url;
    // Chromium only reports NotSameOrigin for a cross-origin request that the
    // other site's Cross-Origin-Resource-Policy refused, so it can never come
    // from a resource this site serves. In the fixture build that is the
    // third-party analytics script's follow-on requests, which succeed or are
    // blocked depending on the network the run happens to have.
    const isBlockedThirdPartyRequest = message.text().includes("ERR_BLOCKED_BY_RESPONSE.NotSameOrigin");
    const isExpectedFixtureNetworkNoise =
      sourceUrl.includes("clarity.ms/tag/") ||
      sourceUrl.endsWith("/api/polls/active") ||
      isBlockedThirdPartyRequest;

    // The static fixture server intentionally does not emulate the Cloudflare
    // poll proxy, and the fixture's third-party analytics script is not part
    // of this browser contract. Keep those known network failures out of the
    // uncaught-error signal while still failing on application errors and
    // unexpected missing local resources.
    if (message.type() === "error" && !isExpectedFixtureNetworkNoise) {
      errors.push(`console.error: ${message.text()}`);
    }
  });

  return errors;
}

async function expectNoBrowserErrors(errors: string[]) {
  expect(errors, errors.join("\n")).toEqual([]);
}

async function openWithoutJavaScript(browser: Browser, route: string) {
  const context = await browser.newContext({
    baseURL: PUBLIC_ORIGIN,
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  await page.goto(route, { waitUntil: "domcontentloaded" });

  return { context, page };
}

test.describe("public Astro site", () => {
  test("desktop homepage keeps the lead above the Latest ribbon", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator("[data-homepage-top-stories]")).toBeVisible();
    await expect(page.locator(".live-lead")).toContainText("Weekly Wildcat fixture story");
    await expect(page.locator(".top-stories-left-rail")).toHaveCount(0);
    await expect(page.locator(".top-stories-rail")).toBeVisible();
    await expect(page.locator(".right-now-list .home-story")).toHaveCount(1);

    const layout = page.locator("[data-homepage-top-stories]");
    const directChildren = await layout.locator(":scope > *").evaluateAll((elements) => elements.map((element) => ({
      className: element.className,
      tagName: element.tagName
    })));
    expect(directChildren[0]?.className).toContain("live-lead");
    expect(directChildren.filter((child) => child.className.includes("live-lead"))).toHaveLength(1);
    expect(directChildren.some((child) => child.tagName === "ASTRO-ISLAND")).toBe(false);

    const lead = await page.locator(".live-lead").boundingBox();
    const latest = await page.locator(".top-stories-rail").boundingBox();

    expect(lead).toBeTruthy();
    expect(latest).toBeTruthy();
    expect(latest!.y).toBeGreaterThanOrEqual(lead!.y + lead!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await expectNoBrowserErrors(errors);
  });

  test.describe("homepage mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("stacks the primary content without horizontal overflow", async ({ page }) => {
      const errors = collectBrowserErrors(page);
      const response = await page.goto("/", { waitUntil: "domcontentloaded" });

      expect(response?.status()).toBe(200);
      await expect(page.locator(".live-lead .home-story-lead h2 a")).toBeVisible();
      await expect(page.locator(".top-stories-rail")).toBeVisible();
      await expect(page.locator(".top-stories-left-rail")).toHaveCount(0);

      const positions = await page.locator("[data-homepage-top-stories] > .live-lead, [data-homepage-top-stories] > .top-stories-rail").evaluateAll((elements) =>
        elements.map((element) => ({
          className: element.className,
          top: element.getBoundingClientRect().top
        }))
      );
      expect(positions.map((entry) => entry.className)).toEqual([
        "live-lead",
        "top-stories-rail"
      ]);
      expect(positions[0].top).toBeLessThanOrEqual(positions[1].top);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await expectNoBrowserErrors(errors);
    });
  });

  test("article renders static content and hydrates its interactive islands", async ({ browser, page }) => {
    const errors = collectBrowserErrors(page);
    const response = await page.goto(ARTICLE_PATH, { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    await expect(page.locator("article h1")).toContainText("Weekly Wildcat fixture story");
    await expect(page.locator(".article-story")).toContainText("A deterministic story used to validate the static Weekly Wildcat build.");

    const articleSchema = await page.locator("#newsarticle-json-ld").textContent();
    expect(JSON.parse(articleSchema || "{}"), "NewsArticle JSON-LD should be valid JSON").toMatchObject({
      "@type": "NewsArticle"
    });
    await expect(page.locator(".article-share-actions button")).toHaveCount(2);
    await expect(page.locator(".article-newsletter-signup")).toBeVisible();
    await expect(page.locator(".reader-feedback")).toBeVisible();
    await expectNoBrowserErrors(errors);

    const noJs = await openWithoutJavaScript(browser, ARTICLE_PATH);
    try {
      await expect(noJs.page.locator("article h1")).toContainText("Weekly Wildcat fixture story");
      await expect(noJs.page.locator(".article-story")).toContainText("A deterministic story used to validate the static Weekly Wildcat build.");
      await expect(noJs.page.locator("#newsarticle-json-ld")).toHaveCount(1);
    } finally {
      await noJs.context.close();
    }
  });

  test("category pages render story links with JavaScript disabled", async ({ browser }) => {
    const noJs = await openWithoutJavaScript(browser, "/category/news/");
    try {
      expect(await noJs.page.title()).toContain("News");
      await expect(noJs.page.locator("main")).toContainText("News");
      expect(await noJs.page.locator('main a[href^="/2026/"]').count()).toBeGreaterThan(0);
    } finally {
      await noJs.context.close();
    }
  });

  test("search updates results and preserves browser history state", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const response = await page.goto("/search/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    const searchInput = page.locator("#search-query");
    await expect(searchInput).toBeVisible();
    await expect(page.locator(".search-result").first()).toBeVisible();

    await searchInput.fill("latest fixture");
    await expect.poll(() => page.locator(".search-result").count()).toBe(1);
    await expect(page.locator(".search-result h3")).toContainText("Weekly Wildcat latest fixture story");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("latest fixture");

    await page.getByRole("button", { name: "Stories", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("type")).toBe("story");
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("type")).toBeNull();
    await expect(searchInput).toHaveValue("latest fixture");
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("type")).toBe("story");

    await expectNoBrowserErrors(errors);
  });

  test("sports records are normal static Pages, including with JavaScript disabled", async ({ page, browser }) => {
    const response = await page.goto("/sports-archive/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sports Archive", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View Football records" }).click();
    await expect(page.getByRole("heading", { name: "Football Archive", exact: true })).toBeVisible();
    await expect(page.locator(".static-page-content")).toContainText("Wildcats 0");
    await expect(page.locator(".static-page-content")).toContainText("Football JV");
    await expect(page.locator("table").filter({ hasText: "Head coach" })).toBeVisible();
    await page.goto("/sports/football-varsity/2025-26/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/sports-archive-football-2\/#season-2025-26$/);
    await page.goto("/search/?q=Coach&type=archive", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".search-result")).toContainText("Football Archive");
    const noJs = await openWithoutJavaScript(browser, "/sports-archive-football-2/");
    try {
      await expect(noJs.page.locator(".static-page-content")).toContainText("Wildcats 0");
      await expect(noJs.page.getByRole("heading", { name: "Football Archive", exact: true })).toBeVisible();
    } finally {
      await noJs.context.close();
    }
  });

  test("renders the public 404 page", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("Page not found");
  });
});
