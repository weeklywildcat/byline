"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import type { ReadinessPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import { useOptionalWorkspace } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, List, PanelRight, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { IMMERSIVE_ALIGNMENT_OPTIONS, STORY_PRESENTATION_OPTIONS } from "../../domain/vocabulary";
import { editorialReadiness } from "../../domain/story-readiness";
import { LiveBadge } from "../live/LiveCoverageSection";
import { useLiveCoverage } from "../live/LiveCoverageProvider";
import { useShellLayout } from "../shell/layout";
import { ShellLink } from "../shell/navigation";
import { useStorySwitcher } from "../shell/StorySwitcher";
import { getJson } from "./api";
import { useStoryField } from "./form";
import { formatDay, Property } from "./parts";
import { PublicationActions } from "./PublicationActions";
import { blockingLines } from "./publication-readiness-model";
import { StoryMediaReadinessNotice, useStoryMediaReadiness } from "./publication-readiness";
import { PresentationStatus, PreviewButton, useStoryPresentationResolution } from "./StoryPreviewControl";
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

/**
 * The Story header is document chrome, not article metadata. Writers get the
 * actions they need constantly; secondary document properties live in the
 * Details sheet. Payload still owns the form, autosave, versions and publish
 * submit underneath this surface.
 */
export function StoryHeader({ context }: { context: StoryScreenContext }) {
  const workspace = useOptionalWorkspace();
  const workspaceQueries = useQueryClient();
  const planned = workspace?.data.story;
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
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const url = useStoryURL(context);
  const newPath = url.proposedPath();
  const [confirmURL, setConfirmURL] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const presentationResolution = useStoryPresentationResolution();
  const mediaReadiness = useStoryMediaReadiness(Boolean(hasPublishPermission) && !context.readOnly);

  const newerDraft = hasPublishedDoc && (unpublishedVersionCount > 0 || modified);
  const scheduledAt = planned?.publicationState.scheduledAt ?? null;
  const scheduledLabel = scheduledAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: context.timeZone }).format(new Date(scheduledAt)) : null;
  const priorPath = url.config?.path || url.config?.previousPath;
  const changedPath = priorPath && newPath && newPath !== priorPath ? { old: priorPath, next: newPath } : null;
  const canEditPublication = Boolean(hasPublishPermission) && !context.readOnly;
  const publication = !hasPublishedDoc ? "Draft" : newerDraft ? "Published · unpublished changes" : "Published";
  const saving = processing || background;
  const saveState = saving ? "Saving…" : modified ? "Unsaved changes" : lastUpdateTime ? "Saved" : "";
  const canPublish = Boolean(hasPublishPermission) && !context.readOnly && uploadStatus !== "uploading" && (!hasPublishedDoc || newerDraft);

  const readiness = useQuery({
    queryKey: ["story-publication-readiness", id, lastUpdateTime],
    queryFn: () => getJson<ReadinessPayload>(context.api, `/byline/stories/${id}/readiness`),
    enabled: canEditPublication && id != null && !modified && !saving && readinessOpen
  });
  const bodyProblems = modified ? [] : readiness.data?.checks.filter((line) => line.id.startsWith("body-")) ?? [];
  const problems = bodyProblems.length + editorial.filter((line) => line.level === "error").length + (mediaReadiness.report?.items.filter((item) => item.state !== "ready").length ?? 0);

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

  const liveDesk = liveCoverage?.desk;

  return (
    <header className="flex flex-col gap-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2">
          <StorySwitchButton />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Story</p>
              {liveDesk?.mode === "live" && liveDesk.status !== "off" ? <LiveBadge desk={liveDesk} timeZone={context.timeZone} /> : null}
            </div>
            <p className="truncate text-sm font-medium">{headline.value?.trim() || "Untitled story"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Field Mode for this Story: straight to it, never the generic "What are you covering?" picker. */}
          {liveCoverage && id != null ? (
            <Button type="button" nativeButton={false} variant="outline" size="sm" className="no-underline max-sm:min-h-11 max-sm:min-w-11" render={<ShellLink href={liveCoverage.fieldHref} />}>
              <Smartphone data-icon="inline-start" aria-hidden="true" />
              <span className="max-sm:sr-only">Field Mode</span>
            </Button>
          ) : null}
          <PreviewButton />
          <Button ref={detailsTrigger} type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setDetailsOpen(true)}>
            <PanelRight data-icon="inline-start" aria-hidden="true" />
            <span className="max-sm:sr-only">Details</span>
            {problems ? <Badge variant="destructive">{problems}</Badge> : null}
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
            {saving ? <Spinner className="size-3" /> : saveState === "Saved" ? <Check className="size-3" aria-hidden="true" /> : null}
            {saveState}
          </span>
          {hasPublishPermission ? (
            <Button ref={publishTrigger} type="button" size="sm" onClick={() => {
              if (changedPath) setConfirmURL(true);
              else void publish();
            }} disabled={!canPublish || publishing || saving || Boolean(scheduledAt) || !url.config}>
              {publishing ? <Spinner /> : null}
              {hasPublishedDoc ? "Publish changes" : "Publish"}
            </Button>
          ) : null}
          {canEditPublication && id != null ? <PublicationActions context={context} scheduledAt={scheduledAt} changedPath={changedPath} saving={saving || modified || publishing} canSchedule={(!hasPublishedDoc || newerDraft) && !modified && !saving} onChanged={refresh} /> : null}
        </div>
      </div>

      {context.readOnly ? <p className="text-sm text-muted-foreground">Someone else is editing this story. You are viewing it read-only.</p> : null}

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Story details</SheetTitle>
            <SheetDescription>Appearance and publishing information. Live coverage is in Write.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 p-4">
            <section className="grid gap-3" aria-labelledby="details-status">
              <DetailsHeading id="details-status">Story</DetailsHeading>
              <dl className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Workflow</dt><dd><Badge variant="secondary">{hasPublishedDoc ? "Published" : (planned?.workflow.label ?? "Pitch")}</Badge></dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Publication</dt><dd><Badge variant={hasPublishedDoc ? "default" : "outline"}>{publication}</Badge></dd></div>
                {planned?.editor ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Editor</dt><dd>{planned.editor.name}</dd></div> : null}
                {planned?.deadline ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Deadline</dt><dd>{formatDay(planned.deadline, context.timeZone)}</dd></div> : null}
                {planned?.plannedPublication ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Publication target</dt><dd>{formatDay(planned.plannedPublication, context.timeZone)}</dd></div> : null}
              </dl>
            </section>

            <Separator />

            <section className="grid gap-3" aria-labelledby="details-appearance">
              <DetailsHeading id="details-appearance">Appearance</DetailsHeading>
              <FieldGroup className="gap-1">
                <Property label="Presentation">
                  <SettingSelect
                    label="Presentation"
                    options={STORY_PRESENTATION_OPTIONS}
                    value={(presentation.value ?? "standard") as (typeof STORY_PRESENTATION_OPTIONS)[number]["value"]}
                    onChange={(next) => presentation.setValue(next)}
                    disabled={context.readOnly}
                  />
                </Property>
                {presentation.value === "immersive" ? (
                  <Property label="Headline position">
                    <SettingSelect
                      label="Headline position"
                      options={IMMERSIVE_ALIGNMENT_OPTIONS}
                      value={(alignment.value ?? "bottom-left") as (typeof IMMERSIVE_ALIGNMENT_OPTIONS)[number]["value"]}
                      onChange={(next) => alignment.setValue(next)}
                      disabled={context.readOnly}
                    />
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
                    {problems ? `${problems} publication ${problems === 1 ? "issue" : "issues"}` : "Publication checks"}
                  </Button>
                ) : null}
              </div>
            </section>

          </div>
        </SheetContent>
      </Sheet>

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
        <DialogContent finalFocus={detailsTrigger} className="max-h-[calc(100dvh-2rem)] overflow-auto">
          <DialogHeader><DialogTitle>Publication checks</DialogTitle><DialogDescription>Fix blocking issues before publishing. Editorial advisories are optional.</DialogDescription></DialogHeader>
          {editorial.length ? <ul className="grid gap-2 text-sm">{editorial.map((line) => <li key={line.path} className={line.level === "error" ? "text-destructive" : "text-muted-foreground"}>{line.level === "warning" ? "Advisory: " : ""}{line.message}</li>)}</ul> : null}
          {bodyProblems.length ? <ul className="grid gap-2 text-sm text-destructive">{bodyProblems.map((line) => <li key={line.id}>{line.explanation}</li>)}</ul> : null}
          <StoryMediaReadinessNotice report={mediaReadiness.report} onChanged={mediaReadiness.refresh} />
          {!editorial.length && !problems ? <p className="text-sm">No known issues. Byline runs final checks when you publish.</p> : null}
        </DialogContent>
      </Dialog>
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
