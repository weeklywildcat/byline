/// <reference types="vite/client" />
import type { VisualStoryClient } from "./types";

/**
 * Starts a visual story's own `stories/<name>/client.ts`, if it has one. The
 * glob makes each story's client its own chunk, so the article route only
 * carries this map and a story's code downloads on that story's page alone.
 */
const clients = import.meta.glob<{ default: VisualStoryClient }>("./stories/*/client.ts");

export async function startVisualStory(root: HTMLElement): Promise<void> {
  const load = clients[`./stories/${root.dataset.visualStory}/client.ts`];
  if (!load) return;
  const { default: enhance } = await load();
  enhance(root);
}
