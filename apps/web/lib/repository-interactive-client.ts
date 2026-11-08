/// <reference types="vite/client" />
import type { RepositoryInteractiveClient } from "@byline/story-presentations/interactives";

const clients = import.meta.glob<{ default: RepositoryInteractiveClient }>("../../../packages/story-presentations/src/interactives/*/client.ts");
const loader = (key: string) => clients[`../../../packages/story-presentations/src/interactives/${key}/client.ts`];

export function hasInteractiveClient(key: string) {
  return Boolean(loader(key));
}

export async function startRepositoryInteractives(elements: Iterable<HTMLElement>) {
  await Promise.all([...elements].map(async (element) => {
    const root = element.querySelector<HTMLElement>("[data-interactive-root]");
    const load = loader(element.dataset.repositoryInteractive ?? "");
    if (root && load) (await load()).default(root);
  }));
}
