import { expect, test, type Browser, type Page } from '@playwright/test';
import { article, articleCanvas, openStory, routeStoryFixtures } from './story-fixtures';

/**
 * Before / After is one native range laid over the photograph. These tests
 * drive that control the way readers do (keyboard, mouse, touch) and read the
 * resulting geometry, never a second slider.
 */
async function open(page: Page) {
  await routeStoryFixtures(page);
  await openStory(page);
  const figure = page.locator('.byline-before-after');
  await expect(figure).toHaveClass(/is-enhanced/);
  await figure.scrollIntoViewIfNeeded();
  return { figure, frame: figure.locator('.byline-comparison-images'), range: figure.locator('input[type=range]'), divider: figure.locator('.byline-comparison-divider') };
}

type Box = { x: number; y: number; width: number; height: number };
type Reading = { value: number; position: string; ratio: string; thumb: number; frame: Box; dividerX: number; revealedEdge: number; rangeBox: Box };
/** Where the control, the divider and the revealed edge are right now. */
function read(page: Page): Promise<Reading> {
  return page.locator('.byline-before-after').evaluate((figure) => {
    const frame = figure.querySelector('.byline-comparison-images')!.getBoundingClientRect();
    const range = figure.querySelector<HTMLInputElement>('input[type=range]')!;
    const box = range.getBoundingClientRect();
    const after = figure.querySelectorAll<HTMLElement>('.byline-comparison-image')[1];
    // clip-path: inset(0 <right> 0 0); the right inset is `N%`, `Npx` or calc(N% + Mpx).
    const right = getComputedStyle(after).clipPath.match(/^inset\(\S+ (calc\([^)]*\)|\S+) \S+ \S+\)$/)![1];
    // Sum the terms, e.g. `calc(51% - 0.48px)` or `calc(49% + 0.48px)`.
    let inset = 0;
    for (const [, sign, amount, unit] of right.matchAll(/(?:^|[\s(])([+-]?)\s*([\d.]+)(%|px)/g)) inset += (sign === '-' ? -1 : 1) * parseFloat(amount) * (unit === '%' ? frame.width / 100 : 1);
    return {
      value: Number(range.value),
      position: (figure as HTMLElement).style.getPropertyValue('--comparison-position'),
      ratio: (figure as HTMLElement).style.getPropertyValue('--comparison-ratio'),
      thumb: parseFloat(getComputedStyle(figure).getPropertyValue('--comparison-thumb')),
      frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      dividerX: figure.querySelector('.byline-comparison-divider')!.getBoundingClientRect().x,
      revealedEdge: frame.width - inset,
      rangeBox: { x: box.x, y: box.y, width: box.width, height: box.height }
    };
  });
}
/** The native thumb's centre travels from half its width to half its width short of the far edge. */
const edge = (r: Reading, value = r.value) => r.thumb / 2 + (r.frame.width - r.thumb) * (value / 100);
const near = (actual: number, expected: number, tolerance = 1.25) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
/** Divider, clip and CSS variables all follow the range value. */
async function expectFollowsValue(page: Page, value: number) {
  const r = await read(page);
  expect(r.value).toBe(value);
  expect(r.position).toBe(`${value}%`);
  expect(Number(r.ratio)).toBeCloseTo(value / 100, 5);
  near(r.dividerX - r.frame.x, edge(r));
  near(r.revealedEdge, edge(r));
  return r;
}
/** Settled value, with the divider and clip checked against it. */
async function settled(page: Page) { return expectFollowsValue(page, (await read(page)).value); }
const point = (r: Reading, value: number) => ({ x: r.frame.x + edge(r, value), y: r.frame.y + r.frame.height / 2 });

test('is one native range on the photograph, with no separate slider below', async ({ page }) => {
  const { figure, range } = await open(page);
  await expect(figure.locator('input')).toHaveCount(1);
  await expect(figure.locator('.byline-comparison-images input[type=range]')).toHaveCount(1);
  await expect(figure.locator('.byline-comparison-control')).toHaveCount(0);
  const r = await read(page);
  // The control spans the comparison frame exactly.
  near(r.rangeBox.x, r.frame.x); near(r.rangeBox.y, r.frame.y); near(r.rangeBox.width, r.frame.width); near(r.rangeBox.height, r.frame.height);
  await expect(range).toHaveAttribute('min', '0'); await expect(range).toHaveAttribute('max', '100'); await expect(range).toHaveValue('50');
  await expect(range).toHaveAttribute('aria-label', 'Compare Before and After');
  await expect(range).toHaveAttribute('aria-valuetext', '50% after image revealed');
  await expect(page.getByRole('slider', { name: 'Compare Before and After' })).toHaveCount(1);
  // Labels stay on the photograph and both complete images are in the DOM.
  await expect(figure.locator('.byline-comparison-labels span')).toHaveText(['Before', 'After']);
  await expect(figure.locator('img')).toHaveCount(2);
  const labelsOnImage = await figure.locator('.byline-comparison-labels span').evaluateAll((labels, frame) => labels.every((label) => { const b = label.getBoundingClientRect(); return b.x >= frame.x && b.right <= frame.x + frame.width && b.y >= frame.y && b.bottom <= frame.y + frame.height; }), r.frame);
  expect(labelsOnImage).toBe(true);
  await expectFollowsValue(page, 50);
  // The handle is a comfortable touch target and sits on the divider line.
  expect(r.thumb).toBeGreaterThanOrEqual(44);
  await expect(range).toHaveCSS('cursor', 'ew-resize');
  await expect(range).toHaveCSS('touch-action', 'pan-y');
});

test('keyboard arrows move the divider and focus is visible on the photograph', async ({ page }) => {
  const { range, frame } = await open(page);
  await range.focus();
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('51');
  await expectFollowsValue(page, 51);
  await expect(range).toHaveAttribute('aria-valuetext', '51% after image revealed');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await expectFollowsValue(page, 49);
  await page.keyboard.press('End'); await expectFollowsValue(page, 100);
  await page.keyboard.press('Home'); await expectFollowsValue(page, 0);
  // The extremes keep the handle fully inside the photograph.
  const r = await read(page);
  near(r.dividerX - r.frame.x, r.thumb / 2);
  // Visible focus, on and around the comparison itself.
  await expect(frame).toHaveCSS('outline-style', 'solid');
  await expect(frame).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Tab');
  await expect(frame).not.toHaveCSS('outline-style', 'solid');
});

test('dragging the handle with a mouse moves the divider on the photograph', async ({ page }) => {
  const { range } = await open(page);
  const start = await read(page);
  const from = point(start, 50), to = point(start, 70);
  // Pressing on the handle without moving must not jump it.
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.up();
  await expect(range).toHaveValue('50');
  // The handle is a real, comfortable hit area: 20px either side of its centre still grabs it...
  for (const dx of [-20, 20]) { await page.mouse.move(from.x + dx, from.y); await page.mouse.down(); await page.mouse.up(); await expect(range).toHaveValue('50'); }
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 6 });
  await page.mouse.move(to.x, from.y, { steps: 6 });
  const during = await settled(page);
  expect(Math.abs(during.value - 70)).toBeLessThanOrEqual(1);
  await page.mouse.up();
  const end = await settled(page);
  expect(Math.abs(end.value - 70)).toBeLessThanOrEqual(1);
  // Moving beyond the photograph clamps to the end, and dragging continues outside the frame.
  await page.mouse.move(point(end, end.value).x, from.y); await page.mouse.down();
  await page.mouse.move(end.frame.x - 80, from.y, { steps: 8 });
  await page.mouse.up();
  await expectFollowsValue(page, 0);
  // Pressing anywhere on the photograph moves the divider there, then dragging continues from it.
  const target = point(end, 25);
  await page.mouse.move(target.x, end.frame.y + 20); await page.mouse.down(); await page.mouse.up();
  const jumped = await settled(page);
  expect(Math.abs(jumped.value - 25)).toBeLessThanOrEqual(1.5);
  await page.mouse.move(point(jumped, jumped.value).x, jumped.frame.y + 20); await page.mouse.down();
  await page.mouse.move(point(jumped, 60).x, jumped.frame.y + 20, { steps: 6 }); await page.mouse.up();
  const dragged = await settled(page);
  expect(Math.abs(dragged.value - 60)).toBeLessThanOrEqual(1.5);
});

async function touchDevice(browser: Browser, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  return { context, page, client: await context.newCDPSession(page) };
}
async function touch(client: Awaited<ReturnType<typeof touchDevice>>['client'], path: { x: number; y: number }[]) {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) });
  await send('touchStart', [path[0]]);
  for (const step of path.slice(1)) await send('touchMove', [step]);
  await send('touchEnd', []);
}
const line = (from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) => Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));

test('touch dragging moves the divider and vertical swipes still scroll the page', async ({ browser }) => {
  const { context, page, client } = await touchDevice(browser);
  const { range } = await open(page);
  const start = await read(page);
  expect(start.thumb).toBeGreaterThanOrEqual(44);
  await touch(client, line(point(start, 50), point(start, 75)));
  const dragged = await settled(page);
  expect(Math.abs(dragged.value - 75)).toBeLessThanOrEqual(2);
  await touch(client, line(point(dragged, dragged.value), point(dragged, 20)));
  const back = await settled(page);
  expect(Math.abs(back.value - 20)).toBeLessThanOrEqual(2);
  // No scroll trapping: a vertical swipe that starts on the photograph scrolls the document and leaves the value alone.
  const before = await page.evaluate(() => window.scrollY);
  const value = await range.inputValue();
  const mid = point(back, back.value);
  await touch(client, line({ x: mid.x, y: Math.min(mid.y + 120, 700) }, { x: mid.x, y: Math.max(mid.y - 260, 40) }, 12));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40);
  await expect(range).toHaveValue(value);
  expect((await articleCanvas(page)).overflow).toBe(false);
  await context.close();
});

test('resizing keeps the divider where the value says', async ({ page }) => {
  const { range } = await open(page);
  await range.fill('70');
  await expectFollowsValue(page, 70);
  const wide = await read(page);
  for (const [width, height] of [[768, 900], [390, 844], [320, 700], [1200, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('.byline-before-after').scrollIntoViewIfNeeded();
    const resized = await expectFollowsValue(page, 70);
    expect(resized.frame.width).toBeLessThanOrEqual(width);
    expect((await articleCanvas(page)).overflow).toBe(false);
  }
  const restored = await read(page);
  near(restored.frame.width, wide.frame.width, 1.5);
  // Dragging still works at the new size.
  const from = point(restored, 70);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(point(restored, 40).x, from.y, { steps: 6 }); await page.mouse.up();
  expect(Math.abs((await read(page)).value - 40)).toBeLessThanOrEqual(1.5);
});

test('stays usable at 200% browser zoom', async ({ browser }) => {
  // 200% zoom of a 1280x900 window is a 640x450 CSS viewport at twice the pixel density.
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const { range } = await open(page);
  const start = await read(page);
  expect(start.frame.width).toBeLessThanOrEqual(640);
  expect(start.thumb).toBeGreaterThanOrEqual(44);
  const from = point(start, 50);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(point(start, 80).x, from.y, { steps: 6 }); await page.mouse.up();
  const dragged = await settled(page);
  expect(Math.abs(dragged.value - 80)).toBeLessThanOrEqual(1.5);
  await range.focus(); await page.keyboard.press('ArrowLeft');
  await expectFollowsValue(page, dragged.value - 1);
  // The handle is inside the visible photograph and unobscured.
  const handle = point(await read(page), dragged.value - 1);
  const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, handle);
  expect(topmost).toBe('byline-comparison-range');
  expect((await articleCanvas(page)).overflow).toBe(false);
  await context.close();
});

test('without JavaScript both complete photographs, the labels and the caption remain', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage(); await routeStoryFixtures(page);
  await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}${article}`);
  const figure = page.locator('.byline-before-after');
  for (const index of [0, 1]) {
    const image = figure.locator('img').nth(index);
    await expect(image).toBeVisible();
    expect(await image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  }
  await expect(figure.locator('[data-before]')).toHaveText('Before'); await expect(figure.locator('[data-after]')).toHaveText('After');
  await expect(figure.locator('figcaption')).toContainText('The campus renovation.');
  await expect(figure.locator('input')).toHaveCount(0);
  await context.close();
});
