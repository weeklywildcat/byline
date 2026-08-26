import { describe, expect, it } from "vitest";
import { resolveWeeklyWildcatHomepage, takeUnused } from "@/lib/homepage-selection";
import type { WordPressCategory, WordPressPost, WordPressTag } from "@/lib/wordpress";

function category(id: number, slug: string): WordPressCategory {
  return {
    id,
    count: 1,
    description: "",
    link: `https://example.test/category/${slug}`,
    name: slug,
    slug,
    taxonomy: "category",
    parent: 0
  };
}

function tag(id: number, slug: string): WordPressTag {
  return {
    id,
    count: 1,
    description: "",
    link: `https://example.test/tag/${slug}`,
    name: slug,
    slug,
    taxonomy: "post_tag"
  };
}

function post(
  id: number,
  categorySlug: string,
  options: { sticky?: boolean; tagSlug?: string; image?: boolean } = {}
): WordPressPost {
  const terms: Array<WordPressCategory | WordPressTag> = [category(id, categorySlug)];

  if (options.tagSlug) {
    terms.push(tag(id + 1000, options.tagSlug));
  }

  return {
    id,
    date: "2026-08-01T12:00:00",
    date_gmt: "2026-08-01T16:00:00",
    modified: "2026-08-01T12:00:00",
    modified_gmt: "2026-08-01T16:00:00",
    slug: `story-${id}`,
    status: "publish",
    type: "post",
    link: `https://example.test/story-${id}`,
    title: { rendered: `Story ${id}` },
    content: { rendered: "" },
    excerpt: { rendered: "" },
    author: 1,
    featured_media: options.image ? id + 2000 : 0,
    categories: [id],
    tags: options.tagSlug ? [id + 1000] : [],
    sticky: Boolean(options.sticky),
    _embedded: {
      "wp:featuredmedia": options.image
        ? [
            {
              id: id + 2000,
              date: "2026-08-01T12:00:00",
              slug: `image-${id}`,
              type: "attachment",
              link: "https://example.test/image",
              title: { rendered: "Image" },
              author: 1,
              caption: { rendered: "" },
              alt_text: "",
              media_type: "image",
              mime_type: "image/jpeg",
              source_url: "https://example.test/image.jpg"
            }
          ]
        : [],
      "wp:term": [terms]
    }
  };
}

describe("Weekly Wildcat homepage compatibility resolver", () => {
  it("reserves the athlete story, prioritizes the sticky lead, and never duplicates stories", () => {
    const posts = [
      post(1, "sports", { sticky: true, tagSlug: "athlete-of-the-week" }),
      post(2, "news", { sticky: true }),
      post(3, "features", { image: true }),
      post(4, "news", { tagSlug: "special-coverage" }),
      post(5, "opinion"),
      post(6, "sports"),
      post(7, "news"),
      post(8, "features"),
      post(9, "culture"),
      post(10, "opinion"),
      post(11, "sports"),
      post(12, "news"),
      post(13, "features"),
      post(14, "culture"),
      post(15, "news"),
      post(16, "sports"),
      post(17, "opinion"),
      post(18, "news"),
      post(19, "features"),
      post(20, "culture"),
      post(21, "news"),
      post(22, "sports"),
      post(23, "opinion")
    ];
    const resolved = resolveWeeklyWildcatHomepage(posts);
    const selected = [
      resolved.athleteSpotlightPost,
      resolved.leadPost,
      resolved.inFocusPost,
      ...resolved.specialCoveragePosts,
      ...resolved.opinionPosts,
      ...resolved.fieldPosts,
      ...resolved.morePosts,
      ...resolved.rightNowPosts,
      ...resolved.briefPosts
    ].filter((value): value is WordPressPost => Boolean(value));
    const selectedIds = selected.map(({ id }) => id);

    expect(resolved.athleteSpotlightPost?.id).toBe(1);
    expect(resolved.leadPost?.id).toBe(2);
    expect(resolved.inFocusPost?.id).toBe(3);
    expect(new Set(selectedIds).size).toBe(selectedIds.length);
    expect(resolved.usedPostIds).toEqual(new Set(selectedIds));
  });

  it("honors earlier consumers in the shared used-ID set", () => {
    const posts = [post(1, "news"), post(2, "news"), post(3, "news")];
    const used = new Set([1]);

    expect(takeUnused(posts, used, 2).map(({ id }) => id)).toEqual([2, 3]);
    expect(used).toEqual(new Set([1, 2, 3]));
  });
});

