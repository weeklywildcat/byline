import { expect, test } from '@playwright/test';
import { article, routeStoryFixtures } from './story-fixtures';

/**
 * The Interactive block in the WordPress-rendered fixture article. Its file
 * deliberately tries to reach the article, cookies and storage, and reports
 * what happened. Windows, navigation and forms are withheld by the sandbox
 * attribute itself, which must stay exactly `allow-scripts`.
 */
test.beforeEach(async ({ page }) => { await routeStoryFixtures(page); });

const figure = '.byline-interactive';
const frameSelector = `${figure} iframe.byline-interactive-frame`;

test('the interactive runs isolated: no access to the article, cookies, storage, windows or navigation', async ({ page }) => {
  const popups: string[] = [];
  page.on('popup', (popup) => popups.push(popup.url()));
  await page.goto(article);
  const title = await page.title();
  const frame = page.locator(frameSelector);
  await frame.scrollIntoViewIfNeeded();

  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  const status = page.frameLocator(frameSelector).locator('#status');
  await expect(status).not.toHaveText('Checking');
  const report = (await status.textContent())!.split(' ');
  expect(report).toEqual(['parent-dom-blocked', 'cookies-blocked', 'storage-blocked']);
  // The page cannot reach into the frame either: its origin is opaque.
  expect(await frame.evaluate((node) => (node as HTMLIFrameElement).contentDocument)).toBeNull();
  expect(await page.title()).toBe(title);
  expect(new URL(page.url()).pathname).toBe(article);
  expect(popups).toEqual([]);
});

test('the frame takes the height the interactive reports, and follows it when it grows', async ({ page }) => {
  await page.goto(article);
  const frame = page.locator(frameSelector);
  await frame.scrollIntoViewIfNeeded();
  await expect(page.frameLocator(frameSelector).locator('#status')).not.toHaveText('Checking');
  // Compact (320px) is only the starting height; the short quiz reports less.
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(320);
  await page.frameLocator(frameSelector).getByRole('button', { name: 'Show every wave' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(600);
});

test('readers get a title, a description that names the frame, and the credit', async ({ page }) => {
  await page.goto(article);
  const frame = page.locator(frameSelector);
  await expect(page.locator(`${figure} .byline-interactive-title`)).toHaveText('Find your lunch wave');
  await expect(frame).toHaveAttribute('title', 'Find your lunch wave');
  const describedBy = (await frame.getAttribute('aria-describedby'))!;
  await expect(page.locator(`#${describedBy}`)).toContainText('Wave A waits about 9 minutes');
  await expect(page.locator(`${figure} figcaption`)).toHaveText('Credit: Weekly Wildcat data desk');
  expect(await page.locator('.article-body script').count()).toBe(0);
});

test('without JavaScript the description stands in for the frame', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await routeStoryFixtures(page);
  await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}${article}`);
  await expect(page.locator(`${figure} .byline-interactive-description`)).toBeVisible();
  await expect(page.locator(`${figure} .byline-interactive-noscript`)).toBeVisible();
  await expect(page.locator(frameSelector)).toBeHidden();
  await context.close();
});

test('a phone keeps the frame inside the article without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(article);
  const frame = page.locator(frameSelector);
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
