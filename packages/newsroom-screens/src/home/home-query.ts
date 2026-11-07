import type { HomeBootstrap } from "./newsroom-model";
import type { EditorialTask } from "../editorial/editorial-model";

export const homeKey = ["byline", "home"] as const;
export { workspaceKey, replaceWorkspaceTask } from "../workspace/workspace-query";

/** Replace only this task, so a rollback never discards another task's change. */
export function replaceHomeTask(data: HomeBootstrap | undefined, task: EditorialTask): HomeBootstrap | undefined {
  if (!data) return data;
  const previous = data.tasks.find((t) => t.id === task.id);
  const delta = previous?.state === task.state ? 0 : task.state === "completed" ? -1 : 1;
  return {
    ...data,
    tasks: data.tasks.map((t) => t.id === task.id ? task : t),
    stories: data.stories.map((s) => s.id === task.storyId ? { ...s, openTaskCount: Math.max(0, s.openTaskCount + delta) } : s)
  };
}
