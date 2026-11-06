"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { WORKFLOW_OPTIONS } from "../../domain/vocabulary";
import { formatDay } from "./parts";
import { useStoryField } from "./form";
import type { StoryScreenContext } from "./StoryScreen";
import type { StoryPlanDoc } from "./types";

function workflowLabel(stage: string | undefined, published: boolean) {
  if (published) return "Published";
  return WORKFLOW_OPTIONS.find((option) => option.value === stage)?.label ?? "Pitch";
}

/**
 * The Story header: what the story is, where it is in the newsroom's workflow
 * and, separately, its publication state. Publish is Payload's own publish
 * (the same form submit with `_status: "published"` that Payload's button
 * sends), shown only when the server grants publish permission.
 */
export function StoryHeader({ context, plan }: { context: StoryScreenContext; plan: StoryPlanDoc | null }) {
  const { id, hasPublishPermission, hasPublishedDoc, unpublishedVersionCount, lastUpdateTime, setHasPublishedDoc, setUnpublishedVersionCount, setMostRecentVersionIsAutosaved, uploadStatus } = useDocumentInfo();
  const { submit } = useForm();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  const { value: headline } = useStoryField<string>("headline");
  const [publishing, setPublishing] = useState(false);

  const newerDraft = hasPublishedDoc && (unpublishedVersionCount > 0 || modified);
  const publication = !hasPublishedDoc ? "Draft" : newerDraft ? "Published · unpublished changes" : "Published";
  const saving = processing || background;
  const saveState = saving ? "Saving…" : modified ? "Unsaved changes" : lastUpdateTime ? "Saved" : "";
  const canPublish = Boolean(hasPublishPermission) && !context.readOnly && uploadStatus !== "uploading" && (!hasPublishedDoc || newerDraft);

  async function publish() {
    if (id === undefined) return;
    setPublishing(true);
    try {
      const result = await submit({ action: `${context.api}/stories/${id}?depth=0`, overrides: { _status: "published" } });
      if (result) {
        setUnpublishedVersionCount(0);
        setMostRecentVersionIsAutosaved(false);
        setHasPublishedDoc(true);
        toast.success(hasPublishedDoc ? "Changes published." : "Story published.");
      }
    } catch {
      toast.error("The story could not be published. Check the highlighted fields.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{headline?.trim() || "Untitled story"}</h1>
        <div className="flex items-center gap-2">
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
          <dd><Badge variant="secondary">{workflowLabel(plan?.workflow, hasPublishedDoc)}</Badge></dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Publication</dt>
          <dd><Badge variant={hasPublishedDoc ? "default" : "outline"}>{publication}</Badge></dd>
        </div>
        {plan?.deadline ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Deadline</dt>
            <dd>{formatDay(plan.deadline, context.timeZone)}</dd>
          </div>
        ) : null}
        {plan?.editor && typeof plan.editor === "object" && plan.editor.name ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Editor</dt>
            <dd>{plan.editor.name}</dd>
          </div>
        ) : null}
      </dl>
      {context.readOnly ? <p className="text-sm text-muted-foreground">Someone else is editing this story. You are viewing it read-only.</p> : null}
    </header>
  );
}
