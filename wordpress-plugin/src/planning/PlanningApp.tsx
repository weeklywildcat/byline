import { WordPressCollectionLinks, WordPressCollections } from "../collections/WordPressCollections";
import { useCallback, useMemo, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { StoryCreateDialog } from "@byline/newsroom-screens/story/StoryCreateDialog";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { StoryHoverProvider } from "@byline/newsroom-screens/story/StoryHoverCard";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { createAdminQueryClient } from "@byline/newsroom-screens/story/story-query";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import { ContentHealth } from "@byline/newsroom-screens/planning/ContentHealth";
import { Feedback } from "./Feedback";
import { MediaWork } from "@byline/newsroom-screens/media/MediaWork";
import { PageHeader } from "@byline/newsroom-screens/planning/PlanningPage";
import { wordpressMediaPicker } from "../workspace/media-library";
import { StoriesPage, type StoriesCalendarProps } from "@byline/newsroom-screens/planning/StoriesPage";
import type { StoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { createWorkspaceUrlBuilder, StoryCalendar } from "./calendar-host";
import { storiesRouteFilters, type PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import { destinationForTab, initialStoriesView, storiesViewHref } from "./planning-routing";

export type PlanningAppFetchers = PlanningFetchers & StoryFetchers;

export type PlanningAppProps = {
  fetchers: PlanningAppFetchers;
  /** The WordPress sidebar entry: stories, collections, calendar, media, content-health or feedback. */
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

/** The shared Media Work desk links files from the WordPress Media Library. */
const WORDPRESS_DESK_PICKER = { ...wordpressMediaPicker, label: "Link from Media Library" };

export function PlanningApp(props: PlanningAppProps) {
  return <QueryClientProvider client={planningQueryClient}><AdminRoot><WordPressCollectionLinks><PlanningShell {...props} /></WordPressCollectionLinks></AdminRoot></QueryClientProvider>;
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
  // WordPress's Stories calendar is Schedule-X over the protected schedule feed; its events link
  // appointments too, so it takes the full wp-admin workspace builder rather than the story-only one.
  const renderCalendar = useCallback((calendar: StoriesCalendarProps) => <StoryCalendar {...calendar} workspaceUrl={workspaceUrl} getSchedule={fetchers.getSchedule} />, [fetchers.getSchedule, workspaceUrl]);
  const viewHref = useCallback((next: StoriesView) => storiesViewHref(window.location.href, next), []);
  return <main className="@container/planning mx-auto mt-6 mb-8 flex max-w-[1600px] flex-col gap-4 pr-5 pl-1">
    {destination === "stories" ? <StoriesPage fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={{ ...storiesRouteFilters(new URLSearchParams(window.location.search)), ...(mine ? { mine: true } : {}) }} workspaceUrl={workspaceUrl} renderCalendar={renderCalendar} viewHref={viewHref} onNewStory={fetchers.createStory ? () => setCreating(true) : undefined} /> : null}
    {destination === "collections" ? <WordPressCollections fetchers={fetchers} currentUserId={currentUserId} workspaceUrl={workspaceUrl} /> : null}
    {destination === "media" ? <>
      <PageHeader title="Media Desk" description="Every photo, video, graphic and audio assignment across the newsroom. Files stay in the WordPress Media Library." />
      <MediaWork fetchers={fetchers} workspaceUrl={workspaceUrl} onOpenStory={openStory} media={WORDPRESS_DESK_PICKER} currentUserId={currentUserId} />
    </> : null}
    {destination === "feedback" ? <Feedback fetchers={fetchers} onOpenStory={openStory} /> : null}
    {destination === "content-health" ? <ContentHealth fetchers={fetchers} onOpenStory={openStory} /> : null}
    <StoryCreateDialog open={creating} onClose={() => setCreating(false)} onCreated={openCreated} fetchers={fetchers} />
  </main>;
}
