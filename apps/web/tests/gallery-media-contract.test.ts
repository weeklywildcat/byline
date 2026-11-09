import { describe, expect, it } from "vitest";
import { buildSitemapEntries } from "@/lib/sitemap";
import { getPostSitemapImages, MAX_SITEMAP_IMAGES_PER_URL } from "@/lib/sitemap-images";
import { buildSitemapXml } from "@/lib/sitemap-xml";
import { sitemapImageLocations, auditSitemapImages } from "@/scripts/seo-audit.mts";
import { category, media, post } from "@/tests/support/seo-fixtures";

const ORIGIN = "https://weeklywildcat.com";
const CMS = "https://cms.weeklywildcat.com/wp-content/uploads/2026/10";

/** What WordPress renders for a linked Photo Gallery, a standalone image and a related-story teaser. */
function articleHtml(base: string) {
  const gallery = (name: string, id: number, alt: string) => `<figure class="wp-block-image size-large"><a href="${base}/${name}.jpg"><img loading="lazy" width="1024" height="683" sizes="auto, (max-width: 540px) calc(100vw - 32px), 335px" data-byline-full-url="${base}/${name}.jpg" data-id="${id}" src="${base}/${name}-1024x683.jpg" alt="${alt}" class="wp-image-${id}" srcset="${base}/${name}-1024x683.jpg 1024w, ${base}/${name}-300x200.jpg 300w, ${base}/${name}-768x512.jpg 768w, ${base}/${name}-1536x1024.jpg 1536w" /></a><figcaption>${alt}. Photo: Staff</figcaption></figure>`;
  return `<p>Lead.</p><figure class="wp-block-gallery is-style-byline-photo-gallery">${gallery("one", 11, "One")}${gallery("two", 12, "Two")}</figure>`
    + `<figure class="wp-block-image size-large"><img width="1024" height="683" data-byline-full-url="${base}/one.jpg" src="${base}/one-1024x683.jpg" alt="One again" class="wp-image-11" /></figure>`
    + `<div class="wp-block-byline-stories byline-newsroom-stories byline-newsroom-stories-related"><article class="story-teaser"><figure class="featured-image"><div class="featured-image-frame"><img src="${base}/teaser-640x426.jpg" alt="Another story" loading="lazy"></div></figure></article></div>`;
}

describe("image sitemap", () => {
  const html = articleHtml("/_byline/media/abc123-photo");

  it("lists the featured original, then each embedded original once, and nothing else", () => {
    const story = post({
      featured_media: 90,
      content: { rendered: html },
      _embedded: { "wp:featuredmedia": [media({ source_url: "/_byline/media/abc123-featured.jpg" })] }
    });

    expect(getPostSitemapImages(story, ORIGIN)).toEqual([
      `${ORIGIN}/_byline/media/abc123-featured.jpg`,
      `${ORIGIN}/_byline/media/abc123-photo/one.jpg`,
      `${ORIGIN}/_byline/media/abc123-photo/two.jpg`
    ]);
  });

  it("does not guess an original for a resized image that never named one", () => {
    const legacy = `<img width="1024" height="683" src="/_byline/media/x-1024x683.jpg" srcset="/_byline/media/x-1024x683.jpg 1024w, /_byline/media/x-300x200.jpg 300w" class="wp-image-7" alt="x"><img src="/_byline/media/plain.png" alt="plain">`;
    expect(getPostSitemapImages(post({ content: { rendered: legacy } }), ORIGIN)).toEqual([`${ORIGIN}/_byline/media/plain.png`]);
  });

  it("falls back to an ordinary media link in older content", () => {
    const linked = `<a href="/_byline/media/old.jpg"><img src="/_byline/media/old-1024x683.jpg" class="wp-image-8" alt="old"></a>`;
    expect(getPostSitemapImages(post({ content: { rendered: linked } }), ORIGIN)).toEqual([`${ORIGIN}/_byline/media/old.jpg`]);
  });

  it("omits unmirrored CMS and third-party URLs, which crawlers cannot rely on", () => {
    const external = `<img data-byline-full-url="${CMS}/cms.jpg" src="${CMS}/cms-1024x683.jpg" class="wp-image-9" alt="cms"><img src="https://example.org/remote.jpg" alt="remote">`;
    const story = post({ content: { rendered: external }, _embedded: { "wp:featuredmedia": [media({ source_url: `${CMS}/featured.jpg` })] } });
    expect(getPostSitemapImages(story, ORIGIN)).toEqual([]);
  });

  it("respects Google's per-page limit", () => {
    const many = Array.from({ length: MAX_SITEMAP_IMAGES_PER_URL + 25 }, (_, index) => `<img data-byline-full-url="/_byline/media/p${index}.jpg" src="/_byline/media/p${index}-300x200.jpg" class="wp-image-${index}">`).join("");
    expect(getPostSitemapImages(post({ content: { rendered: many } }), ORIGIN)).toHaveLength(MAX_SITEMAP_IMAGES_PER_URL);
  });

  it("attaches images to article entries only and serializes them with escaped URLs", () => {
    const news = category(2, "News", "news");
    const story = post({ id: 1, slug: "a", categories: [2], content: { rendered: `<img data-byline-full-url="/_byline/media/a&amp;b <c>.jpg" src="/_byline/media/a-300x200.jpg" class="wp-image-3">` } });
    const entries = buildSitemapEntries({
      siteUrl: ORIGIN, timeZone: "America/New_York", posts: [story], categories: [news], sectionSlugs: ["news"], pages: [], contributors: [], coverages: [], features: { sports: false }
    });
    expect(entries.filter((entry) => entry.images?.length).map((entry) => entry.url)).toEqual([`${ORIGIN}/2026/10/14/news/a/`]);

    const xml = buildSitemapXml(entries);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain("<image:loc>https://weeklywildcat.com/_byline/media/a&amp;b%20%3Cc%3E.jpg</image:loc>");
    expect(sitemapImageLocations(xml)).toEqual([[`${ORIGIN}/2026/10/14/news/a/`, [`${ORIGIN}/_byline/media/a&b%20%3Cc%3E.jpg`]]]);
    expect(auditSitemapImages(xml, ORIGIN)).toEqual([]);
    expect(auditSitemapImages(xml.replace(/<image:image>[\s\S]*<\/image:image>/, (match) => match + match), ORIGIN).map((issue) => issue.message)).toContain("sitemap: lists the same image more than once");
  });
});
