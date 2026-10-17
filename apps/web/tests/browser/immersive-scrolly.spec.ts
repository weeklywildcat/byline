import { expect, test, type Page } from '@playwright/test';
import { openStory, routeStoryFixtures } from './story-fixtures';

/**
 * The stage follows a reading line: a step is active while it covers the line
 * `data-activation-line` percent from the top of the viewport. The tests derive
 * that line from the viewport and place steps relative to it; they never rely
 * on a magic scroll offset.
 */
const story = (page: Page) => page.locator('.byline-scrolly');
const stage = (page: Page) => story(page).locator('.byline-scrolly-stage');

/** Scroll (instantly) so step `index`'s top edge sits `offset` px below the reading line. */
async function placeStep(page: Page, index: number, offset: number) {
  await page.evaluate(async ({ index, offset }) => {
    const step = document.querySelectorAll('.byline-scrolly > .byline-scrolly-step')[index];
    const line = Number(document.querySelector<HTMLElement>('.byline-scrolly-stage')!.dataset.activationLine);
    const lineY = (window.innerHeight * line) / 100;
    window.scrollTo({ top: step.getBoundingClientRect().top + window.scrollY - (lineY + offset), behavior: 'instant' });
    // Two frames let layout and the observer deliver.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { index, offset });
  await page.waitForTimeout(80);
}
const lineY = (page: Page) => page.evaluate(() => (window.innerHeight * Number(document.querySelector<HTMLElement>('.byline-scrolly-stage')!.dataset.activationLine)) / 100);

async function open(page: Page, viewport = { width: 1200, height: 900 }) {
  await routeStoryFixtures(page);
  await page.setViewportSize(viewport);
  await openStory(page);
  await expect(story(page)).toHaveClass(/is-enhanced/);
}

test('the reading line is a fixed viewport position, not a visible-area contest', async ({ page }) => {
  await open(page);
  const line = Number(await stage(page).getAttribute('data-activation-line'));
  expect(line).toBeGreaterThanOrEqual(35); expect(line).toBeLessThanOrEqual(45);
});

test('steps change when they cross the reading line, downward and upward', async ({ page }) => {
  await open(page);
  await expect(stage(page)).toHaveAttribute('data-step', '0');
  await expect(stage(page).locator('img')).toHaveAttribute('src', /landscape\.svg/);
  await expect(stage(page).locator('.byline-scrolly-stage-caption')).toHaveText('The first scene. Photo: Staff');

  // Step 1 is still below the line: the long first step keeps the stage.
  await placeStep(page, 1, 40);
  await expect(stage(page)).toHaveAttribute('data-step', '0');
  // Crossing the line changes the stage at once.
  await placeStep(page, 1, -20);
  await expect(stage(page)).toHaveAttribute('data-step', '1');
  await expect(stage(page).locator('img')).toHaveAttribute('src', /landscape-after\.svg/);
  await expect(stage(page).locator('.byline-scrolly-stage-caption')).toHaveText('The second scene. Photo: Staff');

  await placeStep(page, 2, 40);
  await expect(stage(page)).toHaveAttribute('data-step', '1');
  await placeStep(page, 2, -20);
  await expect(stage(page)).toHaveAttribute('data-step', '2');
  await expect(stage(page).locator('img')).toHaveAttribute('src', /panorama\.svg/);
  await expect(stage(page).locator('.byline-scrolly-stage-caption')).toHaveText('The third scene. Photo: Staff');

  // Upward: step 2 sinks below the line, step 1 covers it again, then step 0.
  await placeStep(page, 2, 40);
  await expect(stage(page)).toHaveAttribute('data-step', '1');
  await placeStep(page, 1, 40);
  await expect(stage(page)).toHaveAttribute('data-step', '0');
  await expect(stage(page).locator('.byline-scrolly-stage-caption')).toHaveText('The first scene. Photo: Staff');
});

test('large jumps select the step under the line', async ({ page }) => {
  await open(page);
  await placeStep(page, 2, -10);
  await expect(stage(page)).toHaveAttribute('data-step', '2');
  await placeStep(page, 0, -10);
  await expect(stage(page)).toHaveAttribute('data-step', '0');
  await placeStep(page, 2, -10);
  await expect(stage(page)).toHaveAttribute('data-step', '2');
  // The line is also honoured when a step is entered from its middle.
  const middle = await page.evaluate(() => {
    const step = document.querySelectorAll('.byline-scrolly > .byline-scrolly-step')[1].getBoundingClientRect();
    return { top: step.top + window.scrollY, height: step.height };
  });
  await page.evaluate(({ top, height, line }) => window.scrollTo({ top: top + height / 2 - line, behavior: 'instant' }), { ...middle, line: await lineY(page) });
  await expect(stage(page)).toHaveAttribute('data-step', '1');
});

test('loading partway down the story selects the step under the line', async ({ page }) => {
  await open(page);
  await placeStep(page, 1, -30);
  await page.reload();
  await expect(story(page)).toHaveClass(/is-enhanced/);
  await expect.poll(async () => { await page.waitForTimeout(100); return stage(page).getAttribute('data-step'); }).toBe('1');
});

test('the stage is sticky, decorative and duplicates, never replaces, the source story', async ({ page }) => {
  await open(page);
  await placeStep(page, 1, -20);
  await expect(stage(page)).toHaveCSS('position', 'sticky');
  await expect(stage(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(stage(page).locator('img')).toHaveAttribute('alt', '');
  // It stays pinned while the story scrolls.
  const top = await stage(page).evaluate((node) => node.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(99); expect(top).toBeLessThanOrEqual(101);
  // The linear story is untouched: every step, heading, text and source image remains in order.
  const steps = story(page).locator(':scope > .byline-scrolly-step');
  await expect(steps).toHaveCount(3);
  await expect(steps.locator('h2')).toHaveText(['Arriving on campus', 'The next scene', 'The last scene']);
  await expect(steps.locator('.byline-scrolly-text p')).toHaveText(['The original entrance anchors the reporting.', 'The renovation changes the public space.', 'The panorama shows how the pieces fit together.']);
  const sources = await steps.locator('.byline-scrolly-media img').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), width: image.getAttribute('width'), height: image.getAttribute('height'), complete: (image as HTMLImageElement).naturalWidth > 0 })));
  expect(sources.map((source) => source.src?.split('/').pop())).toEqual(['landscape.svg', 'landscape-after.svg', 'panorama.svg']);
  expect(sources.every((source) => source.complete && source.width && source.height)).toBe(true);
  // The stage image carries the active step's source attributes.
  const active = await stage(page).locator('img').evaluate((image) => ({ src: image.getAttribute('src'), width: image.getAttribute('width'), height: image.getAttribute('height') }));
  expect(active).toEqual({ src: sources[1].src, width: sources[1].width, height: sources[1].height });
  // Source images and captions stay in the accessibility tree (clipped, not hidden).
  await expect(steps.nth(1).locator('.byline-scrolly-media')).not.toHaveAttribute('aria-hidden', /.*/);
  await expect(steps.nth(1).locator('.byline-scrolly-media figcaption')).toContainText('The second scene.');
  // No animation library or scroll-jacking: ordinary wheel scrolling moves the document by the wheel distance.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(600, 450); await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 60);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
});

test('narrow viewports, reduced motion and wide screens switch between stage and linear story', async ({ page }) => {
  await open(page);
  await placeStep(page, 1, -20);
  await expect(stage(page)).toHaveAttribute('data-step', '1');

  await page.setViewportSize({ width: 899, height: 900 });
  await expect(stage(page)).toHaveCount(0);
  await expect(story(page)).not.toHaveClass(/is-enhanced/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage(page)).toHaveCount(0);
  await expect(story(page).locator('.byline-scrolly-step img')).toHaveCount(3);
  const hiddenMedia = await story(page).locator('.byline-scrolly-media').evaluateAll((nodes) => nodes.every((node) => { const box = node.getBoundingClientRect(); return box.width > 100 && box.height > 50; }));
  expect(hiddenMedia).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(stage(page)).toHaveCount(1);
  await expect(story(page)).toHaveClass(/is-enhanced/);
  // The restored stage reflects the reader's position, not a stale step.
  await placeStep(page, 1, -20);
  await expect(stage(page)).toHaveAttribute('data-step', '1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage(page)).toHaveCount(0);
  await expect(story(page)).not.toHaveClass(/is-enhanced/);
  await expect(story(page).locator(':scope > .byline-scrolly-step')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(stage(page)).toHaveCount(1);
  await placeStep(page, 2, -20);
  await expect(stage(page)).toHaveAttribute('data-step', '2');
});

test('exactly one stage exists and cleanup-safe reinitialisation keeps the story linear', async ({ page }) => {
  await open(page);
  for (const [width, height] of [[1000, 900], [800, 900], [1300, 900], [850, 900], [1100, 900]] as const) await page.setViewportSize({ width, height });
  await expect(stage(page)).toHaveCount(1);
  await expect(story(page).locator(':scope > .byline-scrolly-step')).toHaveCount(3);
});
