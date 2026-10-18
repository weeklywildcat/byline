import {
  ArticleBody,
  ArticleCategory,
  ArticleExcerpt,
  ArticleHeadline,
  ArticleImageCaption,
  ArticleMeta,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter,
  HeroReveal,
  HeroRevealContent
} from "@byline/ui";
import { StoryStyles } from "../../StoryStyles";
import type { StoryPresentationProps } from "../../types";
import css from "./styles.css?inline";

const SURFACE_ID = "story-reveal-surface";

/**
 * Fixture presentation for the framework: the lead photograph fills the first
 * screen with the category, headline and deck over it, and an article surface
 * rises over the pinned photograph. It holds no editorial copy; every word comes
 * from `presentation`, so editing the story in WordPress updates this page.
 */
export default function RevealFixtureStory({ presentation, slots }: StoryPresentationProps) {
  const image = presentation.image;
  return (
    <main className="story-reveal">
      <StoryStyles id="reveal-fixture" css={css} />
      <HeroReveal
        target={SURFACE_ID}
        align="end"
        scrim={0.5}
        className="story-reveal-hero"
        image={image?.src ? { ...image, sizes: "100vw" } : null}
      >
        <ArticleCategory presentation={presentation} className="story-reveal-category" />
        <ArticleHeadline presentation={presentation} className="story-reveal-headline" />
        <ArticleExcerpt presentation={presentation} className="story-reveal-excerpt" />
      </HeroReveal>

      <HeroRevealContent id={SURFACE_ID} className="story-reveal-surface">
        <ArticleShell as="div">
          <article className="article-story">
            <div className="story-reveal-meta">
              <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
              {image ? (
                <div className="story-reveal-caption" role="group" aria-label="Lead photograph caption and credit">
                  <ArticleImageCaption image={image} />
                </div>
              ) : null}
            </div>
            <ArticleBody presentation={presentation} primaryGame={slots.primaryGame} />
            <ArticleStoryFooter presentation={presentation} slots={slots} />
          </article>
          <ArticleStandardEnding presentation={presentation} />
        </ArticleShell>
      </HeroRevealContent>
    </main>
  );
}
