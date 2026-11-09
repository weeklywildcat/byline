import type { ArchiveCategory, ArchivePost } from "@/lib/public-content";

/** Coverage, feed, and video sitemap cases shared by the static browser tests. */
export function browserContent(posts: ArchivePost[], categories: ArchiveCategory[]) {
  const section: ArchiveCategory = {
    id: 91, count: 3, name: "Off Deadline", slug: "behind-the-scenes",
    taxonomy: "category", parent: 0, description: "Stories behind the stories", link: "https://weeklywildcat.com/category/behind-the-scenes/"
  };
  const { live: _live, ...base } = posts.find((post) => post.id === 9)!;
  const additions = [
    { id: 91, day: "22", slug: "building-the-newsroom", title: "Building the newsroom website" },
    { id: 92, day: "21", slug: "our-reporting-tools", title: "Inside our reporting tools" },
    { id: 90, day: "14", slug: "weekly-wildcat-fixture-video", title: "Fixture video story" }
  ].map(({ id, day, slug, title }): ArchivePost => {
    const video = id === 90;
    const date = `2026-08-${day}`;
    return {
      ...base, id, slug, sticky: !video,
      date: `${date}T09:00:00`, date_gmt: `${date}T13:00:00`,
      modified: `${date}T09:00:00`, modified_gmt: `${date}T13:00:00`,
      link: `https://weeklywildcat.com/2026/08/${day}/news/${slug}/`,
      title: { rendered: title },
      content: { rendered: video ? "<p>Reporting that supports the video, below the player.</p>" : "<p>A technical look at how we publish student journalism.</p>" },
      excerpt: { rendered: video ? "<p>The fixture video, with its reporting below.</p>" : "<p>Reporting from the newsroom.</p>" },
      categories: [...base.categories, section.id],
      _embedded: { ...base._embedded, "wp:term": [[...(base._embedded?.["wp:term"]?.[0] ?? []), section], base._embedded?.["wp:term"]?.[1] ?? []] },
      ...(video ? { byline: { format: "video", video: { provider: "youtube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Fixture video", thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", uploadDate: "2026-08-14T09:00:00-04:00", duration: "PT1M32S" } } } : {})
    };
  });
  return { posts: [...posts, ...additions], categories: [...categories, section] };
}
