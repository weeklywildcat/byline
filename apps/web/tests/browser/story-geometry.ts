import { expect, test } from '@playwright/test';
import { articleCanvas, classicScrollbar, openStory, reserveScrollbarGutter, routeStoryFixtures } from './story-fixtures';

const near = (actual: number, expected: number, tolerance = 1) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

/**
 * The width contract is stated against the article canvas: the content box of
 * the `byline-content` container (the article shell), which is what `100cqw`
 * resolves against. The window is not the authority: scrollbar allocation and
 * reserved gutters change `documentElement.clientWidth` without changing the
 * canvas the blocks are centered in. Every width runs as the platform default,
 * with CI's reserved 15px gutter, and (below) with a drawn classic scrollbar.
 */
export type Variant = 'default' | 'reserved gutter' | 'classic scrollbar';
export function defineGeometry(variant: Variant) {
  for (const width of [1600, 1440, 1200, 768, 390, 320]) {
    test(`editorial story geometry at ${width} (${variant})`, async ({ page }) => {
      await routeStoryFixtures(page);
      await page.setViewportSize({ width, height: 900 });
      await openStory(page);
      if (variant === 'reserved gutter') await reserveScrollbarGutter(page);
      if (variant === 'classic scrollbar') {
        await classicScrollbar(page);
        // The scrollbar must really take layout space, or this variant proves nothing.
        expect((await articleCanvas(page)).viewport).toBe(width - 15);
      }
      const canvas = await articleCanvas(page);
      expect(canvas.overflow).toBe(false);
      expect(canvas.shell.left).toBeGreaterThanOrEqual(canvas.body.left);
      expect(canvas.shell.right).toBeLessThanOrEqual(canvas.body.right + 0.5);

      const body = page.locator('.article-body');
      const measure = (selector: string) => body.locator(selector).first().boundingBox().then((box) => box!);
      const blocks = [
        ['prose', await measure(':scope > p'), 760],
        ['alignwide', await measure(':scope > .wp-block-image.alignwide'), 1040],
        ['alignfull', await measure(':scope > .wp-block-image.alignfull'), 1440]
      ] as const;
      for (const [name, box, maximum] of blocks) {
        const label = `${name} at ${width}`;
        near(box.width, Math.min(maximum, canvas.width));
        near(box.x + box.width / 2, canvas.center, 2);
        // Visually symmetric margins inside the canvas.
        expect(Math.abs((box.x - canvas.left) - (canvas.right - (box.x + box.width))), label).toBeLessThanOrEqual(2 * 2);
      }
      const after = await page.locator('.article-after').boundingBox();
      expect(after!.width).toBeLessThanOrEqual(1040 + 0.5);
      near(after!.x + after!.width / 2, canvas.center, 2);

      const geometry = await body.evaluate((body) => {
        const rect = (selector: string) => { const r = body.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width, height: r.height }; };
        const table = body.querySelector('.is-style-byline-data-table')!;
        return {
          portrait: (() => {
            // The photograph fills its slot and is contained, whole, inside it: measure what is drawn, not the box.
            const img = body.querySelector<HTMLImageElement>('.wp-block-image.alignfull img[alt="Campus portrait"]')!;
            const box = img.getBoundingClientRect();
            const scale = getComputedStyle(img).objectFit === 'contain' ? Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight) : 1;
            return { width: img.naturalWidth * scale, height: img.naturalHeight * scale, contained: getComputedStyle(img).objectFit === 'contain' };
          })(),
          note: rect('.is-style-byline-margin-note'), afterNote: rect('.is-style-byline-margin-note + p + .alignwide'),
          noteFloat: getComputedStyle(body.querySelector('.is-style-byline-margin-note')!).float,
          tableScroll: table.scrollWidth > table.clientWidth,
          captionVisible: body.querySelector('.is-style-byline-data-table figcaption')!.getBoundingClientRect().width > 0,
          columns: getComputedStyle(body.querySelector('.is-style-byline-comparison')!).flexDirection,
          markerInside: Array.from(body.querySelectorAll('.byline-annotation-marker')).every((marker) => {
            const m = marker.getBoundingClientRect(); const image = marker.parentElement!.querySelector('img')!.getBoundingClientRect();
            return m.x >= image.x - 0.5 && m.right <= image.right + 0.5 && m.y >= image.y - 0.5 && m.bottom <= image.bottom + 0.5;
          })
        };
      });
      expect(geometry.portrait.contained).toBe(true);
      expect(geometry.portrait.height).toBeLessThanOrEqual(900 * .85 + 1);
      expect(geometry.portrait.height / geometry.portrait.width).toBeCloseTo(1.5, 1);
      // The margin note floats when the article container (not the window) is wide enough.
      expect(geometry.noteFloat).toBe(canvas.width >= 1100 ? 'right' : 'none');
      expect(geometry.afterNote.y).toBeGreaterThanOrEqual(geometry.note.bottom);
      expect(geometry.columns).toBe(canvas.viewport <= 700 ? 'column' : 'row');
      expect(geometry.captionVisible).toBe(true);
      expect(geometry.markerInside).toBe(true);
      if (width <= 768) {
        expect(geometry.tableScroll).toBe(true);
        const table = body.locator('.is-style-byline-data-table');
        await expect(table).toHaveAttribute('tabindex', '0');
        await table.focus(); await page.keyboard.press('ArrowRight');
        await expect.poll(() => table.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
    });
  }
}
