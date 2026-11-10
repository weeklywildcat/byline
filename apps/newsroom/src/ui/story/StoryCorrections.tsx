"use client";

import { publicationLocalDateTime } from "@byline/content";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { SelectField, TextAreaField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CORRECTION_TYPE_OPTIONS } from "../../domain/vocabulary";
import type { StoryCorrections as Response } from "../../newsroom/story-corrections";
import { deleteJson, getJson, patchJson, postJson } from "./api";
import { formatDay, SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

type Row = Response["corrections"][number];
type Draft = { type: Row["type"]; text: string; date: string; publishedAt: string; expected?: string };

export function StoryCorrections({ context }: { context: StoryScreenContext }) {
  const endpoint = `/byline/stories/${context.storyId}/corrections`;
  const corrections = useQuery({ queryKey: ["story-corrections", context.storyId], queryFn: () => getJson<Response>(context.api, endpoint) });
  const [dialog, setDialog] = useState<{ id?: number; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const label = (type: Row["type"]) => CORRECTION_TYPE_OPTIONS.find((item) => item.value === type)?.label;
  const local = (value?: string | null) => value ? publicationLocalDateTime(value, context.timeZone) : "";

  function edit(row?: Row) {
    trigger.current = document.activeElement as HTMLElement | null;
    setError("");
    setDialog(row ? {
      id: row.id, draft: { type: row.type, text: row.text, date: local(row.date), publishedAt: local(row.publishedAt), expected: row.updatedAt }
    } : { draft: { type: "correction", text: "", date: local(new Date().toISOString()), publishedAt: "" } });
  }
  function update(delta: Partial<Draft>) {
    setDialog((current) => current && { ...current, draft: { ...current.draft, ...delta } });
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (deleting) await deleteJson(context.api, `${endpoint}/${deleting.id}`, { expected: deleting.updatedAt });
      else if (dialog?.id) await patchJson(context.api, `${endpoint}/${dialog.id}`, dialog.draft);
      else if (dialog) await postJson(context.api, endpoint, dialog.draft);
      toast.success(deleting ? "Notice removed." : "Notice saved.");
      setDialog(null); setDeleting(null);
      void corrections.refetch();
    } catch (error) {
      setError((error as Error).message);
      void corrections.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-3 border-t border-border pt-4" aria-label="Corrections and updates">
    <SectionHeading action={<Button ref={addTrigger} type="button" size="sm" variant="outline" onClick={() => edit()}>Add notice</Button>}>Corrections &amp; updates</SectionHeading>
    {corrections.isError ? <InlineAlert title="The notices could not be loaded." onAction={() => void corrections.refetch()} actionLabel="Retry" /> : corrections.isPending ? <div role="status" aria-label="Loading notices" className="grid gap-2"><Skeleton className="h-14 w-full" /></div> : !corrections.data.corrections.length ? <Empty className="border border-dashed py-6"><EmptyHeader><EmptyTitle>No public notices yet</EmptyTitle><EmptyDescription>Add a correction, clarification or update and it appears with the published story.</EmptyDescription></EmptyHeader></Empty> : null}
    <ItemGroup>{corrections.data?.corrections.map((row) => <Item key={row.id} variant="outline" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle>{label(row.type)}</ItemTitle>
        <p className="text-xs text-muted-foreground">{formatDay(row.date, context.timeZone)}{row.publishedAt && row.publishedAt !== row.date ? ` · Shown publicly from ${formatDay(row.publishedAt, context.timeZone)}` : ""}</p>
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{row.text}</p>
      </ItemContent>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="outline" aria-label={`Edit ${label(row.type)?.toLowerCase()}`} onClick={() => edit(row)}>Edit</Button>
        <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${label(row.type)?.toLowerCase()}`} onClick={() => { trigger.current = document.activeElement as HTMLElement; setError(""); setDeleting(row); }}>Remove</Button>
      </div>
    </Item>)}</ItemGroup>
    <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
      <DialogContent finalFocus={() => trigger.current ?? addTrigger.current} className="max-h-[calc(100dvh-2rem)] overflow-auto">
        <DialogHeader><DialogTitle>{dialog?.id ? "Edit notice" : "Add a public notice"}</DialogTitle><DialogDescription>This notice appears with the published story at the time you specify.</DialogDescription></DialogHeader>
        {dialog ? <form className="grid gap-4" onSubmit={save}>
          <FieldGroup>
            <SelectField label="Notice type" value={dialog.draft.type} options={CORRECTION_TYPE_OPTIONS} onChange={(type) => update({ type })} />
            <TextAreaField label="Public notice text" value={dialog.draft.text} onChange={(text) => update({ text })} maxLength={2000} rows={4} autoFocus />
            <DateTimeField label="Correction date" value={dialog.draft.date} onChange={(date) => update({ date })} timeZone={context.timeZone} seconds clearable={false} hint="When the correction or update was made." />
            <DateTimeField label="Shown publicly from" optional value={dialog.draft.publishedAt} onChange={(publishedAt) => update({ publishedAt })} timeZone={context.timeZone} seconds hint="Leave blank to show it from the correction date." />
          </FieldGroup>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy || !dialog.draft.text.trim() || !dialog.draft.date}>Save notice</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <AlertDialogContent finalFocus={() => trigger.current?.isConnected ? trigger.current : addTrigger.current}>
        <AlertDialogHeader><AlertDialogTitle>Remove this notice?</AlertDialogTitle><AlertDialogDescription>The notice will no longer appear with the story. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter><AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={busy} onClick={() => void save()}>Remove notice</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
