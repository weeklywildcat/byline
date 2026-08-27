import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SportsPackage } from "@byline/ui";
import { resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
import { resolveSportsPackage } from "@/lib/sports-packages";
import type { SportsGame } from "@/lib/headless";
import type { WordPressPost } from "@/lib/wordpress";
import { PreExtractionSports } from "./baseline/pre-extraction-sports";
import { game, post } from "./fixtures/sports-fixture";

// The extraction proof.
//
// Both sides are rendered from the same inputs: the left is the markup that
// shipped before the sports package existed, the right is the shared renderer
// driven by the resolver. Byte-identical output is the acceptance criterion, and
// it is checked across the conditional cases that do not appear in a single
// live render -- no athlete, no stories, no fixtures, no finals, sports off.

function renderBaseline(options: {
  fieldPosts: WordPressPost[];
  athleteSpotlightPost?: WordPressPost | null;
  recentScores?: SportsGame[];
  upcomingGames?: SportsGame[];
  sportsFeatureEnabled?: boolean;
}) {
  return renderToStaticMarkup(
    <PreExtractionSports
      fieldPosts={options.fieldPosts}
      athleteSpotlightPost={options.athleteSpotlightPost ?? null}
      recentScores={options.recentScores ?? []}
      upcomingGames={options.upcomingGames ?? []}
      sportsFeatureEnabled={options.sportsFeatureEnabled ?? true}
    />
  );
}

function renderExtracted(options: {
  posts: WordPressPost[];
  recentScores?: SportsGame[];
  upcomingGames?: SportsGame[];
  sportsFeatureEnabled?: boolean;
  props?: unknown;
}) {
  const resolved = resolveSportsPackage({
    packageId: "home-sports",
    props: options.props ?? {},
    posts: options.posts,
    selection: resolveWeeklyWildcatHomepage(options.posts),
    recentScores: options.recentScores ?? [],
    upcomingGames: options.upcomingGames ?? [],
    features: { sports: options.sportsFeatureEnabled ?? true }
  });

  return renderToStaticMarkup(<SportsPackage package={resolved} />);
}

// The pre-extraction page fetched 3 finals and 8 fixtures and let the panel slice
// them to 2 and 3. The baseline component keeps that behaviour, so the fixtures
// below are deliberately longer than what is rendered.
const FINALS = [game(9001, "football"), game(9002, "soccer"), game(9003, "basketball")];
const FIXTURES = [
  game(9101, "softball", { upcoming: true }),
  game(9102, "volleyball", { upcoming: true }),
  game(9103, "tennis", { upcoming: true }),
  game(9104, "golf", { upcoming: true }),
  game(9105, "track", { upcoming: true }),
  game(9106, "wrestling", { upcoming: true }),
  game(9107, "swim", { upcoming: true }),
  game(9108, "cheer", { upcoming: true })
];

// A post list shaped so the ordered pass hands the sports package exactly three
// field stories, the way the live homepage does.
function homepagePosts(options: { athlete?: boolean } = {}) {
  return [
    post(1, "news", { sticky: true }),
    ...(options.athlete ? [post(2, "sports", { athlete: true, image: true })] : []),
    post(3, "features", { image: true }),
    post(4, "opinion"),
    post(5, "opinion"),
    post(6, "sports", { image: true }),
    post(7, "sports"),
    post(8, "sports"),
    post(9, "news"),
    post(10, "culture"),
    post(11, "news"),
    post(12, "features")
  ];
}

describe("the extracted sports package reproduces the pre-extraction markup", () => {
  it("matches for the full package: lead, rail, athlete, finals and fixtures", () => {
    const posts = homepagePosts({ athlete: true });
    const selection = resolveWeeklyWildcatHomepage(posts);

    // Guard the fixture itself: if the ordered pass stopped handing sports three
    // stories and a spotlight, the comparison below would pass trivially.
    expect(selection.fieldPosts).toHaveLength(3);
    expect(selection.athleteSpotlightPost?.id).toBe(2);

    const baseline = renderBaseline({
      fieldPosts: selection.fieldPosts,
      athleteSpotlightPost: selection.athleteSpotlightPost,
      recentScores: FINALS,
      upcomingGames: FIXTURES
    });

    expect(renderExtracted({ posts, recentScores: FINALS, upcomingGames: FIXTURES })).toBe(baseline);
    expect(baseline).toContain("sports-athlete-feature");
    expect(baseline).toContain("field-schedule-layout-2");
  });

  it("matches with no athlete spotlight, which is the current live shape", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);

    expect(selection.athleteSpotlightPost).toBeNull();

    expect(renderExtracted({ posts, recentScores: FINALS, upcomingGames: FIXTURES })).toBe(
      renderBaseline({
        fieldPosts: selection.fieldPosts,
        recentScores: FINALS,
        upcomingGames: FIXTURES
      })
    );
  });

  it("matches when the only sports content is the athlete spotlight", () => {
    const posts = [post(1, "news", { sticky: true }), post(2, "sports", { athlete: true, image: true })];
    const selection = resolveWeeklyWildcatHomepage(posts);

    expect(selection.fieldPosts).toHaveLength(0);

    const baseline = renderBaseline({
      fieldPosts: [],
      athleteSpotlightPost: selection.athleteSpotlightPost,
      recentScores: FINALS,
      upcomingGames: FIXTURES
    });

    // The pre-extraction markup still opened .field-layout for a spotlight with
    // no lead story. That awkward shape has to survive.
    expect(baseline).toContain("field-layout");
    expect(baseline).not.toContain("home-story-field");
    expect(renderExtracted({ posts, recentScores: FINALS, upcomingGames: FIXTURES })).toBe(baseline);
  });

  it("matches when there are finals but no upcoming fixtures", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const baseline = renderBaseline({ fieldPosts: selection.fieldPosts, recentScores: FINALS });

    // Two columns, with the empty message in the second.
    expect(baseline).toContain("field-schedule-layout-2");
    expect(baseline).toContain("No upcoming games");
    expect(renderExtracted({ posts, recentScores: FINALS })).toBe(baseline);
  });

  it("matches when there are upcoming fixtures but no finals", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const baseline = renderBaseline({ fieldPosts: selection.fieldPosts, upcomingGames: FIXTURES });

    expect(baseline).toContain("field-schedule-layout-1");
    expect(baseline).not.toContain("field-schedule-result");
    expect(renderExtracted({ posts, upcomingGames: FIXTURES })).toBe(baseline);
  });

  it("matches when there are stories but no structured sports data at all", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const baseline = renderBaseline({ fieldPosts: selection.fieldPosts });

    expect(baseline).not.toContain("field-schedule");
    expect(renderExtracted({ posts })).toBe(baseline);
  });

  it("matches when only the schedule has anything to show", () => {
    const posts = [post(1, "news", { sticky: true }), post(9, "news")];
    const selection = resolveWeeklyWildcatHomepage(posts);

    expect(selection.fieldPosts).toHaveLength(0);

    const baseline = renderBaseline({ fieldPosts: [], recentScores: FINALS, upcomingGames: FIXTURES });

    // Header plus panel, and no .field-layout at all.
    expect(baseline).not.toContain("field-layout");
    expect(renderExtracted({ posts, recentScores: FINALS, upcomingGames: FIXTURES })).toBe(baseline);
  });

  it("matches when the publication has no sports module: both render nothing", () => {
    const posts = homepagePosts({ athlete: true });
    const selection = resolveWeeklyWildcatHomepage(posts);
    const baseline = renderBaseline({
      fieldPosts: selection.fieldPosts,
      athleteSpotlightPost: selection.athleteSpotlightPost,
      recentScores: FINALS,
      upcomingGames: FIXTURES,
      sportsFeatureEnabled: false
    });

    expect(baseline).toBe("");
    // The resolver suppresses the package when a publication has no sports
    // capability. The zero-story fixture below keeps this renderer comparison
    // focused on the same empty result as the legacy page.
    expect(
      renderExtracted({
        posts,
        recentScores: FINALS,
        upcomingGames: FIXTURES,
        sportsFeatureEnabled: false,
        props: { stories: { limit: 0 }, athleteSpotlight: { enabled: false } }
      })
    ).toBe(baseline);
  });

  it("matches when a game record is missing scores, opponent and a formatted date", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const broken = [game(9200, "", { blank: true })];
    const brokenFixture = [game(9201, "", { upcoming: true, blank: true })];

    const baseline = renderBaseline({
      fieldPosts: selection.fieldPosts,
      recentScores: broken,
      upcomingGames: brokenFixture
    });

    expect(baseline).toContain("—");
    expect(baseline).toContain("Opponent");
    expect(renderExtracted({ posts, recentScores: broken, upcomingGames: brokenFixture })).toBe(baseline);
  });

  it("matches for canceled and postponed games, which the schedule endpoints still return", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const odd = [game(9300, "soccer", { status: "postponed" }), game(9301, "football", { status: "canceled" })];

    expect(renderExtracted({ posts, recentScores: odd, upcomingGames: odd })).toBe(
      renderBaseline({ fieldPosts: selection.fieldPosts, recentScores: odd, upcomingGames: odd })
    );
  });
});
