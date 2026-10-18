import type { ReactNode } from "react";
import { ArticleView, type ArticleViewProps } from "@byline/ui";
import { getStoryPresentation } from "./registry";

/**
 * The public article body: the story's custom presentation when one is
 * registered for its WordPress post ID, otherwise the normal `ArticleView`.
 * Both article routes render through this, so they cannot disagree.
 *
 * Structured data stays the route's job. It is rendered here, outside the
 * custom component, so no presentation can omit it.
 */
export function StoryArticle({ presentation, slots = {}, className }: ArticleViewProps): ReactNode {
  const Custom = getStoryPresentation(presentation.id);
  if (!Custom) return <ArticleView presentation={presentation} slots={slots} className={className} />;

  const { metadata, ...rest } = slots;
  return (
    <>
      {metadata}
      <Custom presentation={presentation} slots={rest} />
    </>
  );
}
