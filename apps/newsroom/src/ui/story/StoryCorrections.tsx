"use client";

import { publicationLocalDateTime } from "@byline/content";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";
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
  const fields = useId();
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
    {corrections.isError ? <p role="alert" className="text-sm text-destructive">The notices could not be loaded. <Button type="button" size="xs" variant="outline" onClick={() => void corrections.refetch()}>Retry</Button></p> : corrections.isPending ? <p role="status" className="text-sm">Loading notices…</p> : !corrections.data.corrections.length ? <p className="text-sm text-muted-foreground">No public notices have been recorded.</p> : null}
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
        {dialog ? <form className="grid gap-3" onSubmit={save}>
          <Select items={CORRECTION_TYPE_OPTIONS} value={dialog.draft.type} onValueChange={(type) => { if (type) update({ type }); }}>
            <SelectTrigger aria-label="Notice type"><SelectValue /></SelectTrigger>
            <SelectContent>{CORRECTION_TYPE_OPTIONS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <label htmlFor={`${fields}-text`}>Public notice text</label>
          <Textarea id={`${fields}-text`} rows={4} required maxLength={2000} value={dialog.draft.text} onChange={(event) => update({ text: event.target.value })} />
          <label htmlFor={`${fields}-date`}>Correction date ({context.timeZone})</label>
          <Input id={`${fields}-date`} type="datetime-local" step={1} required value={dialog.draft.date} onChange={(event) => update({ date: event.target.value })} />
          <label htmlFor={`${fields}-from`}>Shown publicly from (optional)</label>
          <Input id={`${fields}-from`} type="datetime-local" step={1} value={dialog.draft.publishedAt} onChange={(event) => update({ publishedAt: event.target.value })} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy}>Save notice</Button></DialogFooter>
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
