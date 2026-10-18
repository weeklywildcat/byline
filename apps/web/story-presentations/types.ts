import type { ReactNode } from "react";
import type { ArticlePresentation, ArticleViewSlots } from "@byline/ui";

/**
 * What every repository-defined story presentation receives: the same
 * normalized article model and interactive slots the default `ArticleView`
 * renders. WordPress owns all of the content in it; a presentation only decides
 * how it is arranged. It never receives a raw WordPress post.
 *
 * `slots.metadata` (structured data) is always empty here. The route renders it
 * for every story, so a presentation cannot drop or fork it.
 */
export type StoryPresentationProps = {
  presentation: ArticlePresentation;
  slots: ArticleViewSlots;
};

export type StoryPresentationComponent = (props: StoryPresentationProps) => ReactNode;

/** WordPress post ID to the component that presents it. */
export type StoryPresentationRegistry = Readonly<Record<number, StoryPresentationComponent>>;
