import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ posts: [] as unknown[] }));
vi.mock("@/lib/public-content", () => ({
  getContributorBySlug: async () => ({
    id: 99,
    name: "Quiet Writer",
    slug: "quiet",
    description: "Public biography",
    bylineProfile: { pronouns: "they/them" },
  }),
  getContributorDescription: () => "Public biography",
  getContributorHref: () => "/author/quiet/",
  getContributorPhoto: () => null,
  getContributorRole: () => "Staff writer",
  getContributorSocialLinks: () => [
    { label: "Website", href: "https://example.test/quiet" },
  ],
  getPostsByContributor: async () => state.posts,
  isGuestContributor: () => false,
}));
vi.mock("@/lib/content", () => ({
  filterVisibleContentPosts: (posts: unknown[]) => posts,
}));
vi.mock("@/components/StoryTeaser", () => ({ StoryTeaser: () => null }));
vi.mock("@/lib/seo", () => ({
  buildPageMetadata: (input: Record<string, unknown>) => input,
  getBreadcrumbSchema: () => ({}),
  getProfilePageSchema: () => ({
    mainEntity: { "@type": "Person", name: "Quiet Writer" },
  }),
  serializeJsonLd: (value: unknown) => JSON.stringify(value),
}));
const { default: AuthorPage, getMetadata } = await import(
  "../views/author/[slug]/page"
);
describe("Author route keeps metadata and story ownership after presentation extraction", () => {
  it("keeps an empty author usable and noindexed", async () => {
    state.posts = [];
    expect(
      await getMetadata({ params: Promise.resolve({ slug: "quiet" }) }),
    ).toMatchObject({ noIndex: true, type: "profile", path: "/author/quiet/" });
    const html = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: "quiet" }) }),
    );
    expect(html).toContain("No published stories");
    expect(html).toContain("author-avatar-fallback");
    expect(html).toContain("they/them");
    expect(html).toContain("https://example.test/quiet");
    expect(html).toContain("author-json-ld");
  });
  it("allows indexing once a visible story exists", async () => {
    state.posts = [{ id: 1 }];
    expect(
      await getMetadata({ params: Promise.resolve({ slug: "quiet" }) }),
    ).toMatchObject({ noIndex: false });
  });
});
