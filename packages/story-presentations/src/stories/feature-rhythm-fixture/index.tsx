import { mediaKey, type ArticleBody } from "@byline/article-body";
import { FIXTURE_FEATURE_STORY_BODY } from "@byline/article-body/fixtures";
import {
  ArticleCategory,
  ArticleExcerpt,
  ArticleHeadline,
  ArticleShell,
  ArticleStandardEnding,
  ArticleStoryFooter
} from "@byline/ui";
import { ArticleBodyContent } from "@byline/ui/article-body";
import { defineStoryPresentation, type StoryPresentationProps } from "../../types";

/**
 * Fixture-only: the presentation presets in one feature story
 * (docs/story-presentation.md). It renders the shared `byline-v1` fixture
 * (`FIXTURE_FEATURE_STORY_BODY`) through the same article shell, renderer and
 * stylesheet as every published story, so the browser checks at phone,
 * tablet and desktop widths measure the real reader experience. Media comes
 * from `tests/fixtures/story-media`, served at `/test-assets/` by the browser
 * tests (`routeStoryFixtures`). It holds no editorial copy of a real story.
 */
const body: ArticleBody = {
  ...FIXTURE_FEATURE_STORY_BODY,
  media: Object.fromEntries(Object.values(FIXTURE_FEATURE_STORY_BODY.media).map((asset) => [mediaKey(asset.id), { ...asset, src: `/test-assets/${asset.src}` }]))
};

function FeatureRhythmFixtureStory({ presentation, slots }: StoryPresentationProps) {
  return (
    <ArticleShell className="story-feature-rhythm-fixture">
      <article className="article-story">
        <header className="article-header">
          <ArticleCategory presentation={presentation} />
          <ArticleHeadline presentation={presentation} />
          <ArticleExcerpt presentation={presentation} />
        </header>
        <div className="article-body">
          <ArticleBodyContent body={body} host={slots.bodyHost} />
        </div>
        <ArticleStoryFooter presentation={presentation} slots={slots} />
      </article>
      <ArticleStandardEnding presentation={presentation} />
    </ArticleShell>
  );
}

export default defineStoryPresentation({ name: "feature-rhythm-fixture", title: "Feature rhythm fixture", Component: FeatureRhythmFixtureStory });
