import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildRssFeed } from "@/lib/feed";
import { buildNewsSitemapXml, NEWS_RECENCY_WINDOW_MS } from "@/lib/news-sitemap";
import { buildSitemapEntries } from "@/lib/sitemap";
import { getCategorySeoDescription, isUsableCategoryDescription } from "@/lib/sections";
import { excludeInternalPages, getPageIndexing, type WordPressPage } from "@/lib/wordpress";
import { author, category, post } from "@/tests/support/seo-fixtures";

const ORIGIN = "https://weeklywildcat.com";
const NOW = Date.parse("2026-10-15T12:00:00Z");

function page(slug: string, title: string, bylinePage?: WordPressPage["bylinePage"]): WordPressPage {
  return {
    id: slug.length, slug, date: "2026-07-01T10:00:00", modified: "2026-07-02T10:00:00", modified_gmt: "2026-07-02T14:00:00",
    title: { rendered: title }, excerpt: { rendered: "" }, content: { rendered: "" }, ...(bylinePage ? { bylinePage } : {})
  };
}

function xml(source: string) {
  return new JSDOM(source, { contentType: "text/xml" }).window.document;
}

describe("CMS page indexability", () => {
  it("defaults to public and honors the Byline Page setting", () => {
    expect(getPageIndexing(page("contact", "Contact"))).toBe("public");
    expect(getPageIndexing(page("contact", "Contact", { indexing: "public" }))).toBe("public");
    expect(getPageIndexing(page("band-concessions", "Concessions", { indexing: "noindex" }))).toBe("noindex");
    expect(getPageIndexing(page("staff-only", "Staff only", { indexing: "internal" }))).toBe("internal");
    expect(getPageIndexing(page("contact", "Contact", { indexing: "surprise" }))).toBe("public");
  });

  it("always keeps the editors' CMS Notice page internal, even without or against the setting", () => {
    expect(getPageIndexing(page("78-2", "CMS Notice"))).toBe("internal");
    expect(getPageIndexing(page("renamed", " <em>cms&nbsp;notice</em> "))).toBe("internal");
    expect(getPageIndexing(page("78-2", "Something else"))).toBe("internal");
    expect(getPageIndexing(page("78-2", "CMS Notice", { indexing: "public" }))).toBe("internal");
  });

  it("drops internal pages from routes while keeping noindex pages", () => {
    const pages = [page("about", "About"), page("78-2", "CMS Notice"), page("hidden", "Hidden", { indexing: "noindex" }), page("ops", "Ops", { indexing: "internal" })];
    expect(excludeInternalPages(pages).map((entry) => entry.slug)).toEqual(["about", "hidden"]);
  });
});

describe("sitemap.xml entries", () => {
  const news = category(2, "News", "news");
  const culture = category(3, "Arts & Culture", "culture");
  const empty = category(4, "Opinion", "opinion");
  const posts = [
    post({ id: 1, slug: "a", date: "2026-10-14T18:15:00", categories: [2], modified_gmt: "2026-10-14T23:00:00" }),
    post({ id: 2, slug: "b", date: "2026-10-10T09:00:00", categories: [3], modified_gmt: "2026-10-10T13:30:00",
      _embedded: { author: [author(1, "Gibson Bell", "gibson")], "wp:term": [[culture], []] } })
  ];
  const authors = [author(1, "Gibson Bell", "gibson"), author(2, "No Stories", "quiet")];
  const entries = buildSitemapEntries({
    siteUrl: ORIGIN,
    timeZone: "America/New_York",
    posts,
    categories: [culture, news, empty],
    sectionSlugs: ["news", "opinion", "culture"],
    pages: [
      page("contact", "Contact"),
      page("band-concessions", "Concessions", { indexing: "noindex" }),
      page("ops", "Ops", { indexing: "internal" }),
      page("sports-archive", "Sports Archive", { sportsArchive: { key: "index", routes: { "/sports/": "" } } }),
      page("about", "About Us")
    ],
    contributors: authors,
    coverages: [],
    features: { sports: true }
  });
  const urls = entries.map((entry) => entry.url);

  it("lists the homepage, sections with stories, articles, authors with stories and public pages", () => {
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls).toContain(`${ORIGIN}/category/news/`);
    expect(urls).toContain(`${ORIGIN}/category/culture/`);
    expect(urls).toContain(`${ORIGIN}/2026/10/14/news/a/`);
    expect(urls).toContain(`${ORIGIN}/author/gibson/`);
    expect(urls).toContain(`${ORIGIN}/contact/`);
    expect(urls).toContain(`${ORIGIN}/sports-archive/`);
    expect(urls).toContain(`${ORIGIN}/about/`);
    expect(urls).toContain(`${ORIGIN}/diversity-inclusion/`);
    expect(urls).toContain(`${ORIGIN}/media-kit/`);
  });

  it("leaves out noindex, internal, search, 404, redirect, empty and duplicate URLs", () => {
    for (const excluded of ["/band-concessions/", "/ops/", "/78-2/", "/search/", "/404/", "/404.html", "/media-assets/", "/sports/", "/sports/schedule/", "/category/opinion/", "/author/quiet/", "/coverage/"]) {
      expect(urls).not.toContain(`${ORIGIN}${excluded}`);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("uses each item's own modification time", () => {
    const lastmod = (path: string) => entries.find((entry) => entry.url === `${ORIGIN}${path}`)?.lastModified?.toString();
    expect(lastmod("/category/culture/")).toBe(new Date("2026-10-10T13:30:00Z").toString());
    expect(lastmod("/contact/")).toBe(new Date("2026-07-02T14:00:00Z").toString());
    expect(lastmod("/")).toBe(new Date("2026-10-14T23:00:00Z").toString());
  });
});

describe("news-sitemap.xml", () => {
  const options = { siteUrl: ORIGIN, publicationName: "Weekly Wildcat", timeZone: "America/New_York", now: NOW };
  const fresh = post({ id: 1, slug: "fresh", title: { rendered: "Students &amp; teachers rally" }, date: "2026-10-15T07:00:00", date_gmt: "2026-10-15T11:00:00" });
  const yesterday = post({ id: 2, slug: "yesterday", date_gmt: "2026-10-14T11:00:00", date: "2026-10-14T07:00:00" });
  const stale = post({ id: 3, slug: "stale", date_gmt: "2026-10-12T11:59:00", date: "2026-10-12T07:59:00" });
  const future = post({ id: 4, slug: "future", date_gmt: "2026-10-16T11:00:00", date: "2026-10-16T07:00:00" });
  const xmlOut = buildNewsSitemapXml([fresh, yesterday, stale, future], options);

  it("only lists stories inside the two-day window", () => {
    const locs = [...xml(xmlOut).getElementsByTagName("loc")].map((node) => node.textContent);
    expect(NEWS_RECENCY_WINDOW_MS).toBe(2 * 24 * 60 * 60 * 1000);
    expect(locs).toEqual([`${ORIGIN}/2026/10/15/news/fresh/`, `${ORIGIN}/2026/10/14/news/yesterday/`]);
  });

  it("is well-formed XML with timezone-aware dates and decoded, re-escaped titles", () => {
    const document = xml(xmlOut);
    const dates = [...document.getElementsByTagName("news:publication_date")].map((node) => node.textContent);
    expect(dates).toEqual(["2026-10-15T11:00:00.000Z", "2026-10-14T11:00:00.000Z"]);
    expect(document.getElementsByTagName("news:title")[0].textContent).toBe("Students & teachers rally");
    expect(xmlOut).toContain("<news:title>Students &amp; teachers rally</news:title>");
  });

  it("converts local-only dates in the publication timezone", () => {
    const localOnly = post({ slug: "local", date: "2026-10-15T07:00:00", date_gmt: "" });
    expect(buildNewsSitemapXml([localOnly], options)).toContain("<news:publication_date>2026-10-15T11:00:00.000Z</news:publication_date>");
  });

  it("produces an empty but valid urlset when nothing is recent", () => {
    expect(xml(buildNewsSitemapXml([stale], options)).getElementsByTagName("url")).toHaveLength(0);
  });
});

describe("feed.xml", () => {
  const options = { siteUrl: ORIGIN, title: "Weekly Wildcat", description: "Student journalism.", language: "en-US", timeZone: "America/New_York" };
  const feed = buildRssFeed([post({ title: { rendered: "Sy&#8217;Reanna &amp; the band" }, excerpt: { rendered: "<p>Arts &amp; Culture.</p>" } })], options);

  it("is valid RSS with canonical links, dates, authors and excerpts", () => {
    const document = xml(feed);
    const item = document.getElementsByTagName("item")[0];
    expect(document.documentElement.tagName).toBe("rss");
    expect(item.getElementsByTagName("link")[0].textContent).toBe(`${ORIGIN}/2026/10/14/news/homecoming-week/`);
    expect(item.getElementsByTagName("guid")[0].textContent).toBe(`${ORIGIN}/2026/10/14/news/homecoming-week/`);
    expect(item.getElementsByTagName("title")[0].textContent).toBe("Sy’Reanna & the band");
    expect(item.getElementsByTagName("description")[0].textContent).toBe("Arts & Culture.");
    expect(item.getElementsByTagName("dc:creator")[0].textContent).toBe("Gibson Bell");
    expect(item.getElementsByTagName("category")[0].textContent).toBe("News");
    expect(new Date(item.getElementsByTagName("pubDate")[0].textContent ?? "").toISOString()).toBe("2026-10-14T22:15:00.000Z");
    expect(feed).toContain(`<atom:link href="${ORIGIN}/feed.xml" rel="self"`);
  });

  it("skips stories without a canonical route", () => {
    const routeless = post({ categories: [], _embedded: { author: [author(1, "A", "a")] } });
    expect(xml(buildRssFeed([routeless], options)).getElementsByTagName("item")).toHaveLength(0);
  });
});

describe("section descriptions", () => {
  it("rejects placeholder category descriptions but keeps real ones", () => {
    for (const weak of ["Breaking & general", "NSHS Wildcat Sports", "Weekly Wildcat campus reporting.", ""]) {
      expect(isUsableCategoryDescription(weak)).toBe(false);
    }
    expect(isUsableCategoryDescription("Reporting on the Wildcat football team, from preseason through the playoffs.")).toBe(true);
  });

  it("falls back to the publication's own newspaper-voice descriptions", () => {
    expect(getCategorySeoDescription({ slug: "news", name: "News", description: "Breaking & general" }))
      .toBe("News from Ninety Six High School and the Ninety Six community, reported by Weekly Wildcat student journalists.");
    expect(getCategorySeoDescription({ slug: "sports", name: "Sports", description: "NSHS Wildcat Sports" }))
      .toBe("Scores, results and reporting on Ninety Six High School Wildcats athletics from the Weekly Wildcat.");
    for (const slug of ["features", "opinion", "culture"]) {
      expect(getCategorySeoDescription({ slug, name: slug, description: "" })).toMatch(/Ninety Six/);
    }
  });

  it("lets a substantial WordPress description override the default, and has a sentence for unknown sections", () => {
    expect(getCategorySeoDescription({ slug: "news", name: "News", description: "Everything the newsroom has reported this school year, newest first." }))
      .toBe("Everything the newsroom has reported this school year, newest first.");
    expect(getCategorySeoDescription({ slug: "clubs", name: "Clubs", description: "" }))
      .toBe("Clubs coverage from Weekly Wildcat, the student newspaper of Ninety Six High School.");
  });
});
