"use client";

import { InlineForm } from "@byline/newsroom-ui/components/inline-form";
import { workspaceKey } from "@byline/newsroom-screens/story/story-query";
import { articleNotesKey } from "@byline/newsroom-screens/workspace/workspace-query";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@byline/newsroom-ui/ui/dialog";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { StoryNotes as Notes } from "../../newsroom/story-notes";
import { getJson, patchJson, postJson } from "./api";
import { formatDay, SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

/**
 * Story notes: the private discussion on the whole Story, open until someone
 * resolves them, so they double as its outstanding questions. `plain` is
 * Plan's quiet presentation; History keeps the bordered one.
 */
export function StoryNotes({ context, plain = false }: { context: StoryScreenContext; plain?: boolean }) {
  const id = Number(context.storyId);
  const endpoint = `/byline/stories/${id}/notes`;
  const cache = useQueryClient();
  const [resolved, setResolved] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["byline", "story-notes", id, resolved, page], queryFn: () => getJson<Notes>(context.api, `${endpoint}?resolved=${resolved ? 1 : 0}&page=${page}`) });

  function refresh() {
    void cache.invalidateQueries({ queryKey: ["byline", "story-notes", id] });
    void cache.invalidateQueries({ queryKey: workspaceKey(id) });
    void cache.invalidateQueries({ queryKey: articleNotesKey(id) });
    if (context.shellQueries !== cache) {
      void context.shellQueries.invalidateQueries({ queryKey: workspaceKey(id) });
      void context.shellQueries.invalidateQueries({ queryKey: articleNotesKey(id) });
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError("");
    try {
      await postJson(context.api, endpoint, { text });
      refresh();
      setCreating(false); setText(""); setResolved(false); setPage(1);
      toast.success("Story note added.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const addNote = <Dialog open={creating} onOpenChange={(open) => { if (!busy) { setCreating(open); setError(""); } }}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Add note</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto">
        <DialogHeader><DialogTitle>Add a story note</DialogTitle><DialogDescription>Only the newsroom team for this story can read it. Notes apply to the story as a whole.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={create}>
          <Textarea aria-label="Note text" required maxLength={4000} rows={4} value={text} onChange={(event) => setText(event.target.value)} />
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy || !text.trim()}>Add note</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>;
  return <section id={plain ? "plan-story-notes" : "story-notes"} className={plain ? "grid scroll-mt-24 gap-2" : "grid gap-2 rounded-lg border p-3"} aria-label={plain ? undefined : "Story notes"} aria-labelledby={plain ? "plan-story-notes-title" : undefined}>
    {plain ? <div className="flex min-h-7 items-center justify-between gap-2">
      <h3 id="plan-story-notes-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Questions and notes {query.data?.summary.openCount ? <span className="ml-1 font-normal normal-case tabular-nums">{query.data.summary.openCount} open</span> : null}</h3>
      {addNote}
    </div> : <SectionHeading action={addNote}>Story notes {query.data ? <Badge variant="secondary">{query.data.summary.openCount} open</Badge> : null}</SectionHeading>}
    <p className="text-xs text-muted-foreground">Private discussion for the whole story. Resolve a note when its question is answered.</p>
    <div className="flex gap-1">
      <Button type="button" size="xs" variant={resolved ? "ghost" : "secondary"} aria-pressed={!resolved} onClick={() => { setResolved(false); setPage(1); }}>Open</Button>
      <Button type="button" size="xs" variant={resolved ? "secondary" : "ghost"} aria-pressed={resolved} onClick={() => { setResolved(true); setPage(1); }}>Resolved</Button>
    </div>
    {query.isError ? <p role="alert" className="text-sm">Notes could not be loaded. <Button type="button" size="xs" onClick={() => void query.refetch()}>Retry</Button></p> : query.isPending ? <p role="status" className="text-sm">Loading notes…</p> : !query.data.threads.length ? <p className="text-sm text-muted-foreground">{resolved ? "No resolved notes." : "No open notes. Add one to start a discussion."}</p> : null}
    <ItemGroup className="gap-2">{query.data?.threads.map((note) => <NoteThread key={note.id} context={context} note={note} path={`${endpoint}/${note.id}`} refresh={refresh} />)}</ItemGroup>
    {page > 1 || query.data?.hasNextPage ? <div className="flex gap-2">
      <Button type="button" size="xs" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <Button type="button" size="xs" variant="outline" disabled={!query.data?.hasNextPage} onClick={() => setPage(page + 1)}>Next</Button>
    </div> : null}
  </section>;
}

function NoteThread({ context, note, path, refresh }: { context: StoryScreenContext; note: Notes["threads"][number]; path: string; refresh: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(input: { text: string } | { resolved: boolean; expected: string }) {
    setBusy(true); setError("");
    try {
      await patchJson(context.api, path, input);
      refresh();
      if ("text" in input) setReply("");
      toast.success("text" in input ? "Reply added." : input.resolved ? "Note resolved." : "Note reopened.");
    } catch (error) {
      setError((error as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  return <Collapsible>
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle>{note.author.name} <time dateTime={note.createdAt} className="text-xs font-normal text-muted-foreground">{formatDay(note.createdAt, context.timeZone)}</time></ItemTitle>
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{note.text}</p>
        <CollapsibleTrigger render={<Button type="button" size="xs" variant="ghost" className="w-fit" />}>{note.replies.length ? `Replies (${note.replies.length})` : "Open thread"}</CollapsibleTrigger>
      </ItemContent>
      <CollapsibleContent className="w-full border-t pt-2">
        <div className="grid gap-2">{note.replies.map((entry, i) => <div key={entry.id ?? i} className="border-l-2 pl-2">
          <p className="text-xs text-muted-foreground">{entry.author.name} · {formatDay(entry.at, context.timeZone)}</p>
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{entry.text}</p>
        </div>)}</div>
        {!note.resolved ? <InlineForm label="Reply to note" className="mt-2 grid gap-2" onSubmit={() => { if (!busy && reply.trim()) void save({ text: reply }); }}>
          <Textarea aria-label="Reply text" required maxLength={4000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} />
          <Button type="button" size="xs" className="w-fit" disabled={busy || !reply.trim()} onClick={() => void save({ text: reply })}>Reply</Button>
        </InlineForm> : null}
        {note.canResolve ? <Button type="button" size="xs" variant="ghost" className="mt-2" disabled={busy} onClick={() => void save({ resolved: !note.resolved, expected: note.updatedAt })}>{note.resolved ? "Reopen note" : "Resolve note"}</Button> : null}
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </CollapsibleContent>
    </Item>
  </Collapsible>;
}
