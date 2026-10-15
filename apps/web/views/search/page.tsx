import type { Metadata } from "@/lib/metadata";
import { SearchPageClient, type SearchIndexItem } from "@/components/SearchPageClient";
import { getBuildSnapshot } from "@/lib/build-snapshot";
import { filterVisibleContentPosts, getPrimaryVisibleCategory, getPublicTopicTags } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { buildPageMetadata } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { getBylineRestUrl } from "@/lib/byline-rest";
import { toSearchFacetValue } from "@/lib/search";
import { getPostContributors, getPostHref } from "@/lib/wordpress";

const publication = getPublicationConfig();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Search",
    description: `Search ${publication.identity.shortName} stories by headline, author, section, or topic.`,
    path: "/search/",
    noIndex: true
  })
};

function getSearchExcerpt(value: string) {
  const text = stripHtml(value).replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "");

  if (text.length <= 180) {
    return text;
  }

  const trimmed = text.slice(0, 180);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export async function getSearchPageProps() {
  const snapshot = await getBuildSnapshot();
  const { posts, pages } = snapshot;
  const visiblePosts = filterVisibleContentPosts(posts);
  const storyItems: SearchIndexItem[] = visiblePosts.map((post) => {
    const title = stripHtml(post.title.rendered);
    const excerpt = getSearchExcerpt(post.excerpt.rendered || post.content.rendered);
    const category = getPrimaryVisibleCategory(post);
    const contributors = getPostContributors(post);
    const topicEntries = getPublicTopicTags(post).map((tag) => ({
      value: tag.slug,
      label: stripHtml(tag.name)
    }));
    const authorName = contributors.length > 0
      ? contributors.map((contributor) => contributor.name).join(", ")
      : `${publication.identity.shortName} Staff`;
    const sectionLabel = category ? stripHtml(category.name) : "";

    return {
      id: post.id,
      kind: "story",
      title,
      excerpt,
      href: getPostHref(post),
      category: sectionLabel,
      section: category?.slug ?? "",
      sectionLabel,
      author: authorName,
      authorKey: contributors.length > 0 ? contributors.map((contributor) => contributor.slug).join(",") : toSearchFacetValue(authorName),
      authorOptions: contributors.map((contributor) => ({ value: contributor.slug, label: contributor.name })),
      topics: topicEntries.map((topic) => topic.value),
      topicLabels: Object.fromEntries(topicEntries.map((topic) => [topic.value, topic.label])),
      date: formatDisplayDate(post.date),
      sortDate: post.date
    };
  });
  const archiveItems: SearchIndexItem[] = pages.filter((page) => page.bylinePage?.sportsArchive).map((page) => ({
    id: `archive-${page.id}`,
    kind: "archive",
    title: stripHtml(page.title.rendered),
    excerpt: getSearchExcerpt(page.excerpt.rendered || page.content.rendered),
    href: `/${page.slug}/`, category: "Sports Archive", section: "sports", sectionLabel: "Sports",
    author: "", authorKey: "", date: "", sortDate: page.modified,
    searchTokens: [...new Set(stripHtml(page.content.rendered).split(/\s+/).filter(Boolean))]
  }));
  const items = [...storyItems, ...archiveItems];

  return {
    items,
    publicationName: publication.identity.shortName,
    searchGapEndpoint: getBylineRestUrl("search-gaps")
  };
}

export default async function SearchPage() {
  const { publicationName, searchGapEndpoint } = await getSearchPageProps();
  return (
    <main className="search-page-shell">
      <SearchPageClient publicationName={publicationName} searchGapEndpoint={searchGapEndpoint} />
    </main>
  );
}
