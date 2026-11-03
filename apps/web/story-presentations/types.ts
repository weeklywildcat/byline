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

/**
 * A flagship visual story: the rare story whose narrative (reporting, data,
 * photography, graphics and scrolling) is built in the repository as one
 * piece. WordPress keeps the publishing record (headline, deck, byline, dates,
 * lead image, corrections, topics, series, SEO) and the component supplies the
 * body instead of the WordPress one.
 *
 * Its `presentation.contentHtml` is always empty: the WordPress body is never
 * printed on a visual story's page, so it cannot appear twice. Only
 * `defineVisualStory` makes one; the scaffold writes it with `--visual`.
 */
export type VisualStoryDefinition = {
  readonly kind: "visual-story";
  /** The story folder's name (`stories/<name>/`): its CSS scope `.story-<name>` and its `client.ts`. */
  readonly name: string;
  readonly Component: StoryPresentationComponent;
  /** Replaces the reading time Byline computes from the WordPress body, which is not this page's text ("12 min read"). */
  readonly readingTime?: string;
};

/** WordPress post ID to the component that presents it, or to a visual story. */
export type StoryPresentationEntry = StoryPresentationComponent | VisualStoryDefinition;
export type StoryPresentationRegistry = Readonly<Record<number, StoryPresentationEntry>>;

/**
 * A visual story's optional `client.ts` default export: progressive
 * enhancement for the already-rendered narrative. Return a cleanup if it
 * keeps observers or listeners.
 */
export type VisualStoryClient = (root: HTMLElement) => void | (() => void);

/** The deliberate opt-in to a repository-owned narrative. */
export function defineVisualStory(definition: Omit<VisualStoryDefinition, "kind">): VisualStoryDefinition {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(definition.name)) throw new Error(`A visual story name must be its kebab-case folder name, got "${definition.name}".`);
  return { kind: "visual-story", ...definition };
}

export function isVisualStory(entry: StoryPresentationEntry | null | undefined): entry is VisualStoryDefinition {
  return typeof entry === "object" && entry !== null && entry.kind === "visual-story";
}
