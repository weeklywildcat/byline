import { describe, expect, it } from "vitest";

import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, type WordPressAuthor, type WordPressPost } from "@/lib/wordpress";
import paritySnapshot from "../../../tests/fixtures/article-presentation-parity.json";

const category = (id: number, name: string, slug: string) => ({
  id,
  count: 1,
  description: name,
  link: `/category/${slug}/`,
  name,
  slug,
  taxonomy: "category" as const,
  parent: 0
});

const tag = (id: number, name: string, slug: string) => ({
  id,
  count: 1,
  description: name,
  link: `/tag/${slug}/`,
  name,
  slug,
  taxonomy: "post_tag" as const
});

const author: WordPressAuthor = {
  id: 7,
  name: "Alex Rivera",
  slug: "alex-rivera",
  description: "Reporter bio",
  bylineProfile: {
    pronouns: "",
    role: "Editor",
    founder: true,
    profilePhoto: { id: 600, url: "/uploads/alex.jpg", alt: "Alex", width: 132, height: 132 },
    socials: { website: "", email: "alex@example.test", instagram: "", tiktok: "", linkedin: "", x: "" }
  }
};

function post(
  id: number,
  date: string,
  title: string,
  categoryValue: ReturnType<typeof category>,
  contributors: unknown[]
): WordPressPost {
  return {
    id,
    date,
    date_gmt: `${date}Z`,
    modified: date,
    modified_gmt: `${date}Z`,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    status: "publish",
    type: "post",
    link: `/story/${id}/`,
    title: { rendered: title },
    content: { rendered: `<p>${title} body.</p>` },
    excerpt: { rendered: `<p>${title} excerpt.</p>` },
    author: 7,
    featured_media: 0,
    categories: [categoryValue.id],
    tags: [],
    sticky: false,
    contributors,
    _embedded: {
      author: [author],
      "wp:term": [[categoryValue], []]
    }
  };
}

const news = category(1, "News", "news");
const sports = category(3, "Sports", "sports");
const arts = category(4, "Arts", "arts");
const features = category(6, "Features", "features");
const campus = tag(12, "Campus", "campus");
const sportBasketball = tag(11, "Sport: Basketball", "sport-basketball");
const athleteOfTheWeek = tag(10, "Athlete of the Week", "athlete-of-the-week");

const guest = {
  type: "guest" as const,
  id: 44,
  name: "Jordan Guest",
  slug: "jordan-guest",
  role: "Community contributor",
  bio: "Guest bio",
  profilePhoto: { id: 601, url: "/uploads/jordan.jpg", alt: "Jordan", width: 132, height: 132 },
  socials: { website: "https://example.test/jordan" }
};

const parityPosts: WordPressPost[] = [
  {
    ...post(100, "2026-08-20T09:00:00", "Parity <em>Story</em>", news, [{ type: "user", id: 7 }, guest]),
    modified: "2026-08-22T09:00:00",
    content: {
      rendered: '<p>A saved body for parity.</p><aside class="byline-correction-notice"><p class="byline-correction-notice-body">Legacy notice.</p><time datetime="2026-08-21T09:00:00"></time></aside>'
    },
    excerpt: { rendered: "<p>A saved excerpt.</p>" },
    tags: [10, 11, 12],
    corrections: [{ id: "701", type: "clarification", date: "2026-08-28T09:00:00Z", text: "We clarified the record." }],
    featured_media: 500,
    _embedded: {
      author: [author],
      "wp:featuredmedia": [{
        id: 500,
        date: "",
        slug: "hero",
        type: "attachment",
        link: "/hero/",
        title: { rendered: "Hero" },
        author: 7,
        caption: { rendered: "<p>Hero caption <strong>HTML</strong>.</p>" },
        alt_text: "Hero alt",
        media_type: "image",
        mime_type: "image/jpeg",
        media_details: {
          width: 1600,
          height: 900,
          sizes: { medium: { file: "hero-800.jpg", source_url: "/uploads/hero-800.jpg", width: 800, height: 450 } },
          image_meta: { caption: "Fallback caption", credit: "Wrong fallback" }
        },
        source_url: "/uploads/hero.jpg",
        bylineImage: { creator: "", creditText: "", copyrightNotice: "", licenseUrl: "", acquireLicensePage: "" },
        weeklyWildcatImage: { creator: "", creditText: "Canonical Photographer", copyrightNotice: "", licenseUrl: "", acquireLicensePage: "" }
      }],
      "wp:term": [[news], [athleteOfTheWeek, sportBasketball, campus]]
    }
  },
  {
    ...post(104, "2026-08-27T09:00:00", "Related latest", news, [{ type: "user", id: 7 }]),
    tags: [12],
    _embedded: { author: [author], "wp:term": [[news], [campus]] }
  },
  post(103, "2026-08-26T09:00:00", "Guest story", sports, [guest]),
  {
    ...post(101, "2026-08-25T09:00:00", "Related one", news, [{ type: "user", id: 7 }]),
    _embedded: { author: [author], "wp:term": [[news], [campus]] },
    tags: [12]
  },
  post(105, "2026-08-23T09:00:00", "Author story", arts, [{ type: "user", id: 7 }]),
  {
    ...post(108, "2026-08-17T09:00:00", "Editorial tag story", features, [{ type: "user", id: 9 }]),
    author: 9,
    _embedded: { "wp:term": [[features], [athleteOfTheWeek]] },
    tags: [10]
  }
];

describe("public article presentation parity fixture", () => {
  it("covers the presentation fields consumed by the shared ArticleView", () => {
    const expected = paritySnapshot.story;
    const postValue = parityPosts[0];
    const contributors = getPostContributors(postValue);
    const presentation = buildArticlePresentation({
      post: postValue,
      allPosts: parityPosts,
      contributors,
      author: contributors.find((value): value is WordPressAuthor => !("type" in value)) ?? null
    });

    expect(presentation.id).toBe(expected.id);
    expect(presentation.title).toBe(expected.title);
    expect(presentation.titleHtml).toBe(expected.titleHtml);
    expect(presentation.excerptHtml).toBe(expected.excerptHtml);
    expect(presentation.contentHtml).toContain(expected.contentIncludes);
    expect(presentation.category).toEqual(expected.category);
    const normalizedContributors = presentation.contributors.map((value) => ({
      id: value.id,
      name: value.name,
      role: value.role,
      bio: value.bio,
      founder: value.founder,
      contactHref: value.contactHref ?? "",
      photo: value.photo ? { path: new URL(value.photo.src, "https://example.test").pathname, alt: value.photo.alt } : null,
      coverage: value.coverage?.map((area) => area.label) ?? []
    }));
    expect(normalizedContributors).toEqual(expected.contributors);
    expect(presentation.image).toMatchObject({
      src: expected.featuredImage.path,
      alt: expected.featuredImage.alt,
      captionHtml: expected.featuredImage.captionHtml,
      fallbackCaption: expected.featuredImage.fallbackCaption,
      credit: expected.featuredImage.credit
    });
    expect(presentation.topics).toEqual(expected.topics);
    expect(presentation.corrections).toEqual(expected.corrections);
    expect(presentation.update).toBe(expected.update);
    expect(presentation.athleteMeta).toEqual(expected.athleteMeta);
    expect(presentation.relatedStories.map((value) => value.id)).toEqual(expected.relatedIds);
    expect(presentation.moreByAuthorStories.map((value) => value.id)).toEqual(expected.moreByAuthorIds);
    expect(presentation.publishedLabel).toBe(expected.publishedDateLabel);
    expect(presentation.readingTime).toBe(expected.readingTime);
    expect(presentation.publication).toEqual(expected.publication);
  });
});
