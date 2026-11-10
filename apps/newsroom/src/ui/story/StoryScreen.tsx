"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { StoryContext, type CaptureAction } from "@byline/newsroom-screens/story-context/StoryContext";
import { ActivitySection } from "@byline/newsroom-screens/workspace/ActivitySection";
import { StoryWorkspaceProvider, useOptionalWorkspace, WorkspaceAnnouncer, WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { useAuth, useConfig, useDocumentInfo, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { CollapsibleFieldClientComponent } from "payload";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { LiveCoverageProvider, type PublishStory } from "../live/LiveCoverageProvider";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import { ReportingTab } from "../reporting/ReportingTab";
import { FeedbackSummary } from "../review/FeedbackSheet";
import { ReviewMode } from "../review/ReviewMode";
import { useLeaveGuard } from "../shell/navigation";
import { setStoryCrumb } from "../shell/story-crumb";
import { useSettleAutosave, useStoryField } from "./form";
import { HistoryTab } from "./HistoryTab";
import { StoryNotes } from "./StoryNotes";
import { FocusedHeader, StoryHeader } from "./StoryHeader";
import { LegacyStoryTabs } from "./LegacyStoryTabs";
import { useStoryLayout } from "./story-layout";
import { parseStoryLocation, parseStoryTab, storyLocationSearch, type StoryLocation, type StoryTab, type StoryView } from "./story-view";
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
  /** Opens Reporting, on a transcript when given (the article's Reporting sheet uses it). */
  openReporting?: (transcriptId?: number) => void;
};

/**
 * The Story's static context rail appears only when the Story container (not
 * the viewport) has room for the article's 760px column with its gutters and
 * a ~300px rail beside it. Below that the same content is a right Sheet.
 * A content breakpoint, measured: see docs/story-screen.md#context.
 */
export const CONTEXT_RAIL_AT = 1180;

type Go = (view: StoryView, extra?: { capture?: CaptureAction | null; transcript?: number | null }) => void;

/**
 * The Byline Story screen (docs/story-screen.md).
 *
 * It is the custom `Field` of one presentational collapsible that holds every
 * story field, so it renders inside Payload's own Edit view: Payload keeps the
 * form, autosave, validation, drafts, versions, locking and the Live Preview
 * window, and this component is everything the writer sees.
 *
 * Opening a Story opens the Story: header, article, Story Context. Reporting,
 * Review and History are focused modes reached deliberately (`?view=`), each
 * with Back to story — never peer tabs. The article and its Lexical editor
 * stay mounted (only hidden) while a focused mode is open, so unsaved edits,
 * autosave, locking and the leave guard are untouched by moving around.
 */
export const StoryScreen: CollapsibleFieldClientComponent = ({ field, parentPath, parentSchemaPath, indexPath, permissions, readOnly }) => {
  const { config } = useConfig();
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const custom = (config.admin?.custom ?? {}) as { newsroomTimeZone?: string };
  const shellQueries = useQueryClient();
  // The Story header registers its normal publish action here; Publish & go live uses exactly it.
  const publishRef = useRef<PublishStory | null>(null);
  const [location, setLocation] = useState<StoryLocation>(() => parseStoryLocation(typeof window === "undefined" ? "" : window.location.search));

  // The address is the mode: Back/Forward move between the Story and a focused mode.
  useEffect(() => {
    const onPop = () => setLocation(parseStoryLocation(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback<Go>((view, extra = {}) => {
    const search = storyLocationSearch(window.location.search, view, extra);
    window.history.pushState(window.history.state, "", `${window.location.pathname}${search}`);
    setLocation(parseStoryLocation(search));
    window.scrollTo({ top: 0 });
  }, []);

  const context: StoryScreenContext = {
    shellQueries,
    openReporting: (transcriptId) => go("reporting", { transcript: transcriptId ?? null }),
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
  const saved = Number.isSafeInteger(storyId) && storyId > 0;

  const screen = <StoryFrame context={context} location={location} go={go} saved={saved}>
    <WriteTab context={context} paths={childPaths} />
  </StoryFrame>;

  // A brand-new document has no ID until its first save; it has no plan, context or reporting yet.
  if (!saved) return <div style={{ display: "contents" }} onSubmit={keepSubmitsInByline}><AdminRoot className="byline-story" toaster={false}>{screen}</AdminRoot></div>;

  return (
    <div style={{ display: "contents" }} onSubmit={keepSubmitsInByline}>
      <AdminRoot className="byline-story" toaster={false}>
        <StoryWorkspaceProvider
          storyId={storyId}
          appointmentId=""
          currentUserId={Number(user?.id ?? 0)}
          storiesUrl={context.admin || "/admin"}
          client={fetchers.workspace!}
          editorial={fetchers.editorial!}
          media={media}
          articleInForm
        >
          <LiveCoverageProvider api={context.api} admin={context.admin || "/admin"} storyId={storyId} timeZone={context.timeZone} readOnly={context.readOnly} userId={Number(user?.id ?? 0)} publishRef={publishRef}>
            {screen}
          </LiveCoverageProvider>
          <WorkspaceAnnouncer />
        </StoryWorkspaceProvider>
      </AdminRoot>
    </div>
  );
};

/**
 * Lays the Story out for the current mode. The article (children) is always
 * rendered; focused modes hide it with `display: none` rather than unmounting
 * Payload's fields.
 */
function StoryFrame({ context, location, go, saved, children }: { context: StoryScreenContext; location: StoryLocation; go: Go; saved: boolean; children: ReactNode }) {
  // Measured from the first render; the element exists in every mode.
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  // The legacy layout (account menu → Legacy Story view): same header and article under
  // Write / Plan / Production / History tabs, and no context rail or Sheet.
  const tabbed = useStoryLayout().layout === "tabs" && saved;
  const wide = width >= CONTEXT_RAIL_AT && !tabbed;
  const [contextOpen, setContextOpen] = useState(location.context);
  const [chosenTab, setChosenTab] = useState<StoryTab>(() => (location.context ? "plan" : parseStoryTab(typeof window === "undefined" ? "" : window.location.search)));
  const workspace = useOptionalWorkspace();
  const headline = useStoryField<string>("headline");
  const requested = saved ? location.view : "story";
  // History is a tab here, not a mode: "View history" and old history links land on it.
  const view = tabbed && requested === "history" ? "story" : requested;
  const tab: StoryTab = tabbed && location.view === "history" ? "history" : chosenTab;
  const selectTab = (next: StoryTab) => {
    setChosenTab(next);
    if (location.view === "history") go("story");
  };
  // The app header's breadcrumb: Stories › this Story's headline, and a focused mode's name after it.
  const crumbId = saved ? Number(context.storyId) : null;
  const crumbTitle = headline.value ?? "";
  const crumbMode = view === "story" ? null : { reporting: "Reporting", review: "Review", history: "History" }[view];
  useEffect(() => {
    if (crumbId === null) return;
    setStoryCrumb({ id: crumbId, title: crumbTitle, mode: crumbMode, openStory: crumbMode ? () => go("story") : null });
  }, [crumbId, crumbTitle, crumbMode, go]);
  useEffect(() => () => setStoryCrumb(null), []);
  const showArticle = view === "story" && (!tabbed || tab === "write");
  const back = () => go("story");
  const openReporting = (capture?: CaptureAction) => {
    setContextOpen(false);
    go("reporting", { capture: capture ?? null });
  };
  const featured = workspace?.data.story.featuredImage ?? null;
  const contextContent = saved ? (
    <WorkspaceGate>
      <WorkspaceStaleNotice />
      <StoryContext
        onOpenReporting={openReporting}
        canCapture={!context.readOnly}
        leadImage={featured ? { url: featured.url ?? null, alt: featured.alt ?? null } : null}
        before={<FeedbackSummary context={context} />}
      />
    </WorkspaceGate>
  ) : null;

  return (
    <div ref={frameRef} className="@container/story flex w-full flex-col gap-4 py-6" data-story-view={view}>
      <StoryLeaveGuard />
      {view === "story" ? (
        <div className={tabbed ? "mx-auto w-full max-w-5xl px-4 md:px-8" : "mx-auto w-full max-w-[1440px] px-4 md:px-8"}>
          <StoryHeader context={context} view={view} onView={(next) => go(next)} onOpenContext={saved && !wide && !tabbed ? () => setContextOpen(true) : undefined} />
        </div>
      ) : null}
      {tabbed && view === "story" ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 empty:hidden md:px-8"><FeedbackSummary context={context} /></div>
      ) : null}
      {tabbed && view === "story" ? <LegacyStoryTabs context={context} tab={tab} onTab={selectTab} /> : null}

      {/*
        The article: always mounted, hidden in focused modes. It keeps the same
        position in the tree whether or not the rail shows, so crossing the
        width threshold never remounts the editor.
      */}
      <div style={showArticle ? undefined : { display: "none" }} data-story-article="">
        <div className={wide && contextContent ? "mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_18.5rem] items-start gap-8 px-4 md:px-8" : undefined}>
          <div className="min-w-0">{children}</div>
          {wide && contextContent ? <aside aria-label="Story context" className="sticky top-24 min-w-0 border-l border-border pl-6" data-story-context-rail="">{contextContent}</aside> : null}
        </div>
      </div>

      {view === "reporting" ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 md:px-8" data-story-mode="reporting">
          <FocusedHeader title="Reporting" storyTitle={headline.value ?? ""} onBack={back} />
          <ReportingTab context={context} capture={location.capture} appointmentId={location.appointment} transcriptId={location.transcript} onTranscript={(transcript) => go("reporting", { transcript })} />
        </div>
      ) : null}
      {view === "history" ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-8" data-story-mode="history">
          <FocusedHeader title="History" storyTitle={headline.value ?? ""} onBack={back} />
          <HistoryTab context={context} />
          <WorkspaceGate>
            <div className="grid gap-6 lg:grid-cols-2">
              <StoryNotes context={context} />
              <ActivitySection />
            </div>
          </WorkspaceGate>
        </div>
      ) : null}
      {view === "review" ? (
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 md:px-8" data-story-mode="review">
          <ReviewMode context={context} storyTitle={headline.value ?? ""} onBack={back} width={width} />
        </div>
      ) : null}

      {saved && !wide && !tabbed ? (
        <Sheet open={contextOpen && view === "story"} onOpenChange={setContextOpen}>
          <SheetContent side="right" className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-sm">
            <SheetHeader className="border-b border-border pr-12">
              <SheetTitle>Story context</SheetTitle>
              <SheetDescription className="sr-only">The angle, reporting, media and checklist for this story.</SheetDescription>
            </SheetHeader>
            <div className="p-4">{contextContent}</div>
          </SheetContent>
        </Sheet>
      ) : null}
      {view === "story" ? <p className="mx-auto w-full max-w-[1440px] px-4 text-xs text-muted-foreground md:px-8">Dates shown in {context.timeZone.replace(/_/g, " ")}</p> : null}
    </div>
  );
}

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
