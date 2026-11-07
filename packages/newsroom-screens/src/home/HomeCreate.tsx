import type { ContributorEntry } from "../editorial/editorial-model";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { StoryCreateDialog } from "../story/StoryCreateDialog";
import { TaskCreateDialog } from "../story/TaskCreateDialog";
import type { HomeFetchers } from "./home-api";
import { activeStory, type HomeBootstrap } from "./newsroom-model";

/** Home's New story and New task: the shared dialogs, fed from Home's own data. */
export function HomeCreate({ kind, onClose, onStoryCreated, fetchers, data, storyId }: { kind: "story" | "task" | null; onClose: () => void; onStoryCreated: (story: StoryWorkspace) => void; fetchers: HomeFetchers; data?: HomeBootstrap; storyId?: number | null }) {
  const currentUser = data?.currentUser;
  const people: ContributorEntry[] = [...(data?.people || [])];
  for (const person of [currentUser, ...(data?.stories.flatMap((s) => [...s.authors, s.editor].filter(Boolean)) || [])]) {
    if (person && (!people.some((p) => p.id === person.id)) && (person as { kind?: string }).kind !== "guest") people.push({ ...person, kind: "user" });
  }
  return <>
    <StoryCreateDialog open={kind === "story"} onClose={onClose} onCreated={onStoryCreated} fetchers={fetchers} />
    <TaskCreateDialog open={kind === "task"} onClose={onClose} fetchers={fetchers} stories={data?.stories.filter(activeStory) || []} storyId={storyId} people={people} currentUser={currentUser} canAssign={Boolean(data?.capabilities.review)} timezone={data?.timezone || "UTC"} />
  </>;
}
