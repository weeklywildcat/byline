import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { HomePortalContext } from "../home/lib/portal";
import { TooltipProvider } from "../home/ui/tooltip";
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
import { InlineError } from "./fields";
import { WorkspaceContext, type WorkspaceContextValue, type WorkspaceEnv } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { workspaceKey, workspaceQueryClient } from "./workspace-query";
import type { StoryWorkspace as StoryWorkspaceData, WorkspaceSection } from "./workspace-types";

export type StoryWorkspaceAppProps = WorkspaceEnv;

/** The Story Workspace root: its own query client, portal boundary, toasts and tooltips. */
export function StoryWorkspaceApp(props: StoryWorkspaceAppProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return <QueryClientProvider client={workspaceQueryClient}>
    <div className="byline-home-root story-workspace-root" ref={setRoot}>
      <HomePortalContext value={root}>
        <TooltipProvider>{root ? <WorkspaceScreen {...props} /> : null}<Toaster position="bottom-right" closeButton toastOptions={{ className: "home-toast" }} /></TooltipProvider>
      </HomePortalContext>
    </div>
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
    <main className="ws-page">
      <WorkspaceHeader />
      {query.isError ? <InlineError onRetry={() => void query.refetch()}>This page couldn't refresh, so it may be out of date.</InlineError> : null}
      <div className="ws-body">
        <div className="ws-main">
          <BriefSection />
          <ReportingSummaryStrip />
          <ReportingPlan />
          <TasksSection />
          <MediaSection />
        </div>
        <aside className="ws-rail" aria-label="Story context">
          <DetailsSection />
          <ResourcesSection />
          <ActivitySection />
        </aside>
      </div>
      <p className="ws-footnote">Dates shown in {value.timezone.replace(/_/g, " ")}</p>
      <span role="status" aria-live="polite" className="sr-only">{message}</span>
    </main>
  </WorkspaceContext>;
}
