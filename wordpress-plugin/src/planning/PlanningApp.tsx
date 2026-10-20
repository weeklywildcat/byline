import { useMemo, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminRoot } from "../admin-ui/components/admin-root";
import { StoryCreateDialog } from "../story/StoryCreateDialog";
import { StoryPeekHost } from "../story/StoryPeekHost";
import { StoryHoverProvider } from "../story/StoryHoverCard";
import type { StoryFetchers } from "../story/story-fetchers";
import { createAdminQueryClient } from "../story/story-query";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { ContentHealth } from "./ContentHealth";
import { Coverage } from "./Coverage";
import { Feedback } from "./Feedback";
import { MediaDesk } from "./MediaDesk";
import { Performance } from "./Performance";
import { StoriesPage } from "./StoriesPage";
import { createWorkspaceUrlBuilder } from "./calendar-model";
import type { PlanningFetchers } from "./planning-api";
import { destinationForTab, initialStoriesView } from "./planning-routing";
import { useStoryPeek } from "../story/StoryPeekHost";

export type PlanningAppFetchers = PlanningFetchers & StoryFetchers;

export type PlanningAppProps = {
  fetchers: PlanningAppFetchers;
  /** The WordPress sidebar entry: stories, calendar, media, coverage, performance, content-health or feedback. */
  tab: string;
  /** `view=` from the address, when it names one. */
  view?: string;
  currentUserId: number | null;
  /** The Stories admin URL; the Story Workspace URL builder derives from it. */
  storiesUrl: string;
  /** Home links to `&mine=1`: open Stories already narrowed to the reader's own. */
  mine?: boolean;
};

const planningQueryClient = createAdminQueryClient();

export function PlanningApp(props: PlanningAppProps) {
  return <QueryClientProvider client={planningQueryClient}><AdminRoot><PlanningShell {...props} /></AdminRoot></QueryClientProvider>;
}

function PlanningShell(props: PlanningAppProps) {
  const workspaceUrl = useMemo(() => createWorkspaceUrlBuilder(props.storiesUrl), [props.storiesUrl]);
  return <StoryHoverProvider fetchers={props.fetchers}>
    <StoryPeekHost fetchers={props.fetchers} workspaceUrl={(storyId) => workspaceUrl(storyId)}>
      <PlanningBody {...props} workspaceUrl={workspaceUrl} />
    </StoryPeekHost>
  </StoryHoverProvider>;
}

function PlanningBody({ fetchers, tab, view, currentUserId, mine, workspaceUrl }: PlanningAppProps & { workspaceUrl: ReturnType<typeof createWorkspaceUrlBuilder> }) {
  const { openStory } = useStoryPeek();
  const [creating, setCreating] = useState(false);
  const destination = destinationForTab(tab);
  const initialView = useMemo(() => initialStoriesView(tab, view, typeof window === "undefined" ? null : window.localStorage), [tab, view]);
  // A new story opens its full Story Workspace, exactly as it does from Home.
  const openCreated = (created: StoryWorkspace) => window.location.assign(created.workspaceUrl || workspaceUrl(created.story.id));
  return <main className="@container/planning mx-auto mt-6 mb-8 flex max-w-[1600px] flex-col gap-4 pr-5 pl-1">
    {destination === "stories" ? <StoriesPage fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={{ mine: Boolean(mine) }} workspaceUrl={workspaceUrl} onNewStory={fetchers.createStory ? () => setCreating(true) : undefined} /> : null}
    {destination === "media" ? <MediaDesk fetchers={fetchers} workspaceUrl={workspaceUrl} onOpenStory={openStory} /> : null}
    {destination === "coverage" ? <Coverage fetchers={fetchers} onOpenStory={openStory} /> : null}
    {destination === "feedback" ? <Feedback fetchers={fetchers} onOpenStory={openStory} /> : null}
    {destination === "performance" ? <Performance fetchers={fetchers} onOpenStory={openStory} /> : null}
    {destination === "content-health" ? <ContentHealth fetchers={fetchers} onOpenStory={openStory} /> : null}
    <StoryCreateDialog open={creating} onClose={() => setCreating(false)} onCreated={openCreated} fetchers={fetchers} />
  </main>;
}
