import type { ResolvedDesignContentBlock } from "@byline/content";
import { getBylineBlockPresentation } from "@byline/ui";
import { HomepageStory } from "@/components/HomepageStory";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { SportsSchedulePanel } from "@/components/SportsSchedulePanel";
import { ThisWeekCard } from "@/components/ThisWeekCard";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import type { WordPressPost } from "@/lib/wordpress";

type DesignHomepageProps = {
  blocks: Array<ResolvedDesignContentBlock<WordPressPost>>;
  sportsSchedule: {
    recentScores: SportsGame[];
    upcomingGames: SportsGame[];
    schoolEvents: SchoolEvent[];
  };
};

function heading(block: ResolvedDesignContentBlock<WordPressPost>, fallback: string) {
  return typeof block.props.title === "string" && block.props.title.trim() ? block.props.title : fallback;
}

export function DesignHomepage({ blocks, sportsSchedule }: DesignHomepageProps) {
  const firstSportsIndex = blocks.findIndex((block) => getBylineBlockPresentation(block.type)?.layout === "sports");

  return (
    <main className="live-home-shell byline-design-home" data-byline-design="home">
      {blocks.map((block, index) => {
        const key = typeof block.props.id === "string" ? block.props.id : `${block.type}-${index}`;
        const [lead, ...remaining] = block.stories;
        const presentation = getBylineBlockPresentation(block.type);
        if (!presentation) return null;

        if (presentation.layout === "lead") {
          return lead ? (
            <section className="top-stories top-stories-single" aria-label={heading(block, presentation.defaultHeading)} key={key}>
              <HomepageStory post={lead} variant="lead" showDeck priority />
            </section>
          ) : null;
        }

        if (presentation.layout === "list") {
          return lead ? (
            <section className="the-brief" aria-labelledby={`${key}-heading`} key={key}>
              <h2 id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</h2>
              <div className="brief-digest-layout">
                <HomepageStory post={lead} variant="brief-lead" showAuthor showDeck />
                {remaining.length ? (
                  <div className="brief-support-list">
                    {remaining.map((post) => <HomepageStory key={post.id} post={post} variant="row" showAuthor />)}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null;
        }

        if (presentation.layout === "grid") {
          return block.stories.length ? (
            <section className="more-weekly" aria-labelledby={`${key}-heading`} key={key}>
              <div className="more-weekly-header"><h2 id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</h2><span aria-hidden="true" /></div>
              <div className="more-story-grid">
                {block.stories.map((post, storyIndex) => (
                  <HomepageStory key={post.id} post={post} variant={storyIndex === 0 ? "more-lead" : "more-compact"} showDeck />
                ))}
              </div>
            </section>
          ) : null;
        }

        if (presentation.layout === "feature") {
          return lead ? (
            <section className="in-focus" aria-labelledby={`${key}-heading`} key={key}>
              <div className="live-package-label" id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</div>
              <HomepageStory post={lead} variant="focus" showAuthor showDeck />
            </section>
          ) : null;
        }

        if (presentation.layout === "special") {
          return block.stories.length ? (
            <section className="special-coverage" aria-labelledby={`${key}-heading`} key={key}>
              <div className="live-package-label" id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</div>
              <div className="special-coverage-layout">
                {block.stories.map((post, storyIndex) => (
                  <HomepageStory key={post.id} post={post} variant={storyIndex === 0 ? "special" : "briefing"} showAuthor showDeck />
                ))}
              </div>
            </section>
          ) : null;
        }

        if (presentation.layout === "opinion") {
          return lead ? (
            <section className="opinion-package" aria-labelledby={`${key}-heading`} key={key}>
              <div className="opinion-package-header"><h2 id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</h2></div>
              <div className="opinion-package-layout">
                <HomepageStory post={lead} variant="opinion-lead" showAuthor showDeck />
                {remaining.length ? <div className="opinion-rail">{remaining.map((post) => <HomepageStory key={post.id} post={post} variant="opinion" showAuthor showDeck />)}</div> : null}
              </div>
            </section>
          ) : null;
        }

        if (presentation.layout === "team-feature") {
          return lead ? (
            <section className="from-field" aria-labelledby={`${key}-heading`} key={key}>
              <div className="section-header-row"><h2 id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</h2></div>
              <HomepageStory post={lead} variant="field" showDeck showAuthor />
            </section>
          ) : null;
        }

        if (presentation.layout === "sports") {
          if (index !== firstSportsIndex || (!sportsSchedule.recentScores.length && !sportsSchedule.upcomingGames.length)) return null;
          return (
            <section className="from-field" aria-labelledby={`${key}-heading`} key={key}>
              <div className="section-header-row"><h2 id={`${key}-heading`}>{heading(block, presentation.defaultHeading)}</h2></div>
              <SportsSchedulePanel recentScores={sportsSchedule.recentScores} upcomingGames={sportsSchedule.upcomingGames} />
            </section>
          );
        }

        if (presentation.layout === "events") {
          return sportsSchedule.schoolEvents.length || sportsSchedule.upcomingGames.length ? (
            <section className="byline-design-utility" key={key}><ThisWeekCard maxVisibleItems={5} schoolEvents={sportsSchedule.schoolEvents} sportsGames={sportsSchedule.upcomingGames} /></section>
          ) : null;
        }

        if (presentation.layout === "poll") return <section className="byline-design-utility" key={key}><PollWidget /></section>;
        if (presentation.layout === "newsletter") return <section id={`newsletter-${key}`} className="home-newsletter-section" key={key}><NewsletterSignupForm /></section>;
        if (presentation.layout === "divider") return <hr className="byline-design-divider" key={key} />;
        if (presentation.layout === "structure") return null;
        return null;
      })}
    </main>
  );
}
