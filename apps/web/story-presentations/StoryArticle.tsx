import type { ReactNode } from "react";
import { PresentedArticleView, type ArticleViewProps } from "@byline/ui";
import { getStoryPresentation } from "./registry";

/**
 * The public article body. Which presentation a story gets, in order:
 *
 *  1. a repository override registered for its WordPress post ID (always wins);
 *  2. the author's "Immersive" choice in WordPress, when the story has a
 *     featured image to open on;
 *  3. the normal `ArticleView`.
 *
 * Both article routes render through this, so they cannot disagree. Structured
 * data stays the route's job: for a repository override it is rendered here,
 * outside the custom component, so no override can omit it.
 */
export function StoryArticle({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const Custom = getStoryPresentation(presentation.id);
  if (Custom) {
    const { metadata, ...rest } = slots;
    return (
      <>
        {metadata}
        <Custom presentation={presentation} slots={rest} />
      </>
    );
  }

  return <PresentedArticleView presentation={presentation} slots={slots} className={className} />;
}
