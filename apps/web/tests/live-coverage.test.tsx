import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleView, StoryCard } from "@byline/ui";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { archiveLiveState } from "@/lib/native-archive-views";
import { buildArticleLiveView, buildLiveFeed, formatLiveTime, liveFeedCacheKey } from "@/lib/live-coverage";
import { buildNewsSitemapXml } from "@/lib/news-sitemap";
import { getNewsArticleSchema, getPostTimestamps } from "@/lib/seo";
import { toStoryView } from "@/lib/story-view";
import { post } from "@/tests/support/seo-fixtures";

const updates = [
  { id: 31, title: "", html: "<p>Halftime: 14-7.</p>", date: "2026-10-14T23:40:00Z", modified: "2026-10-14T23:40:00Z", pinned: false, author: "Ana Reporter" },
  { id: 30, title: "What to know", html: "<ul><li>Kickoff 7 p.m.</li></ul>", date: "2026-10-14T22:30:00Z", modified: "2026-10-14T22:30:00Z", pinned: true, author: "" },
  { id: 29, title: "Kickoff", html: "<p>We are underway.</p>", date: "2026-10-14T23:05:00Z", modified: "2026-10-14T23:05:00Z", pinned: false, author: "Ana Reporter" }
];
const liveStory = post({ id: 9, live: { status: "live", startedAt: "2026-10-14T22:20:00Z", endedAt: "", updates } });
const endedStory = post({ id: 9, live: { status: "ended", startedAt: "2026-10-14T22:20:00Z", endedAt: "2026-10-15T01:00:00Z", updates } });

describe("live coverage on the public site", () => {
  it("splits out the key points and preserves the complete timeline newest first with absolute times", () => {
    const view = buildArticleLiveView(liveStory)!;
    expect(view.keyPoints?.id).toBe(30);
    expect(view.updates.map((update) => update.id)).toEqual([31, 29, 30]);
    expect(view.updatedAt).toBe("2026-10-14T23:40:00.000Z");
    expect(view.updates[0].dateLabel).toBe(formatLiveTime("2026-10-14T23:40:00Z"));
    expect(formatLiveTime("2026-10-14T23:40:00Z")).toBe("Oct 14, 7:40 PM");
    expect(view.feedUrl).toBe("/_byline/live/9.json");
    expect(buildArticleLiveView(post())).toBeNull();
  });

  it("renders the live section and badge into the static page, and keeps every update once ended", () => {
    const live = renderToStaticMarkup(<ArticleView presentation={buildArticlePresentation({ post: liveStory, allPosts: [liveStory], contributors: [], author: null })} />);
    expect(live).toContain('data-byline-live="9"');
    expect(live).toContain('data-status="live"');
    expect(live).toContain("article-live-badge");
    expect(live).toContain('id="update-31"');
    expect(live).toContain("Key points");

    const ended = renderToStaticMarkup(<ArticleView presentation={buildArticlePresentation({ post: endedStory, allPosts: [endedStory], contributors: [], author: null })} />);
    expect(ended).toContain("Live coverage ended");
    expect(ended).not.toContain("article-live-badge");
    expect(ended).not.toContain("article-live-new");
    for (const id of [31, 29, 30]) expect(ended).toContain(`id="update-${id}"`);
  });

  it("dates the story by its newest update", () => {
    const presentation = buildArticlePresentation({ post: liveStory, allPosts: [liveStory], contributors: [], author: null });
    expect(presentation.modifiedAt).toBe("2026-10-14T23:40:00.000Z");
    expect(presentation.update).toBeNull();
    expect(getPostTimestamps(liveStory).modified).toBe("2026-10-14T23:40:00.000Z");
  });

  it("publishes the feed the page polls, rendered by the same component", () => {
    const feed = buildLiveFeed(liveStory)!;
    expect(feed.status).toBe("live");
    expect(feed.updates.map((update) => update.id)).toEqual([31, 29, 30]);
    expect(feed.updates[0].html).toContain('id="update-31"');
    expect(feed.updates[0].html).toContain("Halftime: 14-7.");
    expect(buildLiveFeed(post())).toBeNull();
  });

  it("gives static live feeds content-scoped incremental cache keys", () => {
    const key = liveFeedCacheKey(liveStory);
    expect(key).toMatch(/^[a-f0-9]{16}$/);
    expect(liveFeedCacheKey({ ...liveStory, title: { rendered: "A retitled live story" } })).toBe(key);
    const changed = post({ id: 9, live: { status: "live", startedAt: "2026-10-14T22:20:00Z", endedAt: "", updates: [
      { ...updates[0], id: 32, date: "2026-10-15T00:01:00Z", modified: "2026-10-15T00:01:00Z" },
      ...updates
    ] } });
    expect(liveFeedCacheKey(changed)).not.toBe(key);
    expect(liveFeedCacheKey(post())).toBeNull();
  });

  it("keeps archive-card live state without copying the update timeline", () => {
    const projected = archiveLiveState({
      status: "live",
      startedAt: "2026-10-14T22:20:00.000Z",
      endedAt: "",
      updates: [{ id: 31 } as never]
    });
    expect(projected).toEqual({
      status: "live",
      startedAt: "2026-10-14T22:20:00.000Z",
      endedAt: "",
      updates: []
    });
    expect(toStoryView(post({ id: 9, live: projected })).live).toBe(true);
  });

  it("describes the story as a LiveBlogPosting with its updates", () => {
    const schema = getNewsArticleSchema(endedStory) as Record<string, any>;
    expect(schema["@type"]).toEqual(["NewsArticle", "LiveBlogPosting"]);
    expect(schema.coverageStartTime).toBe("2026-10-14T22:20:00.000Z");
    expect(schema.coverageEndTime).toBe("2026-10-15T01:00:00.000Z");
    expect(schema.liveBlogUpdate[0]).toMatchObject({ "@type": "BlogPosting", headline: "Halftime: 14-7.", url: expect.stringMatching(/#update-31$/) });
    expect(getNewsArticleSchema(post())["@type"]).toBe("NewsArticle");
  });

  it("keeps the news sitemap publication window for running and ended stories", () => {
    const options = { siteUrl: "https://weeklywildcat.com", publicationName: "Weekly Wildcat", timeZone: "America/New_York", now: Date.parse("2026-10-20T12:00:00Z") };
    expect(buildNewsSitemapXml([liveStory], options)).not.toContain("<loc>");
    expect(buildNewsSitemapXml([endedStory], options)).not.toContain("<loc>");
  });

  it("labels running stories LIVE on cards", () => {
    expect(toStoryView(liveStory).live).toBe(true);
    expect(toStoryView(endedStory).live).toBeUndefined();
    expect(renderToStaticMarkup(<StoryCard story={toStoryView(liveStory)} variant="grid" fallbackAuthorName="Staff" />)).toContain('<span class="home-story-live">Live</span>');
  });
});

describe("live data boundary", () => {
  it("orders instants across time zones, rejects invalid dates, and drops duplicate IDs", () => {
    const story = post({ live: { status: "live", startedAt: "2026-11-02T19:00:00Z", updates: [
      { ...updates[0], id: 1, date: "2026-11-02T15:00:00-05:00" },
      { ...updates[0], id: 2, date: "2026-11-02T20:30:00Z" },
      { ...updates[0], id: 1, date: "2026-11-02T20:00:00Z" },
      { ...updates[0], id: 3, date: "2026-02-31T20:00:00Z" },
      { ...updates[0], id: 4, date: "not a date" }
    ] } });
    expect(buildArticleLiveView(story)?.updates.map((update) => update.id)).toEqual([2, 1]);
    expect(buildArticleLiveView(story)?.updates[1].date).toBe("2026-11-02T20:00:00.000Z");
  });
  it("credits each update to its own author with a headshot, profile link and role", () => {
    const story = post({ live: { status: "live", startedAt: "2026-11-02T19:00:00Z", updates: [
      { ...updates[0], id: 2, date: "2026-11-02T20:00:00Z", author: "Ana Reporter", authorSlug: "ana-reporter", authorRole: "Reporting from the stadium", authorPhoto: { url: "/_byline/media/ana.jpg", width: 150, height: 150 } },
      { ...updates[0], id: 1, date: "2026-11-02T18:00:00Z", author: "Jo Writer", authorSlug: "../evil", authorPhoto: { url: "javascript:alert(1)", width: 150, height: 150 } }
    ] } });
    const [ana, jo] = buildLiveFeed(story)!.updates.map((update) => update.html);
    expect(ana).toContain('class="article-live-update-avatar author-avatar" src="/_byline/media/ana.jpg"');
    expect(ana).toContain('<a href="/author/ana-reporter/">Ana Reporter</a>');
    expect(ana).toContain('<span class="article-live-update-role">Reporting from the stadium</span>');
    expect(ana).toContain('data-live-share="update-2"');
    // An unusable slug or photo falls back to the plain name and an initial.
    expect(jo).not.toContain("<a href=\"/author/");
    expect(jo).not.toContain("javascript:");
    expect(jo).toContain('author-avatar-fallback" aria-hidden="true">J</span>');
  });
  it("renders an empty live story and a pinned photo as complete static content", () => {
    const empty = post({ live: { status: "live", startedAt: "2026-11-02T19:00:00Z", updates: [] } });
    const view = buildArticleLiveView(empty)!;
    expect(view.updatedAt).toBe("2026-11-02T19:00:00.000Z");
    expect(renderToStaticMarkup(<ArticleView presentation={buildArticlePresentation({ post: empty, allPosts: [empty], contributors: [], author: null })} />)).toContain("Updates will appear here.");
    const pinned = post({ live: { status: "ended", startedAt: "2026-11-02T19:00:00Z", endedAt: "2026-11-02T21:00:00Z", updates: [
      { ...updates[0], pinned: true, title: '<headline>', author: 'Ana & Jo', image: { url: '/_byline/media/photo.jpg', alt: 'A "photo"', width: 900, height: 600, credit: 'Jo & Ana' } }
    ] } });
    const feed = buildLiveFeed(pinned)!;
    expect(feed.updates).toHaveLength(1);
    expect(feed.updates[0].html).toContain('id="update-31"');
    expect(feed.updates[0].html).toContain('alt="A &quot;photo&quot;"');
    expect(feed.updates[0].html).toContain('Photo: Jo &amp; Ana');
    expect(feed.updates[0].html).toContain('&lt;headline&gt;');
    expect(getPostTimestamps(pinned).modified).toBe("2026-11-02T21:00:00.000Z");
  });
});
