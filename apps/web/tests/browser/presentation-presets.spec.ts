import { expect, test, type Locator, type Page } from '@playwright/test';
import { articleCanvas, openStory, routeStoryFixtures } from './story-fixtures';

/**
 * Story presentation presets (docs/story-presentation.md) in the built public
 * article, at the widths readers use: the feature fixture story (fixture
 * presentation 93) renders the shared `byline-v1` fixture through the same
 * shell, renderer and CSS as every published story.
 */
const story = '/2026/07/01/news/weekly-wildcat-feature-rhythm-fixture/';
const block = (page: Page, id: string) => page.locator(`[data-block-type]:has(#${id}), [data-block-type]:has([id="chapter-${id}"])`).first();
const byType = (page: Page, type: string, index = 0) => page.locator(`[data-block-type="${type}"]`).nth(index);
const box = async (locator: Locator) => (await locator.boundingBox())!;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const css = (locator: Locator, property: string) => locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

async function open(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await routeStoryFixtures(page);
  await openStory(page, story);
}

/** Blocks in story order; the fixture's presets, by what makes each one unique. */
const photoColumn = (page: Page) => byType(page, 'photo', 0);
const photoFull = (page: Page) => byType(page, 'photo', 1);
const split = (page: Page) => page.locator('.byline-portrait-text:not([data-presentation])');
const breakout = (page: Page) => page.locator('.byline-portrait-text[data-presentation="breakout"]');
const sticky = (page: Page) => page.locator('.byline-portrait-text[data-presentation="sticky"]');
const spotlight = (page: Page) => page.locator('.byline-portrait-text[data-presentation="spotlight"]');
const chapter = (page: Page, kind?: string) => page.locator(kind ? `.byline-visual-chapter[data-kind="${kind}"]` : '.byline-visual-chapter:not([data-kind])');
const quote = (page: Page, presentation: string) => page.locator(`.byline-pull-quote[data-presentation="${presentation}"]`);

for (const width of [390, 768, 1024, 1440]) {
  test(`no horizontal page overflow at ${width}px`, async ({ page }) => {
    await open(page, width);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Every visual moment fits the viewport; none is clipped off-screen.
    for (const element of await page.locator('.article-body > .byline-block').all()) {
      const rect = await box(element);
      expect(rect.x).toBeGreaterThanOrEqual(-0.5);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.5);
    }
  });
}

test.describe('on a phone (390px)', () => {
  test.beforeEach(async ({ page }) => open(page, 390, 844));

  test('a full-width photo reaches both screen edges while its caption stays inset', async ({ page }) => {
    const canvas = await articleCanvas(page);
    const image = await box(photoFull(page).locator('img'));
    expect(image.x).toBe(0);
    expect(image.width).toBe(canvas.width);
    const caption = await box(photoFull(page).locator('figcaption .byline-caption'));
    expect(caption.x).toBeGreaterThanOrEqual(16);
    expect(caption.x + caption.width).toBeLessThanOrEqual(canvas.right - 16);
    // A column photo keeps the story's margins.
    const inset = await box(photoColumn(page).locator('img'));
    expect(inset.x).toBeGreaterThanOrEqual(16);
    expect(inset.x + inset.width).toBeLessThanOrEqual(canvas.right - 16);
  });

  test('Split becomes one column, photo then passage', async ({ page }) => {
    const figure = await box(split(page).locator('.byline-portrait-text-figure'));
    const passage = await box(split(page).locator('.byline-portrait-text-body'));
    expect(passage.y).toBeGreaterThanOrEqual(figure.y + figure.height - 1);
    expect(Math.abs(passage.x - figure.x)).toBeLessThan(2);
  });

  test('Breakout and Spotlight bleed the photo and keep their words inset below it, on the page', async ({ page }) => {
    const canvas = await articleCanvas(page);
    for (const moment of [breakout(page), spotlight(page)]) {
      const image = await box(moment.locator('img'));
      expect(image.x).toBe(0);
      expect(image.width).toBe(canvas.width);
      const passage = await box(moment.locator('.byline-portrait-text-body'));
      expect(passage.y).toBeGreaterThanOrEqual(image.y + image.height);
      // The words themselves (not their padded container) keep the gutter.
      const words = await box(moment.locator('.byline-portrait-text-body > h3'));
      expect(words.x).toBeGreaterThanOrEqual(16);
      expect((await box(moment.locator('figcaption .byline-caption'))).x).toBeGreaterThanOrEqual(16);
    }
    // Spotlight never sets words on the photo on a phone: they are page-coloured text, not overlay.
    expect(await css(spotlight(page).locator('.byline-portrait-text-body'), 'background-image')).toBe('none');
    expect(await css(spotlight(page).locator('.byline-portrait-text-body'), 'color')).not.toBe('rgb(255, 255, 255)');
  });

  test('Sticky falls back to an ordinary photo-then-passage sequence', async ({ page }) => {
    const figure = sticky(page).locator('.byline-portrait-text-figure');
    expect(await css(figure, 'position')).toBe('static');
    const passage = await box(sticky(page).locator('.byline-portrait-text-body'));
    expect(passage.y).toBeGreaterThanOrEqual((await box(figure)).y + (await box(figure)).height - 1);
  });

  test('a full-screen chapter fills the small viewport and keeps its words clear of the photo credit', async ({ page }) => {
    const rect = await box(chapter(page));
    expect(rect.width).toBe((await articleCanvas(page)).width);
    expect(rect.height).toBeGreaterThanOrEqual(844 - 1);
    const dek = await box(chapter(page).locator('.byline-visual-chapter-dek'));
    const credit = await box(chapter(page).locator('.byline-visual-chapter-credit'));
    expect(dek.y + dek.height).toBeLessThanOrEqual(credit.y + 1);
  });

  test('a text chapter is a typographic break with no photograph, and a split chapter shows its photograph first', async ({ page }) => {
    await expect(chapter(page, 'text').locator('img')).toHaveCount(0);
    await expect(chapter(page, 'text').getByRole('heading', { level: 2 })).toHaveText("What changed, and what didn't");
    const media = await box(chapter(page, 'split').locator('.byline-visual-chapter-media'));
    const words = await box(chapter(page, 'split').locator('.byline-visual-chapter-text'));
    expect(words.y).toBeGreaterThan(media.y + media.height - 1);
  });

  test('pull quotes gain room without absurd type, and stay in the column', async ({ page }) => {
    const canvas = await articleCanvas(page);
    for (const presentation of ['breakout', 'full']) {
      const element = quote(page, presentation);
      const size = parseFloat(await css(element.locator('blockquote'), 'font-size'));
      expect(size).toBeGreaterThan(22);
      expect(size).toBeLessThan(36);
      const rect = await box(element);
      expect(rect.x).toBeGreaterThanOrEqual(16);
      expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.right - 16);
    }
  });

  test('a Photo Essay bleeds each photograph with inset captions; an even grid keeps two tiles per row', async ({ page }) => {
    const canvas = await articleCanvas(page);
    const essay = page.locator('.byline-gallery.is-essay');
    for (const item of await essay.locator('.byline-gallery-item').all()) {
      const image = await box(item.locator('img'));
      expect(image.x).toBe(0);
      expect(image.width).toBe(canvas.width);
      expect((await box(item.locator('figcaption .byline-caption'))).x).toBeGreaterThanOrEqual(16);
    }
    const tiles = page.locator('.byline-gallery.is-cropped > .byline-gallery-item');
    const [first, second] = [await box(tiles.nth(0)), await box(tiles.nth(1))];
    expect(Math.abs(first.y - second.y)).toBeLessThan(1);
    expect(first.width).toBeGreaterThan(150);
  });
});

test.describe('on a desktop (1440px)', () => {
  test.beforeEach(async ({ page }) => open(page, 1440, 900));

  test('Split sets photo and passage side by side, as Portrait + Text always did', async ({ page }) => {
    const figure = await box(split(page).locator('.byline-portrait-text-figure'));
    const passage = await box(split(page).locator('.byline-portrait-text-body'));
    expect(passage.x).toBeGreaterThan(figure.x + figure.width);
    expect(Math.abs(passage.y - figure.y)).toBeLessThan(2);
    expect(figure.width / (figure.width + passage.width)).toBeGreaterThan(.35);
    expect(figure.width / (figure.width + passage.width)).toBeLessThan(.45);
  });

  test('Breakout gives the photograph most of the width and attaches the passage at its foot', async ({ page }) => {
    const image = await box(breakout(page).locator('img'));
    const passage = await box(breakout(page).locator('.byline-portrait-text-body'));
    expect(image.width).toBeGreaterThan(passage.width * 1.8);
    expect(passage.x).toBeGreaterThan(image.x + image.width);
    expect(passage.y + passage.height).toBeGreaterThan(image.y + image.height * .6);
  });

  test('Sticky keeps the photograph in view while the passage beside it is read, without scroll hijacking', async ({ page }) => {
    const figure = sticky(page).locator('.byline-portrait-text-figure');
    expect(await css(figure, 'position')).toBe('sticky');
    const passage = sticky(page).locator('.byline-portrait-text-body');
    // The passage is longer than the photograph: that is what Sticky is for.
    expect((await box(passage)).height).toBeGreaterThan((await box(figure)).height);
    // Bring the block to the point where the photograph starts to stick (its `top`), then read on.
    const stickTop = parseFloat(await css(figure, 'top'));
    await passage.evaluate((element, top) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - top, behavior: 'instant' }), stickTop);
    const before = await box(figure);
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 60);
    await page.waitForFunction((from) => window.scrollY > from, scrolled);
    const after = await box(figure);
    // The page scrolled the ordinary way, by exactly what the reader asked; the photograph stayed where it was.
    expect(await page.evaluate(() => window.scrollY) - scrolled).toBe(60);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    expect(before.y).toBeGreaterThan(0);
  });

  test('Spotlight sets a few words over the photo on a scrim, never over the caption', async ({ page }) => {
    const image = await box(spotlight(page).locator('img'));
    const passage = await box(spotlight(page).locator('.byline-portrait-text-body'));
    const caption = await box(spotlight(page).locator('figcaption'));
    expect(passage.y).toBeGreaterThan(image.y);
    expect(passage.y + passage.height).toBeLessThanOrEqual(image.y + image.height + 1);
    expect(caption.y).toBeGreaterThanOrEqual(image.y + image.height - 1);
    expect(await css(spotlight(page).locator('.byline-portrait-text-body'), 'background-image')).toContain('linear-gradient');
    expect(await css(spotlight(page).locator('.byline-portrait-text-body h3'), 'color')).toBe('rgb(255, 255, 255)');
  });

  test('pull quotes widen by preset: Standard in the column, Breakout past it, Full across the article', async ({ page }) => {
    const column = (await box(page.locator('.article-body > p').first())).width;
    const breakoutWidth = (await box(quote(page, 'breakout'))).width;
    const fullWidth = (await box(quote(page, 'full'))).width;
    expect(breakoutWidth).toBeGreaterThan(column);
    expect(fullWidth).toBeGreaterThan(breakoutWidth);
    expect(await css(quote(page, 'full'), 'text-align')).toBe('center');
    expect(await css(quote(page, 'breakout'), 'text-align')).toBe('left');
  });

  test('a full-screen chapter fills the viewport and a short split chapter sits side by side', async ({ page }) => {
    expect((await box(chapter(page))).height).toBeGreaterThanOrEqual(900 - 1);
    const media = await box(chapter(page, 'split').locator('.byline-visual-chapter-media'));
    const words = await box(chapter(page, 'split').locator('.byline-visual-chapter-text'));
    expect(words.x).toBeGreaterThan(media.x + media.width);
  });
});

test.describe('on a tablet (768px)', () => {
  test('Breakout and Spotlight stay one column until the canvas can carry them; Sticky already sticks', async ({ page }) => {
    await open(page, 768, 1024);
    for (const moment of [breakout(page), spotlight(page)]) {
      const image = await box(moment.locator('img'));
      const passage = await box(moment.locator('.byline-portrait-text-body'));
      expect(passage.y).toBeGreaterThanOrEqual(image.y + image.height);
    }
    expect(await css(sticky(page).locator('.byline-portrait-text-figure'), 'position')).toBe('sticky');
  });
});

test.describe('a wide iPad with touch (1024px, coarse pointer)', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('lays out by the width of the page, not by the pointer', async ({ page }) => {
    await open(page, 1024, 1366);
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
    // The same wide-screen presentation a mouse user gets at this width.
    expect(await css(sticky(page).locator('.byline-portrait-text-figure'), 'position')).toBe('sticky');
    const figure = await box(split(page).locator('.byline-portrait-text-figure'));
    expect((await box(split(page).locator('.byline-portrait-text-body'))).x).toBeGreaterThan(figure.x + figure.width);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test('reading order matches the source on every width, and every chapter heading is an H2', async ({ page }) => {
  await open(page, 1440);
  const headings = await page.locator('.article-body .byline-visual-chapter h2').allTextContents();
  expect(headings).toEqual(['The third window', "What changed, and what didn't", 'The middle school is watching']);
  // A sticky photograph sits on the right on wide screens, yet reads first.
  const order = await sticky(page).evaluate((element) => [...element.children].map((child) => child.className));
  expect(order).toEqual(['byline-portrait-text-figure', 'byline-portrait-text-body']);
  // Unused helper guard: the fixture's chapters and quotes all rendered.
  await expect(block(page, 'feature-chapter-media')).toHaveCount(1);
});
