import type { RepositoryFeature, RepositoryFeatureClient } from "../repository-features";

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
export type RepositoryInteractive = RepositoryFeature<{ title: string; description: string }>;

export type RepositoryInteractiveRegistry = Readonly<Record<string, RepositoryInteractive>>;

/** The browser enhancement's contract: given the root element it fills, return a cleanup. */
export type RepositoryInteractiveClient = RepositoryFeatureClient;
