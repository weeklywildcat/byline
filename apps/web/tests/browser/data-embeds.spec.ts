import { expect, test, type Page } from "@playwright/test";

/**
 * Byline Data Projects inside a Story (docs/byline-data.md#story-embeds), on
 * the built static site. These specs need the offline-snapshot fixture build,
 * not the browser fixture the rest of the suite uses:
 *
 *   npm run build:data-embed-fixture --workspace @byline/web
 *   npm run test:browser:data-embeds --workspace @byline/web
 *
 * The story places a custom presentation (with client code), a ranking
 * template, and the custom project a second time.
 */
const SENTINEL = "PRIVATE-DATA-FIXTURE-SENTINEL";
const STORY = "/2026/11/10/news/where-the-sidewalk-stands/";
const PLAIN = "/2026/11/10/news/how-the-bands-ranked/";
const embeds = (page: Page) => page.locator("[data-data-embed]");

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("each embed is complete server-rendered HTML with the story's own words", async ({ page }) => {
    await page.goto(STORY);
    await expect(embeds(page)).toHaveCount(3);
    await expect(embeds(page).getByRole("heading", { level: 2, name: "Where the sidewalk project stands" })).toBeVisible();
    await expect(page.getByText("Two of five phases are done; the crossing at Greenwood High is next.")).toBeVisible();
    await expect(page.getByText("2 of 5 phases done")).toHaveCount(2);
    await expect(page.getByLabel("Tied for 1")).toHaveCount(2);
    await expect(embeds(page).getByRole("heading", { level: 2, name: "How the bands ranked" })).toBeVisible();
    await expect(embeds(page).getByRole("heading", { level: 2, name: "The same project, a second time" })).toBeVisible();
    // The standalone page's frame stays on /data/<slug>/.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "About this data" })).toHaveCount(0);
    // The enhancement is absent and nothing is missing without it.
    await expect(page.getByLabel("Show only what is left")).toHaveCount(0);
    expect(await page.content()).not.toContain(SENTINEL);
  });

  test("source, update time and the full-project link are in the HTML", async ({ page }) => {
    await page.goto(STORY);
    const first = embeds(page).first();
    await expect(first.getByText("Greenwood city engineering department; Weekly Wildcat reporting.")).toBeVisible();
    await expect(first.getByText("Data updated")).toBeVisible();
    await expect(first.getByRole("link", { name: /View full data project/ })).toHaveAttribute("href", "/data/main-street-sidewalk/");
    await expect(embeds(page).nth(1).getByRole("link", { name: /View full data project/ })).toHaveAttribute("href", "/data/marching-band-rankings/");
  });
});

test("with JavaScript, every embed of a client presentation enhances on its own", async ({ page }) => {
  await page.goto(STORY);
  const sidewalk = page.locator('[data-data-embed][data-data-presentation="fixture-sidewalk-project"]');
  await expect(sidewalk).toHaveCount(2);
  await expect(sidewalk.first().getByLabel("Show only what is left")).toBeVisible();
  await expect(sidewalk.nth(1).getByLabel("Show only what is left")).toBeVisible();
  const visible = (index: number) => sidewalk.nth(index).getByRole("list", { name: "Main Street sidewalk project: phases" }).getByRole("listitem").filter({ visible: true });
  await sidewalk.first().getByLabel("Show only what is left").check();
  await expect(visible(0)).toHaveCount(3);
  // The second embed of the same project is untouched.
  await expect(visible(1)).toHaveCount(5);
  await sidewalk.nth(1).getByLabel("Show only what is left").check();
  await expect(visible(1)).toHaveCount(3);
  // The template without client code gains no controls.
  await expect(page.locator('[data-data-embed][data-data-presentation="ranking"]').getByRole("checkbox")).toHaveCount(0);
});

test("a story with no client presentation downloads no Data code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await page.goto(PLAIN);
  await expect(embeds(page)).toHaveCount(2);
  await expect(page.getByLabel("Tied for 1")).toHaveCount(2);
  await page.waitForLoadState("networkidle");
  expect(await page.locator("style[data-data-presentation-styles='fixture-sidewalk-project']").count()).toBe(0);
  const withClient = [] as string[];
  page.removeAllListeners("request");
  page.on("request", (request) => { if (request.resourceType() === "script") withClient.push(request.url()); });
  await page.goto(STORY);
  await expect(page.getByLabel("Show only what is left").first()).toBeVisible();
  // The story that declares client code downloads strictly more script: the loader and that presentation's own chunk.
  expect(withClient.length).toBeGreaterThan(scripts.length);
  expect(withClient.filter((url) => !scripts.includes(url)).length).toBeGreaterThanOrEqual(1);
});

/** Every heading inside an embed, as [level, text], in document order. */
async function headings(page: Page, index: number) {
  return embeds(page).nth(index).evaluate((embed) => [...embed.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) => [Number(node.tagName[1]), node.textContent ?? ""] as const));
}

for (const javaScriptEnabled of [false, true]) {
  test.describe(`heading hierarchy (JavaScript ${javaScriptEnabled ? "on" : "off"})`, () => {
    test.use({ javaScriptEnabled });

    test("a Timeline in a story sits under the story's heading: h2, then h3 years, then h4 entries", async ({ page }) => {
      await page.goto(PLAIN);
      const timeline = (await headings(page, 1)).map(([level]) => level);
      expect(timeline[0]).toBe(2);
      expect(timeline.filter((level) => level === 2)).toHaveLength(1);
      expect(timeline).toContain(3);
      expect(timeline).toContain(4);
      expect(Math.max(...timeline)).toBe(4);
      // The ranking embed above it keeps its own, untouched outline.
      expect((await headings(page, 0)).map(([level]) => level)).toEqual([2]);
      // The page's single h1 is the story's; the outline never skips a level in any embed.
      expect(await page.locator("h1").count()).toBe(1);
      for (const level of [timeline]) level.forEach((value, i) => { if (i) expect(value - level[i - 1]!).toBeLessThanOrEqual(1); });
    });

    test("the same Timeline on its own page stays h1, h2, h3", async ({ page }) => {
      await page.goto("/data/sidewalk-timeline/");
      const levels = await page.evaluate(() => [...document.querySelectorAll("main h1, main h2, main h3, main h4")].map((node) => Number(node.tagName[1])));
      expect(levels[0]).toBe(1);
      expect(levels).toContain(2);
      expect(levels).toContain(3);
      expect(levels).not.toContain(4);
    });
  });
}

test("each presentation's CSS is printed once, however many embeds use it", async ({ page }) => {
  await page.goto(STORY);
  expect(await page.locator("style[data-data-presentation-styles='fixture-sidewalk-project']").count()).toBe(1);
  expect(await page.locator("style[data-data-presentation-styles='ranking']").count()).toBe(1);
  expect(await page.locator("style[data-data-embed-styles]").count()).toBe(1);
});

for (const [name, width, height] of [["desktop", 1280, 900], ["phone", 390, 844]] as const) {
  test(`fits the ${name} width with no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(STORY);
    await expect(embeds(page)).toHaveCount(3);
    await noHorizontalOverflow(page);
    for (const embed of await embeds(page).all()) {
      const box = await embed.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
  });
}

test("the full project link goes to the project's own page", async ({ page }) => {
  await page.goto(STORY);
  await embeds(page).first().getByRole("link", { name: /View full data project/ }).click();
  await expect(page).toHaveURL(/\/data\/main-street-sidewalk\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Main Street sidewalk project" })).toBeVisible();
});

test("nothing private is served", async ({ page, request }) => {
  const html = await (await request.get(STORY)).text();
  expect(html).not.toContain(SENTINEL);
  for (const sha of ["b179d85a66fa98dca343f7e8cfe8f6dc91dcce3938be847daa84d200963b1aea", "746828e7952ddb4cf442c9f810c636850727c407909bce3161538e321143716a"]) {
    const response = await request.get(`/_byline/data/${sha}.json`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain(SENTINEL);
  }
  void page;
});
