import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { AdminRoot } from "../admin-ui/components/admin-root";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { ActivitySection } from "./ActivitySection";
import { BriefSection } from "./BriefSection";
import { DetailsSection } from "./DetailsSection";
import { MediaSection } from "./MediaSection";
import { ReportingPlan } from "./ReportingPlan";
import { ReportingSummaryStrip } from "./ReportingSummary";
import { ResourcesSection } from "./ResourcesSection";
import { TasksSection } from "./TasksSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceLoadError, WorkspaceSkeleton } from "./WorkspaceStates";
import { WorkspaceContext, type WorkspaceContextValue, type WorkspaceEnv } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { workspaceKey, workspaceQueryClient } from "./workspace-query";
import type { StoryWorkspace as StoryWorkspaceData, WorkspaceSection } from "./workspace-types";

export type StoryWorkspaceAppProps = WorkspaceEnv;

/** The Story Workspace root: its own query client and the shared admin UI boundary. */
export function StoryWorkspaceApp(props: StoryWorkspaceAppProps) {
  return <QueryClientProvider client={workspaceQueryClient}>
    <AdminRoot><WorkspaceScreen {...props} /></AdminRoot>
  </QueryClientProvider>;
}

function WorkspaceScreen(env: WorkspaceEnv) {
  const { storyId, client } = env;
  const query = useQuery({
    queryKey: workspaceKey(storyId),
    queryFn: () => client.getWorkspace(storyId),
    // A 403/404 will not change on a retry; a dropped connection might.
    retry: (count, error) => { const failure = workspaceError(error); return !failure.forbidden && !failure.notFound && count < 1; }
  });
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  const announce = useCallback((text: string) => setMessage((current) => (current === text ? `${text}​` : text)), []);
  const reload = useCallback(() => query.refetch(), [query]);

  const data = query.data;
  const value = useMemo<WorkspaceContextValue | null>(() => data ? {
    ...env,
    data,
    timezone: data.timezone || "UTC",
    now,
    caps: data.capabilities,
    reload,
    announce,
    sectionError: (section: WorkspaceSection) => {
      const errors = (data.errors && !Array.isArray(data.errors) ? data.errors : {}) as StoryWorkspaceData["errors"];
      return errors[section];
    }
  } : null, [env, data, now, reload, announce]);

  if (query.isPending) return <WorkspaceSkeleton />;
  if (!data || !value) return <WorkspaceLoadError error={workspaceError(query.error, "The story workspace couldn't be loaded.")} storiesUrl={env.storiesUrl} onRetry={() => void query.refetch()} retrying={query.isFetching} />;

  return <WorkspaceContext value={value}>
    <main className="mx-auto mt-3 mb-8 flex w-full max-w-[1320px] flex-col gap-6 pr-5">
      <WorkspaceHeader />
      {query.isError ? <InlineAlert onAction={() => void query.refetch()}>This page couldn't refresh, so it may be out of date.</InlineAlert> : null}
      {/* One column in the order a phone reads it; two columns once there is room. The wrappers dissolve on a phone so Files can precede Details. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <BriefSection />
          <ReportingSummaryStrip />
          <ReportingPlan />
          <TasksSection />
          <MediaSection />
        </div>
        <aside aria-label="Story context" className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <DetailsSection />
          <ResourcesSection />
          <ActivitySection />
        </aside>
      </div>
      <p className="text-xs text-muted-foreground">Dates shown in {value.timezone.replace(/_/g, " ")}</p>
      <span role="status" aria-live="polite" className="sr-only">{message}</span>
    </main>
  </WorkspaceContext>;
}
