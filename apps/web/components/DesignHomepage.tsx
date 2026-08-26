import type { ResolvedDesignContentBlock } from "@byline/content";
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
  const firstSportsIndex = blocks.findIndex((block) => block.type === "sports-scores" || block.type === "sports-upcoming");

  return (
    <main className="live-home-shell byline-design-home" data-byline-design="home">
      {blocks.map((block, index) => {
        const key = typeof block.props.id === "string" ? block.props.id : `${block.type}-${index}`;
        const [lead, ...remaining] = block.stories;

        if (block.type === "story-lead") {
          return lead ? (
            <section className="top-stories top-stories-single" aria-label={heading(block, "Top story")} key={key}>
              <HomepageStory post={lead} variant="lead" showDeck priority />
            </section>
          ) : null;
        }

        if (["story-list", "latest-stories", "section-feed"].includes(block.type)) {
          return lead ? (
            <section className="the-brief" aria-labelledby={`${key}-heading`} key={key}>
              <h2 id={`${key}-heading`}>{heading(block, "Latest stories")}</h2>
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

        if (block.type === "story-grid") {
          return block.stories.length ? (
            <section className="more-weekly" aria-labelledby={`${key}-heading`} key={key}>
              <div className="more-weekly-header"><h2 id={`${key}-heading`}>{heading(block, "Stories")}</h2><span aria-hidden="true" /></div>
              <div className="more-story-grid">
                {block.stories.map((post, storyIndex) => (
                  <HomepageStory key={post.id} post={post} variant={storyIndex === 0 ? "more-lead" : "more-compact"} showDeck />
                ))}
              </div>
            </section>
          ) : null;
        }

        if (block.type === "featured-story" || block.type === "photo-feature") {
          return lead ? (
            <section className="in-focus" aria-labelledby={`${key}-heading`} key={key}>
              <div className="live-package-label" id={`${key}-heading`}>{heading(block, block.type === "photo-feature" ? "In Focus" : "Featured")}</div>
              <HomepageStory post={lead} variant="focus" showAuthor showDeck />
            </section>
          ) : null;
        }

        if (block.type === "special-coverage") {
          return block.stories.length ? (
            <section className="special-coverage" aria-labelledby={`${key}-heading`} key={key}>
              <div className="live-package-label" id={`${key}-heading`}>{heading(block, "Special Coverage")}</div>
              <div className="special-coverage-layout">
                {block.stories.map((post, storyIndex) => (
                  <HomepageStory key={post.id} post={post} variant={storyIndex === 0 ? "special" : "briefing"} showAuthor showDeck />
                ))}
              </div>
            </section>
          ) : null;
        }

        if (block.type === "opinion-package") {
          return lead ? (
            <section className="opinion-package" aria-labelledby={`${key}-heading`} key={key}>
              <div className="opinion-package-header"><h2 id={`${key}-heading`}>{heading(block, "Opinion")}</h2></div>
              <div className="opinion-package-layout">
                <HomepageStory post={lead} variant="opinion-lead" showAuthor showDeck />
                {remaining.length ? <div className="opinion-rail">{remaining.map((post) => <HomepageStory key={post.id} post={post} variant="opinion" showAuthor showDeck />)}</div> : null}
              </div>
            </section>
          ) : null;
        }

        if (block.type === "team-feature" || block.type === "athlete-feature") {
          return lead ? (
            <section className="from-field" aria-labelledby={`${key}-heading`} key={key}>
              <div className="section-header-row"><h2 id={`${key}-heading`}>{heading(block, block.type === "athlete-feature" ? "Athlete Feature" : "Team Feature")}</h2></div>
              <HomepageStory post={lead} variant="field" showDeck showAuthor />
            </section>
          ) : null;
        }

        if (block.type === "sports-scores" || block.type === "sports-upcoming") {
          if (index !== firstSportsIndex || (!sportsSchedule.recentScores.length && !sportsSchedule.upcomingGames.length)) return null;
          return (
            <section className="from-field" aria-labelledby={`${key}-heading`} key={key}>
              <div className="section-header-row"><h2 id={`${key}-heading`}>{heading(block, "Sports")}</h2></div>
              <SportsSchedulePanel recentScores={sportsSchedule.recentScores} upcomingGames={sportsSchedule.upcomingGames} />
            </section>
          );
        }

        if (block.type === "events-list") {
          return sportsSchedule.schoolEvents.length || sportsSchedule.upcomingGames.length ? (
            <section className="byline-design-utility" key={key}><ThisWeekCard maxVisibleItems={5} schoolEvents={sportsSchedule.schoolEvents} sportsGames={sportsSchedule.upcomingGames} /></section>
          ) : null;
        }

        if (block.type === "poll") return <section className="byline-design-utility" key={key}><PollWidget /></section>;
        if (block.type === "newsletter") return <section id={`newsletter-${key}`} className="home-newsletter-section" key={key}><NewsletterSignupForm /></section>;
        if (block.type === "divider") return <hr className="byline-design-divider" key={key} />;
        if (block.type === "section" || block.type === "columns") return null;
        return null;
      })}
    </main>
  );
}
