import { expect, test, type Page } from '@playwright/test';

/**
 * A flagship visual story (fixture post 10, scaffolded with --visual): the
 * repository narrative replaces the WordPress body, is complete static HTML,
 * and its own client code enhances it on its own page only.
 */
const visualStory = '/2026/08/10/news/weekly-wildcat-visual-story-fixture/';
const plainStory = '/2026/08/15/news/weekly-wildcat-browser-fixture-six/';
const sequence = (page: Page) => page.locator('.story-visual-fixture-sequence');
const steps = (page: Page) => page.locator('.story-visual-fixture-step');

/** Scroll so step `index` covers the reading line 40% down the viewport. */
async function readStep(page: Page, index: number) {
  await steps(page).nth(index).evaluate((step) => {
    const line = window.innerHeight * 0.4;
    window.scrollTo({ top: step.getBoundingClientRect().top + window.scrollY - line + 8, behavior: 'instant' });
  });
}

async function articleSchema(page: Page) {
  return JSON.parse((await page.locator('#newsarticle-json-ld').textContent())!) as Record<string, unknown>;
}

test('the narrative is complete static HTML in reading order, without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}${visualStory}`);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Weekly Wildcat visual story fixture');
  await expect(page.locator('.story-visual-fixture-narrative')).toContainText('Open with the reporting.');
  await expect(steps(page)).toHaveCount(3);
  for (const index of [0, 1, 2]) await expect(steps(page).nth(index)).toBeVisible();
  await expect(page.locator('.story-visual-fixture-graphic svg[role="img"] title')).toHaveText('First: 32, Second: 21, Third: 12');
  await expect(page.locator('body')).not.toContainText('WordPress text edition');
  await expect(sequence(page)).not.toHaveClass(/is-enhanced/);
  // Reading order: header, narrative, the standard footer and ending.
  const order = await page.locator('.article-header, .story-visual-fixture-narrative, .article-after').evaluateAll((nodes) => nodes.map((node) => node.className.split(' ').at(-1)));
  expect(order).toEqual(['article-header', 'story-visual-fixture-narrative', 'article-after']);
  await context.close();
});

test('the structured data does not claim the WordPress body the page does not show', async ({ page }) => {
  await page.goto(visualStory);
  const visual = await articleSchema(page);
  expect(visual.headline).toBe('Weekly Wildcat visual story fixture');
  expect(visual).not.toHaveProperty('articleBody');
  await page.goto(plainStory);
  expect(typeof (await articleSchema(page)).articleBody).toBe('string');
});

test('client.ts enhances the narrative as each step reaches the reading line, in both directions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(visualStory);
  await expect(sequence(page)).toHaveClass(/is-enhanced/);
  const highlighted = () => page.locator('.story-visual-fixture-bar.is-highlighted').getAttribute('data-index');

  for (const index of [0, 1, 2, 1]) {
    await readStep(page, index);
    await expect(steps(page).nth(index)).toHaveClass(/is-active/);
    await expect(page.locator('.story-visual-fixture-step.is-active')).toHaveCount(1);
    await expect.poll(highlighted).toBe(String(index));
  }

  // The graphic stays in view beside the steps: sticky, never scroll-jacked.
  await readStep(page, 2);
  const stage = page.locator('.story-visual-fixture-stage');
  const box = (await stage.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  expect(await stage.evaluate((node) => getComputedStyle(node).position)).toBe('sticky');
});

test('reduced motion keeps the enhancement without animating it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(visualStory);
  await expect(sequence(page)).toHaveClass(/is-enhanced/);
  const duration = await page.locator('.story-visual-fixture-bar rect').first().evaluate((rect) => getComputedStyle(rect).transitionDuration);
  expect(duration).toBe('0s');
});

test('a phone gets the same story with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(visualStory);
  await expect(sequence(page)).toHaveClass(/is-enhanced/);
  await readStep(page, 1);
  await expect(steps(page).nth(1)).toHaveClass(/is-active/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("the story's own code and CSS download on its page alone", async ({ page }) => {
  const scripts = new Map<string, string>();
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') scripts.set(response.url(), await response.text().catch(() => ''));
  });
  await page.goto(visualStory);
  await expect(sequence(page)).toHaveClass(/is-enhanced/);
  await page.waitForLoadState('networkidle');
  const storyChunks = [...scripts].filter(([, body]) => body.includes('story-visual-fixture-sequence')).map(([url]) => url);
  expect(storyChunks).toHaveLength(1);
  await expect(page.locator('style[data-story-presentation="visual-fixture"]')).toHaveCount(1);

  scripts.clear();
  await page.goto(plainStory);
  await page.waitForLoadState('networkidle');
  expect([...scripts.keys()].filter((url) => storyChunks.includes(url))).toEqual([]);
  expect([...scripts.values()].some((body) => body.includes('story-visual-fixture-sequence'))).toBe(false);
  await expect(page.locator('style[data-story-presentation], [data-visual-story]')).toHaveCount(0);
});
