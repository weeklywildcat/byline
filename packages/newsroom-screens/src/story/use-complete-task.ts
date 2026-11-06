import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "@byline/newsroom-screens/editorial/editorial-model";
import { homeKey, replaceHomeTask } from "@byline/newsroom-screens/home/home-query";
import type { HomeBootstrap } from "@byline/newsroom-screens/home/newsroom-model";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { invalidateStoryData, replaceWorkspaceTask, workspaceKey } from "@byline/newsroom-screens/story/story-query";

/**
 * Completing a task from Story Peek: the checkbox flips at once in the cached
 * workspace (and Home's list when it is cached), and rolls back on failure.
 */
export function useCompleteTask(fetchers: StoryFetchers) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (task: EditorialTask) => fetchers.editorial!.updateTask(task.id, { state: "completed" }),
    onMutate: async (task) => {
      if (task.storyId) await client.cancelQueries({ queryKey: workspaceKey(task.storyId) });
      const updated = setTaskCompletionState(task, "completed");
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, updated));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, updated));
    },
    onError: (error, task) => {
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, task));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, task));
      toast.error(describeEditorialError(error, "Task couldn't be completed. Try again."));
    },
    onSettled: (_data, _error, task) => { void invalidateStoryData(client, task.storyId); }
  });
}
