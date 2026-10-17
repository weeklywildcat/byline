import { decodeHtml } from "@/lib/format";
import { getFeaturedMedia, type WordPressPost } from "@/lib/wordpress";

/** Google reads at most 1,000 images per <url> entry. */
export const MAX_SITEMAP_IMAGES_PER_URL = 1000;

const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp|svg)$/i;
// Teasers for other stories and people are page furniture, not this story's photography.
const FURNITURE_CLASS = /(?:^|\s)(?:byline-newsroom-stories|story-teaser|byline-person-card|byline-newsroom-people|wp-smiley|emoji)(?:\s|$)/;
const FULL_SOURCE_ATTRIBUTE = "data-byline-full-url";
/** Tag body that tolerates `>` inside quoted attribute values. */
const TAG_BODY = `(?:[^>"']|"[^"]*"|'[^']*')*`;

function attributes(tag: string) {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (!result.has(match[1].toLowerCase())) result.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? ""));
  }
  return result;
}

/** Character ranges of elements whose class marks them as page furniture. */
function furnitureRanges(html: string) {
  const ranges: Array<[number, number]> = [];
  for (const open of html.matchAll(new RegExp(`<(article|div|section|aside|li|figure)\\b${TAG_BODY}>`, "gi"))) {
    if (!FURNITURE_CLASS.test(attributes(open[0]).get("class") ?? "")) continue;
    const name = open[1].toLowerCase();
    const start = open.index!;
    const pattern = new RegExp(`<(/?)${name}\\b${TAG_BODY}>`, "gi");
    pattern.lastIndex = start;
    let depth = 0;
    for (let tag = pattern.exec(html); tag; tag = pattern.exec(html)) {
      depth += tag[1] ? -1 : tag[0].endsWith("/>") ? 0 : 1;
      if (depth === 0) {
        ranges.push([start, tag.index + tag[0].length]);
        break;
      }
    }
  }
  return ranges;
}

/** An absolute URL on the site's own origin that names an image file, else null. */
function publicImageUrl(value: string | undefined, siteUrl: string) {
  if (!value) return null;
  try {
    const origin = new URL(siteUrl).origin;
    const url = new URL(value, `${origin}/`);
    if (url.origin !== origin || !IMAGE_FILE.test(url.pathname)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The full-size editorial photographs of a story, each once, as absolute public
 * URLs for the image sitemap.
 *
 * The featured image comes first, then every image embedded in the body. Body
 * images resolve to the attachment's canonical full-size URL
 * (`data-byline-full-url`, written by WordPress from `wp_get_attachment_image_url`),
 * falling back to a link to an image file and, for images WordPress never
 * resized, the rendered `src`. Derivatives of one photograph therefore collapse
 * to one URL.
 *
 * Only URLs on the site's own origin are listed: after media mirroring that is
 * exactly the set of files the static deploy serves to crawlers. Anything still
 * pointing at the CMS (a failed mirror) or another host is left out.
 */
export function getPostSitemapImages(post: WordPressPost, siteUrl: string): string[] {
  const images = new Set<string>();
  const add = (value: string | undefined) => {
    const url = publicImageUrl(value, siteUrl);
    if (url && images.size < MAX_SITEMAP_IMAGES_PER_URL) images.add(url);
  };

  add(getFeaturedMedia(post)?.source_url);

  const html = post.content?.rendered ?? "";
  const furniture = furnitureRanges(html);
  for (const image of html.matchAll(new RegExp(`<img\\b${TAG_BODY}>`, "gi"))) {
    const index = image.index!;
    if (furniture.some(([start, end]) => index >= start && index < end)) continue;
    const found = attributes(image[0]);
    if (FURNITURE_CLASS.test(found.get("class") ?? "")) continue;

    let source = publicImageUrl(found.get(FULL_SOURCE_ATTRIBUTE), siteUrl);
    if (!source) {
      // A media link wrapped around the image points at the original in older content.
      const before = html.slice(0, index);
      const anchor = before.lastIndexOf("<a ");
      if (anchor > before.lastIndexOf("</a>")) {
        source = publicImageUrl(attributes(before.slice(anchor, before.indexOf(">", anchor) + 1)).get("href"), siteUrl);
      }
    }
    // A WordPress-resized <img> with no canonical full-size source is a known
    // derivative of an original we cannot name without guessing at filenames, so
    // it is left to normal page crawling rather than listed as if it were canonical.
    const resized = /(?:^|\s)wp-image-\d+(?:\s|$)/.test(found.get("class") ?? "") || found.has("srcset");
    add(source ?? (resized ? undefined : found.get("src")));
  }

  return [...images];
}
