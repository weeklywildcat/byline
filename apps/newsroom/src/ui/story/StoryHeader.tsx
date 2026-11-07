"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { editorialReadiness } from "../../domain/story-readiness";
import type { ReadinessPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import { getJson } from "./api";
import { PublicationActions } from "./PublicationActions";
import { useStoryURL } from "./StoryURL";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { Check, List } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatDay } from "./parts";
import { useStoryField } from "./form";
import type { StoryScreenContext } from "./StoryScreen";
import { useOptionalWorkspace } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { useShellLayout } from "../shell/layout";
import { useStorySwitcher } from "../shell/StorySwitcher";
import { PresentationStatus, PreviewButton, useStoryPresentationResolution } from "./StoryPreviewControl";
import { StoryMediaReadinessNotice, useStoryMediaReadiness } from "./publication-readiness";
import { blockingLines } from "./publication-readiness-model";

/**
 * The Story header: what the story is, where it is in the newsroom's workflow
 * and, separately, its publication state. Publish is Payload's own publish
 * (the same form submit with `_status: "published"` that Payload's button
 * sends), shown only when the server grants publish permission. Workflow,
 * editor and deadline come from the shared Story Workspace data, so a change
 * made in the Plan tab shows here at once.
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
  const { value: headline } = useStoryField<string>("headline");
  const { value: section } = useStoryField<unknown>("section");
  const { value: contributors } = useStoryField<unknown>("contributors");
  const { value: format } = useStoryField<string>("format");
  const { value: videoUrl } = useStoryField<string>("video.url");
  const editorial = editorialReadiness({ headline, section, contributors, format, videoUrl });
  const [readinessOpen, setReadinessOpen] = useState(false);
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const readinessTrigger = useRef<HTMLButtonElement>(null);
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

  async function publish() {
    if (id === undefined) return;
    if (editorial.some((line) => line.level === "error")) { setReadinessOpen(true); return; }
    setPublishing(true);
    try {
      // The server decides at submit; asking it first means a known media problem never becomes a vague form error.
      if (!modified) {
        const preflight = await readiness.refetch().catch(() => null);
        if (preflight?.data?.checks.some((line) => line.state === "error")) {
          await mediaReadiness.check().catch(() => null);
          setReadinessOpen(true);
          return;
        }
      }
      const before = await mediaRefusal();
      if (before) {
        setReadinessOpen(true);
        return;
      }
      const result = await submit({ action: `${context.api}/stories/${id}?depth=0`, overrides: { _status: "published" } });
      if (result?.res.ok) {
        setUnpublishedVersionCount(0);
        setMostRecentVersionIsAutosaved(false);
        setHasPublishedDoc(true);
        refresh();
        toast.success(hasPublishedDoc ? "Changes published." : "Story published.");
      } else {
        // Payload already showed the refusal; when Media changed between the check and the submit, say which file and why.
        const after = await mediaRefusal();
        if (after) toast.error(`The story was not published: ${after}.`);
      }
    } catch {
      const after = await mediaRefusal();
      toast.error(after ? `The story was not published: ${after}.` : "The story could not be published. Check the highlighted fields.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-[1_1_18rem] text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{headline?.trim() || "Untitled story"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StorySwitchButton />
          <PreviewButton />
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
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Workflow</dt>
          <dd><Badge variant="secondary">{hasPublishedDoc ? "Published" : (planned?.workflow.label ?? "Pitch")}</Badge></dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Publication</dt>
          <dd><Badge variant={hasPublishedDoc ? "default" : "outline"}>{publication}</Badge></dd>
        </div>
        {scheduledLabel ? <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Scheduled publication</dt><dd>{scheduledLabel} ({context.timeZone})</dd>
        </div> : null}
        {planned?.plannedPublication ? <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Publication target</dt><dd>{formatDay(planned.plannedPublication, context.timeZone)}</dd>
        </div> : null}
        {planned?.deadline ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Story deadline</dt>
            <dd>{formatDay(planned.deadline, context.timeZone)}</dd>
          </div>
        ) : null}
        <PresentationStatus resolution={presentationResolution} />
        {planned?.editor ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Editor</dt>
            <dd>{planned.editor.name}</dd>
          </div>
        ) : null}
      </dl>
      {canEditPublication ? <div>
        <Button ref={readinessTrigger} type="button" size="sm" variant="outline" onClick={() => setReadinessOpen(true)} aria-haspopup="dialog">
          {problems ? `${problems} publication ${problems === 1 ? "issue" : "issues"}` : editorial.length ? "Publication checks · advisory" : readiness.data?.checks.every((line) => line.state === "pass") ? "Ready to publish" : "Publication checks"}
        </Button>
        <Dialog open={readinessOpen} onOpenChange={setReadinessOpen}>
          <DialogContent finalFocus={readinessTrigger} className="max-h-[calc(100dvh-2rem)] overflow-auto">
            <DialogHeader><DialogTitle>Publication checks</DialogTitle><DialogDescription>Fix blocking issues before publishing. Editorial advisories are optional.</DialogDescription></DialogHeader>
            {editorial.length ? <ul className="grid gap-2 text-sm">{editorial.map((line) => <li key={line.path} className={line.level === "error" ? "text-destructive" : "text-muted-foreground"}>{line.level === "warning" ? "Advisory: " : ""}{line.message}</li>)}</ul> : null}
            {bodyProblems.length ? <ul className="grid gap-2 text-sm text-destructive">{bodyProblems.map((line) => <li key={line.id}>{line.explanation}</li>)}</ul> : null}
            <StoryMediaReadinessNotice report={mediaReadiness.report} onChanged={mediaReadiness.refresh} />
            {!editorial.length && !problems ? <p className="text-sm">No known issues. Byline runs final checks when you publish.</p> : null}
          </DialogContent>
        </Dialog>
      </div> : null}
      {context.readOnly ? <p className="text-sm text-muted-foreground">Someone else is editing this story. You are viewing it read-only.</p> : null}
    </header>
  );
}

/**
 * On screens too narrow for the Story workspace sidebar, the Story list opens
 * from here in a temporary sheet (the shell's, the same list the workspace
 * shows). The global navigation keeps its own trigger in the app header.
 * CSS hides it at the workspace width before hydration; the shell's layout
 * decides after.
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
