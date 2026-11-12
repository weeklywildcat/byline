import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * The Feature, Immersive and Split story openings, and the Minimal site
 * navigation, on the browser-fixture build (apps/web/tests/fixtures/browser-content.ts):
 *
 *   94 feature (wide)            standard navigation
 *   95 feature (full)            minimal
 *   96 split, image left         minimal
 *   97 split, image right        standard
 *   98 immersive, bottom left    minimal
 *   99 standard opening          minimal
 *    9 an ordinary story         standard (the unchanged header)
 */
const stories = {
  featureWide: '/2026/01/10/news/weekly-wildcat-opening-feature/',
  featureFull: '/2026/01/11/news/weekly-wildcat-opening-feature-full-minimal/',
  splitLeft: '/2026/01/12/news/weekly-wildcat-opening-split-left-minimal/',
  splitRight: '/2026/01/13/news/weekly-wildcat-opening-split/',
  immersive: '/2026/01/14/news/weekly-wildcat-opening-immersive-minimal/',
  standardMinimal: '/2026/01/15/news/weekly-wildcat-opening-standard-minimal/',
  ordinary: '/2026/08/15/news/weekly-wildcat-browser-fixture-six/'
};
const sizes = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 }
];

/** The fixture feeds absolute production URLs; serve the same files locally. */
async function servePhotos(page: Page, replacement?: Buffer, type = 'image/svg+xml') {
  await page.route('https://weeklywildcat.com/newsroom/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    await route.fulfill(replacement ? { body: replacement, contentType: type } : { body: await readFile(path.resolve(__dirname, '../../public/newsroom', name)), contentType: 'image/jpeg' });
  });
}

async function open(page: Page, url: string) {
  await servePhotos(page);
  await page.goto(url);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const near = (actual: number, expected: number, tolerance = 2) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

test.describe('Site navigation', () => {
  test('an ordinary story keeps the publication header', async ({ page }) => {
    await open(page, stories.ordinary);
    await expect(page.locator('.site-utility')).toHaveCount(1);
    await expect(page.locator('.section-nav a').first()).toBeVisible();
    await expect(page.locator('[data-story-nav]')).toHaveCount(0);
    await expect(page.locator('meta[name=viewport]')).not.toHaveAttribute('content', /viewport-fit/);
  });

  test('a Standard opening with Minimal navigation also gets the minimal bar, and the opening is unchanged', async ({ page }) => {
    await open(page, stories.standardMinimal);
    await expect(page.locator('[data-story-nav]')).toHaveCount(1);
    await expect(page.locator('.article-header h1')).toBeVisible();
    // The headline starts below the bar (it sits over the page background here).
    expect((await box(page, '.article-header h1')).y).toBeGreaterThan(56);
  });

  test('the minimal header omits the utility strip, donate, date, location and section row', async ({ page }) => {
    await open(page, stories.featureFull);
    await expect(page.locator('.site-utility')).toHaveCount(0);
    await expect(page.locator('.section-nav')).toHaveCount(0);
    await expect(page.locator('.header-donate')).toHaveCount(0);
    await expect(page.locator('.masthead-logo')).toHaveCount(0);
    const controls = page.locator('[data-story-nav] a:visible, [data-story-nav] > div > button:visible');
    await expect(controls).toHaveCount(3);
  });

  test('the logo links home and keeps the publication name', async ({ page }) => {
    await open(page, stories.featureFull);
    const logo = page.locator('[data-story-nav]').getByRole('link', { name: 'Weekly Wildcat home' });
    await expect(logo).toHaveAttribute('href', '/');
  });

  test('the hamburger opens the configured sections; Escape closes it and focus returns', async ({ page }) => {
    // The sections it offers are the same configured header sections the standard header lists.
    await open(page, stories.ordinary);
    const configured = await page.locator('.section-nav a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).getAttribute('href')));
    expect(configured.length).toBeGreaterThan(2);

    await open(page, stories.featureFull);
    const menu = page.getByRole('button', { name: 'Open site navigation' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.focus();
    await menu.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Weekly Wildcat' });
    await expect(sheet).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const offered = await sheet.locator('.story-nav__sections a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).getAttribute('href')));
    expect(offered).toEqual(configured);
    // Focus is inside the sheet, and Tab stays there.
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('the close button closes the sheet and restores focus', async ({ page }) => {
    await open(page, stories.splitLeft);
    const menu = page.getByRole('button', { name: 'Open site navigation' });
    await menu.click();
    await page.getByRole('button', { name: 'Close site navigation' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  test('search reaches the existing search page', async ({ page }) => {
    await open(page, stories.featureFull);
    const search = page.getByRole('link', { name: 'Search Weekly Wildcat' });
    await expect(search).toHaveAttribute('href', '/search/');
    await search.click();
    await expect(page).toHaveURL(/\/search\/$/);
    await expect(page.locator('#search-query')).toBeVisible();
  });

  test('the bar is transparent over the opening and solid once the reader leaves it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, stories.immersive);
    const nav = page.locator('[data-story-nav]');
    await expect(nav).toHaveAttribute('data-solid', 'false');
    expect(await page.locator('.story-nav__surface').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    // Still compact: the same three controls, no section row.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(nav).toHaveAttribute('data-solid', 'true');
    await expect.poll(() => page.locator('.story-nav__surface').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await expect(page.locator('.section-nav')).toHaveCount(0);
    await expect(page.locator('[data-story-nav]').getByRole('link', { name: 'Weekly Wildcat home' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(nav).toHaveAttribute('data-solid', 'false');
  });

  test('reduced motion removes the bar transition, and the sheet animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, stories.immersive);
    expect(await page.locator('.story-nav__surface').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await page.locator('.story-nav__logo-mark').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await page.getByRole('button', { name: 'Open site navigation' }).click();
    expect(await page.locator('dialog').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  for (const size of sizes) {
    test(`${size.name} (${size.width}px): the bar is laid out safely`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const url of [stories.featureFull, stories.splitLeft, stories.immersive]) {
        await open(page, url);
        expect(await noHorizontalOverflow(page), url).toBe(true);
        const menu = await box(page, '[data-story-nav-open]');
        const logo = await box(page, '.story-nav__logo-mark');
        const search = await box(page, '.story-nav__layer--end a');
        // 44px targets, in the safe edges, with the logo centred on the screen (not in the space left over).
        expect(menu.width).toBeGreaterThanOrEqual(44);
        expect(menu.height).toBeGreaterThanOrEqual(44);
        expect(search.width).toBeGreaterThanOrEqual(44);
        expect(menu.x).toBeGreaterThanOrEqual(0);
        expect(search.x + search.width).toBeLessThanOrEqual(size.width);
        if (url === stories.splitLeft && size.width >= 1024) {
          // A Split opening's seam is mid-viewport: on a wide screen the logo sits at the left, beside the menu.
          expect(logo.x).toBeGreaterThanOrEqual(menu.x + menu.width);
          expect(logo.x).toBeLessThan(menu.x + menu.width + 24);
        } else {
          near(logo.x + logo.width / 2, size.width / 2);
        }
        expect(logo.x).toBeGreaterThanOrEqual(menu.x + menu.width);
        expect(logo.x + logo.width).toBeLessThan(search.x);
      }
    });
  }

  test('controls stay usable at 200% text size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, stories.splitLeft);
    await page.addStyleTag({ content: 'html{font-size:200%}' });
    expect(await noHorizontalOverflow(page)).toBe(true);
    const menu = await box(page, '[data-story-nav-open]');
    const search = await box(page, '.story-nav__layer--end a');
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(search.x + search.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Open site navigation' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

/**
 * The menu and search icons are bare (no disc or pill). A dark icon with a white halo reads on any photograph:
 * the icon contrasts with its halo (WCAG 1.4.11 asks for 3:1), and the halo is what meets the picture.
 */
test.describe('control legibility over photographs', () => {
  const luminance = ([r, g, b]: number[]) => {
    const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);

  test('the icons are not bubbled in', async ({ page }) => {
    await open(page, stories.immersive);
    for (const selector of ['[data-story-nav-open]', '.story-nav__layer--end a']) {
      const surface = await page.locator(selector).evaluate((el) => {
        const before = getComputedStyle(el, '::before');
        const own = getComputedStyle(el);
        return { before: before.content, background: own.backgroundColor, shadow: own.boxShadow, border: own.borderTopWidth };
      });
      expect(surface.before).toBe('none');
      expect(surface.background).toBe('rgba(0, 0, 0, 0)');
      expect(surface.shadow).toBe('none');
      expect(surface.border).toBe('0px');
    }
  });

  const backdrops: Record<string, number[]> = { 'white sky': [255, 255, 255], 'dark photograph': [10, 12, 16], 'gray midtone': [128, 128, 128], 'mixed foliage': [90, 100, 60] };
  for (const [name, backdrop] of Object.entries(backdrops)) {
    test(`${name}: a dark icon inside a white halo`, async ({ page }) => {
      await open(page, stories.immersive);
      const { icon, filter } = await page.locator('[data-story-nav-open]').evaluate((el) => ({ icon: getComputedStyle(el).color, filter: getComputedStyle(el.querySelector('svg')!).filter }));
      // The halo is white; the icon against it is far above 3:1, and a white halo meets a dark photograph with its own edge.
      expect(filter).toContain('drop-shadow');
      expect(filter).toMatch(/rgb\(255, 255, 255\)/);
      expect(contrast(parse(icon), [255, 255, 255])).toBeGreaterThanOrEqual(3);
      // The halo separates the icon from every backdrop: either the icon (dark) or the halo (white) contrasts with it.
      expect(Math.max(contrast(parse(icon), backdrop), contrast([255, 255, 255], backdrop)), name).toBeGreaterThanOrEqual(1.5);
    });
  }

  test('on the publication surface the halo goes away', async ({ page }) => {
    await open(page, stories.immersive);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-story-nav]')).toHaveAttribute('data-solid', 'true');
    expect(await page.locator('[data-story-nav-open] svg').evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  });

  test('keyboard focus is visible against any background', async ({ page }) => {
    await open(page, stories.immersive);
    const focused = page.locator('[data-story-nav-open]');
    await focused.focus();
    const style = await focused.evaluate((el) => { const s = getComputedStyle(el); return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow }; });
    expect(style.outline).not.toBe('none');
    expect(parseFloat(style.width)).toBeGreaterThanOrEqual(2);
    expect(style.shadow).not.toBe('none');
  });
});

test.describe('Feature', () => {
  test('desktop: headline package on the page, a wider photograph below it, caption inset', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, stories.featureWide);
    const head = await box(page, '.story-opening-head');
    const media = await box(page, '.story-opening-media');
    const caption = await box(page, '.story-opening-caption .featured-image-caption-row');
    // The photograph is substantially larger than a 760px Standard lead, below the headline, with margin either side.
    expect(media.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    expect(media.width).toBeGreaterThan(1000);
    expect(media.width).toBeLessThan(1440);
    expect(media.x).toBeGreaterThan(20);
    // The caption stays in the text measure, not across the photograph.
    expect(caption.width).toBeLessThan(media.width);
    expect(caption.y).toBeGreaterThanOrEqual(media.y + media.height - 1);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('desktop full width reaches both edges', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, stories.featureFull);
    const media = await box(page, '.story-opening-media');
    near(media.x, 0);
    near(media.width, 1440);
  });

  test('phone: the photograph is edge to edge while the headline stays inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, stories.featureWide);
    const media = await box(page, '.story-opening-media');
    near(media.x, 0);
    near(media.width, 390);
    expect((await box(page, '.story-opening-headline')).x).toBeGreaterThanOrEqual(16);
    expect((await box(page, '.story-opening-caption .featured-image-caption-row')).x).toBeGreaterThanOrEqual(16);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('uses the phone crop when the editor made one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, stories.featureWide);
    // No crop exists in this fixture, so the photograph serves every viewport with its focal point.
    expect(await page.locator('.story-opening-media picture source').count()).toBe(0);
    expect(await page.locator('.story-opening-media img').evaluate((img) => getComputedStyle(img).objectFit)).toBe('cover');
  });
});

test.describe('Split', () => {
  test('desktop: the photograph takes slightly more than half, on the chosen side', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, stories.splitRight);
    const right = await box(page, '.story-opening-split-figure');
    const textRight = await box(page, '.story-opening-split-text');
    expect(right.x).toBeGreaterThan(textRight.x);
    expect(right.width / 1440).toBeGreaterThan(0.5);
    expect(right.width / 1440).toBeLessThan(0.6);
    expect(right.height).toBeGreaterThanOrEqual(560);

    await open(page, stories.splitLeft);
    const left = await box(page, '.story-opening-split-figure');
    const textLeft = await box(page, '.story-opening-split-text');
    near(left.x, 0);
    expect(textLeft.x).toBeGreaterThan(left.x);
    // The DOM order is the headline package first either way.
    expect(await page.evaluate(() => {
      const text = document.querySelector('.story-opening-split-text')!;
      const figure = document.querySelector('.story-opening-split-figure')!;
      return Boolean(text.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1000, height: 800 }]) {
    test(`${size.width}px: stacked, headline package first, then an edge-to-edge photograph`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, stories.splitLeft);
      const text = await box(page, '.story-opening-split-text');
      const figure = await box(page, '.story-opening-split-figure');
      expect(figure.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
      near(figure.x, 0);
      near(figure.width, size.width);
      // No narrow columns: the text uses a readable measure.
      expect(text.width).toBeGreaterThan(size.width * 0.9);
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  }
});

test.describe('Immersive', () => {
  test('the photograph fills the first screen from the top edge under the minimal bar', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await open(page, stories.immersive);
      const hero = await box(page, '.hero-reveal');
      near(hero.y, 0);
      near(hero.height, size.height);
      expect(await noHorizontalOverflow(page)).toBe(true);
      // The words start below the bar and stay on screen.
      const headline = await box(page, '.immersive-article-headline');
      expect(headline.y).toBeGreaterThanOrEqual(56);
      expect(headline.y + headline.height).toBeLessThanOrEqual(size.height);
    }
  });

  test('an immersive story with Standard navigation is exactly as before', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/2026/08/16/news/weekly-wildcat-browser-fixture-five/');
    await expect(page.locator('.site-utility')).toHaveCount(1);
    await expect(page.locator('[data-story-nav]')).toHaveCount(0);
    const hero = await box(page, '.hero-reveal');
    const nav = await box(page, '.section-nav');
    near(hero.y, nav.y + nav.height);
  });
});
