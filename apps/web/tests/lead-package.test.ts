import { describe, expect, it } from "vitest";
import { WEEKLY_WILDCAT_LEAD_DEFAULTS } from "@byline/design";
import { resolveLeadPackage, toCalendarEntries, toStoryView } from "@/lib/homepage-packages";
import { resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
import type { WordPressCategory, WordPressPost } from "@/lib/wordpress";

function category(id: number, slug: string): WordPressCategory {
  return { id, count: 1, description: "", link: "", name: slug, slug, taxonomy: "category", parent: 0 };
}

function post(id: number, categorySlug: string, options: { sticky?: boolean; image?: boolean } = {}): WordPressPost {
  return {
    id,
    date: `2026-08-${String(id).padStart(2, "0")}T12:00:00`,
    date_gmt: "2026-08-01T16:00:00",
    modified: "2026-08-01T12:00:00",
    modified_gmt: "2026-08-01T16:00:00",
    slug: `story-${id}`,
    status: "publish",
    type: "post",
    link: `https://example.test/story-${id}`,
    title: { rendered: `Story ${id}` },
    content: { rendered: "" },
    excerpt: { rendered: `Deck ${id}` },
    author: 1,
    featured_media: options.image ? id + 2000 : 0,
    categories: [id],
    tags: [],
    sticky: Boolean(options.sticky),
    _embedded: {
      "wp:featuredmedia": options.image
        ? [
            {
              id: id + 2000,
              date: "2026-08-01T12:00:00",
              slug: `image-${id}`,
              type: "attachment",
              link: "",
              title: { rendered: "Image" },
              author: 1,
              caption: { rendered: "" },
              alt_text: `Alt ${id}`,
              media_type: "image",
              mime_type: "image/jpeg",
              source_url: `https://example.test/image-${id}.jpg`
            }
          ]
        : [],
      "wp:term": [[category(id, categorySlug)]]
    }
  } as WordPressPost;
}

const ALL_MODULES = { polls: true, events: true, sports: true };

function resolve(posts: WordPressPost[], props: unknown = {}, features = ALL_MODULES) {
  return resolveLeadPackage({
    packageId: "home-lead",
    props,
    posts,
    selection: resolveWeeklyWildcatHomepage(posts),
    features
  });
}

describe("lead package resolution", () => {
  // Deliberately larger than the packages that resolve before the rail. The
  // Latest is the eighth selection, so a short fixture would leave it empty and
  // hide exactly the behaviour these tests exist to pin down.
  const posts = [
    post(1, "news"),
    post(2, "news", { sticky: true }),
    post(3, "features", { image: true }),
    post(4, "opinion"),
    post(5, "sports"),
    post(6, "news"),
    post(7, "culture"),
    post(8, "news"),
    post(9, "features"),
    post(10, "news"),
    post(11, "opinion"),
    post(12, "sports"),
    post(13, "news"),
    post(14, "culture"),
    post(15, "news"),
    post(16, "features")
  ];

  it("selects the sticky lead, matching the pre-extraction behaviour", () => {
    expect(resolve(posts).lead?.id).toBe(2);
  });

  it("fills the latest rail up to the configured limit", () => {
    const resolved = resolve(posts, { latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 2 } });

    expect(resolved.latest.stories).toHaveLength(2);
    expect(resolved.latest.heading).toBe("The Latest");
  });

  it("never repeats the lead story in its own rail", () => {
    const resolved = resolve(posts);
    const ids = [resolved.lead?.id, ...resolved.latest.stories.map((story) => story.id)];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("honours a manual lead as an explicit editorial override", () => {
    const resolved = resolve(posts, { lead: { source: { type: "manual", storyIds: [7] } } });

    expect(resolved.lead?.id).toBe(7);
  });

  it("honours a manual latest rail in the order the editor chose", () => {
    const resolved = resolve(posts, {
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, source: { type: "manual", storyIds: [8, 6] } }
    });

    expect(resolved.latest.stories.map((story) => story.id)).toEqual([8, 6]);
  });

  it("drops a manually pinned story from the rail when it is already the lead", () => {
    const resolved = resolve(posts, {
      lead: { source: { type: "manual", storyIds: [6] } },
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, source: { type: "manual", storyIds: [6, 8] } }
    });

    expect(resolved.lead?.id).toBe(6);
    expect(resolved.latest.stories.map((story) => story.id)).toEqual([8]);
  });

  it("renders an empty state rather than failing when there is no content", () => {
    const resolved = resolve([]);

    expect(resolved.lead).toBeNull();
    expect(resolved.emptyMessage).toBeTruthy();
  });

  it("cannot switch on a module the publication has disabled", () => {
    const resolved = resolve(posts, WEEKLY_WILDCAT_LEAD_DEFAULTS, { polls: false, events: false, sports: false });

    expect(resolved.utility.poll).toBe(false);
    expect(resolved.utility.calendar).toBe(false);
  });

  it("keeps the calendar when only sports is enabled", () => {
    const resolved = resolve(posts, WEEKLY_WILDCAT_LEAD_DEFAULTS, { polls: false, events: false, sports: true });

    expect(resolved.utility.calendar).toBe(true);
  });

  it("passes presentation settings through to the renderer", () => {
    const resolved = resolve(posts, { presentation: { showDeck: false } });

    expect(resolved.presentation.showDeck).toBe(false);
  });
});

// The acceptance test for the extraction: the shared package must choose exactly
// the stories the hand-written homepage chose, including the rail, which is
// resolved eighth rather than in layout order.
describe("regression against the pre-extraction homepage", () => {
  const posts = Array.from({ length: 18 }, (_, index) => {
    const id = index + 1;
    const slug = ["news", "features", "opinion", "sports", "culture"][index % 5];

    return post(id, slug, { sticky: id === 2, image: id % 3 === 0 });
  });

  it("resolves the same lead and the same rail as homepage-selection", () => {
    const selection = resolveWeeklyWildcatHomepage(posts);
    const resolved = resolve(posts);

    expect(resolved.lead?.id).toBe(selection.leadPost?.id);
    expect(resolved.latest.stories.map((story) => story.id)).toEqual(
      selection.rightNowPosts.slice(0, WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.limit).map((entry) => entry.id)
    );
  });

  it("does not consume stories the later legacy packages still need", () => {
    const selection = resolveWeeklyWildcatHomepage(posts);
    const resolved = resolve(posts);
    const leadIds = new Set([resolved.lead?.id, ...resolved.latest.stories.map((story) => story.id)]);

    // The Brief is resolved after the rail; extracting the lead must not have
    // taken any of its stories.
    expect(selection.briefPosts.some((entry) => leadIds.has(entry.id))).toBe(false);
  });
});

describe("view models", () => {
  it("flattens a post into a presentation-neutral story view", () => {
    const view = toStoryView(post(3, "features", { image: true }));

    expect(view).toMatchObject({
      id: 3,
      title: "Story 3",
      deckIsHtml: true,
      image: { src: "https://example.test/image-3.jpg", alt: "Alt 3" }
    });
    // No WordPress shapes may leak into the renderer's input.
    expect(view).not.toHaveProperty("_embedded");
    expect(view).not.toHaveProperty("excerpt");
  });

  it("builds calendar entries without leaking CMS records", () => {
    const entries = toCalendarEntries(
      [
        {
          id: 1,
          title: "College Application Day",
          eventType: "academic",
          status: "scheduled",
          startDate: new Date(Date.now() + 86_400_000).toISOString(),
          location: "Media Center",
          externalUrl: "",
          display: { date: "Aug 27", time: "12:00 AM" }
        } as never
      ],
      [],
      5
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "event", label: "Academic", title: "College Application Day" });
    expect(entries[0]).not.toHaveProperty("sortKey");
  });
});
