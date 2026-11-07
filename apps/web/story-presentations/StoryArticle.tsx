import type { ReactNode } from "react";
import { PresentedArticleView, type ArticleViewProps } from "@byline/ui";
import { getStoryPresentation } from "./registry";
import { isVisualStory } from "./types";

/**
 * The public article body. Which presentation a story gets, in order:
 *
 *  1. a repository entry registered for its WordPress post ID (always wins):
 *     a presentation arranges the WordPress body; a visual story replaces it
 *     with the narrative in its folder;
 *  2. the author's "Immersive" choice in WordPress, when the story has a
 *     featured image to open on;
 *  3. the normal `ArticleView`.
 *
 * Both article routes render through this, so they cannot disagree. Structured
 * data stays the route's job: for a repository entry it is rendered here,
 * outside the custom component, so no override can omit it.
 */
export function StoryArticle({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const entry = getStoryPresentation(presentation.id);
  if (!entry) return <PresentedArticleView presentation={presentation} slots={slots} className={className} />;

  const { metadata, ...rest } = slots;
  if (isVisualStory(entry)) {
    // The WordPress body is withheld, so a visual story cannot print it beside its own narrative.
    const visual = { ...presentation, contentHtml: "", readingTime: entry.readingTime ?? presentation.readingTime };
    return (
      <>
        {metadata}
        <div className="visual-story" data-visual-story={entry.name}>
          <entry.Component presentation={visual} slots={rest} />
        </div>
      </>
    );
  }

  const Custom = entry;
  return (
    <>
      {metadata}
      <Custom presentation={presentation} slots={rest} />
    </>
  );
}
