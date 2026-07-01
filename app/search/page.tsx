import type { Metadata } from "next";
import { SearchPageClient, type SearchIndexItem } from "@/components/SearchPageClient";
import { filterVisibleContentPosts, getPrimaryVisibleCategory, getPublicTopicTags } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { buildPageMetadata } from "@/lib/seo";
import { getAllPosts, getPostAuthor, getPostHref } from "@/lib/wordpress";

export const dynamic = "force-static";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Search",
    description: "Search Weekly Wildcat stories by headline, author, section, or topic.",
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

export default async function SearchPage() {
  const posts = filterVisibleContentPosts(await getAllPosts());
  const items: SearchIndexItem[] = posts.map((post) => {
    const title = stripHtml(post.title.rendered);
    const excerpt = getSearchExcerpt(post.excerpt.rendered || post.content.rendered);
    const category = getPrimaryVisibleCategory(post);
    const author = getPostAuthor(post);
    const topics = getPublicTopicTags(post).map((tag) => stripHtml(tag.name));

    return {
      id: post.id,
      title,
      excerpt,
      href: getPostHref(post),
      category: category ? stripHtml(category.name) : "",
      author: author?.name ?? "Weekly Wildcat Staff",
      date: formatDisplayDate(post.date),
      searchText: [title, excerpt, category?.name, author?.name, ...topics].filter(Boolean).join(" ").toLowerCase()
    };
  });

  return (
    <main className="search-page-shell">
      <SearchPageClient items={items} />
    </main>
  );
}
