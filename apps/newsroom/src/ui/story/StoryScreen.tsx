"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ActivitySection } from "@byline/newsroom-screens/workspace/ActivitySection";
import { BriefSection } from "@byline/newsroom-screens/workspace/BriefSection";
import { DetailsSection } from "@byline/newsroom-screens/workspace/DetailsSection";
import { MediaSection } from "@byline/newsroom-screens/workspace/MediaSection";
import { ReportingPlan } from "@byline/newsroom-screens/workspace/ReportingPlan";
import { ReportingSummaryStrip } from "@byline/newsroom-screens/workspace/ReportingSummary";
import { ResourcesSection } from "@byline/newsroom-screens/workspace/ResourcesSection";
import { StoryWorkspaceProvider, WorkspaceAnnouncer, WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { TasksSection } from "@byline/newsroom-screens/workspace/TasksSection";
import { useAuth, useConfig, useDocumentInfo, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { CollapsibleFieldClientComponent } from "payload";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { LiveCoverageProvider, type PublishStory } from "../live/LiveCoverageProvider";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import { useLeaveGuard } from "../shell/navigation";
import { useSettleAutosave } from "./form";
import { HistoryTab } from "./HistoryTab";
import { ReportingTab } from "../reporting/ReportingTab";
import { StoryNotes } from "./StoryNotes";
import { StoryHeader } from "./StoryHeader";
import { WriteTab } from "./WriteTab";

export type StoryScreenContext = {
  api: string;
  admin: string;
  timeZone: string;
  storyId: string | number | undefined;
  role: string;
  userId: string | number | undefined;
  readOnly: boolean;
  shellQueries: QueryClient;
  /** Opens the Reporting tab, on a transcript when given (the article's Reporting sheet uses it). */
  openReporting?: (transcriptId?: number) => void;
};

/**
 * The Byline Story screen.
 *
 * It is the custom `Field` of one presentational collapsible that holds every
 * story field, so it renders inside Payload's own Edit view: Payload keeps the
 * form, autosave, validation, drafts, versions, locking and the Live Preview
 * window, and this component is everything the writer sees. The Byline shell
 * (src/ui/shell) around it owns navigation, Create, Search and the one toaster.
 *
 * Write edits the article through Payload's form hooks: the one copy of the
 * article. Live coverage is not a tab: it is the Story mode control and a section under the article in
 * Write (`ui/live`). Plan and Production are the shared Story Workspace sections
 * (@byline/newsroom-screens), the same ones the WordPress workspace page
 * shows, reading and writing the plan and workspace records through
 * /api/byline. They run with `articleInForm`, so they never write article
 * fields behind the form's back.
 */
export const StoryScreen: CollapsibleFieldClientComponent = ({ field, parentPath, parentSchemaPath, indexPath, permissions, readOnly }) => {
  const { config } = useConfig();
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const custom = (config.admin?.custom ?? {}) as { newsroomTimeZone?: string };
  const shellQueries = useQueryClient();
  // The Story header registers its normal publish action here; Publish & go live uses exactly it.
  const publishRef = useRef<PublishStory | null>(null);
  const [tab, setTab] = useState<string>(() => {
    const requested = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("tab") ?? "";
    return requested === "reporting" || requested === "history" ? requested : "";
  });
  const context: StoryScreenContext = {
    shellQueries,
    openReporting: (transcriptId) => {
      if (transcriptId) window.history.replaceState(null, "", `${window.location.pathname}?tab=reporting&transcript=${transcriptId}`);
      setTab("reporting");
    },
    api: config.routes.api,
    admin: config.routes.admin,
    timeZone: custom.newsroomTimeZone ?? "America/New_York",
    storyId: id,
    role: typeof user?.role === "string" ? user.role : "staff",
    userId: user?.id,
    readOnly: Boolean(readOnly)
  };
  const fetchers = useMemo(() => createPayloadHomeFetchers(context.api), [context.api]);
  // Production assignments link files through Byline's Media picker (never Payload's Media list).
  const media = useBylineMediaPicker();
  const childPaths = { fields: field.fields, parentPath: parentPath ?? "", parentSchemaPath: parentSchemaPath ?? "stories", parentIndexPath: indexPath ?? "", permissions };
  const storyId = Number(id);
  // `?appointment=<id>` opens that appointment's scheduler, as in the WordPress workspace.
  const location = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const appointmentId = location?.get("appointment") ?? "";
  const defaultTab = tab || (appointmentId || location?.get("tab") === "plan" ? "plan" : "write");

  const screen = (
    // Write spans the whole canvas (wide and full photographs measure against it);
    // the header, tabs and the other tabs keep the screen's reading width.
    <div className="@container/story flex w-full flex-col gap-4 py-6">
      <StoryLeaveGuard />
      <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <StoryHeader context={context} />
      </div>
      <Tabs value={tab || defaultTab} onValueChange={(next) => setTab(String(next))} className="gap-4">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="reporting">Reporting</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>
        {/* Write stays mounted so the editor keeps its state while other tabs are open. */}
        <TabsContent value="write" keepMounted>
          <WriteTab context={context} paths={childPaths} />
        </TabsContent>
        <TabsContent value="reporting" className="mx-auto w-full max-w-6xl px-4 md:px-8">
          {Number.isSafeInteger(storyId) && storyId > 0 ? <ReportingTab context={context} /> : <p className="text-sm text-muted-foreground">Save the story once to start reporting on it.</p>}
        </TabsContent>
        <TabsContent value="plan" className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <Workspace storyId={storyId}>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-start lg:gap-5">
              <div className="flex min-w-0 flex-col gap-4">
                <BriefSection />
                <ReportingSummaryStrip />
                <ReportingPlan />
                <TasksSection />
              </div>
              <aside aria-label="Story context" className="flex min-w-0 flex-col gap-4">
                <DetailsSection />
                <ResourcesSection />
                <StoryNotes context={context} />
                <ActivitySection />
              </aside>
            </div>
          </Workspace>
        </TabsContent>
        <TabsContent value="production" className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <Workspace storyId={storyId}>
            <MediaSection />
          </Workspace>
        </TabsContent>
        <TabsContent value="history" className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <HistoryTab context={context} />
        </TabsContent>
      </Tabs>
      <p className="mx-auto w-full max-w-5xl px-4 text-xs text-muted-foreground md:px-8">Dates shown in {context.timeZone.replace(/_/g, " ")}</p>
    </div>
  );

  // A brand-new document has no ID until its first save; it has no plan yet either.
  if (!Number.isSafeInteger(storyId) || storyId <= 0) return <div style={{ display: "contents" }} onSubmit={keepSubmitsInByline}><AdminRoot className="byline-story" toaster={false}>{screen}</AdminRoot></div>;
  const liveProvider = (children: ReactNode) => (
    <LiveCoverageProvider api={context.api} admin={context.admin || "/admin"} storyId={storyId} timeZone={context.timeZone} readOnly={context.readOnly} userId={Number(user?.id ?? 0)} publishRef={publishRef}>{children}</LiveCoverageProvider>
  );

  return (
    <div style={{ display: "contents" }} onSubmit={keepSubmitsInByline}>
    <AdminRoot className="byline-story" toaster={false}>
      <StoryWorkspaceProvider
        storyId={storyId}
        appointmentId={appointmentId}
        currentUserId={Number(user?.id ?? 0)}
        storiesUrl={context.admin || "/admin"}
        client={fetchers.workspace!}
        editorial={fetchers.editorial!}
        media={media}
        articleInForm
      >
        {liveProvider(screen)}
        <WorkspaceAnnouncer />
      </StoryWorkspaceProvider>
    </AdminRoot>
    </div>
  );
};

/**
 * Tells the shell whether this story has work that leaving would lose: an
 * edit Payload's autosave has not saved yet, or a save in flight. The shell
 * waits for that autosave (or asks) before any shell navigation, such as
 * switching stories. It reads Payload's own form state and saves nothing.
 */
function StoryLeaveGuard() {
  // Payload keeps `modified` set when anything touched the form mid-autosave; settle it
  // here so the header and this guard read the truth.
  useSettleAutosave();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  useLeaveGuard(() => ({ modified, saving: processing || background }));
  return null;
}

/**
 * The Story screen lives inside Payload's document <form>, and React submit
 * events bubble through portals. A Byline dialog's own <form> (Add source, New
 * task…) would otherwise also submit Payload's form and save the story. Any
 * submit that reaches this root came from a nested Byline form, never from
 * Payload's (an ancestor), so it stops here.
 */
const keepSubmitsInByline = (event: FormEvent) => event.stopPropagation();

/** A tab of workspace sections: loading and error states, and the stale-refresh notice. */
function Workspace({ storyId, children }: { storyId: number; children: ReactNode }) {
  if (!Number.isSafeInteger(storyId) || storyId <= 0) return <p className="text-sm text-muted-foreground">Save the story once to start planning it.</p>;
  return (
    <WorkspaceGate>
      <div className="flex flex-col gap-4">
        <WorkspaceStaleNotice />
        {children}
      </div>
    </WorkspaceGate>
  );
}
