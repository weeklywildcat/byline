import { HomepageStory } from "@/components/HomepageStory";
import { SportsSchedulePanel } from "@/components/SportsSchedulePanel";
import type { SportsGame } from "@/lib/headless";
import type { WordPressPost } from "@/lib/wordpress";
import { SportsAthleteFeature } from "./pre-extraction-athlete-feature";

// The pre-extraction Sports section, frozen.
//
// This is a verbatim copy of the markup that lived in apps/web/app/page.tsx
// before the sports package was extracted, together with the `hasFieldSection`
// gate and the lead/rail split that surrounded it. It is the compatibility
// baseline: sports-package-parity.test.tsx renders this and the shared renderer
// against the same inputs and requires byte-identical output.
//
// Nothing here may be "fixed". If this markup is wrong, the shared renderer has
// to be wrong in the same way until the two are changed together, deliberately.

export type PreExtractionSportsProps = {
  fieldPosts: WordPressPost[];
  athleteSpotlightPost: WordPressPost | null;
  recentScores: SportsGame[];
  upcomingGames: SportsGame[];
  sportsFeatureEnabled: boolean;
};

export function PreExtractionSports({
  fieldPosts,
  athleteSpotlightPost,
  recentScores,
  upcomingGames,
  sportsFeatureEnabled
}: PreExtractionSportsProps) {
  const fieldLeadPost = fieldPosts[0] ?? null;
  const fieldRailPosts = fieldPosts.slice(1, 3);
  const hasFieldSection =
    sportsFeatureEnabled &&
    (fieldPosts.length > 0 ||
      Boolean(athleteSpotlightPost) ||
      recentScores.length > 0 ||
      upcomingGames.length > 0);

  if (!hasFieldSection) {
    return null;
  }

  return (
    <section className="from-field" aria-labelledby="field-heading">
      <div className="section-header-row">
        <h2 id="field-heading">Sports</h2>
        <a href="/sports/">All Sports →</a>
      </div>
      {fieldPosts.length > 0 || athleteSpotlightPost ? (
        <div className="field-layout">
          {fieldLeadPost ? (
            <HomepageStory post={fieldLeadPost} variant="field" showDeck cleanDeck showAuthor showReadLink />
          ) : null}
          {fieldRailPosts.length > 0 || athleteSpotlightPost ? (
            <div className="field-rail">
              {fieldRailPosts.map((post) => (
                <HomepageStory key={post.id} post={post} variant="briefing" showAuthor />
              ))}
              {athleteSpotlightPost ? <SportsAthleteFeature post={athleteSpotlightPost} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <SportsSchedulePanel recentScores={recentScores} upcomingGames={upcomingGames} />
    </section>
  );
}
