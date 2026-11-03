import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError, type EditorialTask, type TaskPatch } from "../editorial/editorial-model";
import { homeKey, replaceHomeTask } from "../home/home-query";
import type { HomeBootstrap } from "../home/newsroom-model";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData, replaceWorkspaceTask, workspaceKey } from "./story-query";

type UpdateTaskVariables = {
  task: EditorialTask;
  patch: TaskPatch;
  optimistic?: Partial<EditorialTask>;
};

/** One optimistic task-edit path shared by Home and Story Peek. */
export function useUpdateTask(fetchers: StoryFetchers) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, patch }: UpdateTaskVariables) => fetchers.editorial!.updateTask(task.id, patch),
    onMutate: async ({ task, patch, optimistic }) => {
      await client.cancelQueries({ queryKey: homeKey });
      if (task.storyId) await client.cancelQueries({ queryKey: workspaceKey(task.storyId) });
      const updated: EditorialTask = { ...task, ...patch, ...optimistic };
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, updated));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, updated));
      return { previous: task };
    },
    onSuccess: (updated, { task }) => {
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, updated));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, updated));
    },
    onError: (error, { task }, context) => {
      const previous = context?.previous || task;
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, previous));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, previous));
      toast.error(describeEditorialError(error, "The task couldn't be saved. The previous value was restored."));
    },
    onSettled: (_data, _error, { task }) => { void invalidateStoryData(client, task.storyId); }
  });
}
