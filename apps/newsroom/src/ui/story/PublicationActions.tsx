"use client";

import { publicationLocalMinute } from "@byline/content";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { useDocumentInfo, useForm } from "@payloadcms/ui";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import type { Story } from "../../payload-types";
import { patchJson, postJson } from "./api";
import type { StoryScreenContext } from "./StoryScreen";
import { useShellNavigation } from "../shell/navigation";

type Props = {
  context: StoryScreenContext;
  page?: boolean;
  scheduledAt: string | null;
  changedPath: { old: string; next: string } | null;
  saving: boolean;
  canSchedule: boolean;
  onChanged: () => void;
};

export function PublicationActions({ context, page, scheduledAt, changedPath, saving, canSchedule, onChanged }: Props) {
  const { hasPublishedDoc, setData, setHasPublishedDoc, setUnpublishedVersionCount, setMostRecentVersionIsAutosaved, setLastUpdateTime, incrementVersionCount } = useDocumentInfo();
  const { reset } = useForm();
  const [dialog, setDialog] = useState<"schedule" | "unpublish" | "trash" | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [confirmPath, setConfirmPath] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathId = useId();
  const { navigate } = useShellNavigation();
  const kind = page ? "page" : "story";
  const collection = page ? "pages" : "stories";

  async function schedule(at: string | null) {
    setError("");
    setBusy(true);
    try {
      await postJson(context.api, `/byline/${collection}/${context.storyId}/schedule-publication`, { at, expected: scheduledAt, confirmedPath: confirmPath ? changedPath?.next : undefined });
      setDialog(null);
      toast.success(at ? "Publication scheduled." : "Scheduled publication cancelled.");
      onChanged();
    } catch (error) {
      const message = (error as Error).message;
      if (at) setError(message);
      else toast.error(message);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setError("");
    setBusy(true);
    try {
      const { doc } = await patchJson<{ doc: Story }>(context.api, `/${collection}/${context.storyId}?depth=0`, { _status: "draft" });
      await reset(doc);
      setData(doc);
      setHasPublishedDoc(false);
      setUnpublishedVersionCount(1);
      setMostRecentVersionIsAutosaved(false);
      setLastUpdateTime(Date.parse(doc.updatedAt));
      incrementVersionCount();
      setDialog(null);
      onChanged();
      toast.success(page ? "Page unpublished." : "Story unpublished.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash() {
    if (page || context.storyId == null) return;
    setError("");
    setBusy(true);
    try {
      const result = await postJson<{ id: number; cancelledScheduledPublication: boolean }>(
        context.api,
        `/byline/stories/${context.storyId}/trash`,
        {}
      );
      await invalidateStoryData(context.shellQueries, Number(context.storyId));
      setDialog(null);
      toast.success(
        result.cancelledScheduledPublication
          ? "Story moved to Trash. Scheduled publication cancelled."
          : "Story moved to Trash."
      );
      navigate(`${context.admin}/stories`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onSchedule(event: FormEvent) {
    event.preventDefault();
    if (!busy && time && (!changedPath || confirmPath)) void schedule(time);
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button ref={trigger} type="button" size="icon-sm" variant="outline" aria-label="Publication actions" disabled={saving || busy} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canSchedule} onClick={() => {
          setTime(scheduledAt ? publicationLocalMinute(scheduledAt, context.timeZone) : "");
          setError(""); setConfirmPath(false); setDialog("schedule");
        }}>{scheduledAt ? "Reschedule publication" : "Schedule publication"}</DropdownMenuItem>
        {scheduledAt ? <DropdownMenuItem onClick={() => void schedule(null)}>Cancel scheduled publication</DropdownMenuItem> : null}
        {hasPublishedDoc ? <DropdownMenuItem variant="destructive" onClick={() => { setError(""); setDialog("unpublish"); }}>Unpublish…</DropdownMenuItem> : null}
        {!page ? <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { setError(""); setDialog("trash"); }}>
            <Trash2 aria-hidden="true" />
            Move to trash…
          </DropdownMenuItem>
        </> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={dialog === "schedule"} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
      <DialogContent finalFocus={trigger} className="max-h-[calc(100dvh-2rem)] overflow-auto">
        <DialogHeader><DialogTitle>{scheduledAt ? "Reschedule publication" : "Schedule publication"}</DialogTitle>
          <DialogDescription>Byline will publish the latest saved changes at this time if the document passes publication checks.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSchedule}>
          <FieldGroup>
            <DateTimeField label="Publish at" value={time} onChange={setTime} timeZone={context.timeZone} />
            {changedPath ? <Field orientation="horizontal">
              <Checkbox id={pathId} checked={confirmPath} onCheckedChange={(checked) => setConfirmPath(checked === true)} />
              <FieldLabel htmlFor={pathId} className="font-normal [overflow-wrap:anywhere]">Publish at {changedPath.next}. Preserve {changedPath.old} with a permanent redirect.</FieldLabel>
            </Field> : null}
          </FieldGroup>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy || !canSchedule || !time || (Boolean(changedPath) && !confirmPath)}>{busy ? "Saving…" : "Save schedule"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={dialog === "unpublish"} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
      <AlertDialogContent finalFocus={trigger}>
        <AlertDialogHeader><AlertDialogTitle>Unpublish this {kind}?</AlertDialogTitle><AlertDialogDescription>The {kind} will come off the public site on its next build. Its draft and publication date will remain.</AlertDialogDescription></AlertDialogHeader>
        {scheduledAt ? <p className="text-sm">There is still a scheduled publication. Cancel it first to keep this {kind} offline.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter><AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={busy || Boolean(scheduledAt)} onClick={() => void unpublish()}>{busy ? "Unpublishing…" : "Unpublish"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {!page ? <AlertDialog open={dialog === "trash"} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
      <AlertDialogContent finalFocus={trigger} size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Move this story to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasPublishedDoc
              ? "It will disappear from active newsroom lists now and come off the public site on the next build. Its drafts, history, planning work and byline will stay recoverable."
              : "It will disappear from active newsroom lists. Its drafts, history, planning work and byline will stay recoverable."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {scheduledAt ? <p className="text-sm text-muted-foreground">Its scheduled publication will be cancelled automatically.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void moveToTrash()}>
            {busy ? "Moving…" : "Move to Trash"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog> : null}
  </>;
}
