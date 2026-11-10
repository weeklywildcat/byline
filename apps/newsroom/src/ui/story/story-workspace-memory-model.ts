/**
 * The workspace each reader last used on each Story (docs/story-screen.md#default),
 * the pure parts. The hook that stores it in Payload Preferences is
 * story-workspace-memory.ts.
 */
import type { StoryWorkspace } from "./story-view";

export const STORY_WORKSPACE_PREFERENCE_KEY = "byline:story:workspace:v1";

/** Only the most recent Stories are remembered; an older one falls back to the default rule. */
export const REMEMBERED_STORIES = 100;

/** Most recent first: `[storyId, workspace]`. */
export type WorkspaceMemory = Array<[number, StoryWorkspace]>;

/** Stored data is untrusted: anything malformed is dropped, duplicates keep their most recent entry, and the list is bounded. */
export function normalizeWorkspaceMemory(value: unknown): WorkspaceMemory {
  const list = value && typeof value === "object" && !Array.isArray(value) ? (value as { stories?: unknown }).stories : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<number>();
  const result: WorkspaceMemory = [];
  for (const entry of list) {
    if (!Array.isArray(entry)) continue;
    const [id, workspace] = entry as [unknown, unknown];
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    if (workspace !== "plan" && workspace !== "write") continue;
    seen.add(id);
    result.push([id, workspace]);
    if (result.length >= REMEMBERED_STORIES) break;
  }
  return result;
}

export function rememberedWorkspace(memory: WorkspaceMemory, storyId: number): StoryWorkspace | null {
  return memory.find(([id]) => id === storyId)?.[1] ?? null;
}

/** This Story moves to the front with its workspace; the oldest falls off the end. */
export function rememberWorkspace(memory: WorkspaceMemory, storyId: number, workspace: StoryWorkspace): WorkspaceMemory {
  return [[storyId, workspace] as [number, StoryWorkspace], ...memory.filter(([id]) => id !== storyId)].slice(0, REMEMBERED_STORIES);
}
