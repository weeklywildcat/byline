import type { ReactNode } from "react";
import { createElement } from "react";
import { FixtureLunchLine, FIXTURE_LUNCH_LINE } from "./fixture-lunch-line";
import type { RepositoryInteractive, RepositoryInteractiveRegistry } from "./types";

/**
 * Production repository interactives, keyed by stable key. Empty until a
 * developer builds one for a real story; do not add one merely to populate it.
 *
 *   "lunch-line-calculator": LunchLineCalculator
 *
 * See docs/newsroom-blocks.md ("Repository Interactive").
 */
export const repositoryInteractives: RepositoryInteractiveRegistry = {};

/**
 * Test and development only: one fixture that proves editor selection, Live
 * Preview, the static fallback, the client enhancement, the public build and a
 * missing key. Hosts opt in explicitly (`fixtures: true`), as they do for the
 * fixture Story Presentations, so production can never place it.
 */
export const fixtureRepositoryInteractives: RepositoryInteractiveRegistry = { [FIXTURE_LUNCH_LINE.key]: FIXTURE_LUNCH_LINE };

export function repositoryInteractiveRegistry({ fixtures = false }: { fixtures?: boolean } = {}): RepositoryInteractiveRegistry {
  return fixtures ? { ...fixtureRepositoryInteractives, ...repositoryInteractives } : repositoryInteractives;
}

/** The registry as plain data, for a host that must describe interactives without loading any of their code. */
export function describeRepositoryInteractives(registry: RepositoryInteractiveRegistry): Array<Pick<RepositoryInteractive, "key" | "name" | "description" | "client">> {
  return Object.values(registry).map(({ key, name, description, client }) => ({ key, name, description, client }));
}

/** The body renderer's `renderInteractive` host hook: a registered interactive's static fallback, or nothing. */
export function renderRepositoryInteractive(registry: RepositoryInteractiveRegistry) {
  return (block: { key: string; title: string; description: string }): ReactNode => {
    const entry = registry[block.key];
    return entry ? createElement(entry.Fallback, { title: block.title, description: block.description }) : null;
  };
}

export { FixtureLunchLine };

export type { RepositoryInteractiveClient } from "./types";
