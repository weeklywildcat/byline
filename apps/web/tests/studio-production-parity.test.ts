import { describe, expect, it } from "vitest";
import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  createLegacyConversionContext,
  convertLegacyBlock,
  getWeeklyWildcatCompatibilityDesign,
  migrateDesignDocumentV1ToV2,
  parseOpinionPackageProps,
  parseSpecialCoveragePackageProps,
  type BylineDesignDocumentV2
} from "@byline/design";
import { resolveHomepageDocument as resolveSharedHomepageDocument } from "@byline/content";
import { isResolvedHomepagePackageVisible, type ResolvedHomepagePackage } from "@byline/ui";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { getFeaturedMedia, getPostCategories, getPostTags, type WordPressPost } from "@/lib/wordpress";
import {
  toPreviewData,
  type PreviewPost
} from "../../../wordpress-plugin/src/studio-preview-model";
import { post } from "./fixtures/sports-fixture";

// The production-equivalence harness.
//
// Studio's canvas and the static export must not merely "look similar": they
// must be the same resolution of the same document. The two hosts differ only
// in transport, so this file feeds equivalent content through each adapter and
// asserts the resolved documents agree on everything that is a resolution
// decision -- which packages exist, in what order, which are visible, which
// stories they hold and in what order, and the presentation each package was
// configured with.

/** The captured production content shape: no special-coverage story exists. */
function baselinePosts(): WordPressPost[] {
  return [
    post(1, "sports", { athlete: true }),
    post(2, "news", { sticky: true }),
    post(3, "features", { image: true }),
    post(4, "news"),
    post(5, "opinion"),
    post(6, "opinion"),
    post(7, "opinion"),
    post(8, "sports"),
    post(9, "sports"),
    post(10, "sports"),
    post(11, "news"),
    post(12, "features"),
    post(13, "culture"),
    post(14, "news"),
    post(15, "features"),
    post(16, "culture"),
    post(17, "news"),
    post(18, "opinion"),
    post(19, "sports"),
    post(20, "news")
  ];
}

/**
 * The same story, in the shape Studio receives it from the REST API.
 *
 * Written by hand rather than shared with the build-time fixture on purpose:
 * the point of the test is that two genuinely different transports converge,
 * so the transports have to stay different.
 */
function toPreviewPost(source: WordPressPost): PreviewPost {
  const media = getFeaturedMedia(source);

  return {
    id: source.id,
    title: { rendered: source.title.rendered },
    excerpt: { rendered: source.excerpt.rendered },
    content: { rendered: source.content.rendered },
    date: source.date,
    link: source.link,
    sticky: source.sticky,
    categories: source.categories,
    tags: source.tags,
    author: source.author,
    _embedded: {
      "wp:featuredmedia": media
        ? [{ source_url: media.source_url, alt_text: media.alt_text, media_details: media.media_details }]
        : [],
      "wp:term": [
        getPostCategories(source).map((category) => ({
          id: category.id,
          taxonomy: "category",
          name: category.name,
          slug: category.slug
        })),
        getPostTags(source).map((entry) => ({
          id: entry.id,
          taxonomy: "post_tag",
          name: entry.name,
          slug: entry.slug
        }))
      ]
    }
  };
}

const PREVIEW_PUBLICATION = {
  shortName: WEEKLY_WILDCAT_PUBLICATION.identity.shortName,
  name: WEEKLY_WILDCAT_PUBLICATION.identity.name,
  organizationName: WEEKLY_WILDCAT_PUBLICATION.identity.organizationName,
  contactHref: WEEKLY_WILDCAT_PUBLICATION.urls.contact,
  social: WEEKLY_WILDCAT_PUBLICATION.social.map((entry) => ({
    label: entry.label,
    url: entry.url,
    service: entry.service
  })),
  features: {
    polls: WEEKLY_WILDCAT_PUBLICATION.features.polls,
    events: WEEKLY_WILDCAT_PUBLICATION.features.events,
    sports: WEEKLY_WILDCAT_PUBLICATION.features.sports,
    newsletter: WEEKLY_WILDCAT_PUBLICATION.features.newsletter
  },
  calendarHeading: "At NSHS"
};

function packageStoryIds(entry: ResolvedHomepagePackage): number[] {
  switch (entry.type) {
    case "lead-package":
      return [entry.package.lead?.id, ...entry.package.latest.stories.map((story) => story.id)].filter(
        (id): id is number => typeof id === "number"
      );
    case "brief-package":
    case "opinion-package":
    case "more-package":
      return [entry.package.lead?.id, ...entry.package.rail.map((story) => story.id)].filter(
        (id): id is number => typeof id === "number"
      );
    case "in-focus-package":
      return entry.package.story ? [entry.package.story.id] : [];
    case "special-coverage-package":
      return entry.package.stories.map((story) => story.id);
    case "sports-package":
      return [
        entry.package.lead?.id,
        ...entry.package.rail.map((story) => story.id),
        entry.package.athleteSpotlight?.id
      ].filter((id): id is number => typeof id === "number");
    case "newsletter-package":
      return [];
  }
}

/** Everything that is a resolution decision rather than a transport detail. */
function resolutionShape(packages: ResolvedHomepagePackage[]) {
  return packages.map((entry) => ({
    type: entry.type,
    packageId: entry.package.packageId,
    visible: isResolvedHomepagePackageVisible(entry),
    storyIds: packageStoryIds(entry),
    presentation: "presentation" in entry.package ? entry.package.presentation : null
  }));
}

function resolveProduction(document: BylineDesignDocumentV2, posts: WordPressPost[]) {
  return resolveHomepageDocument({
    document,
    posts,
    publication: WEEKLY_WILDCAT_PUBLICATION,
    sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }
  });
}

function resolveStudio(document: BylineDesignDocumentV2, posts: WordPressPost[]) {
  const data = toPreviewData({ posts: posts.map(toPreviewPost) });

  return resolveSharedHomepageDocument({
    document,
    stories: data.stories,
    publication: PREVIEW_PUBLICATION,
    sportsSchedule: { recentScores: data.recentScores, upcomingGames: data.upcomingGames }
  });
}

const compatibilityDesign = () => getWeeklyWildcatCompatibilityDesign("weekly-wildcat");

describe("Studio and production resolve one homepage", () => {
  it("produces the same packages, order, visibility and stories", () => {
    const document = compatibilityDesign();
    const posts = baselinePosts();

    expect(resolutionShape(resolveStudio(document, posts).packages)).toEqual(
      resolutionShape(resolveProduction(document, posts).packages)
    );
  });

  it("agrees after the design is reordered, because ordering is document-level", () => {
    const document = compatibilityDesign();
    // Move Opinion in front of The Brief. Selection order is the historical
    // compatibility order, not the visual order, so both hosts must still
    // agree -- and must still not resolve The Latest early.
    const opinion = document.packages.splice(4, 1)[0];
    document.packages.splice(1, 0, opinion);

    const posts = baselinePosts();

    expect(resolutionShape(resolveStudio(document, posts).packages)).toEqual(
      resolutionShape(resolveProduction(document, posts).packages)
    );
  });

  it("agrees on the recovered production autosave once its legacy blocks convert", () => {
    const posts = baselinePosts();
    const document = recoveredProductionDesign();

    expect(resolutionShape(resolveStudio(document, posts).packages)).toEqual(
      resolutionShape(resolveProduction(document, posts).packages)
    );
  });
});

describe("the homepage never repeats a story", () => {
  it("resolves the Weekly Wildcat baseline with zero cross-package duplicates", () => {
    const posts = baselinePosts();

    for (const [host, resolved] of [
      ["production", resolveProduction(compatibilityDesign(), posts)],
      ["Studio", resolveStudio(compatibilityDesign(), posts)]
    ] as const) {
      const ids = resolved.packages.flatMap(packageStoryIds);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

      expect(duplicates, `${host} repeated stories ${duplicates.join(", ")}`).toEqual([]);
      // A homepage that selected nothing would also have no duplicates.
      expect(ids.length).toBeGreaterThan(10);
    }
  });

  it("keeps the invariant for the recovered production design", () => {
    const resolved = resolveStudio(recoveredProductionDesign(), baselinePosts());
    const ids = resolved.packages.flatMap(packageStoryIds);

    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});

describe("Special Coverage is a conditional package", () => {
  it("stays configured but renders nothing when no story matches", () => {
    const document = compatibilityDesign();

    expect(document.packages.some((entry) => entry.type === SPECIAL_COVERAGE_PACKAGE_TYPE)).toBe(true);

    for (const resolved of [
      resolveProduction(document, baselinePosts()),
      resolveStudio(document, baselinePosts())
    ]) {
      const entry = resolved.packages.find((item) => item.type === SPECIAL_COVERAGE_PACKAGE_TYPE);

      expect(entry).toBeDefined();
      // Still present in the resolved document, so the outline can explain it.
      expect(entry && isResolvedHomepagePackageVisible(entry)).toBe(false);
      expect(entry?.type === SPECIAL_COVERAGE_PACKAGE_TYPE && entry.package.stories).toEqual([]);
    }
  });

  it("becomes visible as soon as matching content exists", () => {
    const posts = [...baselinePosts(), post(21, "news", { specialCoverage: true })];
    const document = compatibilityDesign();

    for (const resolved of [resolveProduction(document, posts), resolveStudio(document, posts)]) {
      const entry = resolved.packages.find((item) => item.type === SPECIAL_COVERAGE_PACKAGE_TYPE);

      expect(entry && isResolvedHomepagePackageVisible(entry)).toBe(true);
      expect(entry?.type === SPECIAL_COVERAGE_PACKAGE_TYPE && entry.package.stories.map((story) => story.id)).toEqual([
        21
      ]);
    }
  });
});

describe("Opinion resolves identically in both hosts", () => {
  it("selects the same stories, in the same order, with the same presentation", () => {
    const document = compatibilityDesign();
    const posts = baselinePosts();
    const opinionOf = (packages: ResolvedHomepagePackage[]) =>
      packages.find((entry) => entry.type === OPINION_PACKAGE_TYPE);
    const production = opinionOf(resolveProduction(document, posts).packages);
    const studio = opinionOf(resolveStudio(document, posts).packages);

    expect(production?.type).toBe(OPINION_PACKAGE_TYPE);
    expect(studio && packageStoryIds(studio)).toEqual(production && packageStoryIds(production));

    if (production?.type !== OPINION_PACKAGE_TYPE || studio?.type !== OPINION_PACKAGE_TYPE) return;

    expect(studio.package.heading).toBe(production.package.heading);
    expect(studio.package.description).toBe(production.package.description);
    expect(studio.package.archiveLink).toEqual(production.package.archiveLink);
    expect(studio.package.presentation).toEqual(production.package.presentation);
    expect(studio.package.rail).toHaveLength(production.package.rail.length);
  });

  it("holds only its configured story count, so it cannot outgrow the live section", () => {
    const document = compatibilityDesign();
    const opinion = document.packages.find((entry) => entry.type === OPINION_PACKAGE_TYPE);
    const configured = parseOpinionPackageProps(opinion?.props);
    const resolved = resolveProduction(document, baselinePosts()).packages.find(
      (entry) => entry.type === OPINION_PACKAGE_TYPE
    );

    expect(resolved?.type).toBe(OPINION_PACKAGE_TYPE);
    expect(resolved && packageStoryIds(resolved).length).toBeLessThanOrEqual(configured.limit);
    // Every one of them is an Opinion story, not a generic recent story.
    const opinionIds = new Set(
      baselinePosts()
        .filter((entry) => getPostCategories(entry).some((category) => category.slug === "opinion"))
        .map((entry) => entry.id)
    );
    for (const id of resolved ? packageStoryIds(resolved) : []) {
      expect(opinionIds.has(id)).toBe(true);
    }
  });
});

// --- sparse recovered legacy blocks -----------------------------------------
//
// The real production autosave's blocks carry an id, a title and sometimes a
// limit. Nothing else. Treating that as "no query, therefore the newest
// stories" is what turned every semantic package into the same generic feed.

const SPARSE_PRODUCTION_BLOCKS = [
  { type: "latest-stories", props: { id: "latest-stories-2", title: "Latest Stories", limit: 6 } },
  { type: "opinion-package", props: { id: "opinion-package-3", title: "Opinion", limit: 3 } },
  { type: "photo-feature", props: { id: "photo-feature-4", title: "In Focus", limit: 1 } },
  { type: "special-coverage", props: { id: "special-coverage-5", title: "Special Coverage", limit: 4 } },
  { type: "sports-scores", props: { id: "sports-scores-6", title: "Sports", limit: 5 } },
  { type: "sports-upcoming", props: { id: "sports-upcoming-7", title: "Upcoming", limit: 5 } },
  { type: "events-list", props: { id: "events-list-8", title: "This Week", limit: 5 } },
  { type: "poll", props: { id: "poll-9", title: "Poll" } },
  { type: "newsletter", props: { id: "newsletter-10", title: "Newsletter" } }
];

function recoveredProductionDesign(): BylineDesignDocumentV2 {
  const { document } = migrateDesignDocumentV1ToV2(
    {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: {
        root: { props: {} },
        content: [{ type: "story-lead", props: { id: "story-lead-1", title: "Top story" } }, ...SPARSE_PRODUCTION_BLOCKS]
      }
    },
    "home"
  );

  return document;
}

describe("sparse legacy blocks keep their historical semantics", () => {
  const convert = (block: { type: string; props: Record<string, unknown> }) => {
    const conversion = convertLegacyBlock(block, 0, createLegacyConversionContext());

    expect(conversion.status).toBe("converted");

    return conversion.status === "converted" ? conversion.package : null;
  };

  it("does not turn a named homepage slot into a generic latest feed", () => {
    const sources = Object.fromEntries(
      SPARSE_PRODUCTION_BLOCKS.filter((block) =>
        ["latest-stories", "opinion-package", "photo-feature", "special-coverage"].includes(block.type)
      ).map((block) => {
        const converted = convert(block);

        return [block.type, (converted?.props as { source?: { type: string } }).source?.type];
      })
    );

    expect(sources).toEqual({
      "latest-stories": "compatibility-brief",
      "opinion-package": "compatibility-opinion",
      "photo-feature": "compatibility-in-focus",
      "special-coverage": "compatibility-special-coverage"
    });
  });

  it("still uses the generic fallback for a block that never had implicit semantics", () => {
    for (const type of ["story-list", "story-grid", "section-feed", "featured-story"]) {
      const converted = convert({ type, props: { id: `${type}-1` } });

      expect((converted?.props as { source?: { type: string } }).source?.type).toBe("latest");
    }
  });

  it("keeps an explicit query rather than overriding it with the historical slot", () => {
    const converted = convert({
      type: "opinion-package",
      props: { id: "opinion-package-3", query: { type: "manual", postIds: [7, 9] } }
    });

    expect((converted?.props as { source?: unknown }).source).toEqual({ type: "manual", storyIds: [7, 9] });
  });

  it("recovers the production design without a Special Coverage section appearing", () => {
    const document = recoveredProductionDesign();
    const resolved = resolveStudio(document, baselinePosts());
    const special = resolved.packages.find((entry) => entry.type === SPECIAL_COVERAGE_PACKAGE_TYPE);
    const inFocus = resolved.packages.find((entry) => entry.type === IN_FOCUS_PACKAGE_TYPE);
    const brief = resolved.packages.find((entry) => entry.type === BRIEF_PACKAGE_TYPE);

    expect(special && isResolvedHomepagePackageVisible(special)).toBe(false);
    // In Focus takes the compatibility In Focus story, not simply the newest.
    expect(inFocus && packageStoryIds(inFocus)).toEqual([3]);
    // The Brief receives what the semantic packages left, exactly as the
    // historical late selection did.
    expect(brief && packageStoryIds(brief).length).toBeGreaterThan(0);
  });

  it("keeps the configured Special Coverage limit an editorial setting", () => {
    const converted = convert(SPARSE_PRODUCTION_BLOCKS[3]);

    expect(parseSpecialCoveragePackageProps(converted?.props).limit).toBe(4);
  });
});
