"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { useFineHoverPointer } from "@byline/newsroom-ui/lib/hooks";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import type { ReadinessPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import { relativeDay } from "@byline/newsroom-screens/story/attention";
import { LIFECYCLE_PHASES, PHASE_LABELS, PHASE_STATUSES, type EffectivePhase } from "@byline/newsroom-screens/story/lifecycle";
import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import { PlanningProperties } from "@byline/newsroom-screens/workspace/DetailsSection";
import { useOptionalWorkspace } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronLeft, Ellipsis, Eye, History, List, SlidersHorizontal, Smartphone } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { IMMERSIVE_ALIGNMENT_OPTIONS, STORY_PRESENTATION_OPTIONS } from "../../domain/vocabulary";
import { editorialReadiness } from "../../domain/story-readiness";
import { LiveBadge } from "../live/LiveCoverageSection";
import { useLiveCoverage } from "../live/LiveCoverageProvider";
import { problemsOf, useReviewActions, useStoryReview, type SubmissionProblem } from "../review/api";
import { useShellLayout } from "../shell/layout";
import { ShellLink, waitForSavedDocument } from "../shell/navigation";
import { useStorySwitcher } from "../shell/StorySwitcher";
import { getJson, postJson } from "./api";
import { useStoryField } from "./form";
import { formatDay, Property } from "./parts";
import { PhaseBadge } from "./PhaseBadge";
import { usePublicationActions } from "./PublicationActions";
import { blockingLines } from "./publication-readiness-model";
import { StoryMediaReadinessNotice, useStoryMediaReadiness } from "./publication-readiness";
import { PresentationStatus, useStoryPresentationResolution, useStoryPreview } from "./StoryPreviewControl";
import type { StoryScreenContext } from "./StoryScreen";
import { StoryURL, useStoryURL } from "./StoryURL";

function SettingSelect<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
}) {
  const items = options.map((option) => ({ value: option.value, label: option.label }));
  return (
    <Select items={items} value={value} disabled={disabled} onValueChange={(next) => {
      if (next) onChange(next as T);
    }}>
      <SelectTrigger aria-label={label} size="sm" className="-ml-2 max-w-full border-transparent bg-transparent px-2 font-normal hover:bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DetailsHeading({ id, children }: { id?: string; children: string }) {
  return <h3 id={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

/** Names as a reader says them: "Caroline Elrod + Gibson Bell", "Ana Ruiz + 2 others". */
export function peopleLine(names: string[]): string {
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names.length - 1} others`;
}

export type HeaderProps = {
  context: StoryScreenContext;
  /** Opens a focused view: Review (the submitted version and its pipeline) or History. */
  onOpen: (view: "review" | "history") => void;
};

type Transition = "accept-pitch" | "start-drafting" | "put-on-hold" | "drop" | "resume";

/**
 * The Story header (docs/story-screen.md#header) answers, at a glance: what
 * phase is this Story in, who writes it, when is it due, what happens next
 * and whose move it is, has it saved, can I preview or publish. It is the
 * same over Plan and Write. Exactly one lifecycle action is primary;
 * everything occasional is in the overflow menu or Story details. Payload
 * still owns the form, autosave, versions and the publish submit.
 */
export function StoryHeader({ context, onOpen }: HeaderProps) {
  const workspace = useOptionalWorkspace();
  const workspaceQueries = useQueryClient();
  const planned = workspace?.data.story;
  // Editors (anyone the plan lets assign) edit the editor, deadline and publication target in the details panel.
  const planning = Boolean(workspace?.caps.assign) && !context.readOnly;
  const { id, hasPublishPermission, hasPublishedDoc, unpublishedVersionCount, lastUpdateTime, setHasPublishedDoc, setUnpublishedVersionCount, setMostRecentVersionIsAutosaved, uploadStatus } = useDocumentInfo();
  const { submit } = useForm();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  const headline = useStoryField<string>("headline");
  const section = useStoryField<unknown>("section");
  const contributors = useStoryField<unknown>("contributors");
  const format = useStoryField<string>("format");
  const videoUrl = useStoryField<string>("video.url");
  const presentation = useStoryField<string>("presentation");
  const alignment = useStoryField<string>("immersiveAlignment");
  const liveCoverage = useLiveCoverage();
  const editorial = editorialReadiness({ headline: headline.value, section: section.value, contributors: contributors.value, format: format.value, videoUrl: videoUrl.value });
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [problems, setProblems] = useState<SubmissionProblem[]>([]);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const url = useStoryURL(context);
  const newPath = url.proposedPath();
  const [confirmURL, setConfirmURL] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const presentationResolution = useStoryPresentationResolution();
  const mediaReadiness = useStoryMediaReadiness(Boolean(hasPublishPermission) && !context.readOnly);
  const review = useStoryReview(context, id != null);
  const actions = useReviewActions(context);
  const saveState = useRef({ modified, saving: processing || background });
  saveState.current = { modified, saving: processing || background };

  const newerDraft = hasPublishedDoc && (unpublishedVersionCount > 0 || modified);
  const scheduledAt = planned?.publicationState.scheduledAt ?? null;
  const scheduledLabel = scheduledAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: context.timeZone }).format(new Date(scheduledAt)) : null;
  const priorPath = url.config?.path || url.config?.previousPath;
  const changedPath = priorPath && newPath && newPath !== priorPath ? { old: priorPath, next: newPath } : null;
  const canEditPublication = Boolean(hasPublishPermission) && !context.readOnly;
  const publication = !hasPublishedDoc ? "Draft" : newerDraft ? "Published · unpublished changes" : "Published";
  const saving = processing || background;
  const saveLabel = saving ? "Saving…" : modified ? "Unsaved changes" : lastUpdateTime ? "Saved" : "";
  const canPublish = Boolean(hasPublishPermission) && !context.readOnly && uploadStatus !== "uploading" && (!hasPublishedDoc || newerDraft);
  const readiness = useQuery({
    queryKey: ["story-publication-readiness", id, lastUpdateTime],
    queryFn: () => getJson<ReadinessPayload>(context.api, `/byline/stories/${id}/readiness`),
    enabled: canEditPublication && id != null && !modified && !saving && readinessOpen
  });
  const bodyProblems = modified ? [] : readiness.data?.checks.filter((line) => line.id.startsWith("body-")) ?? [];
  const publicationProblems = bodyProblems.length + editorial.filter((line) => line.level === "error").length + (mediaReadiness.report?.items.filter((item) => item.state !== "ready").length ?? 0);

  // Where the Story is and who it belongs to, from its plan and its review.
  const reviewState = review.data;
  const storedPhase = (reviewState?.phase ?? planned?.workflow.id ?? "pitch") as EffectivePhase;
  const phase: EffectivePhase = hasPublishedDoc ? "published" : storedPhase;
  const userId = Number(context.userId ?? 0);
  const isEditor = context.role === "editor" || context.role === "administrator";
  const storyEditor = isEditor || planned?.editor?.id === userId;
  const manages = workspace?.caps.role === "manager";
  const writers = planned?.authors ?? [];
  const run = reviewState?.run ?? null;
  const changesRequested = run?.status === "changes-requested";
  const routingFailed = run?.status === "routing-failed";
  const stale = Boolean(run && run.steps.some((step) => step.state === "stale"));
  const waitingFor = run?.status === "active" ? run.steps.find((step) => step.state === "active")?.waitingFor ?? null : null;
  const due = planned?.deadline && !hasPublishedDoc ? `Due ${relativeDay(planned.deadline, { now: new Date(), timeZone: context.timeZone })}` : null;
  const sidelined = phase === "on-hold" || phase === "dropped";
  const preview = useStoryPreview();
  // Schedule, Unpublish and Move to trash are not lifecycle steps. Trash is Payload's recoverable delete, distinct from editorial Drop, and stays reachable in every phase.
  const publicationActions = usePublicationActions({ context, scheduledAt, changedPath, saving: saving || modified || publishing, canSchedule: (!hasPublishedDoc || newerDraft) && !modified && !saving, onChanged: refresh, finalFocus: menuTrigger });

  function refresh() {
    void invalidateStoryData(context.shellQueries, Number(id));
    if (workspaceQueries !== context.shellQueries) void invalidateStoryData(workspaceQueries, Number(id));
    void url.result.refetch();
    void workspaceQueries.invalidateQueries({ queryKey: ["story-versions", id] });
    void workspaceQueries.invalidateQueries({ queryKey: ["byline", "story-distribution", id] });
  }

  /** Why Media blocks publishing right now, from the server, or null. */
  async function mediaRefusal(): Promise<string | null> {
    const media = await mediaReadiness.check().catch(() => null);
    if (!media || media.ready) return null;
    const line = blockingLines(media)[0]?.text;
    return line ? line.replace(/\.$/, "") : "its media is still being prepared";
  }

  /** The one normal publish action. Returns whether the story is now published, so Publish & go live can stop when it is not. */
  async function publish(): Promise<boolean> {
    if (id === undefined) return false;
    if (editorial.some((line) => line.level === "error")) { setReadinessOpen(true); return false; }
    setPublishing(true);
    try {
      if (!modified) {
        const preflight = await readiness.refetch().catch(() => null);
        if (preflight?.data?.checks.some((line) => line.state === "error")) {
          await mediaReadiness.check().catch(() => null);
          setReadinessOpen(true);
          return false;
        }
      }
      const before = await mediaRefusal();
      if (before) {
        setReadinessOpen(true);
        return false;
      }
      const result = await submit({ action: `${context.api}/stories/${id}?depth=0`, overrides: { _status: "published" } });
      if (result?.res.ok) {
        setUnpublishedVersionCount(0);
        setMostRecentVersionIsAutosaved(false);
        setHasPublishedDoc(true);
        refresh();
        toast.success(hasPublishedDoc ? "Changes published." : "Story published.");
        return true;
      }
      const after = await mediaRefusal();
      if (after) toast.error(`The story was not published: ${after}.`);
      return false;
    } catch {
      const after = await mediaRefusal();
      toast.error(after ? `The story was not published: ${after}.` : "The story could not be published. Check the highlighted fields.");
      return false;
    } finally {
      setPublishing(false);
    }
  }
  // Publish & go live runs exactly this action (its readiness checks, nothing weaker).
  if (liveCoverage) liveCoverage.publishRef.current = publish;
  const startPublish = () => {
    if (changedPath) setConfirmURL(true);
    else void publish();
  };

  /** Submit or resubmit: wait for Payload's autosave so the sealed version is what the writer sees. */
  async function submitForReview() {
    const settled = await waitForSavedDocument(() => saveState.current);
    if (!settled) {
      toast.error("Still saving. Try again in a moment.");
      return;
    }
    actions.submit.mutate(undefined, {
      onSuccess: (state) => {
        const active = state.run?.steps.find((step) => step.state === "active");
        if (state.run?.status === "active" && active) toast.success(`Sent to ${active.waitingFor ?? "review"}.`);
        else if (state.run?.status === "approved") toast.success("Review complete. The story is Ready.");
        else if (state.run?.status === "routing-failed") toast.error("This story couldn't be sent for review.");
      },
      onError: (error) => {
        const found = problemsOf(error);
        if (found.length) setProblems(found);
        else toast.error((error as Error).message);
      }
    });
  }

  function move(transition: Transition, success: string, undo?: Transition) {
    actions.lifecycle.mutate(transition, {
      onSuccess: () => toast.success(success, undo ? { action: { label: "Undo", onClick: () => actions.lifecycle.mutate(undo) } } : undefined),
      onError: (error) => toast.error((error as Error).message)
    });
  }

  // Exactly one primary lifecycle action for this reader, now.
  const busy = actions.submit.isPending || actions.lifecycle.isPending;
  let primary: { label: string; run: () => void } | null = null;
  if (!context.readOnly && id != null && !hasPublishedDoc) {
    const canSubmit = Boolean(reviewState?.viewer.canSubmit);
    if (phase === "pitch" && storyEditor) primary = { label: "Accept pitch", run: () => move("accept-pitch", "Pitch accepted. It's in Reporting.") };
    else if (phase === "reporting" && manages) primary = { label: "Start drafting", run: () => move("start-drafting", "Moved to Drafting.") };
    else if ((phase === "drafting" || (phase === "ready" && stale)) && canSubmit) primary = { label: reviewState!.viewer.submitLabel, run: () => void submitForReview() };
    else if (phase === "review" && reviewState?.viewer.canReview) primary = { label: "Review submitted version", run: () => onOpen("review") };
  }
  // Hold and Drop (or Resume): shared by the overflow menu and the right-click menu on the stage.
  const sidelineActions: Array<{ key: string; label: string; run: () => void; destructive?: boolean }> = storyEditor && !context.readOnly && !hasPublishedDoc
    ? sidelined
      ? [{ key: "resume", label: "Resume story", run: () => move("resume", "Story resumed.") }]
      : [
        { key: "hold", label: "Put on hold", run: () => move("put-on-hold", "Story put on hold.", "resume") },
        { key: "drop", label: "Drop story", run: () => move("drop", "Story dropped.", "resume"), destructive: true }
      ]
    : [];
  // An editor's jump to any stage, skipping the ones between (the same override as Story details). Undo goes back to where it was.
  const [jumping, setJumping] = useState(false);
  const canJump = isEditor && !context.readOnly && id != null && !hasPublishedDoc;
  async function jumpTo(next: EffectivePhase, undoTo?: EffectivePhase) {
    if (jumping || next === storedPhase) return;
    setJumping(true);
    try {
      await postStage(context, next);
      // Undo is its own request: it must not read this render's "busy" or stage.
      toast.success(`Moved to ${PHASE_LABELS[next]}. Any open review was closed.`, undoTo ? {
        action: {
          label: "Undo",
          onClick: () => void postStage(context, undoTo).then(() => { refresh(); void review.refetch(); }, (error: Error) => toast.error(error.message))
        }
      } : undefined);
      refresh();
      void review.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setJumping(false);
    }
  }
  const canHover = useFineHoverPointer();
  const canMove = Boolean(primary) || sidelineActions.length > 0 || canJump;
  const showPublish = canEditPublication && (phase === "ready" || hasPublishedDoc);
  const statusLine = changesRequested ? "Changes requested" : waitingFor ? `Waiting for ${waitingFor}` : stale && phase === "ready" ? "Changed since approval" : phase === "pitch" && !storyEditor ? "Waiting for an editor" : null;
  const phaseContent = <>
    <PhaseBadge phase={phase} />
    {statusLine && !run ? <span className="text-sm text-muted-foreground" data-story-status="">{statusLine}</span> : null}
    {liveCoverage?.desk?.mode === "live" && liveCoverage.desk.status !== "off" ? <LiveBadge desk={liveCoverage.desk} timeZone={context.timeZone} /> : null}
  </>;

  return (
    <header className="flex flex-col gap-2 border-b border-border pb-3" data-story-header="">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_18rem] flex-wrap items-center gap-x-4 gap-y-1.5">
          <StorySwitchButton />
          {canHover && canMove ? <ContextMenu>
            <ContextMenuTrigger render={<div className="flex items-center gap-2" data-story-phase={phase} title="Right-click to move this story" />}>{phaseContent}</ContextMenuTrigger>
            <ContextMenuContent className="w-56" side="bottom" align="start">
              <ContextMenuGroup>
                <ContextMenuLabel>{PHASE_LABELS[phase]}</ContextMenuLabel>
                {primary ? <ContextMenuItem disabled={busy} onClick={primary.run} data-stage-menu-primary=""><ArrowRight aria-hidden="true" />{primary.label}</ContextMenuItem> : null}
              </ContextMenuGroup>
              {sidelineActions.length ? <>
                {primary ? <ContextMenuSeparator /> : null}
                <ContextMenuGroup>
                  {sidelineActions.map((action) => <ContextMenuItem key={action.key} variant={action.destructive ? "destructive" : undefined} disabled={busy} onClick={action.run}>{action.label}</ContextMenuItem>)}
                </ContextMenuGroup>
              </> : null}
              {canJump ? <>
                {primary || sidelineActions.length ? <ContextMenuSeparator /> : null}
                <ContextMenuSub>
                  <ContextMenuSubTrigger data-stage-menu-jump="">Move to stage</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuRadioGroup value={storedPhase} onValueChange={(next) => void jumpTo(next as EffectivePhase, storedPhase)}>
                      {LIFECYCLE_PHASES.map((value) => <ContextMenuRadioItem key={value} value={value} disabled={jumping}>{PHASE_LABELS[value]}</ContextMenuRadioItem>)}
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </> : null}
            </ContextMenuContent>
          </ContextMenu> : <div className="flex items-center gap-2" data-story-phase={phase}>{phaseContent}</div>}
          {/* Whose move it is in review, and the way into Review for anyone on the Story: a labelled link, never a hidden menu item. */}
          {statusLine && run ? (
            <Button type="button" variant="link" size="sm" className={changesRequested ? "h-auto p-0 font-medium text-destructive" : "h-auto p-0 font-normal text-muted-foreground"} onClick={() => onOpen("review")} data-story-status="" aria-label={`${statusLine}. Open review`}>
              {statusLine}
            </Button>
          ) : run && !primary ? (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 font-normal text-muted-foreground" onClick={() => onOpen("review")} data-story-review-link="">Review</Button>
          ) : null}
          {writers.length ? (
            <div className="flex min-w-0 items-center gap-2 text-sm" data-story-writers="">
              <PeopleAvatars people={writers.map((writer) => ({ name: writer.name, avatarUrl: writer.avatarUrl ?? null }))} />
              <span className="truncate">{peopleLine(writers.map((writer) => writer.name))}</span>
              {planned?.editor ? <span className="truncate text-muted-foreground max-xl:hidden">· Edited by {planned.editor.name}</span> : null}
            </div>
          ) : null}
          {due ? <span className="text-sm text-muted-foreground">{due}</span> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
            {saving ? <Spinner className="size-3" /> : saveLabel === "Saved" ? <Check className="size-3" aria-hidden="true" /> : null}
            {saveLabel}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button ref={menuTrigger} type="button" variant="outline" size="icon-sm" aria-label="More story actions" />}>
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                {preview.available ? <DropdownMenuItem onClick={preview.toggle} data-story-preview=""><Eye aria-hidden="true" />{preview.previewing ? "Close preview" : "Preview"}</DropdownMenuItem> : null}
                <DropdownMenuItem onClick={() => setDetailsOpen(true)}><SlidersHorizontal aria-hidden="true" />Story details{publicationProblems && canEditPublication ? <Badge variant="destructive" className="ml-auto">{publicationProblems}</Badge> : null}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpen("history")}><History aria-hidden="true" />View history</DropdownMenuItem>
                {liveCoverage && id != null ? <DropdownMenuItem render={<ShellLink href={liveCoverage.fieldHref} />}><Smartphone aria-hidden="true" />Open in Field Mode</DropdownMenuItem> : null}
              </DropdownMenuGroup>
              {sidelineActions.length ? <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {sidelineActions.map((action) => <DropdownMenuItem key={action.key} variant={action.destructive ? "destructive" : undefined} onClick={action.run}>{action.label}</DropdownMenuItem>)}
                </DropdownMenuGroup>
              </> : null}
              {canEditPublication && !showPublish ? <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canPublish || publishing || saving || Boolean(scheduledAt) || !url.config} onClick={startPublish}>Publish now, without review</DropdownMenuItem>
              </> : null}
              {canEditPublication && id != null ? <>
                <DropdownMenuSeparator />
                {publicationActions.items}
              </> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {primary ? (
            <Button type="button" size="sm" onClick={primary.run} disabled={busy} data-primary-action="">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {primary.label}
              {busy ? null : <ArrowRight data-icon="inline-end" aria-hidden="true" />}
            </Button>
          ) : null}
          {showPublish ? (
            <Button ref={publishTrigger} type="button" size="sm" onClick={startPublish} disabled={!canPublish || publishing || saving || Boolean(scheduledAt) || !url.config}>
              {publishing ? <Spinner /> : null}
              {hasPublishedDoc ? "Publish changes" : "Publish"}
            </Button>
          ) : null}
        </div>
      </div>

      {context.readOnly ? <p className="text-sm text-muted-foreground">Someone else is editing this story. You are viewing it read-only.</p> : null}
      {routingFailed && run ? (
        <Alert variant="destructive" data-routing-failure="">
          <AlertTitle>This story can't be sent for review yet</AlertTitle>
          <AlertDescription>{run.failure} {isEditor ? "Fix the newsroom roles, then send it again." : "An editor has been notified."}</AlertDescription>
          {isEditor ? <AlertAction><Button type="button" size="sm" variant="outline" nativeButton={false} render={<ShellLink href={`${context.admin || "/admin"}/people?view=roles`} />}>Fix roles</Button></AlertAction> : null}
        </Alert>
      ) : null}
      {phase === "ready" && stale ? (
        <Alert data-approval-stale="">
          <AlertTitle>Changed since it was approved</AlertTitle>
          <AlertDescription>{run?.steps.find((step) => step.state === "stale")?.staleReason} Resubmit so that review can look again.</AlertDescription>
        </Alert>
      ) : null}

      {canEditPublication && id != null ? publicationActions.dialogs : null}

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" finalFocus={menuTrigger} className="gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Story details</SheetTitle>
            <SheetDescription>Appearance, publishing and the story's settings.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 p-4">
            <section className="grid gap-3" aria-labelledby="details-status">
              <DetailsHeading id="details-status">Story</DetailsHeading>
              <dl className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Stage</dt><dd><PhaseBadge phase={storedPhase} /></dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Publication</dt><dd><Badge variant={hasPublishedDoc ? "default" : "outline"}>{publication}</Badge></dd></div>
                {planning ? null : <>
                  {planned?.editor ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Editor</dt><dd>{planned.editor.name}</dd></div> : null}
                  {planned?.deadline ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Deadline</dt><dd>{formatDay(planned.deadline, context.timeZone)}</dd></div> : null}
                  {planned?.plannedPublication ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Publication target</dt><dd>{formatDay(planned.plannedPublication, context.timeZone)}</dd></div> : null}
                </>}
              </dl>
              {/* Editors set these here: the Plan tab that used to hold them is gone. */}
              {planning ? <PlanningProperties /> : null}
              {isEditor && !context.readOnly && id != null && !hasPublishedDoc ? <StageOverride context={context} phase={storedPhase} onChanged={() => { refresh(); void review.refetch(); }} /> : null}
            </section>

            <Separator />

            <section className="grid gap-3" aria-labelledby="details-appearance">
              <DetailsHeading id="details-appearance">Appearance</DetailsHeading>
              <FieldGroup className="gap-1">
                <Property label="Presentation">
                  <SettingSelect label="Presentation" options={STORY_PRESENTATION_OPTIONS} value={(presentation.value ?? "standard") as (typeof STORY_PRESENTATION_OPTIONS)[number]["value"]} onChange={(next) => presentation.setValue(next)} disabled={context.readOnly} />
                </Property>
                {presentation.value === "immersive" ? (
                  <Property label="Headline position">
                    <SettingSelect label="Headline position" options={IMMERSIVE_ALIGNMENT_OPTIONS} value={(alignment.value ?? "bottom-left") as (typeof IMMERSIVE_ALIGNMENT_OPTIONS)[number]["value"]} onChange={(next) => alignment.setValue(next)} disabled={context.readOnly} />
                  </Property>
                ) : null}
              </FieldGroup>
              {presentationResolution.custom || presentationResolution.requested !== presentationResolution.resolved
                ? <dl className="text-sm"><PresentationStatus resolution={presentationResolution} /></dl>
                : null}
            </section>

            <Separator />

            <section className="grid gap-3" aria-labelledby="details-publishing">
              <DetailsHeading id="details-publishing">Publishing</DetailsHeading>
              <div className="grid gap-3">
                {scheduledLabel ? <p className="text-sm"><span className="text-muted-foreground">Scheduled for </span>{scheduledLabel} <span className="text-muted-foreground">({context.timeZone})</span></p> : null}
                <StoryURL context={context} compact />
                {canEditPublication ? (
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => { setDetailsOpen(false); setReadinessOpen(true); }}>
                    {publicationProblems ? `${publicationProblems} publication ${publicationProblems === 1 ? "issue" : "issues"}` : "Publication checks"}
                  </Button>
                ) : null}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Ordinary Story problems that stop a submission: a focused Dialog, never a routing alert. */}
      <Dialog open={problems.length > 0} onOpenChange={(open) => { if (!open) setProblems([]); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto">
          <DialogHeader>
            <DialogTitle>Before sending this story</DialogTitle>
            <DialogDescription>Fix these, then submit it again.</DialogDescription>
          </DialogHeader>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">{problems.map((problem) => <li key={problem.field}>{problem.message}</li>)}</ul>
          <DialogFooter><Button type="button" onClick={() => setProblems([])}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmURL} onOpenChange={setConfirmURL}>
        <AlertDialogContent finalFocus={publishTrigger} className="max-h-[calc(100dvh-2rem)] overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Change the published URL?</AlertDialogTitle>
            <AlertDialogDescription>Byline will preserve the old address with a permanent redirect.</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid gap-1 text-sm [overflow-wrap:anywhere]">
            <dt className="font-medium">Old path</dt><dd>{changedPath?.old}</dd>
            <dt className="font-medium">New path</dt><dd>{newPath}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => { setConfirmURL(false); void publish(); }}>Publish with redirect</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={readinessOpen} onOpenChange={setReadinessOpen}>
        <DialogContent finalFocus={menuTrigger} className="max-h-[calc(100dvh-2rem)] overflow-auto">
          <DialogHeader><DialogTitle>Publication checks</DialogTitle><DialogDescription>Fix blocking issues before publishing. Editorial advisories are optional.</DialogDescription></DialogHeader>
          {editorial.length ? <ul className="grid gap-2 text-sm">{editorial.map((line) => <li key={line.path} className={line.level === "error" ? "text-destructive" : "text-muted-foreground"}>{line.level === "warning" ? "Advisory: " : ""}{line.message}</li>)}</ul> : null}
          {bodyProblems.length ? <ul className="grid gap-2 text-sm text-destructive">{bodyProblems.map((line) => <li key={line.id}>{line.explanation}</li>)}</ul> : null}
          <StoryMediaReadinessNotice report={mediaReadiness.report} onChanged={mediaReadiness.refresh} />
          {!editorial.length && !publicationProblems ? <p className="text-sm">No known issues. Byline runs final checks when you publish.</p> : null}
        </DialogContent>
      </Dialog>
    </header>
  );
}

/** The editor's stage override: the server checks who may, closes any open review and records it in History. */
function postStage(context: StoryScreenContext, status: string) {
  return postJson(context.api, `/byline/stories/${context.storyId}/workflow`, { status });
}

/**
 * The editor's manual stage override (docs/story-lifecycle.md#override): an
 * exception path in Story details, never the normal way a Story moves. It
 * closes an open review and History says so.
 */
function StageOverride({ context, phase, onChanged }: { context: StoryScreenContext; phase: EffectivePhase; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const options = PHASE_STATUSES.filter((status) => status.selectable).map((status) => ({ value: status.id, label: status.label }));
  return (
    <Property label="Change stage">
      <Select items={options} value={phase} disabled={busy} onValueChange={async (next) => {
        if (!next || next === phase) return;
        setBusy(true);
        try {
          await postStage(context, next);
          toast.success(`Stage changed to ${PHASE_LABELS[next as EffectivePhase]}. Any open review was closed.`);
          onChanged();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <SelectTrigger aria-label="Change stage (editor override)" size="sm" className="-ml-2 border-transparent bg-transparent px-2 font-normal hover:bg-muted"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </Property>
  );
}

/** The header of a focused Story view (Review, History, a Transcript): a way back and what this is, never a tab bar. */
export function FocusedHeader({ title, storyTitle, onBack, actions, backLabel = "Back to story" }: { title: string; storyTitle: string; onBack: () => void; actions?: ReactNode; backLabel?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3" data-focused-header="">
      <div className="flex min-w-0 flex-col gap-1">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          {backLabel}
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="truncate text-sm text-muted-foreground">{storyTitle || "Untitled story"}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * On screens too narrow for the Story workspace sidebar, the Story list opens
 * from here in a temporary sheet (the shell's, the same list the workspace
 * shows). The global navigation keeps its own trigger in the app header.
 */
function StorySwitchButton() {
  const { storyId, composition } = useShellLayout();
  const { openSheet } = useStorySwitcher();
  if (storyId === null || composition === "story-workspace") return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={openSheet} className="min-[1300px]:hidden" aria-haspopup="dialog" data-story-switch="">
      <List data-icon="inline-start" aria-hidden="true" />
      <span className="max-sm:sr-only">Switch story</span>
    </Button>
  );
}
