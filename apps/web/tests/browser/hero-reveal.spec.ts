import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openStory } from './story-fixtures';

/**
 * Fixture stories the WordPress "Immersive" option is set on (build fixture
 * `byline.presentation`): post 8 bottom left, post 7 centered. Post 6 is also
 * Immersive but has a repository override, which must win. Post 9 is plain.
 */
const stories = [
  { alignment: 'bottom-left', url: '/2026/08/16/news/weekly-wildcat-browser-fixture-five/' },
  { alignment: 'center', url: '/2026/08/17/news/weekly-wildcat-browser-fixture-four/' }
] as const;
const overriddenStory = '/2026/08/18/news/weekly-wildcat-browser-fixture-three/';
const plainStory = '/2026/08/15/news/weekly-wildcat-browser-fixture-six/';
const diversityPage = '/diversity-inclusion/';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 }
];

/** The fixture feeds absolute production URLs; serve the same files locally. */
async function serveFixturePhotos(page: Page) {
  await page.route('https://weeklywildcat.com/newsroom/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    await route.fulfill({ body: await readFile(path.resolve(__dirname, '../../public/newsroom', name)), contentType: 'image/jpeg' });
  });
}

async function openReveal(page: Page, url: string) {
  await serveFixturePhotos(page);
  await openStory(page, url);
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.hero-reveal-image');
    return !image || (image.complete && image.naturalWidth > 0);
  });
}

type Rects = { header: DOMRect; hero: DOMRect; surface: DOMRect; scrollY: number; viewportHeight: number };
const measure = (page: Page): Promise<Rects> => page.evaluate(() => {
  const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
  // Article pages lay `.site-header` out with `display: contents`, so the section nav, its last row, marks the header's bottom edge.
  return { header: { ...rect('.section-nav'), height: rect('.section-nav').bottom + window.scrollY }, hero: rect('.hero-reveal'), surface: rect('.hero-reveal-content'), scrollY: window.scrollY, viewportHeight: window.innerHeight };
});

const near = (actual: number, expected: number, tolerance = 1) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

/** Header + hero fill the first screen, the surface starts where the hero ends, and nothing shows between them while scrolling. */
async function expectRevealGeometry(page: Page) {
  const start = await measure(page);
  expect(start.scrollY).toBe(0);
  near(start.hero.top, start.header.bottom);
  near(start.hero.height, Math.max(420, start.viewportHeight - start.header.height));
  near(start.header.height + start.hero.height, start.viewportHeight);
  near(start.surface.top, start.hero.bottom);

  const heroHeight = start.hero.height;
  const headerHeight = start.header.height;
  for (const progress of [0.1, 0.35, 0.6, 0.85, 1]) {
    const target = headerHeight + heroHeight * progress;
    await page.evaluate((y) => window.scrollTo(0, y), target);
    const rects = await measure(page);
    // Once the header has scrolled away the hero stays pinned...
    near(rects.hero.top, 0);
    // ...and the surface rides up over it with no gap between the two layers.
    expect(rects.surface.top).toBeLessThanOrEqual(rects.hero.bottom + 0.5);
    near(rects.surface.top, heroHeight + headerHeight - rects.scrollY, 1.5);
    if (rects.surface.top > 2) {
      const layers = await page.evaluate((y) => {
        const hit = document.elementFromPoint(window.innerWidth / 2, y);
        return { hero: Boolean(hit?.closest('.hero-reveal')) };
      }, rects.surface.top - 2);
      expect(layers.hero, `hero shows directly above the surface at ${Math.round(progress * 100)}%`).toBe(true);
    }
    const covering = await page.evaluate((y) => Boolean(document.elementFromPoint(window.innerWidth / 2, y)?.closest('.hero-reveal-content')), Math.min(rects.surface.top + 4, rects.viewportHeight - 4));
    expect(covering, `surface paints over the hero at ${Math.round(progress * 100)}%`).toBe(true);
  }
  const covered = await measure(page);
  near(covered.surface.top, 0, 1.5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
}

for (const story of stories) for (const viewport of viewports) {
  test.describe(`immersive story (${story.alignment}) at ${viewport.name} width`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openReveal(page, story.url);
    });

    test('places the headline where the author chose', async ({ page }) => {
      const box = await page.evaluate(() => {
        const hero = document.querySelector('.hero-reveal')!.getBoundingClientRect();
        const h1 = document.querySelector('.hero-reveal h1')!.getBoundingClientRect();
        return { heroTop: hero.top, heroHeight: hero.height, heroWidth: hero.width, left: h1.left, centerX: (h1.left + h1.right) / 2, centerY: (h1.top + h1.bottom) / 2 - hero.top, bottom: h1.bottom - hero.top };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      if (story.alignment === 'bottom-left') {
        expect(box.left).toBeLessThan(box.heroWidth * 0.25);
        expect(box.centerY).toBeGreaterThan(box.heroHeight * 0.55);
      } else {
        near(box.centerX, box.heroWidth / 2, 3);
        expect(box.centerY).toBeGreaterThan(box.heroHeight * 0.3);
        expect(box.centerY).toBeLessThan(box.heroHeight * 0.7);
      }
      expect(box.bottom).toBeLessThanOrEqual(box.heroHeight);
    });

    test('fills the screen beneath the header, and the article surface rises over the pinned photograph', async ({ page }) => {
      await expectRevealGeometry(page);
    });

    test('lays the byline and caption at the top of the surface, then the WordPress body', async ({ page }) => {
      const order = await page.evaluate(() => {
        const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top + window.scrollY;
        const surface = document.querySelector('.hero-reveal-content')!;
        return {
          meta: top('.hero-reveal-content .article-meta-block'),
          caption: top('.immersive-article-caption'),
          body: top('.hero-reveal-content .article-body'),
          ending: top('.hero-reveal-content .article-after'),
          bodyInside: surface.contains(document.querySelector('.article-body')),
          h1InHero: document.querySelector('.hero-reveal h1') !== null,
          h1Count: document.querySelectorAll('h1').length
        };
      });
      expect(order.meta).toBeLessThan(order.caption);
      expect(order.caption).toBeLessThan(order.body);
      expect(order.body).toBeLessThan(order.ending);
      expect(order.bodyInside).toBe(true);
      expect(order.h1InHero).toBe(true);
      expect(order.h1Count).toBe(1);
      await expect(page.locator('.immersive-article-caption')).toContainText('Staff plan the publishing schedule.');
      await expect(page.locator('.immersive-article-caption')).toContainText('Photo: Fixture Photographer');
      await expect(page.locator('.hero-reveal-content .article-after-section.about-writer')).toBeVisible();
    });

    test('keeps the headline readable over the photograph and the image a real responsive <img>', async ({ page }) => {
      const hero = await page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>('.hero-reveal-image')!;
        const scrim = getComputedStyle(document.querySelector('.hero-reveal')!, '::before');
        const imageBox = image.getBoundingClientRect();
        const heroBox = document.querySelector('.hero-reveal')!.getBoundingClientRect();
        return {
          tag: image.tagName,
          srcset: image.srcset.split(',').length,
          fit: getComputedStyle(image).objectFit,
          currentSrc: image.currentSrc,
          filled: Math.abs(imageBox.width - heroBox.width) < 1 && Math.abs(imageBox.height - heroBox.height) < 1,
          scrim: scrim.backgroundImage !== 'none' ? scrim.backgroundImage : scrim.backgroundColor,
          headline: getComputedStyle(document.querySelector('.hero-reveal h1')!).color,
          headlineInside: (() => { const h = document.querySelector('.hero-reveal h1')!.getBoundingClientRect(); return h.top >= heroBox.top && h.bottom <= heroBox.bottom && h.left >= 0 && h.right <= window.innerWidth; })(),
          background: getComputedStyle(document.querySelector('.hero-reveal-content')!).backgroundColor,
          backgroundImages: Array.from(document.querySelectorAll('*')).filter((node) => getComputedStyle(node).backgroundImage.includes('url(')).length
        };
      });
      expect(hero.tag).toBe('IMG');
      expect(hero.srcset).toBe(3);
      expect(hero.fit).toBe('cover');
      expect(hero.filled).toBe(true);
      // Bottom-left darkens toward the words with a gradient; centered uses an even scrim.
      expect(hero.scrim).toMatch(story.alignment === 'bottom-left' ? /linear-gradient/ : /^rgba\(14, 17, 22, 0\.5\d*\)$/);
      expect(hero.headline).toBe('rgb(255, 255, 255)');
      expect(hero.headlineInside).toBe(true);
      expect(hero.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(hero.backgroundImages).toBe(0);
      expect(hero.currentSrc).toContain('newsroom-meeting-');
    });

    test('the scroll cue is a keyboard link to the article, and the page never traps scrolling', async ({ page }) => {
      const cue = page.locator('a.hero-reveal-scroll');
      await expect(cue).toHaveAttribute('href', '#immersive-article-surface');
      await cue.focus();
      await expect(cue).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#immersive-article-surface$/);
      // The page reserves `scroll-padding-top` for the docked logo bar, so the surface lands just beneath it.
      const reserved = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
      await expect.poll(async () => Math.abs((await measure(page)).surface.top - reserved)).toBeLessThan(3);

      await page.keyboard.press('End');
      await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true);
      await page.keyboard.press('Home');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.goBack();
      await expect(page).not.toHaveURL(/#immersive-article-surface$/);
    });
  });
}

test('respects reduced motion on the scroll cue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openReveal(page, stories[0].url);
  const animation = () => page.locator('.hero-reveal-scroll svg').evaluate((svg) => getComputedStyle(svg).animationName);
  expect(await animation()).toBe('hero-reveal-bob');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');
  // The reveal itself is ordinary sticky scrolling, so it needs no motion fallback.
  await expectRevealGeometry(page);
});

for (const viewport of viewports) {
  test(`Diversity & Inclusion uses the same reveal at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openReveal(page, diversityPage);
    await expectRevealGeometry(page);
    await expect(page.locator('.hero-reveal h1')).toHaveText('Diversity & Inclusion');
    await expect(page.locator('a.hero-reveal-scroll')).toHaveAttribute('href', '#di-content');
  });
}

test('a standard story keeps the normal article', async ({ page }) => {
  await page.goto(plainStory);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.article-header h1')).toHaveCount(1);
  await expect(page.locator('.hero-reveal, .hero-reveal-content, .immersive-article')).toHaveCount(0);
  await expect(page.locator('main.article-shell')).toHaveCount(1);
});

test('a repository override wins over WordPress Immersive', async ({ page }) => {
  await serveFixturePhotos(page);
  await page.goto(overriddenStory);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.story-override-fixture')).toHaveCount(1);
  await expect(page.locator('.hero-reveal, .immersive-article')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('script#newsarticle-json-ld')).toHaveCount(1);
  await expect(page.locator('.article-body')).toBeVisible();
});
