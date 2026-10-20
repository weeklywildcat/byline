import { expect, test } from '@playwright/test';
import { article, articleCanvas, externalRequests, openStory, routeStoryFixtures } from './story-fixtures';
import { defineGeometry } from './story-geometry';

test.beforeEach(async ({ page }) => { await routeStoryFixtures(page); });

const near = (actual: number, expected: number, tolerance = 1) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

defineGeometry('default');
defineGeometry('reserved gutter');

test('TOC, footnotes and native details retain local reader navigation', async ({ page }) => {
  await page.goto(article);
  const links = page.locator('.byline-table-of-contents a'); expect(await links.count()).toBeGreaterThan(2);
  expect(await links.evaluateAll((links) => links.every((link) => Boolean(document.getElementById(decodeURIComponent((link as HTMLAnchorElement).hash.slice(1))))))).toBe(true);
  expect(await page.locator('[id]').evaluateAll((nodes) => nodes.length === new Set(nodes.map((node) => node.id)).size)).toBe(true);
  const href = await links.first().getAttribute('href'); await links.first().click(); await expect(page).toHaveURL(new RegExp(href! + '$'));
  const reference = page.locator('sup.fn a').first(); const target = await reference.getAttribute('href'); await reference.click(); await expect(page).toHaveURL(new RegExp(target! + '$'));
  await page.locator('.wp-block-footnotes a[aria-label^="Jump to footnote reference"]').first().click(); await expect(reference).toBeFocused();
  const details = page.locator('.is-style-byline-methodology'); await expect(details).not.toHaveAttribute('open'); await details.locator('summary').click(); await expect(details).toHaveAttribute('open', '');
});

test('plain stories never download the interactive enhancement bundle', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('/2026/08/15/news/weekly-wildcat-browser-fixture-six/');
  await page.waitForLoadState('networkidle');
  expect(await page.locator('.article-body').evaluate((body) => body.querySelector('.wp-block-gallery img, .byline-visualization, .byline-annotated-image, .byline-before-after, .byline-scrolly'))).toBeNull();
  expect(scripts.filter((url) => /article-enhancements/.test(url))).toEqual([]);
  await page.goto(article);
  await expect.poll(() => page.locator('.byline-scrolly').evaluate((story) => story.classList.contains('is-enhanced'))).toBe(true);
});

test('the shared enhancer still enlarges linked gallery photographs from their full file', async ({ page }) => {
  await page.goto(article);
  const gallery = page.locator('.is-style-byline-photo-gallery');
  await expect.poll(() => gallery.evaluate((node) => (node as HTMLElement).dataset.bylineLightbox)).toBe('true');
  const first = gallery.locator('a[href] img').first();
  await expect(first).toHaveCSS('cursor', 'zoom-in');
  await first.click();
  const dialog = page.locator('dialog.byline-gallery-dialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute('src', /portrait\.svg$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(first.locator('xpath=ancestor::a')).toBeFocused();
});

/* ----------------------------- Visual Chapters ----------------------------- */

for (const width of [1200, 390, 320]) {
  test(`Visual Chapters keep Core's cover controls at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page);
    const chapters = page.locator('.article-body .wp-block-cover.is-style-byline-visual-chapter');
    expect(await chapters.count()).toBe(3);
    const read = (chapter: ReturnType<typeof chapters.nth>) => chapter.evaluate((node) => {
      const cover = node.getBoundingClientRect();
      const inner = node.querySelector('.wp-block-cover__inner-container')!.getBoundingClientRect();
      const heading = node.querySelector('h2')!;
      const media = node.querySelector<HTMLElement>('.wp-block-cover__image-background, .wp-block-cover__video-background')!;
      const style = getComputedStyle(node);
      return {
        cover: { x: cover.x, right: cover.right, y: cover.y, bottom: cover.bottom, width: cover.width },
        inner: { x: inner.x, right: inner.right, y: inner.y, bottom: inner.bottom },
        padding: { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) },
        heading: { clippedX: heading.scrollWidth > heading.clientWidth + 1, right: heading.getBoundingClientRect().right, bottom: heading.getBoundingClientRect().bottom },
        paragraphs: node.querySelectorAll('.wp-block-cover__inner-container p').length,
        coverClipped: node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1,
        media: { tag: media.tagName, inlineStyle: media.getAttribute('style'), objectPosition: getComputedStyle(media).objectPosition, objectFit: getComputedStyle(media).objectFit, width: media.getBoundingClientRect().width, height: media.getBoundingClientRect().height, autoplay: (media as HTMLVideoElement).autoplay, muted: (media as HTMLVideoElement).muted },
        dim: parseFloat(getComputedStyle(node.querySelector('.wp-block-cover__background')!).opacity)
      };
    });
    const [centered, imageCover, videoCover] = await Promise.all([0, 1, 2].map((index) => read(chapters.nth(index))));
    // Order follows the fixture: centered text, focal-point image, video.
    const [one, two, three] = [centered, imageCover, videoCover];
    near(one.inner.x + (one.inner.right - one.inner.x) / 2, one.cover.x + one.cover.width / 2, 2);
    expect(one.paragraphs).toBe(1);
    expect(one.dim).toBeCloseTo(.4, 2);

    // Image background: Core's focal point is an inline object-position that our CSS must leave alone.
    expect(two.media).toMatchObject({ tag: 'IMG', objectPosition: '20% 80%', objectFit: 'cover' });
    expect(two.media.inlineStyle).toContain('object-position:20% 80%');
    expect(two.paragraphs).toBe(0);
    expect(two.dim).toBeCloseTo(.7, 2);
    near(two.inner.x, two.cover.x + two.padding.left, 2);
    near(two.inner.y, two.cover.y + two.padding.top, 2);
    // A long heading wraps instead of clipping or escaping the chapter.
    expect(two.heading.clippedX).toBe(false);
    expect(two.heading.right).toBeLessThanOrEqual(two.inner.right + 0.5);
    expect(two.heading.bottom).toBeLessThanOrEqual(two.cover.bottom - two.padding.bottom + 0.5);

    // Video background.
    expect(three.media).toMatchObject({ tag: 'VIDEO', objectPosition: '70% 30%', objectFit: 'cover', autoplay: true, muted: true });
    expect(three.media.inlineStyle).toContain('object-position:70% 30%');
    expect(three.dim).toBe(0);
    near(three.inner.right, three.cover.right - three.padding.right, 2);
    near(three.inner.bottom, three.cover.bottom - three.padding.bottom, 2);
    for (const chapter of [one, two, three]) {
      expect(chapter.coverClipped).toBe(false);
      near(chapter.media.width, chapter.cover.width, 1);
      near(chapter.media.height, chapter.cover.bottom - chapter.cover.y, 1);
    }
    expect((await articleCanvas(page)).overflow).toBe(false);
  });
}

/* ------------------------------ Annotated Image ----------------------------- */

test('annotation markers and notes stay synchronized and the list stays ordered', async ({ page }) => {
  await page.goto(article);
  const markers = page.locator('.byline-annotation-marker');
  const notes = page.locator('.byline-annotations > li');
  await expect(notes).toHaveCount(2);
  expect(await markers.evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).hash.slice(1)))).toEqual(await notes.evaluateAll((nodes) => nodes.map((node) => node.id)));
  await markers.nth(1).click();
  await expect(notes.nth(1)).toHaveClass(/is-active/); await expect(notes.nth(0)).not.toHaveClass(/is-active/);
  await expect(markers.nth(1)).toHaveAttribute('aria-current', 'true');
  await notes.nth(0).focus();
  await expect(markers.nth(0)).toHaveAttribute('aria-current', 'true'); await expect(markers.nth(0)).toHaveClass(/is-active/); await expect(markers.nth(1)).not.toHaveAttribute('aria-current');
  // Keyboard-only: tab focus on a marker selects it; Enter follows its link to the note.
  await markers.nth(1).focus();
  await expect(notes.nth(1)).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#annotation-campus-library$/);
  await expect(markers.first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  // Every note is plain text in the page, never hover-only.
  await expect(notes.nth(0)).toContainText('The entrance faces the main street.'); await expect(notes.nth(0)).toBeVisible();
});

test('annotation notes sit beside the image on desktop and below it on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 }); await openStory(page);
  const layout = () => page.locator('.byline-annotation-layout').evaluate((node) => {
    const canvas = node.querySelector('.byline-annotation-canvas')!.getBoundingClientRect(); const list = node.querySelector('.byline-annotations')!.getBoundingClientRect();
    return { canvasRight: canvas.right, canvasBottom: canvas.bottom, listX: list.x, listY: list.y };
  });
  const desktop = await layout(); expect(desktop.listX).toBeGreaterThanOrEqual(desktop.canvasRight);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await layout(); expect(phone.listY).toBeGreaterThanOrEqual(phone.canvasBottom);
});

test('annotation markers remain reachable at 200% browser zoom', async ({ browser }) => {
  // 200% zoom of a 1280x900 window is a 640x450 CSS viewport at twice the pixel density.
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  const page = await context.newPage(); await routeStoryFixtures(page); await openStory(page);
  const markers = page.locator('.byline-annotation-marker');
  for (const index of [0, 1]) {
    const marker = markers.nth(index);
    await marker.scrollIntoViewIfNeeded();
    const box = (await marker.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
    await marker.click();
    await expect(page.locator('.byline-annotations > li').nth(index)).toHaveClass(/is-active/);
  }
  expect((await articleCanvas(page)).overflow).toBe(false);
  await context.close();
});

test('an annotation link marks its marker and note, markers have a 44px target, and the notes are a numbered list', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${article}#annotation-campus-library`);
  const markers = page.locator('.byline-annotation-marker');
  const notes = page.locator('.byline-annotations > li');
  await expect(notes.nth(1)).toHaveClass(/is-active/); await expect(markers.nth(1)).toHaveClass(/is-active/);
  await expect(markers.nth(1)).toHaveAttribute('aria-current', 'true'); await expect(markers.nth(0)).not.toHaveClass(/is-active/);
  // The 32px disc has a 44px target: a point 21px from its centre still lands on it.
  await markers.first().scrollIntoViewIfNeeded();
  const reach = await markers.first().evaluate((marker) => {
    const box = marker.getBoundingClientRect();
    const hit = (dx: number, dy: number) => marker.ownerDocument.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    return { size: box.width, right: hit(21, 0) === marker, below: hit(0, 21) === marker, far: hit(30, 0) === marker };
  });
  expect(reach).toEqual({ size: 32, right: true, below: true, far: false });
  // A list with real numbers: the ordered list keeps its role, and each note repeats its marker's number.
  await expect(page.locator('ol.byline-annotations')).toHaveAttribute('role', 'list');
  const numbers = await notes.evaluateAll((items) => items.map((item) => getComputedStyle(item, '::before').content));
  expect(numbers).toEqual(['counter(annotation)', 'counter(annotation)']);
  await expect(page.locator('ol.byline-annotations')).toHaveCSS('list-style-type', 'none');
  expect(await markers.allTextContents()).toEqual(['1', '2']);
  // Hierarchy: bold title, then the explanation in the reading face.
  const type = await notes.first().evaluate((item) => ({ title: getComputedStyle(item.querySelector('h3')!).fontWeight, body: getComputedStyle(item.querySelector('p')!).fontFamily }));
  expect(type.title).toBe('700'); expect(type.body).toMatch(/newsreader|serif/i);
});

/* --------------------------- Providers and embeds --------------------------- */

test('provider resize messages require matching source, origin, ID and bounded height', async ({ page }) => {
  await page.goto(article);
  for (const [selector, height, payload] of [
    ['.byline-visualization[data-provider="datawrapper"] iframe', 620, { 'datawrapper-height': { AbCdE: 620 } }],
    ['.byline-visualization[data-provider="flourish"] iframe', 710, JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 710 })]
  ] as const) {
    const frame = page.locator(selector); await frame.scrollIntoViewIfNeeded();
    const handle = await frame.elementHandle(); const child = await handle!.contentFrame(); await child!.waitForLoadState();
    await child!.evaluate((payload) => window.parent.postMessage(payload, '*'), payload); await expect(frame).toHaveCSS('height', `${height}px`);
    await page.evaluate(({ selector, payload }) => {
      const invalid = typeof payload === 'string' ? JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 999 }) : { 'datawrapper-height': { AbCdE: 999 } };
      const frame = document.querySelector<HTMLIFrameElement>(selector)!;
      // A matching frame with the wrong origin, then the right origin from an unrelated source.
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://evil.example', data: invalid }));
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: new URL(frame.src).origin, data: invalid }));
    }, { selector, payload });
    // Malformed, negative and absurd heights from the real frame are ignored.
    await child!.evaluate(() => {
      window.parent.postMessage({ 'datawrapper-height': { AbCdE: 99999 } }, '*');
      window.parent.postMessage({ 'datawrapper-height': { AbCdE: -50 } }, '*');
      window.parent.postMessage({ 'datawrapper-height': { OtherId: 999 } }, '*');
      window.parent.postMessage(JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: -2 }), '*');
      window.parent.postMessage(JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 99999 }), '*');
      window.parent.postMessage(JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 'tall' }), '*');
      window.parent.postMessage('not json {', '*');
      window.parent.postMessage(null, '*');
    });
    await expect(frame).toHaveCSS('height', `${height}px`);
  }
  await expect(page.locator('.byline-visualization[data-provider="openstreetmap"] iframe')).toHaveCSS('height', '560px');
});

test('Google Maps embeds use the allowlisted form, the chosen height and a direct link', async ({ page }) => {
  const requestedProviders = await routeStoryFixtures(page);
  await page.goto(article);
  const figure = page.locator('.byline-visualization[data-provider="google-maps"]');
  const frame = figure.locator('iframe');
  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
  await expect(frame).toHaveAttribute('title', 'District map');
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
  // The Compact preset (320px) was chosen in the fixture; the default Map preset is 560px.
  await expect(frame).toHaveCSS('height', '320px');
  const link = figure.locator('.byline-visualization-link a');
  await expect(link).toHaveAttribute('href', (await figure.getAttribute('data-src'))!);
  await expect(link).toContainText('Open the interactive version');
  await expect(link).toBeVisible();
  await expect.poll(() => requestedProviders.filter((url) => url.startsWith('https://www.google.com/maps/embed?pb='))).toHaveLength(1);
  // Google Maps never resizes from a message: another provider's wire format is ignored.
  const child = await (await frame.elementHandle())!.contentFrame();
  await child!.evaluate(() => window.parent.postMessage({ 'datawrapper-height': { '': 900 } }, '*'));
  await page.waitForTimeout(150);
  await expect(frame).toHaveCSS('height', '320px');
  // Every request a provider route saw stays on the allowlist; the live network is never needed.
  await page.waitForLoadState('networkidle');
  const allowed = (url: string) => externalRequests.some((prefix) => url.startsWith(prefix));
  expect(requestedProviders.filter((url) => !allowed(url))).toEqual([]);
    expect(await page.locator('.byline-visualization iframe').evaluateAll((frames) => frames.map((item) => new URL((item as HTMLIFrameElement).src).hostname).sort())).toEqual(['datawrapper.dwcdn.net', 'flo.uri.sh', 'www.google.com', 'www.openstreetmap.org']);
});

/* --------------------------------- No JS ---------------------------------- */

test('all evidence remains useful without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage(); await routeStoryFixtures(page);
  await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}${article}`);
  // Visualization: fallback image, text and direct link, never a frame.
  await expect(page.locator('.byline-visualization iframe')).toHaveCount(0);
  await expect(page.locator('.byline-visualization-link a').first()).toBeVisible(); await expect(page.locator('.byline-visualization img').first()).toBeVisible();
  await expect(page.locator('.byline-visualization-link a[href^="https://www.google.com/maps/embed"]')).toBeVisible();
  // Before / After: both complete photographs, labels and caption; no slider.
  const comparison = page.locator('.byline-before-after');
  await expect(comparison.locator('img').nth(0)).toBeVisible(); await expect(comparison.locator('img').nth(1)).toBeVisible();
  await expect(comparison.locator('[data-before]')).toBeVisible(); await expect(comparison.locator('[data-after]')).toBeVisible();
  await expect(comparison.locator('figcaption')).toContainText('The campus renovation.'); await expect(comparison.locator('input')).toHaveCount(0);
  // Scrollytelling: every step image and every word, in order.
  const steps = page.locator('.byline-scrolly-step'); await expect(steps).toHaveCount(3);
  for (const index of [0, 1, 2]) await expect(steps.nth(index).locator('img')).toBeVisible();
  await expect(steps.nth(0)).toContainText('Arriving on campus'); await expect(steps.nth(2)).toContainText('The panorama shows how the pieces fit together.');
  await expect(page.locator('.byline-scrolly-stage')).toHaveCount(0);
  // Annotated Image: image, marker anchors and the complete list.
  const marker = page.locator('.byline-annotation-marker').first(); await marker.click();
  await expect(page).toHaveURL(/#annotation-campus-entrance$/); await expect(page.locator('#annotation-campus-entrance')).toBeVisible();
  await expect(page.locator('.byline-annotations > li')).toHaveCount(2);
  // Gallery: ordinary links to the full photographs.
  await expect(page.locator('.is-style-byline-photo-gallery a[href$=".svg"] img').first()).toBeVisible();
  // TOC anchors and native details work.
  const toc = page.locator('.byline-table-of-contents a').first(); const hash = await toc.getAttribute('href'); await toc.click(); await expect(page).toHaveURL(new RegExp(hash! + '$'));
  const details = page.locator('.is-style-byline-methodology'); await details.locator('summary').click(); await expect(details).toHaveAttribute('open', '');
  await context.close();
});
