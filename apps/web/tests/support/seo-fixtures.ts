import type { WordPressAuthor, WordPressCategory, WordPressMedia, WordPressPost } from "@/lib/wordpress";

export const author = (id: number, name: string, slug: string): WordPressAuthor => ({ id, name, slug, description: "", avatar_urls: {} });

export const category = (id: number, name: string, slug: string): WordPressCategory => ({
  id, count: 1, description: "", link: "", name, slug, taxonomy: "category", parent: 0
});

export function media(overrides: Partial<WordPressMedia> = {}): WordPressMedia {
  return {
    id: 90,
    date: "2026-10-01T10:00:00",
    slug: "photo",
    type: "attachment",
    link: "",
    title: { rendered: "Homecoming court" },
    author: 1,
    caption: { rendered: "" },
    alt_text: "",
    media_type: "image",
    mime_type: "image/jpeg",
    media_details: { width: 2048, height: 1365 },
    source_url: "/_wordpress-media/2026/10/photo.jpg",
    ...overrides
  };
}

export function post(overrides: Partial<WordPressPost> = {}): WordPressPost {
  return {
    id: 1,
    date: "2026-10-14T18:15:00",
    date_gmt: "2026-10-14T22:15:00",
    modified: "2026-10-14T19:00:00",
    modified_gmt: "2026-10-14T23:00:00",
    slug: "homecoming-week",
    status: "publish",
    type: "post",
    link: "",
    title: { rendered: "Homecoming week" },
    content: { rendered: "<p>The week began on Monday.</p>" },
    excerpt: { rendered: "<p>The week began on Monday.</p>" },
    author: 1,
    featured_media: 0,
    categories: [2],
    tags: [],
    sticky: false,
    _embedded: {
      author: [author(1, "Gibson Bell", "gibson")],
      "wp:term": [[category(2, "News", "news")], []]
    },
    ...overrides
  };
}
