"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { StoryContext, type CaptureAction } from "@byline/newsroom-screens/story-context/StoryContext";
import { ActivitySection } from "@byline/newsroom-screens/workspace/ActivitySection";
import { StoryWorkspaceProvider, useOptionalWorkspace, WorkspaceAnnouncer, WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { useAuth, useConfig, useDocumentInfo, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { CollapsibleFieldClientComponent } from "payload";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { LiveCoverageProvider, type PublishStory } from "../live/LiveCoverageProvider";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import { ReportingReferencePane, ReportingReferenceSheet, type QuoteInserter } from "../reporting/ReportingReference";
import { TranscriptView } from "../reporting/TranscriptView";
import { FeedbackSummary } from "../review/FeedbackSheet";
import { ReviewMode } from "../review/ReviewMode";
import { useLeaveGuard } from "../shell/navigation";
import { setStoryCrumb } from "../shell/story-crumb";
import { useSettleAutosave, useStoryField } from "./form";
import { HistoryTab } from "./HistoryTab";
import { PlanWorkspace } from "./PlanWorkspace";
import { StoryNotes } from "./StoryNotes";
import { FocusedHeader, StoryHeader } from "./StoryHeader";
import { defaultWorkspace, hasArticleText, parseStoryLocation, storyLocationSearch, type StoryLocation, type StoryPlace, type StoryWorkspace } from "./story-view";
import { useWorkspaceMemory } from "./story-workspace-memory";
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
  /** Opens Plan's Reporting, or a transcript in its focused view when given. */
  openReporting?: (transcriptId?: number) => void;
  /** Write registers the article's Reported Quote inserter here; Reporting reference calls it. */
  quoteInserter?: RefObject<QuoteInserter | null>;
};

/**
 * Story Context sits beside the article in Write only when the Story
 * container (not the viewport) has room for the article's 760px column with
 * its gutters and a ~300px rail beside it. Reporting reference takes the
 * same place when it is open; below this width it is a Sheet instead.
 * A content breakpoint, measured: see docs/story-screen.md#write.
 */
export const CONTEXT_RAIL_AT = 1180;

/**
 * Reporting reference is something the writer asked for, so it may take a
 * little more of the article's room than the rail: a 20rem pane beside an
 * article column of at least ~580px (about 65 characters a line).
 */
export const REFERENCE_PANE_AT = 1000;

type Go = (place: StoryPlace) => void;

/**
 * The Byline Story screen (docs/story-screen.md).
 *
 * It is the custom `Field` of one presentational collapsible that holds every
 * story field, so it renders inside Payload's own Edit view: Payload keeps the
 * form, autosave, validation, drafts, versions, locking and the Live Preview
 * window, and this component is everything the writer sees.
 *
 * A Story has two workspaces, **Plan** and **Write**, as tabs under its
 * header. Review, History and a Transcript are focused views with a way back.
 * The article and its Lexical editor are mounted once and never unmounted by
 * any of it (Plan, a focused view, the reference pane): they are only hidden,
 * so unsaved edits, undo history, selection, autosave, locking and the leave
 * guard are untouched by moving around.
 */
export const StoryScreen: CollapsibleFieldClientComponent = ({ field, parentPath, parentSchemaPath, indexPath, permissions, readOnly }) => {
  const { config } = useConfig();
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const custom = (config.admin?.custom ?? {}) as { newsroomTimeZone?: string };
  const shellQueries = useQueryClient();
  // The Story header registers its normal publish action here; Publish & go live uses exactly it.
  const publishRef = useRef<PublishStory | null>(null);
  const quoteInserter = useRef<QuoteInserter | null>(null);
  const [location, setLocation] = useState<StoryLocation>(() => parseStoryLocation(typeof window === "undefined" ? "" : window.location.search));

  // The address is the place: Back/Forward move between workspaces and focused views.
  useEffect(() => {
    const onPop = () => setLocation(parseStoryLocation(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback<Go>((place) => {
    const search = storyLocationSearch(window.location.search, place);
    if (search === window.location.search) return;
    window.history.pushState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    setLocation(parseStoryLocation(search));
  }, []);

  const context: StoryScreenContext = {
    shellQueries,
    openReporting: (transcriptId) => go(transcriptId ? { mode: "transcript", transcript: transcriptId, workspace: "plan", section: "reporting" } : { workspace: "plan", section: "reporting" }),
    quoteInserter,
    api: config.routes.api,
    admin: config.routes.admin,
    timeZone: custom.newsroomTimeZone ?? "America/New_York",
    storyId: id,
    role: typeof user?.role === "string" ? user.role : "staff",
    userId: user?.id,
    readOnly: Boolean(readOnly)
  };
  const fetchers = useMemo(() => createPayloadHomeFetchers(context.api), [context.api]);
  // Media assignments link files through Byline's Media picker (never Payload's Media list).
  const media = useBylineMediaPicker();
  const childPaths = { fields: field.fields, parentPath: parentPath ?? "", parentSchemaPath: parentSchemaPath ?? "stories", parentIndexPath: indexPath ?? "", permissions };
  const storyId = Number(id);
  const saved = Number.isSafeInteger(storyId) && storyId > 0;
  const article = <WriteTab context={context} paths={childPaths} />;

  // A brand-new document has no ID until its first save; it has no plan, reporting or workspaces yet.
  if (!saved) {
    return (
      <div style={{ display: "contents" }} onSubmit={keepSubmitsInByline}>
        <AdminRoot className="byline-story" toaster={false}>
          <div className="flex w-full flex-col gap-4 py-6" data-story-view="write">
            <StoryLeaveGuard />
            <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8"><StoryHeader context={context} onOpen={() => undefined} /></div>
            {article}
          </div>
        </AdminRoot>
      </div>
    );
  }

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
            <StoryFrame context={context} location={location} go={go} storyId={storyId}>{article}</StoryFrame>
          </LiveCoverageProvider>
          <WorkspaceAnnouncer />
        </StoryWorkspaceProvider>
      </AdminRoot>
    </div>
  );
};

const WORKSPACE_LABELS: Record<StoryWorkspace, string> = { plan: "Plan", write: "Write" };

/**
 * Which workspace shows when the address names none (docs/story-screen.md#default):
 * decided once per Story visit, from whether the article has words yet and
 * the workspace this reader last used here. Typing never moves it.
 */
function useDefaultWorkspace(storyId: number): { workspace: StoryWorkspace; remember: (workspace: StoryWorkspace) => void } {
  const body = useStoryField<unknown>("body");
  const contentFormat = useStoryField<string>("contentFormat");
  const memory = useWorkspaceMemory(storyId);
  const decided = useRef<StoryWorkspace | null>(null);
  const hasText = contentFormat.value === "legacy-html" || hasArticleText(body.value);
  const proposal = defaultWorkspace({ hasArticleText: hasText, remembered: memory.remembered });
  if (decided.current === null && memory.loaded) decided.current = proposal;
  return { workspace: decided.current ?? proposal, remember: memory.remember };
}

/**
 * Lays the Story out for the current place. The article (children) is
 * rendered exactly once, in the Write panel, which is kept mounted and only
 * hidden while Plan or a focused view shows.
 */
function StoryFrame({ context, location, go, storyId, children }: { context: StoryScreenContext; location: StoryLocation; go: Go; storyId: number; children: ReactNode }) {
  // Measured from the first render; the element exists in every place.
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width >= CONTEXT_RAIL_AT;
  const paneFits = width >= REFERENCE_PANE_AT;
  const workspaceData = useOptionalWorkspace();
  const headline = useStoryField<string>("headline");
  const fallback = useDefaultWorkspace(storyId);
  const workspace: StoryWorkspace = location.workspace ?? fallback.workspace;
  const mode = location.mode;
  const [referenceOpen, setReferenceOpen] = useState(false);
  const referenceTrigger = useRef<HTMLButtonElement | null>(null);

  // The most recently used workspace on this Story, for the next visit.
  const { remember } = fallback;
  useEffect(() => { if (!mode) remember(workspace); }, [mode, workspace, remember]);

  // Each workspace keeps its own scroll position: switching back lands where you were.
  const scroll = useRef<Record<string, number>>({});
  const place = mode ? `mode:${mode}` : workspace;
  const placeRef = useRef(place);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { scroll.current[placeRef.current] = window.scrollY; });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  useLayoutEffect(() => {
    if (placeRef.current === place) return;
    placeRef.current = place;
    // A focused view opens at its top; a workspace returns to where it was left.
    window.scrollTo({ top: mode ? 0 : scroll.current[place] ?? 0 });
  }, [place, mode]);

  // The app header's breadcrumb: Stories › this Story's headline, and a focused view's name after it.
  const crumbTitle = headline.value ?? "";
  const crumbMode = mode ? { review: "Review", history: "History", transcript: "Transcript" }[mode] : null;
  useEffect(() => {
    setStoryCrumb({ id: storyId, title: crumbTitle, mode: crumbMode, openStory: crumbMode ? () => go({ workspace }) : null });
  }, [storyId, crumbTitle, crumbMode, go, workspace]);
  useEffect(() => () => setStoryCrumb(null), []);

  const selectWorkspace = (next: StoryWorkspace) => {
    if (next === workspace && !mode) return;
    go({ workspace: next });
  };
  const backToWorkspace = () => go({ workspace, section: mode === "transcript" ? "reporting" : null });
  const openReporting = (capture?: CaptureAction) => go({ workspace: "plan", section: "reporting", capture: capture ?? null });
  const featured = workspaceData?.data.story.featuredImage ?? null;
  const leadImage = featured ? { url: featured.url ?? null, alt: featured.alt ?? null } : null;
  const showRail = wide && !referenceOpen;
  const showPane = paneFits && referenceOpen;

  return (
    <div ref={frameRef} className="@container/story flex w-full flex-col gap-4 py-6" data-story-view={mode ?? workspace}>
      <StoryLeaveGuard />
      {mode ? null : (
        <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8">
          <StoryHeader context={context} onOpen={(next) => go({ mode: next })} />
        </div>
      )}
      {mode ? null : <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 empty:hidden md:px-8"><FeedbackSummary context={context} /></div>}

      {/*
        The two workspaces. Hidden (never unmounted) while a focused view is
        open, so Write's editor and Plan's place are both kept.
      */}
      <div style={mode ? { display: "none" } : undefined} data-story-workspaces="">
        <Tabs value={workspace} onValueChange={(next) => selectWorkspace(next as StoryWorkspace)} className="gap-6">
          <div className="border-b border-border">
            <div className="mx-auto flex w-full max-w-[1440px] items-end justify-between gap-3 px-4 md:px-8">
              <TabsList variant="line" aria-label="Story workspace" activateOnFocus className="gap-2 group-data-horizontal/tabs:h-11" data-story-tabs="">
                {(["plan", "write"] as const).map((value) => (
                  <TabsTrigger key={value} value={value} className="min-w-16 px-3 text-base" data-story-tab={value}>{WORKSPACE_LABELS[value]}</TabsTrigger>
                ))}
              </TabsList>
              {workspace === "write" ? (
                <Button
                  ref={referenceTrigger}
                  type="button"
                  variant={showPane ? "secondary" : "ghost"}
                  size="sm"
                  className="mb-1.5"
                  aria-pressed={paneFits ? referenceOpen : undefined}
                  aria-haspopup={paneFits ? undefined : "dialog"}
                  onClick={() => setReferenceOpen((open) => !open)}
                  data-reporting-reference-toggle=""
                >
                  <BookOpenText data-icon="inline-start" aria-hidden="true" />
                  <span>Reporting<span className="max-sm:sr-only"> reference</span></span>
                </Button>
              ) : null}
            </div>
          </div>

          <TabsContent value="plan" className="min-w-0" data-story-panel="plan">
            <PlanWorkspace context={context} location={location} go={go} leadImage={leadImage} />
          </TabsContent>

          {/* Write: always mounted (keepMounted), only hidden while Plan shows. */}
          <TabsContent value="write" keepMounted className="min-w-0 data-hidden:hidden" data-story-panel="write">
            <div data-story-article="">
              <div className={showPane ? "mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_20rem] items-start gap-8 px-4 md:px-8 @[90rem]/story:grid-cols-[minmax(0,1fr)_24rem]" : showRail ? "mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_18.5rem] items-start gap-8 px-4 md:px-8" : undefined}>
                <div className="min-w-0">{children}</div>
                {showPane ? (
                  <div className="sticky top-24 min-w-0">
                    <ReportingReferencePane context={context} insert={context.quoteInserter!} onClose={() => { setReferenceOpen(false); referenceTrigger.current?.focus(); }} />
                  </div>
                ) : showRail ? (
                  <aside aria-label="Story context" className="sticky top-24 min-w-0 border-l border-border pl-6" data-story-context-rail="">
                    <WorkspaceGate>
                      <WorkspaceStaleNotice />
                      <StoryContext onOpenReporting={openReporting} canCapture={!context.readOnly} leadImage={leadImage} />
                    </WorkspaceGate>
                  </aside>
                ) : null}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <ReportingReferenceSheet context={context} insert={context.quoteInserter!} open={referenceOpen && !paneFits && workspace === "write" && !mode} onOpenChange={setReferenceOpen} finalFocus={referenceTrigger} />
        <p className="mx-auto mt-6 w-full max-w-[1440px] px-4 text-xs text-muted-foreground md:px-8">Dates shown in {context.timeZone.replace(/_/g, " ")}</p>
      </div>

      {mode === "transcript" && location.transcript ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 md:px-8" data-story-mode="transcript">
          <FocusedHeader title="Transcript" backLabel="Back to Plan" storyTitle={headline.value ?? ""} onBack={backToWorkspace} />
          <TranscriptView context={context} transcriptId={location.transcript} onBack={backToWorkspace} hideBack />
        </div>
      ) : null}
      {mode === "history" ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-8" data-story-mode="history">
          <FocusedHeader title="History" backLabel={`Back to ${WORKSPACE_LABELS[workspace]}`} storyTitle={headline.value ?? ""} onBack={backToWorkspace} />
          <HistoryTab context={context} />
          <WorkspaceGate>
            <div className="grid gap-6 lg:grid-cols-2">
              <StoryNotes context={context} />
              <ActivitySection />
            </div>
          </WorkspaceGate>
        </div>
      ) : null}
      {mode === "review" ? (
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 md:px-8" data-story-mode="review">
          <ReviewMode context={context} storyTitle={headline.value ?? ""} onBack={backToWorkspace} width={width} />
        </div>
      ) : null}
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
