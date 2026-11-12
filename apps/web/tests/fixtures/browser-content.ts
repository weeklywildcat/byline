import type { ArchiveCategory, ArchivePost } from "@/lib/public-content";

/** Coverage, feed, and video sitemap cases shared by the static browser tests. */
export function browserContent(posts: ArchivePost[], categories: ArchiveCategory[]) {
  const section: ArchiveCategory = {
    id: 91, count: 4, name: "Off Deadline", slug: "behind-the-scenes",
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
  // The presentation-preset feature (fixture story presentation 93): an older, unpinned Off Deadline story,
  // so it stays out of the homepage's general news lists and no listing it joins moves.
  const feature: ArchivePost = {
    ...base, id: 93, slug: "weekly-wildcat-feature-rhythm-fixture", sticky: false,
    categories: [...base.categories, section.id],
    _embedded: { ...base._embedded, "wp:term": [[...(base._embedded?.["wp:term"]?.[0] ?? []), section], base._embedded?.["wp:term"]?.[1] ?? []] },
    date: "2026-07-01T09:00:00", date_gmt: "2026-07-01T13:00:00", modified: "2026-07-01T09:00:00", modified_gmt: "2026-07-01T13:00:00",
    link: "https://weeklywildcat.com/2026/07/01/news/weekly-wildcat-feature-rhythm-fixture/",
    title: { rendered: "The lunch line, rebuilt" },
    content: { rendered: "<p>The feature fixture's text edition.</p>" },
    excerpt: { rendered: "<p>How a third serving window changed third lunch.</p>" }
  };
  // The story openings (Feature, Split, Immersive) and Site navigation, one story each. Like the presentation-preset
  // feature above they are unpinned Off Deadline stories, so no homepage list moves; they borrow an immersive fixture's lead photograph.
  const photo = posts.find((post) => post.id === 8)!;
  const openings = [
    { id: 94, day: "10", slug: "weekly-wildcat-opening-feature", title: "The gardener who stayed", byline: { presentation: "feature", featureWidth: "wide" } },
    { id: 95, day: "11", slug: "weekly-wildcat-opening-feature-full-minimal", title: "Forty years on the same field", byline: { presentation: "feature", featureWidth: "full", siteNavigation: "minimal" } },
    { id: 96, day: "12", slug: "weekly-wildcat-opening-split-left-minimal", title: "A school year in nine portraits", byline: { presentation: "split", splitImageSide: "left", siteNavigation: "minimal" } },
    { id: 97, day: "13", slug: "weekly-wildcat-opening-split", title: "The long walk to the bus", byline: { presentation: "split", splitImageSide: "right" } },
    { id: 98, day: "14", slug: "weekly-wildcat-opening-immersive-minimal", title: "Night practice under the lights", byline: { presentation: "immersive", immersiveAlignment: "bottom-left", siteNavigation: "minimal" } },
    { id: 99, day: "15", slug: "weekly-wildcat-opening-standard-minimal", title: "A quiet morning in the library", byline: { siteNavigation: "minimal" } }
  ].map(({ id, day, slug, title, byline }): ArchivePost => ({
    ...photo, id, slug, sticky: false,
    categories: [...photo.categories, section.id],
    _embedded: { ...photo._embedded, "wp:term": [[...(photo._embedded?.["wp:term"]?.[0] ?? []), section], photo._embedded?.["wp:term"]?.[1] ?? []] },
    date: `2026-01-${day}T09:00:00`, date_gmt: `2026-01-${day}T14:00:00`, modified: `2026-01-${day}T09:00:00`, modified_gmt: `2026-01-${day}T14:00:00`,
    link: `https://weeklywildcat.com/2026/01/${day}/news/${slug}/`,
    title: { rendered: title },
    content: { rendered: "<p>The opening fixture's text edition.</p><p>A second paragraph, so the body has some length under the opening.</p>" },
    excerpt: { rendered: "<p>A deck that runs a line or two under the headline.</p>" },
    byline
  }));
  return { posts: [...posts, ...additions, feature, ...openings], categories: [...categories, section] };
}
