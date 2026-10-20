import { QueryClient } from "@tanstack/react-query";
import type { EditorialTask } from "../editorial/editorial-model";
import type { StoryWorkspace } from "./workspace-types";

/** One query per story serves both Home's Story Peek and the full workspace. */
export const workspaceKey = (storyId: number) => ["byline", "workspace", storyId] as const;

export const workspaceQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } }
});

/** Replace one task. Used for optimistic completion and for rollback. */
export function replaceWorkspaceTask(data: StoryWorkspace | undefined, task: EditorialTask): StoryWorkspace | undefined {
  if (!data) return data;
  return { ...data, tasks: data.tasks.map((item) => (item.id === task.id ? task : item)) };
}
