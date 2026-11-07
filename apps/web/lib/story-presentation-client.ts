/// <reference types="vite/client" />
import type { VisualStoryClient } from "@byline/story-presentations";

/**
 * The public site's (Vite) loader for a flagship visual story's own
 * `client.ts`. The glob makes each story's client its own chunk, so the
 * article route only carries this map and a story's code downloads on that
 * story's page alone. The newsroom has its own Next.js loader; the stories and
 * their registry are shared (@byline/story-presentations).
 */
const clients = import.meta.glob<{ default: VisualStoryClient }>("../../../packages/story-presentations/src/stories/*/client.ts");

export async function startVisualStory(root: HTMLElement): Promise<void> {
  const load = clients[`../../../packages/story-presentations/src/stories/${root.dataset.visualStory}/client.ts`];
  if (!load) return;
  const { default: enhance } = await load();
  enhance(root);
}
