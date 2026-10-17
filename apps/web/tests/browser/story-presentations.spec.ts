import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const article = "/2026/08/20/news/weekly-wildcat-fixture-story/";
async function serveStoryMedia(page: Page) {
  await page.route("**/test-assets/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const types: Record<string, string> = { svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf", wav: "audio/wav", vtt: "text/vtt", html: "text/html" };
    await route.fulfill({ body: await readFile(path.resolve(__dirname, "../../../../tests/fixtures/story-media", name)), contentType: types[name.split(".").pop()!] || "text/plain" });
  });
}

test.describe("WordPress-rendered story presentations on Astro", () => {
  test.beforeEach(async ({ page }) => { await serveStoryMedia(page); });
  for (const width of [1440, 1200, 768, 390, 320]) {
    test(`preserves media, captions, widths and chronology at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(article);
      await expect(page.locator('.article-body .is-style-byline-photo-gallery')).toBeVisible();
      // Load below-the-fold related thumbnails before comparing all media.
      await page.locator('.article-body img').evaluateAll((images) => images.forEach((image) => { (image as HTMLImageElement).loading = 'eager'; }));
      await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.article-body img')).every((img) => img.complete && img.naturalWidth > 0));
      await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('.article-body video')!.videoHeight > 0);
      await expect(page.locator('.byline-newsroom-stories-related .featured-image')).toHaveCount(2);
      const data = await page.locator('.article-body').evaluate((body) => {
        const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; };
        const q = (selector: string) => body.querySelector(selector)!;
        const columns = (selector: string) => getComputedStyle(q(selector)).gridTemplateColumns.split(" ").length;
        const pair = q('.is-style-byline-photo-pair');
        const media = q('.is-style-byline-portrait-text');
        // The page sets `scrollbar-gutter: stable`, so Linux CI reserves a 15px
        // gutter that clientWidth still counts when the headless scrollbar is
        // hidden: the <html> box is the width content lays out in. Centering is
        // judged against the article canvas, the content box of the
        // `byline-content` shell that `100cqw` resolves against.
        const viewportWidth = document.documentElement.getBoundingClientRect().width;
        const shell = document.querySelector<HTMLElement>('main.article-shell')!;
        const shellStyle = getComputedStyle(shell);
        const shellRect = shell.getBoundingClientRect();
        const canvasWidth = shellRect.width - parseFloat(shellStyle.paddingLeft) - parseFloat(shellStyle.paddingRight);
        const canvasCenter = shellRect.left + parseFloat(shellStyle.paddingLeft) + canvasWidth / 2;
        return {
          viewportWidth, canvasWidth, canvasCenter,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          pairColumns: columns('.is-style-byline-photo-pair'), galleryColumns: columns('.is-style-byline-photo-gallery'),
          legacyColumns: columns('.is-style-byline-news-grid'), mediaColumns: columns('.is-style-byline-portrait-text'),
          wide: rect(pair), media: rect(media), portraitMedia: rect(media.querySelector('figure')!), portraitText: rect(media.querySelector('.wp-block-media-text__content')!),
          portrait: rect(q('.is-style-byline-photo-pair img')), video: rect(q('video')), videoRatio: getComputedStyle(q('video')).aspectRatio,
          pdf: { ...rect(q('.wp-block-file__embed')), ratio: getComputedStyle(q('.wp-block-file__embed')).aspectRatio, display: getComputedStyle(q('.wp-block-file__embed')).display },
          embed: rect(q('.wp-block-embed iframe')),
          timeline: Array.from(body.querySelectorAll('.byline-timeline-item')).map(rect),
          thumbnail: rect(q('.byline-newsroom-stories-related .featured-image')),
          relatedHeadingSize: parseFloat(getComputedStyle(q('.byline-newsroom-stories-layout-related > h2')).fontSize),
          related: Array.from(body.querySelectorAll('.byline-newsroom-stories-related article')).map(rect),
          essayProse: rect(q('.is-style-byline-photo-essay > p')),
          captions: Array.from(body.querySelectorAll('figcaption')).map((element) => ({ ...rect(element), clipped: element.scrollHeight > element.clientHeight + 1 })),
          overwideMedia: Array.from(body.querySelectorAll('img, video, audio')).filter((element) => { const r = element.getBoundingClientRect(); return r.x < -1 || r.right > viewportWidth + 1; }).length
        };
      });
      expect(data.overflow).toBe(false);
      expect(data.overwideMedia).toBe(0);
      expect(data.pairColumns).toBe(width <= 540 ? 1 : 2);
      expect(data.galleryColumns).toBe(width <= 540 ? 1 : width <= 900 ? 2 : 3);
      expect(data.legacyColumns).toBe(data.galleryColumns);
      expect(data.mediaColumns).toBe(width <= 700 ? 1 : 2);
      expect(data.wide.x).toBeGreaterThanOrEqual(0);
      expect(data.wide.right).toBeLessThanOrEqual(data.viewportWidth);
      expect(Math.abs((data.wide.x + data.wide.right) / 2 - data.canvasCenter)).toBeLessThan(2);
      expect(data.wide.width).toBeCloseTo(Math.min(1040, data.canvasWidth), 0);
      if (width <= 700) expect(data.portraitText.y).toBeGreaterThanOrEqual(data.portraitMedia.y + data.portraitMedia.height);
      expect(data.portrait.height / data.portrait.width).toBeCloseTo(1.5, 1);
      expect(data.portrait.height).toBeLessThanOrEqual(620);
      expect(data.video.height / data.video.width).toBeCloseTo(320 / 180, 1);
      expect(data.videoRatio).toBe("auto");
      expect(data.pdf.ratio).toBe("auto");
      if (width <= 540) expect(data.pdf.display).toBe("none");
      else expect(data.pdf.height).toBeCloseTo(640, 0);
      expect(data.embed.width / data.embed.height).toBeCloseTo(16 / 9, 1);
      expect(data.essayProse.width).toBeLessThanOrEqual(760);
      expect(data.timeline.length).toBe(2);
      expect(data.timeline[0].x).toBe(data.timeline[1].x);
      expect(data.timeline[1].y).toBeGreaterThan(data.timeline[0].y);
      expect(data.related.length).toBe(3);
      expect(data.thumbnail.width).toBeLessThanOrEqual(96);
      expect(data.relatedHeadingSize).toBeLessThan(16);
      expect(data.related[1].y).toBeGreaterThan(data.related[0].y);
      expect(data.captions.every((caption) => !caption.clipped && caption.width > 0 && caption.right <= data.viewportWidth + 1)).toBe(true);
      await expect(page.locator('.is-style-byline-document a:not([download])').first()).toBeVisible();
      await expect(page.locator('.is-style-byline-document a[download]').first()).toBeVisible();
      await expect(page.locator('video track[kind="captions"]')).toHaveCount(1);
      // Story audio and video never start on their own. The only autoplay is Core's
      // muted, looping, inline Cover background video, which carries no sound.
      await expect(page.locator('video[autoplay]:not(.wp-block-cover__video-background), audio[autoplay]')).toHaveCount(0);
      await expect(page.locator('video.wp-block-cover__video-background[autoplay]')).toHaveCount(1);
      expect(await page.locator('video.wp-block-cover__video-background').evaluate((video) => (video as HTMLVideoElement).muted && (video as HTMLVideoElement).loop && video.hasAttribute('playsinline'))).toBe(true);
    });
  }

  test("gallery enlargement supports keyboard navigation, Escape, focus return and ordinary links", async ({ page }) => {
    await page.goto(article);
    const link = page.locator('.is-style-byline-photo-gallery a[href]').first();
    await expect(link).toHaveAttribute('aria-haspopup', 'dialog');
    await link.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Article photographs' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await expect(dialog.locator('img')).toHaveAttribute('alt', 'Portrait composition');
    await expect(dialog.getByRole('status')).toHaveText('Photograph 1 of 3');
    await expect(dialog.locator('figcaption')).toContainText('Photo: Staff');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('status')).toHaveText('Photograph 2 of 3');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByRole('status')).toHaveText('Photograph 1 of 3');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(link).toBeFocused();
    await link.click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(link).toBeFocused();
    await expect(page.locator('.is-style-byline-photo-essay a').first()).not.toHaveAttribute('aria-haspopup');
  });

  test("gallery media and documents remain linked without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await serveStoryMedia(page);
    await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}${article}`);
    await expect(page.locator('.is-style-byline-photo-gallery a').first()).toHaveAttribute('href', /\/test-assets\/portrait.svg/);
    await expect(page.locator('.is-style-byline-document a:not([download])').first()).toHaveAttribute('href', /document.pdf/);
    await page.locator('.is-style-byline-photo-gallery a').first().click();
    await expect(page).toHaveURL(/portrait.svg$/);
    await context.close();
  });
});
