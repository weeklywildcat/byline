"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { Check, List } from "lucide-react";
import { useState } from "react";
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
  const planned = workspace?.data.story;
  const { id, hasPublishPermission, hasPublishedDoc, unpublishedVersionCount, lastUpdateTime, setHasPublishedDoc, setUnpublishedVersionCount, setMostRecentVersionIsAutosaved, uploadStatus } = useDocumentInfo();
  const { submit } = useForm();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  const { value: headline } = useStoryField<string>("headline");
  const [publishing, setPublishing] = useState(false);
  const presentationResolution = useStoryPresentationResolution();
  const mediaReadiness = useStoryMediaReadiness(Boolean(hasPublishPermission) && !context.readOnly);

  const newerDraft = hasPublishedDoc && (unpublishedVersionCount > 0 || modified);
  const publication = !hasPublishedDoc ? "Draft" : newerDraft ? "Published · unpublished changes" : "Published";
  const saving = processing || background;
  const saveState = saving ? "Saving…" : modified ? "Unsaved changes" : lastUpdateTime ? "Saved" : "";
  const canPublish = Boolean(hasPublishPermission) && !context.readOnly && uploadStatus !== "uploading" && (!hasPublishedDoc || newerDraft);

  /** Why Media blocks publishing right now, from the server, or null. */
  async function mediaRefusal(): Promise<string | null> {
    const media = await mediaReadiness.check().catch(() => null);
    if (!media || media.ready) return null;
    const line = blockingLines(media)[0]?.text;
    return line ? line.replace(/\.$/, "") : "its media is still being prepared";
  }

  async function publish() {
    if (id === undefined) return;
    setPublishing(true);
    try {
      // The server decides at submit; asking it first means a known media problem never becomes a vague form error.
      const before = await mediaRefusal();
      if (before) {
        toast.error(`Can't publish yet: ${before}.`);
        return;
      }
      const result = await submit({ action: `${context.api}/stories/${id}?depth=0`, overrides: { _status: "published" } });
      if (result) {
        setUnpublishedVersionCount(0);
        setMostRecentVersionIsAutosaved(false);
        setHasPublishedDoc(true);
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
            <Button type="button" size="sm" onClick={publish} disabled={!canPublish || publishing}>
              {publishing ? <Spinner /> : null}
              {hasPublishedDoc ? "Publish changes" : "Publish"}
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Workflow</dt>
          <dd><Badge variant="secondary">{hasPublishedDoc ? "Published" : (planned?.workflow.label ?? "Pitch")}</Badge></dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Publication</dt>
          <dd><Badge variant={hasPublishedDoc ? "default" : "outline"}>{publication}</Badge></dd>
        </div>
        {planned?.deadline ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Deadline</dt>
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
      {hasPublishPermission && !context.readOnly ? <StoryMediaReadinessNotice report={mediaReadiness.report} onChanged={mediaReadiness.refresh} /> : null}
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
