import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
import { filterGeneralEditorialPosts, filterPublicHomepagePosts, filterVisibleContentPosts, getBehindTheScenesPosts, getPrimaryVisibleCategory } from "@/lib/content";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { buildRssFeed } from "@/lib/feed";
import { buildSitemapEntries } from "@/lib/sitemap";
import { BehindTheScenesSection } from "@/components/BehindTheScenesSection";
import { getAllPosts, getCategoryBySlug, getContributorBySlug, getPostsByCategory, getPostsByContributor, getPostContributors, getPostHref } from "@/lib/wordpress";
import BehindTheScenesPage, { getMetadata } from "@/views/behind-the-scenes/page";
import AuthorPage from "@/views/author/[slug]/page";
import CategoryPage from "@/views/category/[slug]/page";
import { getSearchPageProps } from "@/views/search/page";
import { getBuildSnapshot } from "@/lib/build-snapshot";
import { author, category, post } from "@/tests/support/seo-fixtures";

vi.mock("@/lib/wordpress", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/wordpress")>(),
  getAllPosts: vi.fn(), getCategoryBySlug: vi.fn(), getContributorBySlug: vi.fn(),
  getPostsByCategory: vi.fn(), getPostsByContributor: vi.fn()
}));
vi.mock("@/lib/build-snapshot", () => ({ getBuildSnapshot: vi.fn() }));

const writer = author(1, "Gibson Bell", "gibson");
const newsCategory = category(2, "News", "news");
const btsCategory = category(20, BEHIND_THE_SCENES.name, BEHIND_THE_SCENES.slug);
const news = post({ id: 1, slug: "ordinary-news", title: { rendered: "Ordinary news" } });
// News is deliberately first, and the post is sticky: BTS exclusion must win.
const bts = post({ id: 2, slug: "building-our-site", sticky: true, categories: [2, 20],
  title: { rendered: "Building our site" },
  _embedded: { author: [writer], "wp:term": [[newsCategory, btsCategory], []] }
});
const newerBts = { ...bts, id: 3, slug: "new-project", date: "2026-10-16T12:00:00", title: { rendered: "Our new project" } };
const draft = { ...bts, id: 4, status: "draft" };
const posts = [news, bts, draft, newerBts];

beforeEach(() => {
  vi.mocked(getAllPosts).mockResolvedValue(posts);
  vi.mocked(getCategoryBySlug).mockResolvedValue(newsCategory);
  vi.mocked(getPostsByCategory).mockResolvedValue(posts);
  vi.mocked(getContributorBySlug).mockResolvedValue(writer);
  vi.mocked(getPostsByContributor).mockResolvedValue(posts);
  vi.mocked(getBuildSnapshot).mockResolvedValue({ posts, pages: [] } as unknown as Awaited<ReturnType<typeof getBuildSnapshot>>);
});

describe("Behind the Scenes placement", () => {
  it("keeps published articles public while isolating them from general news, including mixed categories", () => {
    expect(filterVisibleContentPosts(posts).map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(filterGeneralEditorialPosts(posts)).toEqual([news]);
    expect(filterPublicHomepagePosts(posts)).toEqual([news]);
    expect(getBehindTheScenesPosts(posts)).toEqual([newerBts, bts]);
    expect(getPrimaryVisibleCategory(bts)).toEqual(btsCategory);
  });

  it("renders a newest-first archive and excludes BTS from other categories", async () => {
    const archive = renderToStaticMarkup(await BehindTheScenesPage());
    expect(archive.indexOf("Our new project")).toBeLessThan(archive.indexOf("Building our site"));
    expect(archive).toContain("Off Deadline");
    expect(archive).toContain("Stories behind the stories");
    expect(archive).not.toContain("Ordinary news");
    expect((await getMetadata()).robots?.index).not.toBe(false);
    const section = renderToStaticMarkup(await CategoryPage({ params: Promise.resolve({ slug: "news" }) }));
    expect(section).toContain("Ordinary news");
    expect(section).not.toContain("Building our site");
  });

  it("keeps articles in search and author profile story lists", async () => {
    const search = await getSearchPageProps();
    expect(search.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: bts.id, section: BEHIND_THE_SCENES.slug })]));
    const profile = renderToStaticMarkup(await AuthorPage({ params: Promise.resolve({ slug: writer.slug }) }));
    expect(profile).toContain("Building our site");
    expect(profile).toContain("Our new project");
  });

  it("excludes BTS from related and more-by recommendations but keeps its normal article presentation", () => {
    const presentation = (entry: typeof news) => buildArticlePresentation({ post: entry, allPosts: posts, contributors: getPostContributors(entry), author: writer });
    expect(presentation(news).relatedStories).toHaveLength(0);
    expect(presentation(news).moreByAuthorStories).toHaveLength(0);
    expect(presentation(bts)).toMatchObject({ title: "Building our site", category: { href: BEHIND_THE_SCENES.path } });
  });

  it("omits BTS from RSS while retaining article, section and author sitemap entries", () => {
    const rss = buildRssFeed(posts, { siteUrl: "https://example.test", title: "News", description: "News", language: "en-US", timeZone: "America/New_York" });
    expect(rss).toContain("Ordinary news");
    expect(rss).not.toContain("Building our site");
    const entries = buildSitemapEntries({ siteUrl: "https://example.test", timeZone: "America/New_York",
      posts: filterVisibleContentPosts(posts), categories: [newsCategory, btsCategory], sectionSlugs: ["news"],
      pages: [], contributors: [writer], coverages: [], features: { sports: false } });
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(`https://example.test${getPostHref(bts)}`);
    expect(urls).toContain(`https://example.test${BEHIND_THE_SCENES.path}`);
    expect(urls).toContain("https://example.test/author/gibson/");
    expect(urls).not.toContain("https://example.test/category/behind-the-scenes/");
  });

  it("shows at most two homepage teasers and has a useful empty archive with no homepage section", async () => {
    const homepage = renderToStaticMarkup(<BehindTheScenesSection posts={[newerBts, bts, newerBts]} />);
    expect(homepage.match(/class="story-teaser /g)).toHaveLength(2);
    expect(homepage).toContain('href="/off-deadline/"');
    expect(renderToStaticMarkup(<BehindTheScenesSection posts={[]} />)).toBe("");
    vi.mocked(getAllPosts).mockResolvedValue([news, draft]);
    expect(renderToStaticMarkup(await BehindTheScenesPage())).toContain("will appear here as we publish");
    expect((await getMetadata()).robots?.index).toBe(false);
    const emptyEntries = buildSitemapEntries({ siteUrl: "https://example.test", timeZone: "America/New_York", posts: [news], categories: [], sectionSlugs: [], pages: [], contributors: [], coverages: [], features: { sports: false } });
    expect(emptyEntries.some((entry) => entry.url.endsWith(BEHIND_THE_SCENES.path))).toBe(false);
  });
});
