import { expect, test, type Page } from "@playwright/test";

/**
 * Media delivery for Photo Galleries, against real JPEGs with known sizes
 * (original 2400x1600; 300, 768, 1024 and 1536px derivatives; see
 * tests/fixtures/story-media/photos). The fixture markup is what WordPress
 * renders for a linked gallery and for a legacy gallery whose images are not.
 */
const article = "/2026/08/19/news/weekly-wildcat-latest-fixture-story/";
const photos = "/test-assets/photos/";
const ORIGINAL = /\/test-assets\/photos\/field-[a-e]\.jpg$/;

function trackPhotoRequests(page: Page) {
  const paths: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(photos)) paths.push(pathname.slice(photos.length));
  });
  return paths;
}

/** Pixel width of the srcset candidate the browser chose (naturalWidth is density-corrected). */
function chosenCandidateWidth(img: HTMLImageElement) {
  const chosen = img.currentSrc;
  for (const candidate of img.srcset.split(/,\s+/)) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (new URL(url, document.baseURI).href === chosen) return parseInt(descriptor, 10);
  }
  return 0;
}

const linkedGallery = (page: Page) => page.locator(".article-body .is-style-byline-photo-gallery").nth(0);
const unlinkedGallery = (page: Page) => page.locator(".article-body .is-style-byline-photo-gallery").nth(1);

async function loadGallery(page: Page, gallery = linkedGallery(page)) {
  await gallery.scrollIntoViewIfNeeded();
  await page.waitForFunction((element) => Array.from((element as HTMLElement).querySelectorAll("img")).every((img) => img.complete && img.naturalWidth > 0), await gallery.elementHandle());
}

test.describe("Photo Gallery media delivery", () => {
  test("keeps standards-based responsive markup from WordPress through Astro", async ({ page }) => {
    await page.goto(article);
    const images = linkedGallery(page).locator("img");
    await expect(images).toHaveCount(5);
    const data = await images.first().evaluate((img: HTMLImageElement) => ({
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      full: img.getAttribute("data-byline-full-url"),
      width: img.getAttribute("width"),
      height: img.getAttribute("height"),
      alt: img.alt,
      href: img.closest("a")?.getAttribute("href")
    }));
    expect(data.src).toBe(`${photos}field-a-1024x683.jpg`);
    expect(data.srcset!.split(",").map((candidate) => candidate.trim().split(/\s+/)[1])).toEqual(["1024w", "300w", "768w", "1536w"]);
    expect(data.sizes).toContain("(max-width: 540px)");
    expect(data.sizes).toContain("335px");
    expect(data.full).toBe(`${photos}field-a.jpg`);
    expect(data.href).toBe(data.full);
    expect([data.width, data.height]).toEqual(["1024", "683"]);
    expect(data.alt).toBe("A field at dusk");
    // The original is a link and an attribute, not a candidate the browser downloads for a thumbnail.
    expect(data.srcset).not.toContain("field-a.jpg");
  });

  test("makes linked and unlinked Photo Gallery images enlargeable", async ({ page }) => {
    await page.goto(article);
    const linked = linkedGallery(page).locator("a[href]");
    await expect(linked).toHaveCount(5);
    await expect(linked.first()).toHaveAttribute("aria-haspopup", "dialog");
    expect(await linked.first().evaluate((link) => getComputedStyle(link).cursor)).toBe("zoom-in");

    const openers = unlinkedGallery(page).locator("button.byline-gallery-opener");
    await expect(openers).toHaveCount(3);
    await expect(openers.first()).toHaveAttribute("aria-haspopup", "dialog");
    await expect(openers.first()).toHaveAccessibleName("Enlarge photograph: A field at dusk");
    expect(await openers.first().evaluate((button) => getComputedStyle(button).cursor)).toBe("zoom-in");
    // The saved image markup is untouched apart from the generated control around it.
    await expect(openers.first().locator("img")).toHaveAttribute("src", `${photos}field-a-1024x683.jpg`);
    // Photo Pair and ordinary galleries stay out unless their images are already file links.
    await expect(page.locator(".article-body .is-style-byline-photo-essay button.byline-gallery-opener")).toHaveCount(0);
  });

  test("loads full-size originals only after the lightbox opens, then only neighbouring photographs", async ({ page }) => {
    const requested = trackPhotoRequests(page);
    await page.goto(article);
    await loadGallery(page);
    await loadGallery(page, unlinkedGallery(page));

    expect(requested.filter((path) => /^field-[a-e]\.jpg$/.test(path))).toEqual([]);

    await linkedGallery(page).locator("a[href]").nth(2).click();
    const dialog = page.getByRole("dialog", { name: "Article photographs" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveText("Photograph 3 of 5");
    await expect.poll(() => requested.filter((path) => /^field-[a-e]\.jpg$/.test(path)).sort()).toEqual(["field-b.jpg", "field-c.jpg", "field-d.jpg"]);

    const shown = dialog.locator("img");
    expect(await shown.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname)).toBe(`${photos}field-c.jpg`);
    await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);
    // The dialog never draws the photograph larger than its own pixels.
    expect(await shown.evaluate((img: HTMLImageElement) => Math.round(img.getBoundingClientRect().width) <= img.naturalWidth)).toBe(true);
    // Photographs two steps away were never requested.
    expect(requested).not.toContain("field-a.jpg");
    expect(requested).not.toContain("field-e.jpg");
  });

  test("navigates with the full-resolution source and keeps alt, caption and credit", async ({ page }) => {
    await page.goto(article);
    await linkedGallery(page).locator("a[href]").nth(1).click();
    const dialog = page.getByRole("dialog", { name: "Article photographs" });
    const shown = dialog.locator("img");
    const pathOf = () => shown.evaluate((img: HTMLImageElement) => new URL(img.currentSrc || img.src).pathname);

    await expect(dialog.getByRole("status")).toHaveText("Photograph 2 of 5");
    await expect(shown).toHaveAttribute("alt", "A violet hillside");
    await expect(dialog.locator("figcaption")).toHaveText("Field B: the second photograph. Photo: Staff");
    expect(await pathOf()).toBe(`${photos}field-b.jpg`);

    await dialog.getByRole("button", { name: "Next photograph" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Photograph 3 of 5");
    expect(await pathOf()).toBe(`${photos}field-c.jpg`);
    await page.keyboard.press("ArrowRight");
    await expect(shown).toHaveAttribute("alt", "A green valley");
    expect(await pathOf()).toBe(`${photos}field-d.jpg`);
    await page.keyboard.press("ArrowLeft");
    await dialog.getByRole("button", { name: "Previous photograph" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Photograph 2 of 5");
    expect(await pathOf()).toBe(`${photos}field-b.jpg`);
  });

  test("opens unlinked images from the keyboard and restores focus", async ({ page }) => {
    await page.goto(article);
    const opener = unlinkedGallery(page).locator("button.byline-gallery-opener").first();
    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Article photographs" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(dialog.getByRole("status")).toHaveText("Photograph 1 of 3");
    await expect.poll(() => dialog.locator("img").evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname)).toBe(`${photos}field-a.jpg`);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();

    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(opener).toBeFocused();
  });

  test("falls back to the widest srcset candidate when no full source is published", async ({ page }) => {
    await page.goto(article);
    // The third image in the legacy gallery carries neither a link nor a full-size attribute.
    await unlinkedGallery(page).locator("button.byline-gallery-opener").nth(2).click();
    const dialog = page.getByRole("dialog", { name: "Article photographs" });
    await expect.poll(() => dialog.locator("img").evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname)).toBe(`${photos}field-c-1536x1024.jpg`);
  });

  test("lets the browser pick a sharper candidate on a high-DPI display", async ({ browser }) => {
    for (const [scale, minimumRatio] of [[1, 1], [2, 2]] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
      const page = await context.newPage();
      const requested = trackPhotoRequests(page);
      await page.goto(article);
      await loadGallery(page);
      const measured = await linkedGallery(page).locator("img").first().evaluate((img: HTMLImageElement, source) => ({
        cssWidth: img.getBoundingClientRect().width,
        cssHeight: img.getBoundingClientRect().height,
        candidate: new Function("img", `return (${source})(img)`)(img) as number,
        current: new URL(img.currentSrc).pathname
      }), chosenCandidateWidth.toString());
      // The image keeps its photographic proportions (3:2), not a placeholder box.
      expect(measured.cssWidth).toBeGreaterThan(320);
      expect(measured.cssWidth).toBeLessThan(345);
      expect(measured.cssWidth / measured.cssHeight).toBeCloseTo(1.5, 1);
      // A ~335 CSS-pixel cell gets at least one device pixel per pixel drawn: 768w on 1x and 2x...
      expect(measured.candidate).toBeGreaterThanOrEqual(measured.cssWidth * minimumRatio);
      // ...and a thumbnail never costs the 2400px original.
      expect(measured.candidate).toBeLessThan(2400);
      expect(requested.filter((path) => /^field-[a-e]\.jpg$/.test(path))).toEqual([]);
      expect(measured.current).not.toContain("300x200");
      await context.close();
    }
  });

  test("still resolves a sharp candidate in one column on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await context.newPage();
    await page.goto(article);
    await loadGallery(page);
    const measured = await linkedGallery(page).locator("img").first().evaluate((img: HTMLImageElement, source) => ({
      cssWidth: img.getBoundingClientRect().width,
      candidate: new Function("img", `return (${source})(img)`)(img) as number
    }), chosenCandidateWidth.toString());
    expect(measured.cssWidth).toBeGreaterThan(300);
    // 3x of a ~358px column is ~1070px: the 1536w candidate, still not the original.
    expect(measured.candidate).toBeGreaterThanOrEqual(measured.cssWidth * 3);
    expect(measured.candidate).toBeLessThan(2400);
    await context.close();
  });

  test("keeps full media links, captions and responsive images without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const base = `http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT || 4173}`;
    await page.goto(`${base}${article}`);
    const gallery = linkedGallery(page);
    await expect(gallery.locator("a[href]").first()).toHaveAttribute("href", `${photos}field-a.jpg`);
    await expect(gallery.locator("figcaption").first()).toHaveText("Field A: the first photograph. Photo: Staff");
    await expect(gallery.locator("img").first()).toHaveAttribute("srcset", /1536w/);
    await expect(gallery.locator("button")).toHaveCount(0);
    await gallery.locator("a[href]").first().click();
    await expect(page).toHaveURL(`${base}${photos}field-a.jpg`);
    await context.close();
  });

  test("advertises each editorial original once in the image sitemap", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    const xml = await response.text();
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');

    const entry = xml.split("<url>").find((block) => block.includes("<loc>https://weeklywildcat.com/2026/08/19/news/weekly-wildcat-latest-fixture-story/</loc>"))!;
    const images = [...entry.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => match[1]);
    const origin = "https://weeklywildcat.com";
    for (const name of ["a", "b", "c", "d", "e"]) expect(images).toContain(`${origin}${photos}field-${name}.jpg`);
    expect(images.every((image) => image.startsWith(`${origin}/`))).toBe(true);
    expect(new Set(images).size).toBe(images.length);
    // Derivatives, related-story thumbnails and site graphics are not editorial originals.
    expect(images.filter((image) => /-\d+x\d+\.jpg$/.test(image))).toEqual([]);
    expect(images.filter((image) => /\/newsroom\/|logo|favicon|avatar|brand\//i.test(image))).toEqual([]);
    // Pages without photography do not grow image entries.
    expect(xml.split("<url>")[1]).not.toContain("<image:image>");
    // Crawlers can actually fetch what the sitemap names.
    for (const image of images) expect((await request.get(image.replace(origin, ""))).ok()).toBe(true);
  });
});
