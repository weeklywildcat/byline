import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THE_PROWLER, isProwlerHref } from "@/lib/the-prowler";
import { filterGeneralEditorialPosts, filterPublicHomepagePosts, filterVisibleContentPosts, getPrimaryVisibleCategory, getProwlerPosts } from "@/lib/content";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { buildRssFeed } from "@/lib/feed";
import { buildNewsSitemapXml } from "@/lib/news-sitemap";
import { getNewsArticleSchema } from "@/lib/seo";
import { buildSitemapEntries } from "@/lib/sitemap";
import { ProwlerSection } from "@/components/ProwlerSection";
import { SiteHeader } from "@/components/SiteHeader";
import { getAllPosts, getCategoryBySlug, getPostsByCategory, getPostContributors, getPostHref } from "@/lib/public-content";
import TheProwlerPage, { getMetadata } from "@/views/the-prowler/page";
import CategoryPage from "@/views/category/[slug]/page";
import { getBuildSnapshot } from "@/lib/build-snapshot";
import { CODE_ROUTED_PAGE_SLUGS } from "@/lib/code-routes";
import { author, category, post } from "@/tests/support/seo-fixtures";

vi.mock("@/lib/public-content", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/public-content")>(),
  getAllPosts: vi.fn(), getCategoryBySlug: vi.fn(), getPostsByCategory: vi.fn()
}));
vi.mock("@/lib/build-snapshot", () => ({ getBuildSnapshot: vi.fn() }));

const writer = author(1, "Gibson Bell", "gibson");
const newsCategory = category(2, "News", "news");
const prowlerCategory = category(30, THE_PROWLER.name, THE_PROWLER.slug);
const news = post({ id: 1, slug: "ordinary-news", title: { rendered: "Ordinary news" } });
// News is deliberately first and the post is sticky: satire must still read as satire.
const satire = post({ id: 2, slug: "cafeteria-declares-independence", sticky: true, categories: [2, 30],
  title: { rendered: "Cafeteria declares independence" },
  _embedded: { author: [writer], "wp:term": [[newsCategory, prowlerCategory], []] }
});
const newerSatire = { ...satire, id: 3, slug: "bell-rings-early", date: "2026-10-16T12:00:00", title: { rendered: "Bell rings early, nobody notices" } };
const draft = { ...satire, id: 4, status: "draft" };
const posts = [news, satire, draft, newerSatire];

beforeEach(() => {
  vi.mocked(getAllPosts).mockResolvedValue(posts);
  vi.mocked(getCategoryBySlug).mockResolvedValue(newsCategory);
  vi.mocked(getPostsByCategory).mockResolvedValue(posts);
  vi.mocked(getBuildSnapshot).mockResolvedValue({ posts, pages: [] } as unknown as Awaited<ReturnType<typeof getBuildSnapshot>>);
});

describe("The Prowler", () => {
  it("keeps satire public but out of general news, even when it is also filed in News", () => {
    expect(filterVisibleContentPosts(posts).map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(filterGeneralEditorialPosts(posts)).toEqual([news]);
    expect(filterPublicHomepagePosts(posts)).toEqual([news]);
    expect(getProwlerPosts(posts)).toEqual([newerSatire, satire]);
    expect(getPrimaryVisibleCategory(satire)).toEqual(prowlerCategory);
  });

  it("swaps the site masthead for The Prowler wordmark and keeps a way home", () => {
    const header = renderToStaticMarkup(<SiteHeader masthead="prowler" homepage />);
    expect(header).toMatch(/<h1 class="masthead-logo"><a href="\/the-prowler\/"><img src="\/brand\/the-prowler-logo.svg" alt="The Prowler"/);
    expect(header).toContain('<a class="site-utility-home" href="/">Weekly Wildcat</a>');
    expect(header).toContain("site-header--prowler");
    const overlay = renderToStaticMarkup(<SiteHeader mode="story-overlay" masthead="prowler" />);
    expect(overlay).toContain('href="/the-prowler/"');
    expect(overlay).toContain(THE_PROWLER.logo.src);
    const standard = renderToStaticMarkup(<SiteHeader />);
    expect(standard).not.toContain(THE_PROWLER.logo.src);
    expect(standard).not.toContain("site-utility-home");
  });

  it("renders a newest-first archive", async () => {
    const page = renderToStaticMarkup(await TheProwlerPage());
    expect(page).not.toContain("None of it is real");
    expect(page.indexOf("Bell rings early")).toBeLessThan(page.indexOf("Cafeteria declares independence"));
    expect(page).not.toContain("Ordinary news");
    expect((await getMetadata()).robots?.index).not.toBe(false);
    const section = renderToStaticMarkup(await CategoryPage({ params: Promise.resolve({ slug: "news" }) }));
    expect(section).toContain("Ordinary news");
    expect(section).not.toContain("Cafeteria declares independence");
  });

  it("links articles to the section page and marks them as satirical in structured data", () => {
    const presentation = buildArticlePresentation({ post: satire, allPosts: posts, contributors: getPostContributors(satire), author: writer });
    expect(presentation).toMatchObject({ category: { href: THE_PROWLER.path } });
    expect(getNewsArticleSchema(satire)["@type"]).toBe("SatiricalArticle");
    expect(getNewsArticleSchema(news)["@type"]).toBe("NewsArticle");
    expect(isProwlerHref("/category/the-prowler/")).toBe(true);
    expect(isProwlerHref("/category/news/")).toBe(false);
  });

  it("keeps satire out of RSS and Google News but lists the section in the sitemap", () => {
    const rss = buildRssFeed(posts, { siteUrl: "https://example.test", title: "News", description: "News", language: "en-US", timeZone: "America/New_York" });
    expect(rss).toContain("Ordinary news");
    expect(rss).not.toContain("Cafeteria declares independence");
    const newsXml = buildNewsSitemapXml(filterVisibleContentPosts(posts), { siteUrl: "https://example.test", publicationName: "Test", timeZone: "America/New_York", now: Date.parse("2026-10-16T18:00:00Z") });
    expect(newsXml).not.toContain("bell-rings-early");
    const urls = buildSitemapEntries({ siteUrl: "https://example.test", timeZone: "America/New_York",
      posts: filterVisibleContentPosts(posts), categories: [newsCategory, prowlerCategory], sectionSlugs: ["news"],
      pages: [], contributors: [writer], coverages: [], features: { sports: false } }).map((entry) => entry.url);
    expect(urls).toContain(`https://example.test${getPostHref(satire)}`);
    expect(urls).toContain(`https://example.test${THE_PROWLER.path}`);
    expect(urls).not.toContain("https://example.test/category/the-prowler/");
    expect(CODE_ROUTED_PAGE_SLUGS).toContain(THE_PROWLER.pageSlug);
  });

  it("shows at most two homepage teasers and an empty, unindexed archive with no homepage strip", async () => {
    const homepage = renderToStaticMarkup(<ProwlerSection posts={[newerSatire, satire, newerSatire]} />);
    expect(homepage.match(/class="story-teaser /g)).toHaveLength(2);
    expect(homepage).toContain('href="/the-prowler/"');
    expect(renderToStaticMarkup(<ProwlerSection posts={[]} />)).toBe("");
    vi.mocked(getAllPosts).mockResolvedValue([news, draft]);
    expect(renderToStaticMarkup(await TheProwlerPage())).toContain("Satire will appear here");
    expect((await getMetadata()).robots?.index).toBe(false);
  });
});
