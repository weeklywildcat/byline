import { expect, test } from "@playwright/test";

/**
 * Byline Data on the static site (docs/byline-data.md): a project page is
 * complete without JavaScript, its optional client code only enhances it, a
 * presentation's CSS and JS load on its page alone, the release bytes the
 * client may read are the exact public ones, and nothing private is served.
 * Build first: BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture npm run build:frontend
 */
const SENTINEL = "PRIVATE-DATA-FIXTURE-SENTINEL";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the custom presentation is meaningful server-rendered HTML", async ({ page }) => {
    await page.goto("/data/main-street-sidewalk/");
    await expect(page.getByRole("heading", { level: 1, name: "Main Street sidewalk project" })).toBeVisible();
    await expect(page.getByText("2 of 5 phases done")).toBeVisible();
    await expect(page.getByRole("list", { name: "Main Street sidewalk project: phases" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByText("Greenwood High crossing")).toBeVisible();
    await expect(page.getByRole("heading", { name: "About this data" })).toBeVisible();
    // The enhancement is not there, and nothing is missing without it.
    await expect(page.getByLabel("Show only what is left")).toHaveCount(0);
    expect(await page.content()).not.toContain(SENTINEL);
  });

  test("templates render from the same releases", async ({ page }) => {
    await page.goto("/data/marching-band-rankings/");
    await expect(page.getByLabel("Tied for 1")).toHaveCount(2);
    await page.goto("/data/sidewalk-timeline/");
    await expect(page.getByRole("heading", { level: 2, name: "2025" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test("the custom presentation's client filter enhances the page and loads only there", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await page.goto("/data/main-street-sidewalk/");
  const filter = page.getByLabel("Show only what is left");
  await expect(filter).toBeVisible();
  await filter.check();
  await expect(page.getByRole("list", { name: "Main Street sidewalk project: phases" }).getByRole("listitem").filter({ visible: true })).toHaveCount(3);
  await filter.press("Space");
  await expect(page.getByRole("list", { name: "Main Street sidewalk project: phases" }).getByRole("listitem").filter({ visible: true })).toHaveCount(5);
  expect(await page.locator("style[data-data-presentation-styles='fixture-sidewalk-project']").count()).toBe(1);

  // A template without client code downloads no presentation chunk.
  const before = scripts.length;
  await page.goto("/data/marching-band-rankings/");
  await expect(page.getByLabel("Tied for 1").first()).toBeVisible();
  expect(scripts.slice(before).some((url) => /client/i.test(url) && /fixture-sidewalk|ranking/.test(url))).toBe(false);
  expect(await page.locator("style[data-data-presentation-styles='fixture-sidewalk-project']").count()).toBe(0);
});

test("the index lists projects, and the public release bytes carry no private data", async ({ page, request }) => {
  await page.goto("/data/");
  await expect(page.getByRole("link", { name: "Marching band rankings" })).toBeVisible();
  const release = await page.goto("/data/main-street-sidewalk/").then(() => page.locator("[data-data-releases]").getAttribute("data-data-releases"));
  const path = JSON.parse(release ?? "{}").phases as string;
  expect(path).toMatch(/^\/_byline\/data\/[0-9a-f]{64}\.json$/);
  const response = await request.get(path);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).toContain("Greenwood High crossing");
  expect(text).not.toContain(SENTINEL);
  expect(text).not.toContain("city_contact");
});

test("a phone gets the page without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data/main-street-sidewalk/");
  await expect(page.getByLabel("Show only what is left")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
