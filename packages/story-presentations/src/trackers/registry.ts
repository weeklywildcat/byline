import { describeRepositoryFeatures, renderRepositoryFeature, type RepositoryFeatureDescriptor } from "../repository-features";
import { FIXTURE_SIDEWALK_PROJECT } from "./fixture-sidewalk-project";
import type { RepositoryTrackerRegistry } from "./types";

/**
 * Production repository trackers, keyed by stable key. Empty until a developer
 * builds one for a real story; do not add one merely to populate it.
 * Scaffold one with `npm run tracker -- create <kebab-case-key>`.
 *
 * See docs/newsroom-blocks.md ("Repository Tracker").
 */
export const repositoryTrackers: RepositoryTrackerRegistry = {};

/**
 * Test and development only: one fixture that proves editor selection, Live
 * Preview, the static render, the client enhancement, the public build and a
 * missing key. Hosts opt in explicitly, as they do for fixture interactives.
 */
export const fixtureRepositoryTrackers: RepositoryTrackerRegistry = { [FIXTURE_SIDEWALK_PROJECT.key]: FIXTURE_SIDEWALK_PROJECT };

export function repositoryTrackerRegistry({ fixtures = false }: { fixtures?: boolean } = {}): RepositoryTrackerRegistry {
  return fixtures ? { ...fixtureRepositoryTrackers, ...repositoryTrackers } : repositoryTrackers;
}

/** The registry as plain data (never its components, styles or client code), for the newsroom's tracker picker. */
export function describeRepositoryTrackers(registry: RepositoryTrackerRegistry): RepositoryFeatureDescriptor[] {
  return describeRepositoryFeatures(registry);
}

/** The body renderer's `renderTracker` host hook: a registered tracker's server-rendered content, or nothing. */
export function renderRepositoryTracker(registry: RepositoryTrackerRegistry) {
  return renderRepositoryFeature(registry);
}

export type { RepositoryTracker, RepositoryTrackerClient, RepositoryTrackerRegistry } from "./types";
