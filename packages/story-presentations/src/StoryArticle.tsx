import type { ReactNode } from "react";
import { EMPTY_ARTICLE_BODY } from "@byline/content/story";
import { PresentedArticleView, type ArticleViewProps } from "@byline/ui";
import { storyPresentations } from "./registry";
import { resolveStoryPresentation } from "./resolve";
import type { StoryPresentationHost, StoryPresentationRegistry } from "./types";

export type StoryArticleProps = ArticleViewProps & {
  /** Which repository presentations exist for this host. Defaults to the public registry. */
  registry?: StoryPresentationRegistry;
  /** The host's loader for a story's own stylesheet. */
  host?: StoryPresentationHost;
};

/**
 * The article, for every host: the public Astro route and the newsroom's Live
 * Preview render this same component from the same `ArticlePresentation`.
 * Which presentation a story gets is `resolveStoryPresentation`:
 *
 *  1. a repository entry registered for its story ID (always wins): a
 *     presentation arranges the CMS body; a visual story replaces it with the
 *     narrative in its folder;
 *  2. the author's Feature, Immersive or Split choice, when the story has a
 *     lead image (and is not a video story);
 *  3. the normal `ArticleView`.
 *
 * Structured data stays the public route's job: for a repository entry it is
 * rendered here, outside the custom component, so no override can omit it.
 * The newsroom passes no metadata, so Preview never emits SEO.
 */
export function StoryArticle({ presentation, slots = {}, className, registry = storyPresentations, host }: StoryArticleProps): ReactNode {
  const resolution = resolveStoryPresentation(presentation, registry);
  const entry = resolution.entry;
  if (!entry) return <PresentedArticleView presentation={presentation} slots={slots} className={className} />;

  const { metadata, ...rest } = slots;
  const styles = host?.styles?.(entry.name) ?? null;
  if (entry.kind === "visual-story") {
    // The CMS body is withheld, so a visual story cannot print it beside its own narrative.
    const visual = { ...presentation, body: EMPTY_ARTICLE_BODY, readingTime: entry.readingTime ?? presentation.readingTime };
    return (
      <>
        {metadata}
        {styles}
        <div className="visual-story" data-visual-story={entry.name}>
          <entry.Component presentation={visual} slots={rest} />
        </div>
      </>
    );
  }

  return (
    <>
      {metadata}
      {styles}
      <entry.Component presentation={presentation} slots={rest} />
    </>
  );
}
