/// <reference types="vite/client" />
import type { RepositoryFeatureClient } from "@byline/story-presentations";

/**
 * The public site's loader for repository features' browser code: Repository
 * Interactives and Repository Trackers share it (they differ editorially, not
 * in how their optional `client.ts` loads). Each client is its own chunk,
 * downloaded only on a page that places that feature.
 */
const interactiveClients = import.meta.glob<{ default: RepositoryFeatureClient }>("../../../packages/story-presentations/src/interactives/*/client.ts");
const trackerClients = import.meta.glob<{ default: RepositoryFeatureClient }>("../../../packages/story-presentations/src/trackers/*/client.ts");

type Kind = "interactive" | "tracker";
const loader = (kind: Kind, key: string) => (kind === "interactive" ? interactiveClients[`../../../packages/story-presentations/src/interactives/${key}/client.ts`] : trackerClients[`../../../packages/story-presentations/src/trackers/${key}/client.ts`]);

export function hasInteractiveClient(key: string) {
  return Boolean(loader("interactive", key));
}

export function hasTrackerClient(key: string) {
  return Boolean(loader("tracker", key));
}

async function start(kind: Kind, elements: Iterable<HTMLElement>) {
  await Promise.all([...elements].map(async (element) => {
    const root = element.querySelector<HTMLElement>(kind === "interactive" ? "[data-interactive-root]" : "[data-tracker-root]");
    const load = loader(kind, (kind === "interactive" ? element.dataset.repositoryInteractive : element.dataset.repositoryTracker) ?? "");
    if (root && load) (await load()).default(root);
  }));
}

export const startRepositoryInteractives = (elements: Iterable<HTMLElement>) => start("interactive", elements);
export const startRepositoryTrackers = (elements: Iterable<HTMLElement>) => start("tracker", elements);
