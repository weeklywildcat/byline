import type { RepositoryFeature, RepositoryFeatureClient } from "../repository-features";

/**
 * A repository tracker: a developer-built record of something changing over
 * time (a construction project, a promise, a count), placed in an article by
 * its stable key. It is deliberately not modeled in Payload: there is no
 * trackers collection, milestone list or status enum. Its content, data and
 * design live in its own folder here and change with a deploy:
 *
 *   trackers/<key>/index.tsx   the server-rendered tracker (always in the HTML)
 *   trackers/<key>/data.ts     its typed data
 *   trackers/<key>/styles.css  optional, scoped under `.tracker-<key>`
 *   trackers/<key>/client.ts   optional progressive enhancement
 *
 * The article stores only the key, an article-facing title and a text
 * alternative. Several articles may place the same tracker on purpose.
 * Repository Tracker is a different editorial idea from Repository
 * Interactive; they share only the registry plumbing.
 */
export type RepositoryTracker = RepositoryFeature<{ title: string; description: string }> & {
  /** Whether the tracker has a `styles.css` beside it, loaded only with stories that place it. */
  styles: boolean;
};

export type RepositoryTrackerRegistry = Readonly<Record<string, RepositoryTracker>>;

export type RepositoryTrackerClient = RepositoryFeatureClient;
