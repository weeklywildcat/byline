import {
  ArticleBody,
  ArticleCategory,
  ArticleHeadline,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter
} from "@byline/ui";
import type { StoryPresentationProps } from "../../types";

/**
 * Fixture-only bespoke presentation. It exists to prove that a repository
 * override beats the WordPress "Immersive" option, so it is deliberately plain
 * and holds no editorial copy.
 */
export default function OverrideFixtureStory({ presentation, slots }: StoryPresentationProps) {
  return (
    <ArticleShell className="story-override-fixture">
      <article className="article-story">
        <ArticleCategory presentation={presentation} />
        <ArticleHeadline presentation={presentation} />
        <ArticleBody presentation={presentation} primaryGame={slots.primaryGame} />
        <ArticleStoryFooter presentation={presentation} slots={slots} />
      </article>
      <ArticleStandardEnding presentation={presentation} />
    </ArticleShell>
  );
}
