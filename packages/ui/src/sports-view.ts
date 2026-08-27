import type { StoryImageView, StoryView } from "./story-view";

// Structured sports records are a different source domain from WordPress
// stories, so they get their own view models rather than being bent into
// StoryView. A game has a scoreboard, a site, a status and a fixture date; a
// story has a byline, a deck and a category. Forcing one into the other would
// lose exactly the fields the sports package exists to show.
//
// Every formatting decision -- the score dash, the winner flags, the verdict
// sentence, the sport icon, the "Home final" context line -- is made in the
// resolver. The renderer prints what it is given.

export type SportsScoreboardSideView = {
  label: string;
  // Already rendered: "24", or the em dash when the record carries no score.
  score: string;
  isWinner: boolean;
};

/**
 * A completed game.
 *
 * `verdict` is the resolved footer sentence and is never empty: the resolver
 * falls back through the record's own status text to "Final", matching the
 * pre-Studio card.
 */
export type SportsResultView = {
  id: number;
  sportLabel: string;
  iconName: string;
  matchup: string;
  // The record's own score string, used as the scoreboard's accessible name.
  // Null when the record has none, in which case no label is emitted.
  scoreLabel: string | null;
  team: SportsScoreboardSideView;
  opponent: SportsScoreboardSideView;
  verdict: string;
  // "Home final", "Region opener", or empty when the record says nothing useful.
  context: string;
  recapHref: string | null;
};

/**
 * An upcoming game.
 *
 * `displayDate` can be empty -- some records carry a date the CMS could not
 * format -- and the renderer omits the `<time>` element in that case rather than
 * printing a blank one.
 */
export type SportsFixtureView = {
  id: number;
  isoDate: string;
  displayDate: string;
  // "Home", "Away", "Neutral Site", or empty when the record does not say.
  siteLabel: string;
  sportLabel: string;
  matchup: string;
  location: string;
};

export type AthleteSpotlightView = {
  id: number;
  name: string;
  href: string;
  // "Athlete of the Week" / "Athlete of the Month" / "Athlete Spotlight".
  eyebrow: string;
  sport: string | null;
  blurb: string | null;
  image: StoryImageView | null;
};

export type SportsScheduleView = {
  panelHeading: string;
  scoresHeading: string;
  upcomingHeading: string;
  fullScheduleLink: { label: string; href: string };
  results: SportsResultView[];
  upcoming: SportsFixtureView[];
  // Shown when the package still has finals to report but no fixture ahead of
  // them, which is how the pre-Studio panel behaved at the end of a season.
  emptyUpcomingMessage: string;
};

/**
 * The resolved sports package: everything the renderer needs, already selected,
 * de-duplicated, reconciled against the publication's modules and formatted.
 *
 * No CMS types, no sports endpoints, no feature flags, no story queries. This is
 * the single model that both the Next static export and Studio's preview render.
 */
export type ResolvedSportsPackage = {
  packageId: string;
  heading: string;
  sectionLink: { label: string; href: string } | null;
  lead: StoryView | null;
  rail: StoryView[];
  athleteSpotlight: AthleteSpotlightView | null;
  // Null when the publication has no sports module, or when both structured
  // modules are switched off, or when there is genuinely nothing to report.
  // The renderer never invents placeholder fixtures.
  schedule: SportsScheduleView | null;
  presentation: {
    showDeck: boolean;
    showBylines: boolean;
    showReadLink?: boolean;
  };
  content?: "full" | "schedule" | "story";
  fallbackAuthorName: string;
};

/**
 * True when the package has something to render.
 *
 * The pre-Studio homepage gated the whole `<section>` on this, and rendered
 * nothing at all rather than an empty state, so both theme renderers share the
 * one predicate instead of each re-deriving it.
 */
export function sportsPackageHasContent(resolved: ResolvedSportsPackage) {
  return Boolean(resolved.lead || resolved.rail.length > 0 || resolved.athleteSpotlight || resolved.schedule);
}
