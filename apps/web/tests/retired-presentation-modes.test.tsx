import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LEAD_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  parseLeadPackageProps,
  type BylineDesignDocumentV2
} from "@byline/design";
import { getLeadPackageRenderer } from "@byline/ui";
import { resolveLeadPackage, toStoryView } from "@/lib/homepage-packages";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
import type { WordPressCategory, WordPressPost } from "@/lib/wordpress";

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const articleRoute = readSource("../app/[segment]/[month]/[day]/[category]/[articleSlug]/page.tsx");
const articleRenderer = readSource("../../../packages/ui/src/article-view.tsx");
const homepageRoute = readSource("../app/page.tsx");
const globalCss = readSource("../app/globals.css");
const weeklyWildcatCss = readSource("../../../packages/theme-weekly-wildcat/src/styles.css");
const studioConfig = readSource("../../../wordpress-plugin/src/studio.tsx");
const pluginSource = readSource("../../../wordpress-plugin/weekly-wildcat-headless.php");

function category(id: number, slug: string): WordPressCategory {
  return { id, count: 1, description: "", link: "", name: slug, slug, taxonomy: "category", parent: 0 };
}

/**
 * A post as it still arrives from an installed site: the retired per-post
 * settings remain in the database, so the REST payload of an older cached
 * response can still carry them. Nothing may read them, and nothing may break.
 */
function legacyPost(id: number, categorySlug: string, options: { sticky?: boolean; legacyMeta?: boolean } = {}) {
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
    content: { rendered: "<p>Body</p>" },
    excerpt: { rendered: `Deck ${id}` },
    author: 1,
    featured_media: 0,
    categories: [id],
    tags: [],
    sticky: Boolean(options.sticky),
    ...(options.legacyMeta
      ? {
          byline: {
            primaryGameId: 0,
            homepageOpinionTreatment: true,
            articleHero: {
              enabled: true,
              backgroundColor: "#171a21",
              textColor: "light",
              layout: "overlay",
              imageFit: "cover",
              imageSource: "custom",
              image: { id: 99, sourceUrl: "https://example.test/hero.jpg", alt: "", width: 1, height: 1, caption: "", creditText: "" }
            }
          }
        }
      : {}),
    _embedded: { "wp:featuredmedia": [], "wp:term": [[category(id, categorySlug)]] }
  } as unknown as WordPressPost;
}

// --- custom article hero ----------------------------------------------------

describe("the custom article hero is gone", () => {
  it("leaves the article route with one canonical header", () => {
    expect(articleRoute).not.toContain("ArticleHero");
    expect(articleRoute).not.toContain("articleHero");
    expect(articleRoute).not.toContain("hasCustomHero");
    expect(articleRoute).not.toContain("article-story-custom-hero");

    // The route supplies data and slots; the shared renderer owns the one
    // canonical header and article structure used by production and preview.
    expect(articleRoute).toContain("<ArticleView");
    expect(articleRenderer.match(/className="article-header"/g)).toHaveLength(1);
    expect(articleRenderer).toContain('<article className="article-story">');
  });

  it("keeps the rest of the canonical article intact", () => {
    for (const marker of [
      "article-section-label",
      "article-excerpt",
      "article-athlete-meta",
      "article-author-line",
      "article-timing",
      "ArticleShareActions",
      "ArticleImage",
      "ArticleGameCard",
      "article-body",
      "article-tags",
      "article-update-notice",
      "NewsletterSignupForm",
      "AboutWriters"
    ]) {
      expect(`${articleRoute}\n${articleRenderer}`).toContain(marker);
    }
  });

  it("no longer derives the browser theme colour from a story", () => {
    expect(articleRoute).toContain('themeColor: "#fbfaf7"');
    expect(articleRoute).not.toContain("backgroundColor");
  });

  it("leaves no custom-hero styling behind", () => {
    for (const selector of ["article-custom-hero", "article-story-custom-hero", "article-immersive", "article-story-content"]) {
      expect(globalCss).not.toContain(selector);
    }
    // The shared heading animation belongs to every page header and stays.
    expect(globalCss).toContain("page-heading-enter");
    expect(globalCss).toContain(".article-header h1,");
  });

  it("stops emitting the retired settings from WordPress", () => {
    expect(pluginSource).not.toContain("articleHero");
    expect(pluginSource).not.toContain("ARTICLE_HERO");
    expect(pluginSource).not.toContain("homepageOpinionTreatment");
    expect(pluginSource).not.toContain("HOMEPAGE_OPINION_TREATMENT");
    // The one surviving post display setting is the sports game relationship.
    expect(pluginSource).toContain("'primaryGameId' => absint(get_post_meta($post_id, WWH_PRIMARY_GAME_META, true))");
  });
});

// --- homepage opinion lead treatment ----------------------------------------

const ALL_MODULES = { polls: true, events: true, sports: true };

function resolve(posts: WordPressPost[], props: unknown) {
  return resolveLeadPackage({
    packageId: "home-lead",
    props,
    posts,
    selection: resolveWeeklyWildcatHomepage(posts),
    features: ALL_MODULES,
    usedStoryIds: new Set<number>(),
    compatibilitySelection: true
  });
}

describe("the homepage opinion lead treatment is gone", () => {
  const ordinaryLead = [legacyPost(1, "news", { sticky: true }), legacyPost(2, "features"), legacyPost(3, "opinion")];
  const legacyLead = [legacyPost(1, "news", { sticky: true, legacyMeta: true }), legacyPost(2, "features"), legacyPost(3, "opinion")];

  // Fixtures A-D from the removal: an ordinary lead, a lead still carrying the
  // retired post meta, and designs persisting either value of the retired
  // package setting. All four must produce the same normal lead treatment.
  const fixtures: Array<[string, WordPressPost[], unknown]> = [
    ["an ordinary lead", ordinaryLead, WEEKLY_WILDCAT_LEAD_DEFAULTS],
    ["a lead with the retired post meta", legacyLead, WEEKLY_WILDCAT_LEAD_DEFAULTS],
    ["a design persisting opinionTreatment: auto", legacyLead, { ...WEEKLY_WILDCAT_LEAD_DEFAULTS, presentation: { showDeck: true, opinionTreatment: "auto" } }],
    ["a design persisting opinionTreatment: off", legacyLead, { ...WEEKLY_WILDCAT_LEAD_DEFAULTS, presentation: { showDeck: true, opinionTreatment: "off" } }]
  ];

  it.each(fixtures)("renders the normal lead treatment for %s", (_name, posts, props) => {
    const resolved = resolve(posts, props);

    expect(resolved.presentation).toEqual({ showDeck: true });
    expect(resolved.presentation).not.toHaveProperty("opinionTreatment");
    expect(resolved.lead).not.toBeNull();
    expect(resolved.lead).not.toHaveProperty("opinionTreatment");

    const Renderer = getLeadPackageRenderer("weekly-wildcat");
    const html = renderToStaticMarkup(<Renderer package={resolved} />);

    expect(html).not.toContain("home-story-homepage-opinion");
    // The lead is still a lead.
    expect(html).toContain("home-story-lead");
    expect(html).toContain("Story 1");
  });

  it("produces byte-identical markup whether or not the retired data is present", () => {
    const Renderer = getLeadPackageRenderer("weekly-wildcat");
    const [, , ...rest] = fixtures;
    const baseline = renderToStaticMarkup(<Renderer package={resolve(ordinaryLead, WEEKLY_WILDCAT_LEAD_DEFAULTS)} />);

    for (const [name, posts, props] of rest) {
      expect(renderToStaticMarkup(<Renderer package={resolve(posts, props)} />), name).toBe(baseline);
    }
  });

  it("keeps a design that persists the retired setting valid", () => {
    for (const retired of ["auto", "off"]) {
      const parsed = parseLeadPackageProps({
        lead: { source: { type: "sticky" } },
        presentation: { showDeck: true, opinionTreatment: retired }
      });

      // An intentionally removed presentation option, not schema corruption:
      // the document still loads and normalises the obsolete field away.
      expect(parsed.presentation).toEqual({ showDeck: true });
      expect(JSON.stringify(parsed)).not.toContain("opinionTreatment");
    }
  });

  it("removes the page-wide shell signal", () => {
    expect(homepageRoute).not.toContain("leadHasOpinionTreatment");
    expect(homepageRoute).not.toContain("live-home-shell-opinion-lead");
    expect(homepageRoute).toContain('className="byline-publication-preview live-home-shell"');
    expect(globalCss).not.toContain("live-home-shell-opinion-lead");
  });

  it("removes the resolved-homepage signal entirely", () => {
    // Deliberately typed loosely: the props carry the retired setting exactly as
    // an installed site's saved design still does, which the current type no
    // longer describes. That the document still resolves is the point.
    const document = {
      schemaVersion: 2 as const,
      template: "home",
      theme: "weekly-wildcat",
      packages: [
        {
          id: "home-lead",
          type: LEAD_PACKAGE_TYPE,
          props: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS, presentation: { showDeck: true, opinionTreatment: "auto" } }
        }
      ]
    } as unknown as BylineDesignDocumentV2;

    const resolved = resolveHomepageDocument({
      document,
      posts: legacyLead,
      publication: {
        identity: { shortName: "Test", organizationName: "Test School" },
        appearance: { theme: "weekly-wildcat" },
        features: ALL_MODULES
      } as never,
      sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }
    });

    expect(resolved).not.toHaveProperty("leadHasOpinionTreatment");
    expect(resolved.packages).toHaveLength(1);
  });

  it("removes the Studio control", () => {
    expect(studioConfig).not.toContain("opinionTreatment");
    expect(studioConfig).not.toContain("Opinion treatment");
    // The rest of the lead package's presentation settings stay configurable.
    expect(studioConfig).toContain("showDeck");
  });

  it("drops the per-story treatment from the presentation-neutral view model", () => {
    const view = toStoryView(legacyPost(1, "opinion", { legacyMeta: true }));

    expect(view).not.toHaveProperty("opinionTreatment");
    expect(view.title).toBe("Story 1");
  });
});

// --- what must survive ------------------------------------------------------

describe("the real Opinion package is untouched", () => {
  it("keeps its own package type and visual identity", () => {
    expect(OPINION_PACKAGE_TYPE).toBe("opinion-package");

    for (const selector of [
      ".opinion-package",
      ".opinion-package-header",
      ".opinion-package-layout",
      ".opinion-rail",
      ".home-story-opinion-lead",
      ".home-story-opinion "
    ]) {
      expect(weeklyWildcatCss).toContain(selector);
    }

    // Only the per-post lead treatment was retired.
    expect(weeklyWildcatCss).not.toContain("home-story-homepage-opinion");
  });
});
