import { describe, expect, it } from "vitest";
import {
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  collectPinnedStoryIds,
  parseSportsPackageProps
} from "@byline/design";
import { resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
import { resolveSportsPackage } from "@/lib/sports-packages";
import type { SportsGame } from "@/lib/headless";
import type { WordPressPost } from "@/lib/wordpress";
import { game, post } from "./fixtures/sports-fixture";

const SPORTS_ON = { sports: true };

// Deliberately wider than the packages that resolve before Sports. Sports is the
// sixth selection, so a short fixture would starve it and hide the ordering
// behaviour these tests exist to pin down.
function homepagePosts() {
  return [
    post(1, "news", { sticky: true }),
    post(2, "sports", { athlete: true, image: true }),
    post(3, "features", { image: true }),
    post(4, "opinion"),
    post(5, "opinion"),
    post(6, "opinion"),
    post(7, "sports", { image: true }),
    post(8, "sports"),
    post(9, "sports"),
    post(10, "sports"),
    post(11, "news"),
    post(12, "culture"),
    post(13, "news"),
    post(14, "features"),
    post(15, "news"),
    post(16, "culture")
  ];
}

// Mirrors what the homepage does: gather the design's pins, reserve them in the
// ordered pass, then resolve the package.
function selectionFor(posts: WordPressPost[], props: unknown) {
  const pinned = collectPinnedStoryIds({
    schemaVersion: 2,
    template: "home",
    theme: "weekly-wildcat",
    packages: [{ id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: props as Record<string, unknown> }]
  });

  return resolveWeeklyWildcatHomepage(posts, pinned);
}

function resolve(
  posts: WordPressPost[],
  props: unknown = {},
  options: { recentScores?: SportsGame[]; upcomingGames?: SportsGame[]; sports?: boolean } = {}
) {
  return resolveSportsPackage({
    packageId: "home-sports",
    props,
    posts,
    selection: selectionFor(posts, props),
    recentScores: options.recentScores ?? [],
    upcomingGames: options.upcomingGames ?? [],
    features: options.sports === undefined ? SPORTS_ON : { sports: options.sports }
  });
}

const FINALS = [game(9001, "football"), game(9002, "soccer"), game(9003, "basketball"), game(9004, "golf")];
const FIXTURES = [
  game(9101, "softball", { upcoming: true }),
  game(9102, "volleyball", { upcoming: true }),
  game(9103, "tennis", { upcoming: true }),
  game(9104, "swim", { upcoming: true })
];

describe("sports story selection", () => {
  it("takes the ordered pass's sports stories, split into a lead and a rail", () => {
    const resolved = resolve(homepagePosts());

    expect(resolved.lead?.id).toBe(7);
    expect(resolved.rail.map((story) => story.id)).toEqual([8, 9]);
  });

  it("resolves the lead with a cleaned deck and the rail with the raw excerpt", () => {
    const resolved = resolve(homepagePosts());

    // The pre-Studio sports lead used cleanDeck; the rail did not. The flag is a
    // resolution decision, recorded on the view model, not a renderer option.
    expect(resolved.lead?.deckIsHtml).toBe(false);
    expect(resolved.rail[0]?.deckIsHtml).toBe(true);
  });

  it("honours the story limit", () => {
    expect(resolve(homepagePosts(), { stories: { limit: 1 } }).rail).toHaveLength(0);
    expect(resolve(homepagePosts(), { stories: { limit: 2 } }).rail).toHaveLength(1);
    expect(resolve(homepagePosts(), { stories: { limit: 0 } }).lead).toBeNull();
  });

  it("takes a manual selection as an explicit editorial override, in the pinned order", () => {
    const posts = homepagePosts();
    const resolved = resolve(posts, {
      stories: { source: { type: "manual", storyIds: [13, 11] }, limit: 3 }
    });

    expect(resolved.lead?.id).toBe(13);
    expect(resolved.rail.map((story) => story.id)).toEqual([11]);
  });

  it("takes a pinned story away from the package that would otherwise claim it", () => {
    const posts = homepagePosts();
    const unpinned = resolveWeeklyWildcatHomepage(posts);

    // Post 1 is the sticky front-page lead and post 4 leads Opinion. Pinning
    // them into Sports has to move them, not duplicate them.
    expect(unpinned.leadPost?.id).toBe(1);
    expect(unpinned.opinionPosts[0]?.id).toBe(4);

    const props = { stories: { source: { type: "manual", storyIds: [1, 4] }, limit: 3 } };
    const selection = selectionFor(posts, props);
    const resolved = resolve(posts, props);

    expect(resolved.lead?.id).toBe(1);
    expect(resolved.rail.map((story) => story.id)).toEqual([4]);

    // The homepage-wide invariant: neither pinned story appears anywhere else.
    expect(selection.leadPost?.id).not.toBe(1);
    expect(selection.opinionPosts.map((entry) => entry.id)).not.toContain(4);
    expect(selection.fieldPosts.map((entry) => entry.id)).not.toContain(1);
    for (const bucket of [selection.morePosts, selection.rightNowPosts, selection.briefPosts]) {
      expect(bucket.map((entry) => entry.id)).not.toContain(1);
      expect(bucket.map((entry) => entry.id)).not.toContain(4);
    }
  });

  it("drops a manual id that no longer resolves to a published story", () => {
    const resolved = resolve(homepagePosts(), {
      stories: { source: { type: "manual", storyIds: [99999, 13] }, limit: 3 }
    });

    expect(resolved.lead?.id).toBe(13);
  });
});

describe("cross-package de-duplication", () => {
  // The regression that matters most: extracting Sports must not change which
  // stories any other package receives.
  it("leaves every other package's stories untouched", () => {
    const posts = homepagePosts();
    const selection = resolveWeeklyWildcatHomepage(posts);
    const before = {
      lead: selection.leadPost?.id,
      inFocus: selection.inFocusPost?.id,
      special: selection.specialCoveragePosts.map((entry) => entry.id),
      opinion: selection.opinionPosts.map((entry) => entry.id),
      more: selection.morePosts.map((entry) => entry.id),
      latest: selection.rightNowPosts.map((entry) => entry.id),
      brief: selection.briefPosts.map((entry) => entry.id)
    };

    resolve(posts, {}, { recentScores: FINALS, upcomingGames: FIXTURES });

    const after = resolveWeeklyWildcatHomepage(posts);

    expect({
      lead: after.leadPost?.id,
      inFocus: after.inFocusPost?.id,
      special: after.specialCoveragePosts.map((entry) => entry.id),
      opinion: after.opinionPosts.map((entry) => entry.id),
      more: after.morePosts.map((entry) => entry.id),
      latest: after.rightNowPosts.map((entry) => entry.id),
      brief: after.briefPosts.map((entry) => entry.id)
    }).toEqual(before);
  });

  it("does not repeat a story across the sports package's own slots", () => {
    const posts = homepagePosts();
    const resolved = resolve(posts);
    const ids = [
      ...(resolved.lead ? [resolved.lead.id] : []),
      ...resolved.rail.map((story) => story.id),
      ...(resolved.athleteSpotlight ? [resolved.athleteSpotlight.id] : [])
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("moves a story out of the automatic list when it is pinned as the spotlight", () => {
    const posts = homepagePosts();
    const resolved = resolve(posts, {
      athleteSpotlight: { enabled: true, source: { type: "manual", storyIds: [7] } }
    });

    // Post 7 would normally lead the package. Pinning it as the spotlight
    // reserves it, so the story list starts at the next unused sports post.
    expect(resolved.athleteSpotlight?.id).toBe(7);
    expect(resolved.lead?.id).toBe(8);
  });

  it("suppresses the spotlight when a pin puts the same story in both slots", () => {
    // The one collision reservation cannot prevent: the standing spotlight is
    // found by tag rather than from the used set, so pinning that same post as a
    // story would otherwise render it twice inside this package.
    const posts = homepagePosts();
    const resolved = resolve(posts, {
      stories: { source: { type: "manual", storyIds: [2, 9] }, limit: 3 }
    });

    expect(resolved.lead?.id).toBe(2);
    expect(resolved.athleteSpotlight).toBeNull();
  });
});

describe("athlete spotlight", () => {
  it("uses the post the ordered pass reserved before the front page lead", () => {
    const resolved = resolve(homepagePosts());

    expect(resolved.athleteSpotlight?.id).toBe(2);
    expect(resolved.athleteSpotlight?.eyebrow).toBe("Athlete of the Week");
    expect(resolved.athleteSpotlight?.sport).toBe("Soccer");
  });

  it("strips the standing prefix from the athlete's name", () => {
    const posts = [
      post(1, "news", { sticky: true }),
      post(2, "sports", { athlete: true, title: "Athlete of the Week: Jordan Reyes" })
    ];

    expect(resolve(posts).athleteSpotlight?.name).toBe("Jordan Reyes");
  });

  it("can be switched off without touching the stories", () => {
    const resolved = resolve(homepagePosts(), { athleteSpotlight: { enabled: false } });

    expect(resolved.athleteSpotlight).toBeNull();
    expect(resolved.lead?.id).toBe(7);
  });

  it("resolves to nothing when the publication has no spotlight post", () => {
    const posts = homepagePosts().filter((entry) => entry.id !== 2);

    expect(resolve(posts).athleteSpotlight).toBeNull();
  });

  it("accepts a manual spotlight override", () => {
    const resolved = resolve(homepagePosts(), {
      athleteSpotlight: { enabled: true, source: { type: "manual", storyIds: [16] } }
    });

    expect(resolved.athleteSpotlight?.id).toBe(16);
  });

  it("reserves a pinned spotlight so no other package shows it", () => {
    const posts = homepagePosts();
    const props = { athleteSpotlight: { enabled: true, source: { type: "manual", storyIds: [16] } } };
    const selection = selectionFor(posts, props);

    expect(resolveWeeklyWildcatHomepage(posts).morePosts.map((entry) => entry.id)).toContain(16);
    for (const bucket of [selection.morePosts, selection.rightNowPosts, selection.briefPosts, selection.fieldPosts]) {
      expect(bucket.map((entry) => entry.id)).not.toContain(16);
    }
  });
});

describe("structured sports data", () => {
  it("resolves finals and fixtures into their own view models", () => {
    const resolved = resolve(homepagePosts(), {}, { recentScores: FINALS, upcomingGames: FIXTURES });

    expect(resolved.schedule?.results).toHaveLength(2);
    expect(resolved.schedule?.upcoming).toHaveLength(3);
    expect(resolved.schedule?.results[0]).toMatchObject({
      matchup: "Wildcats vs Rivals 9001",
      sportLabel: "Football · Varsity",
      iconName: "mdi:football",
      verdict: "Wildcats win by 7"
    });
  });

  it("honours the finals and fixtures counts", () => {
    const resolved = resolve(
      homepagePosts(),
      { scores: { enabled: true, limit: 4 }, upcoming: { enabled: true, limit: 1 } },
      { recentScores: FINALS, upcomingGames: FIXTURES }
    );

    expect(resolved.schedule?.results).toHaveLength(4);
    expect(resolved.schedule?.upcoming).toHaveLength(1);
  });

  it("drops the panel entirely when both modules are switched off", () => {
    const resolved = resolve(
      homepagePosts(),
      { scores: { enabled: false }, upcoming: { enabled: false } },
      { recentScores: FINALS, upcomingGames: FIXTURES }
    );

    expect(resolved.schedule).toBeNull();
  });

  it("keeps the panel with only finals, and only fixtures", () => {
    expect(resolve(homepagePosts(), { upcoming: { enabled: false } }, { recentScores: FINALS }).schedule?.upcoming)
      .toHaveLength(0);
    expect(resolve(homepagePosts(), { scores: { enabled: false } }, { upcomingGames: FIXTURES }).schedule?.results)
      .toHaveLength(0);
  });

  it("invents nothing when there are no games", () => {
    expect(resolve(homepagePosts()).schedule).toBeNull();
  });

  it("renders an em dash rather than a zero for a record with no score", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9500, "soccer", { teamScore: null, opponentScore: null })] }
    );

    expect(resolved.schedule?.results[0].team.score).toBe("—");
    expect(resolved.schedule?.results[0].opponent.score).toBe("—");
    expect(resolved.schedule?.results[0].team.isWinner).toBe(false);
    expect(resolved.schedule?.results[0].opponent.isWinner).toBe(false);
  });

  it("falls back through the record when display fields are missing", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9600, "", { blank: true })], upcomingGames: [game(9601, "", { upcoming: true, blank: true })] }
    );

    expect(resolved.schedule?.results[0]).toMatchObject({
      matchup: "Game 9600",
      sportLabel: "Sports",
      iconName: "mdi:whistle",
      opponent: { label: "Opponent", score: "—" },
      verdict: "Final",
      context: "",
      scoreLabel: null,
      recapHref: null
    });
    // A fixture with no formatted date carries an empty display date, which the
    // renderer turns into no <time> element rather than an empty one.
    expect(resolved.schedule?.upcoming[0]).toMatchObject({ displayDate: "", siteLabel: "", location: "" });
  });

  it("keeps the editorial context line for a note that names an occasion", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9700, "football", { notes: "Region opener", site: "away" })] }
    );

    expect(resolved.schedule?.results[0].context).toBe("Region opener");
  });

  it("falls back to the site context when the note says nothing useful", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9701, "football", { notes: "Good crowd", site: "away" })] }
    );

    expect(resolved.schedule?.results[0].context).toBe("Road final");
  });

  it("reports a tie rather than picking a winner", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9800, "soccer", { teamScore: 2, opponentScore: 2 })] }
    );

    expect(resolved.schedule?.results[0].verdict).toBe("Final tied");
    expect(resolved.schedule?.results[0].team.isWinner).toBe(false);
  });

  it("marks the opponent as the winner when they scored more", () => {
    const resolved = resolve(
      homepagePosts(),
      {},
      { recentScores: [game(9801, "soccer", { teamScore: 1, opponentScore: 3 })] }
    );

    expect(resolved.schedule?.results[0].opponent.isWinner).toBe(true);
    expect(resolved.schedule?.results[0].verdict).toBe("Rivals 9801 wins by 2");
  });
});

describe("publication capabilities are authoritative", () => {
  it("gives a publication without the sports module no structured modules at all", () => {
    const resolved = resolve(
      homepagePosts(),
      // The design asks for both. The publication does not have them.
      { scores: { enabled: true, limit: 3 }, upcoming: { enabled: true, limit: 3 } },
      { recentScores: FINALS, upcomingGames: FIXTURES, sports: false }
    );

    expect(resolved.schedule).toBeNull();
  });

  it("still resolves the sports stories a publication actually published", () => {
    const resolved = resolve(homepagePosts(), {}, { sports: false });

    expect(resolved.lead?.id).toBe(7);
  });
});

describe("sports package settings", () => {
  it("falls back to the Weekly Wildcat defaults for malformed props", () => {
    expect(parseSportsPackageProps(null)).toEqual(WEEKLY_WILDCAT_SPORTS_DEFAULTS);
    expect(parseSportsPackageProps({ scores: { limit: -4 }, stories: { limit: "three" } })).toEqual(
      WEEKLY_WILDCAT_SPORTS_DEFAULTS
    );
  });

  it("keeps the Weekly Wildcat counts the pre-Studio panel actually rendered", () => {
    expect(WEEKLY_WILDCAT_SPORTS_DEFAULTS.scores.limit).toBe(2);
    expect(WEEKLY_WILDCAT_SPORTS_DEFAULTS.upcoming.limit).toBe(3);
    expect(WEEKLY_WILDCAT_SPORTS_DEFAULTS.stories.limit).toBe(3);
  });

  it("renames the section heading without touching anything else", () => {
    const resolved = resolve(homepagePosts(), { heading: "Wildcat Sports" });

    expect(resolved.heading).toBe("Wildcat Sports");
    expect(resolved.sectionLink).toEqual({ label: "All Sports →", href: "/sports/" });
  });

  it("turns bylines and decks off", () => {
    const resolved = resolve(homepagePosts(), { presentation: { showDeck: false, showBylines: false } });

    expect(resolved.presentation).toEqual({ showDeck: false, showBylines: false });
  });

  it("rejects an athlete source the package cannot render", () => {
    const resolved = resolve(homepagePosts(), {
      athleteSpotlight: { enabled: true, source: { type: "author", authorId: 4 } }
    });

    // Falls back to the standing spotlight convention rather than accepting a
    // source the spotlight treatment has no meaning for.
    expect(resolved.athleteSpotlight?.id).toBe(2);
  });
});
