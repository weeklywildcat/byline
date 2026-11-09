import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryCard } from "@byline/ui";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getArticleJsonLd, getVideoObjectSchema, getVideoStories, getVideoStoryMetadata } from "@/lib/story-video";
import { buildSitemapEntries } from "@/lib/sitemap";
import { toStoryView } from "@/lib/story-view";
import { buildVideoSitemapXml } from "@/lib/video-sitemap";
import { absoluteUrl, serializeJsonLd } from "@/lib/seo";
import { getPostContributors, getPostHref, getPostPrimaryVideo, type ArchivePost } from "@/lib/public-content";
import { StoryTeaser } from "@/components/StoryTeaser";
import { StoryArticle } from "@/lib/story-presentation-host";
import { auditVideoSitemap, pageVideoObject, type SitemapPage } from "@/scripts/seo-audit.mts";
import { category, media, post } from "@/tests/support/seo-fixtures";

const ID = "dQw4w9WgXcQ";
const EMBED = `https://www.youtube.com/embed/${ID}`;
const BODY_EMBED = `<figure class="wp-block-embed is-type-video is-provider-youtube"><div class="wp-block-embed__wrapper"><iframe title="Highlights" src="https://www.youtube.com/embed/aaaaaaaaaaa?feature=oembed"></iframe></div></figure>`;

/** A published video story as the `byline` REST field (and build snapshot) delivers it. */
function videoStory(overrides: Partial<ArchivePost> = {}, video: Record<string, unknown> = {}): ArchivePost {
  return post({
    id: 21,
    slug: "homecoming-in-90-seconds",
    title: { rendered: "Homecoming in 90 seconds" },
    excerpt: { rendered: "<p>From the pep rally to the parade, the whole week at once.</p>" },
    content: { rendered: "<p>Student reporters followed the week with two cameras.</p>" },
    featured_media: 90,
    byline: {
      format: "video",
      video: {
        provider: "youtube",
        videoId: ID,
        url: `https://www.youtube.com/watch?v=${ID}`,
        title: "Homecoming week in 90 seconds | Weekly Wildcat",
        thumbnailUrl: `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
        uploadDate: "2026-10-14T20:00:00Z",
        duration: "PT1M32S",
        ...video
      }
    },
    _embedded: {
      author: [{ id: 1, name: "Gibson Bell", slug: "gibson", description: "", avatar_urls: {} }],
      "wp:featuredmedia": [media()],
      "wp:term": [[category(2, "News", "news")], []]
    },
    ...overrides
  });
}

/** An ordinary article, even with a YouTube embed in its body. */
const article = post({ id: 22, slug: "board-meeting", featured_media: 90, content: { rendered: `<p>The board met.</p>${BODY_EMBED}` }, _embedded: {
  author: [{ id: 1, name: "Gibson Bell", slug: "gibson", description: "", avatar_urls: {} }],
  "wp:featuredmedia": [media()],
  "wp:term": [[category(2, "News", "news")], []]
} });

function presentation(target: ArchivePost, all: ArchivePost[] = [target, article]) {
  return buildArticlePresentation({ post: target, allPosts: all, contributors: getPostContributors(target), author: null });
}

/** The article markup the route renders, with the JSON-LD the route puts beside it. */
function renderArticle(target: ArchivePost) {
  return `<script type="application/ld+json">${serializeJsonLd(getArticleJsonLd(target))}</script>${renderToStaticMarkup(<StoryArticle presentation={presentation(target)} />)}`;
}

describe("WordPress REST parsing of the story format", () => {
  it("reads a video story's primary video", () => {
    expect(getPostPrimaryVideo(videoStory())).toMatchObject({ provider: "youtube", videoId: ID, duration: "PT1M32S" });
  });

  it("is not a video story without the format, or without a valid video", () => {
    expect(getPostPrimaryVideo(article)).toBeNull();
    expect(getPostPrimaryVideo(videoStory({ byline: { format: "standard", video: { videoId: ID } } }))).toBeNull();
    expect(getPostPrimaryVideo(videoStory({ byline: { format: "video", video: null } }))).toBeNull();
    expect(getPostPrimaryVideo(videoStory({ byline: { format: "video", video: { videoId: "not-an-id" } } }))).toBeNull();
    // The legacy settings alias is read the same way.
    expect(getPostPrimaryVideo(videoStory({ byline: undefined, weeklyWildcat: { format: "video", video: { videoId: ID } } }))?.videoId).toBe(ID);
  });

  it("never treats a body YouTube embed as a first-class video", () => {
    expect(getVideoStoryMetadata(article)).toBeNull();
    expect(getVideoObjectSchema(article)).toBeNull();
    expect(presentation(article).video).toBeUndefined();
  });
});

describe("a standard article is unchanged", () => {
  it("keeps its featured photo, body embed and NewsArticle-only JSON-LD", () => {
    const view = presentation(article);
    expect("video" in view).toBe(false);
    expect(view.relatedStories.every((story) => !("video" in story))).toBe(true);
    const html = renderArticle(article);
    expect(html).toContain('class="featured-image');
    expect(html).not.toContain("article-primary-video");
    expect(html).not.toContain("article-video-label");
    expect(html).not.toContain("data-story-format");
    expect(html).toContain("youtube.com/embed/aaaaaaaaaaa");
    const jsonLd = getArticleJsonLd(article) as Record<string, unknown>;
    expect(jsonLd["@type"]).toBe("NewsArticle");
    expect(jsonLd).not.toHaveProperty("@graph");
    expect(jsonLd).not.toHaveProperty("video");
  });
});

describe("a video story is a watch page", () => {
  const story = videoStory();
  const html = renderArticle(story);

  it("server-renders one real YouTube iframe above the body, with no featured photo hero", () => {
    const iframes = [...html.matchAll(/<iframe\b[^>]*>/g)].map((match) => match[0]);
    expect(iframes).toHaveLength(1);
    expect(iframes[0]).toContain(`src="${EMBED}"`);
    expect(iframes[0]).toContain('title="Homecoming week in 90 seconds | Weekly Wildcat"');
    expect(iframes[0]).toContain('width="1280"');
    expect(iframes[0]).toContain('height="720"');
    expect(iframes[0]).not.toContain("loading=");
    expect(html).toContain('class="article-primary-video-frame"');
    // Order: Video label, headline, deck, byline, player, then the reporting.
    const order = ["article-video-label", "<h1", "article-excerpt", "article-author-line", "<iframe", 'class="article-body"'].map((needle) => html.indexOf(needle));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const header = html.slice(html.indexOf('<header class="article-header"'), html.indexOf("</header>"));
    expect(header).not.toContain("featured-image");
    expect(html).toContain('data-story-format="video"');
  });

  it("is never shown with the Immersive photo opening", () => {
    const immersive = videoStory({ byline: { ...videoStory().byline, presentation: "immersive" } });
    const markup = renderToStaticMarkup(<StoryArticle presentation={presentation(immersive)} />);
    expect(markup).not.toContain("immersive-article");
    expect(markup).toContain(`src="${EMBED}"`);
  });

  it("keeps authors, sections and related coverage", () => {
    const related = post({ id: 23, slug: "parade-route", date: "2026-10-13T10:00:00" });
    const view = presentation(story, [story, related, article]);
    expect(view.category).toEqual({ label: "News", href: "/category/news/" });
    expect(view.contributors.map((contributor) => contributor.name)).toEqual(["Gibson Bell"]);
    expect(view.relatedStories.map((card) => card.id)).toEqual(expect.arrayContaining([22, 23]));
    expect(html).toContain("Related Stories");
  });
});

describe("VideoObject structured data", () => {
  const story = videoStory();
  const canonical = absoluteUrl(getPostHref(story));
  const graph = (getArticleJsonLd(story) as { "@graph": Array<Record<string, unknown>> })["@graph"];
  const [articleNode, videoNode] = graph;

  it("keeps the NewsArticle and links it to a VideoObject in one graph", () => {
    expect(articleNode["@type"]).toBe("NewsArticle");
    expect(articleNode["@id"]).toBe(`${canonical}#article`);
    expect(articleNode.video).toEqual({ "@id": `${canonical}#video` });
    expect(videoNode["@type"]).toBe("VideoObject");
    expect(videoNode["@id"]).toBe(`${canonical}#video`);
    expect(videoNode.isPartOf).toEqual({ "@id": `${canonical}#article` });
  });

  it("has the required fields, describing the video in the iframe", () => {
    expect(videoNode).toMatchObject({
      name: "Homecoming week in 90 seconds | Weekly Wildcat",
      description: "From the pep rally to the parade, the whole week at once.",
      thumbnailUrl: [`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`],
      uploadDate: "2026-10-14T20:00:00.000Z",
      embedUrl: EMBED,
      duration: "PT1M32S"
    });
    const page = pageVideoObject(renderArticle(story));
    expect(page?.embedUrl).toBe(EMBED);
    expect(renderArticle(story)).toContain(`<iframe src="${page?.embedUrl}"`);
  });

  it("falls back to the story without inventing a duration", () => {
    const bare = videoStory({}, { title: undefined, thumbnailUrl: undefined, uploadDate: undefined, duration: undefined });
    const node = getVideoObjectSchema(bare)!;
    expect(node.name).toBe("Homecoming in 90 seconds");
    expect(node.thumbnailUrl).toEqual([`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`]);
    // The story's own publication time, as its NewsArticle states it.
    expect(node.uploadDate).toBe((getArticleJsonLd(bare) as { "@graph": Array<Record<string, unknown>> })["@graph"][0].datePublished);
    expect(node.uploadDate).toBe("2026-10-14T22:15:00.000Z");
    expect(node).not.toHaveProperty("duration");
    const noDeck = videoStory({ excerpt: { rendered: "" } }, { description: "YouTube's own description." });
    expect(getVideoObjectSchema(noDeck)?.description).toBe("YouTube's own description.");
  });
});

describe("video sitemap", () => {
  const story = videoStory();
  const xml = buildVideoSitemapXml([story, article], { siteUrl: "https://weeklywildcat.com" });

  it("lists video stories at their canonical URL with the VideoObject's metadata", () => {
    const canonical = `https://weeklywildcat.com${getPostHref(story)}`;
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    expect(xml).toContain(`<loc>${canonical}</loc>`);
    expect(xml).toContain(`<video:player_loc>${EMBED}</video:player_loc>`);
    expect(xml).toContain(`<video:thumbnail_loc>https://i.ytimg.com/vi/${ID}/maxresdefault.jpg</video:thumbnail_loc>`);
    expect(xml).toContain("<video:title>Homecoming week in 90 seconds | Weekly Wildcat</video:title>");
    expect(xml).toContain("<video:description>From the pep rally to the parade, the whole week at once.</video:description>");
    expect(xml).toContain("<video:duration>92</video:duration>");
    expect(xml).toContain("<video:publication_date>2026-10-14T20:00:00.000Z</video:publication_date>");
  });

  it("excludes standard stories, even with a YouTube embed", () => {
    expect(xml).not.toContain(getPostHref(article));
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(buildVideoSitemapXml([article], { siteUrl: "https://weeklywildcat.com" })).not.toContain("<url>");
  });

  it("agrees with the rendered page under the build audit", () => {
    const route = getPostHref(story);
    const canonical = `https://weeklywildcat.com${route}`;
    const pages = new Map<string, SitemapPage>([[route, { canonical, robots: "index,follow", kind: "article", video: pageVideoObject(renderArticle(story)) }]]);
    expect(auditVideoSitemap(xml, pages, "https://weeklywildcat.com")).toEqual([]);
    const drifted = xml.replace("<video:title>Homecoming week", "<video:title>Different");
    expect(auditVideoSitemap(drifted, pages, "https://weeklywildcat.com").map((issue) => issue.message)).toContain("video sitemap: name disagrees with the page's VideoObject");
  });
});

describe("discovery", () => {
  const story = videoStory();
  const entries = buildSitemapEntries({ siteUrl: "https://weeklywildcat.com", timeZone: "America/New_York", posts: [story, article], categories: [category(2, "News", "news")], sectionSlugs: ["news"], pages: [], contributors: [], coverages: [], features: { sports: false } });

  it("keeps video stories in the regular sitemap once, at their own URL, and lists /watch", () => {
    const urls = entries.map((entry) => entry.url);
    expect(urls.filter((url) => url === `https://weeklywildcat.com${getPostHref(story)}`)).toHaveLength(1);
    expect(urls).toContain("https://weeklywildcat.com/watch/");
    expect(urls.some((url) => url.includes("/watch/") && url !== "https://weeklywildcat.com/watch/")).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("does not list /watch while there are no videos", () => {
    const none = buildSitemapEntries({ siteUrl: "https://weeklywildcat.com", timeZone: "America/New_York", posts: [article], categories: [], sectionSlugs: [], pages: [], contributors: [], coverages: [], features: { sports: false } });
    expect(none.map((entry) => entry.url)).not.toContain("https://weeklywildcat.com/watch/");
  });

  it("puts only published video-format stories on /watch", () => {
    expect(getVideoStories([story, article]).map((candidate) => candidate.id)).toEqual([21]);
  });
});

describe("story cards", () => {
  it("label a video story and leave articles alone", () => {
    const videoTeaser = renderToStaticMarkup(<StoryTeaser post={videoStory()} />);
    expect(videoTeaser).toContain("story-video-badge");
    // The label is just "Video"; the running time stays in the structured data.
    // In the small byline line above the headline, never inside the headline itself.
    expect(videoTeaser).toMatch(/<div class="article-byline"><span class="story-video-badge">Video<\/span>/);
    expect(videoTeaser.slice(videoTeaser.indexOf("<h2"))).not.toContain("story-video-badge");
    expect(videoTeaser).not.toContain("1:32");
    expect(renderToStaticMarkup(<StoryTeaser post={article} />)).not.toContain("story-video-badge");

    const card = renderToStaticMarkup(<StoryCard story={toStoryView(videoStory())} variant="grid" fallbackAuthorName="Staff" />);
    expect(card).toContain("story-video-badge");
    expect(toStoryView(article)).not.toHaveProperty("video");
  });

  it("show the YouTube thumbnail when a video story has no featured photo", () => {
    const noPhoto = videoStory({ featured_media: 0, _embedded: { "wp:term": [[category(2, "News", "news")], []] } });
    expect(renderToStaticMarkup(<StoryTeaser post={noPhoto} />)).toContain(`src="https://i.ytimg.com/vi/${ID}/maxresdefault.jpg"`);
  });
});
