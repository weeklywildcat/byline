import { QueryClient } from "@tanstack/react-query";
import type { HomeBootstrap, HomePeek } from "./newsroom-model";
import type { EditorialTask } from "../editorial/editorial-model";

export const homeQueryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } });
export const homeKey = ["byline", "home"] as const;
export const peekKey = (id: number) => ["byline", "peek", id] as const;

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
export function replacePeekTask(data: HomePeek | undefined, task: EditorialTask): HomePeek | undefined {
  if (!data) return data;
  return { ...data, tasks: { ...data.tasks, tasks: data.tasks.tasks.map((t) => t.id === task.id ? task : t) } };
}
