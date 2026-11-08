import type { ReactNode } from "react";
import type { ArticlePresentation } from "@byline/content/story";
import type { ArticleViewSlots } from "@byline/ui";

/**
 * What every repository-defined story presentation receives: the same
 * normalized article model and interactive slots the default `ArticleView`
 * renders. The CMS owns all of the content in it; a presentation only decides
 * how it is arranged. It never receives a CMS record (WordPress post or
 * Payload document).
 *
 * `slots.metadata` (structured data) is always empty here. The public route
 * renders it for every story, so a presentation cannot drop or fork it.
 */
export type StoryPresentationProps = {
  presentation: ArticlePresentation;
  slots: ArticleViewSlots;
};

export type StoryPresentationComponent = (props: StoryPresentationProps) => ReactNode;

type Definition = {
  /** The story folder's name (`stories/<name>/`): its CSS scope `.story-<name>`, its `styles.css` and `client.ts`. */
  readonly name: string;
  /** How the newsroom names it ("Election Results 2026"). Defaults to the folder name in title case. */
  readonly title: string;
  readonly Component: StoryPresentationComponent;
};

/** A bespoke arrangement of the CMS body and fields. */
export type CustomPresentationDefinition = Definition & { readonly kind: "presentation" };

/**
 * A flagship visual story: the rare story whose narrative (reporting, data,
 * photography, graphics and scrolling) is built in the repository as one
 * piece. The CMS keeps the publishing record (headline, deck, byline, dates,
 * lead image, corrections, topics, series, SEO) and the component supplies the
 * body instead of the CMS one.
 *
 * Its `presentation.body` is always empty: the CMS body is never printed on a
 * visual story's page, so it cannot appear twice. Only `defineVisualStory`
 * makes one; the scaffold writes it with `--visual`.
 */
export type VisualStoryDefinition = Definition & {
  readonly kind: "visual-story";
  /** Replaces the reading time Byline computes from the CMS body, which is not this page's text ("12 min read"). */
  readonly readingTime?: string;
};

export type StoryPresentationEntry = CustomPresentationDefinition | VisualStoryDefinition;

/** Stable story ID (WordPress post ID, kept by imported Payload stories) to its presentation. */
export type StoryPresentationRegistry = Readonly<Record<number, StoryPresentationEntry>>;

/**
 * A visual story's optional `client.ts` default export: progressive
 * enhancement for the already-rendered narrative. Return a cleanup if it
 * keeps observers or listeners.
 */
export type VisualStoryClient = (root: HTMLElement) => void | (() => void);

/**
 * What a host supplies for a story's own assets. Bundlers differ (Vite in the
 * public site, Next.js in the newsroom), so the shared package never imports
 * CSS or client code itself; each host prints a story's stylesheet with that
 * story only and loads its `client.ts` on demand.
 */
export type StoryPresentationHost = {
  /** The story's stylesheet (`stories/<name>/styles.css`), rendered before its component, or nothing. */
  styles?: (name: string) => ReactNode;
};

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function titleFromName(name: string) {
  return name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function checkName(name: string, what: string) {
  if (!NAME.test(name)) throw new Error(`A ${what} name must be its kebab-case folder name, got "${name}".`);
}

/** A custom presentation: the CMS body and fields, arranged by the repository. */
export function defineStoryPresentation(definition: { name: string; title?: string; Component: StoryPresentationComponent }): CustomPresentationDefinition {
  checkName(definition.name, "story presentation");
  return { kind: "presentation", name: definition.name, title: definition.title ?? titleFromName(definition.name), Component: definition.Component };
}

/** The deliberate opt-in to a repository-owned narrative. */
export function defineVisualStory(definition: { name: string; title?: string; Component: StoryPresentationComponent; readingTime?: string }): VisualStoryDefinition {
  checkName(definition.name, "visual story");
  return {
    kind: "visual-story",
    name: definition.name,
    title: definition.title ?? titleFromName(definition.name),
    Component: definition.Component,
    ...(definition.readingTime ? { readingTime: definition.readingTime } : {})
  };
}

export function isVisualStory(entry: StoryPresentationEntry | null | undefined): entry is VisualStoryDefinition {
  return typeof entry === "object" && entry !== null && entry.kind === "visual-story";
}
