import type { ComponentType } from "react";

/**
 * A repository interactive: custom, developer-written code a story can place
 * by key. It is the only custom-code path in an article, replacing the old
 * uploaded-HTML Interactive for good: a writer never supplies HTML, script,
 * CSS or a URL, only picks a registered key and writes its title and text
 * alternative.
 *
 * The registry is plain data plus one server-rendered component, so the
 * newsroom can list and validate interactives without loading any browser
 * code, and the public build always prints a useful static fallback. The
 * optional browser enhancement is a separate `client.ts` per interactive,
 * loaded by the host's bundler only when a story that places it is shown
 * (the same boundary Story Presentations use for a flagship story's assets).
 */
export type RepositoryInteractive = {
  /** The stable key stored in the article. Never renamed once a story uses it. */
  key: string;
  /** What the newsroom calls it. */
  name: string;
  /** What it does, one sentence, shown when choosing it. */
  description: string;
  /** The static, server-rendered content: always in the HTML, useful with no script. */
  Fallback: ComponentType<{ title: string; description: string }>;
  /** Whether the interactive has a browser enhancement (`client.ts` beside it). */
  client: boolean;
};

export type RepositoryInteractiveRegistry = Readonly<Record<string, RepositoryInteractive>>;

/** The browser enhancement's contract: given the root element it fills, return a cleanup. */
export type RepositoryInteractiveClient = (root: HTMLElement) => void | (() => void);
