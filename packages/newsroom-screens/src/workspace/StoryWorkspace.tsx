import { WorkspaceCollections } from "../collections/WorkspaceCollections";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClientProvider, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { ActivitySection } from "./ActivitySection";
import { BriefSection } from "./BriefSection";
import { DetailsSection } from "./DetailsSection";
import { MediaSection } from "./MediaSection";
import { NotesSection } from "./NotesSection";
import { ReportingPlan } from "./ReportingPlan";
import { ReportingSummaryStrip } from "./ReportingSummary";
import { ResourcesSection } from "./ResourcesSection";
import { TasksSection } from "./TasksSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceLoadError, WorkspaceSkeleton } from "./WorkspaceStates";
import { WorkspaceContext, type WorkspaceContextValue, type WorkspaceEnv } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { workspaceQueryClient, workspaceQueryOptions } from "./workspace-query";
import type { StoryWorkspace as StoryWorkspaceData, WorkspaceSection } from "./workspace-types";

export type StoryWorkspaceAppProps = WorkspaceEnv;

type WorkspaceLoad = {
  env: WorkspaceEnv;
  query: UseQueryResult<StoryWorkspaceData>;
  value: WorkspaceContextValue | null;
  message: string;
};

const WorkspaceLoadContext = createContext<WorkspaceLoad | null>(null);

function useWorkspaceLoad(): WorkspaceLoad {
  const load = useContext(WorkspaceLoadContext);
  if (!load) throw new Error("Story Workspace sections must be inside StoryWorkspaceProvider.");
  return load;
}

/** The loaded workspace, or `null` while it loads or if it failed (for chrome that renders either way). */
export function useOptionalWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}

/**
 * Loads one story's workspace and provides it. Children always render; put
 * sections inside `WorkspaceGate`, which shows the loading and error states.
 * A host composes the sections however its screen needs: the WordPress page
 * below, or the Payload Story screen's Plan tab.
 */
export function StoryWorkspaceProvider({ children, ...env }: WorkspaceEnv & { children: ReactNode }) {
  return <WorkspaceLoader env={env}>{children}</WorkspaceLoader>;
}

function WorkspaceLoader({ env, children }: { env: WorkspaceEnv; children: ReactNode }) {
  const { storyId, client } = env;
  const query = useQuery({
    ...workspaceQueryOptions(storyId, (id) => client.getWorkspace(id)),
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

  const load = useMemo(() => ({ env, query, value, message }), [env, query, value, message]);
  return <WorkspaceLoadContext value={load}><WorkspaceContext value={value}>{children}</WorkspaceContext></WorkspaceLoadContext>;
}

/** Renders its sections once the workspace has loaded; the skeleton or the load error until then. */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { env, query, value } = useWorkspaceLoad();
  if (query.isPending) return <WorkspaceSkeleton />;
  if (!value) return <WorkspaceLoadError error={workspaceError(query.error, "The story workspace couldn't be loaded.")} storiesUrl={env.storiesUrl} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  return <>{children}</>;
}

/** Shown when a refresh failed but the last loaded workspace is still on screen. */
export function WorkspaceStaleNotice() {
  const { query } = useWorkspaceLoad();
  return query.isError ? <InlineAlert onAction={() => void query.refetch()}>This page couldn't refresh, so it may be out of date.</InlineAlert> : null;
}

/** The polite live region the sections announce results through. */
export function WorkspaceAnnouncer() {
  const { message } = useWorkspaceLoad();
  return <span role="status" aria-live="polite" className="sr-only">{message}</span>;
}

/** The Story Workspace page (WordPress): header, then the sections in two columns. */
export function StoryWorkspaceApp(props: StoryWorkspaceAppProps) {
  return <QueryClientProvider client={workspaceQueryClient}>
    <StoryWorkspaceProvider {...props}>
      <AdminRoot><WorkspaceGate><WorkspacePage /></WorkspaceGate></AdminRoot>
    </StoryWorkspaceProvider>
  </QueryClientProvider>;
}

function WorkspacePage() {
  const { value } = useWorkspaceLoad();
  return <main className="mx-auto mt-3 mb-8 flex w-full max-w-[1320px] flex-col gap-6 pr-5">
    <WorkspaceHeader />
    <WorkspaceStaleNotice />
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
        <WorkspaceCollections />
        <NotesSection />
        <ResourcesSection />
        <ActivitySection />
      </aside>
    </div>
    <p className="text-xs text-muted-foreground">Dates shown in {value!.timezone.replace(/_/g, " ")}</p>
    <WorkspaceAnnouncer />
  </main>;
}
