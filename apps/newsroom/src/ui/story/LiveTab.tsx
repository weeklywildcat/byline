"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Label } from "@byline/newsroom-ui/ui/label";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Pin, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { LiveDeskResponse, LiveDeskUpdate } from "../../newsroom/live-coverage";
import { LIVE_TEXT_MAX } from "../../newsroom/live-text";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import { deleteJson, getJson, patchJson, postJson } from "./api";
import { SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase()).join("") || "?";

function timeLabel(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

type Draft = { title: string; text: string; photo: LiveDeskUpdate["photo"]; pinned: boolean };
const EMPTY: Draft = { title: "", text: "", photo: null, pinned: false };

/**
 * The live desk: post, edit, pin, publish and remove a story's live updates.
 * It talks to `/api/byline/stories/:id/live`, which applies the `live-updates`
 * collection's own access: managers write, only editors publish what readers
 * can see, and pinning replaces the previous key update.
 */
export function LiveTab({ context }: { context: StoryScreenContext }) {
  const id = Number(context.storyId);
  const endpoint = `/byline/stories/${id}/live`;
  const cache = useQueryClient();
  const picker = useBylineMediaPicker();
  const key = ["byline", "story-live", id];
  const desk = useQuery({ queryKey: key, queryFn: () => getJson<LiveDeskResponse>(context.api, endpoint), refetchInterval: 30_000 });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [removing, setRemoving] = useState<LiveDeskUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const data = desk.data;
  const canWrite = data?.canManage === true && !context.readOnly;
  const canPublish = data?.canPublish === true;

  const refresh = () => cache.invalidateQueries({ queryKey: key });
  async function run<T>(work: () => Promise<T>, success: string): Promise<T | undefined> {
    setBusy(true);
    try {
      const result = await work();
      await refresh();
      toast.success(success);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Byline could not save that update.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const payload = (value: Draft, state?: "draft" | "published") => ({
    title: value.title, text: value.text, photoId: value.photo?.id ?? null, pinned: value.pinned, ...(state ? { state } : {})
  });

  async function post(state: "draft" | "published") {
    if (!draft.text.trim()) return;
    if (await run(() => postJson(context.api, endpoint, payload(draft, state)), state === "published" ? "Update published." : "Draft saved.")) setDraft(EMPTY);
  }

  async function pickPhoto(set: (photo: LiveDeskUpdate["photo"]) => void) {
    const [chosen] = await picker.pick("photo", { title: "Choose a photo for this update", buttonLabel: "Use photo", multiple: false });
    if (chosen) set({ id: Number(chosen.id), alt: chosen.title ?? "", previewUrl: chosen.previewUrl ?? null });
  }

  if (desk.isPending) return <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading live coverage…</p>;
  if (desk.isError || !data) return <p className="py-8 text-center text-sm text-destructive" role="alert">The live desk couldn't load. {desk.error instanceof Error ? desk.error.message : ""}</p>;

  const form = (value: Draft, set: (next: Draft) => void, name: string) => (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-title`}>Headline <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id={`${name}-title`} maxLength={200} value={value.title} onChange={(event) => set({ ...value, title: event.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-text`}>Update</Label>
        <Textarea id={`${name}-text`} rows={4} required maxLength={LIVE_TEXT_MAX} value={value.text} placeholder="What should readers know right now? Blank line for a new paragraph, “- ” for a list; links become links." onChange={(event) => set({ ...value, text: event.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {value.photo ? (
          <div className="flex items-center gap-2 rounded-md border p-1 pr-2 text-sm">
            {value.photo.previewUrl ? <img src={value.photo.previewUrl} alt="" className="size-10 rounded object-cover" /> : null}
            <span className="max-w-40 truncate">{value.photo.alt || "Photo"}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove photo" onClick={() => set({ ...value, photo: null })}><X aria-hidden="true" /></Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void pickPhoto((photo) => set({ ...value, photo }))}><ImagePlus data-icon="inline-start" aria-hidden="true" />Add photo</Button>
        )}
        {canPublish ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={value.pinned} onCheckedChange={(checked) => set({ ...value, pinned: checked === true })} />
            Pin as the key update
          </Label>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="grid gap-4" aria-labelledby="live-desk-heading">
      <SectionHeading action={<div className="flex items-center gap-2">{data.status === "live" ? <Badge variant="destructive">Live</Badge> : data.status === "ended" ? <Badge variant="outline">Ended</Badge> : <Badge variant="outline">Off</Badge>}</div>}>
        <span id="live-desk-heading">Live updates</span>
      </SectionHeading>

      {data.status === "off" ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Live coverage is off. Start it from Story details to publish timestamped updates while an event unfolds.</p> : null}
      {!data.storyPublished ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Updates stay private until this story is published.</p> : null}

      {canWrite ? (
        // Not a <form>: this tab renders inside Payload's document form, and forms cannot nest.
        <div role="group" className="grid gap-3 rounded-lg border p-4" aria-label="Post an update">
          {form(draft, setDraft, "new")}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy || !draft.text.trim()} onClick={() => void post(canPublish ? "published" : "draft")}>{canPublish ? "Publish update" : "Save draft"}</Button>
            {canPublish ? <Button type="button" variant="outline" disabled={busy || !draft.text.trim()} onClick={() => void post("draft")}>Save as draft</Button> : <span className="text-xs text-muted-foreground">An editor publishes drafts.</span>}
          </div>
        </div>
      ) : null}

      {!data.updates.length ? <p className="py-6 text-center text-sm text-muted-foreground">No updates yet.</p> : null}
      <ol className="grid gap-3" aria-label="Updates, newest first">
        {data.updates.map((update) => {
          const isEditing = editing?.id === update.id;
          const publicUpdate = update.state === "published" && data.storyPublished;
          // An update readers can see belongs to editors; staff change their own drafts.
          const mayChange = canWrite && (canPublish || !publicUpdate);
          return (
            <li key={update.id} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {update.author ? (
                  <span className="flex items-center gap-2">
                    <Avatar size="sm" aria-hidden="true">{update.author.avatarUrl ? <AvatarImage src={update.author.avatarUrl} alt="" /> : null}<AvatarFallback>{initials(update.author.name)}</AvatarFallback></Avatar>
                    <span className="font-medium">{update.author.name}</span>
                  </span>
                ) : null}
                <time className="text-muted-foreground" dateTime={update.publishedAt}>{timeLabel(update.publishedAt, context.timeZone)}</time>
                {update.state === "draft" ? <Badge variant="outline">Draft</Badge> : null}
                {update.pinned ? <Badge variant="secondary"><Pin data-icon="inline-start" aria-hidden="true" />Key update</Badge> : null}
              </div>

              {isEditing ? (
                <div role="group" className="grid gap-3" aria-label="Edit update">
                  {form(editing.draft, (next) => setEditing({ id: update.id, draft: next }), `edit-${update.id}`)}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy || !editing.draft.text.trim()} onClick={() => void run(() => patchJson(context.api, `${endpoint}/${update.id}`, payload(editing.draft)), "Update saved.").then((saved) => { if (saved) setEditing(null); })}>Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {update.title ? <h3 className="text-base font-semibold">{update.title}</h3> : null}
                  <p className="text-sm whitespace-pre-wrap">{update.text}</p>
                  {update.photo?.previewUrl ? <img src={update.photo.previewUrl} alt={update.photo.alt} className="max-h-56 w-fit rounded-md object-cover" /> : null}
                  {mayChange ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing({ id: update.id, draft: { title: update.title, text: update.text, photo: update.photo, pinned: update.pinned } })}>Edit</Button>
                      {canPublish ? (
                        <>
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => patchJson(context.api, `${endpoint}/${update.id}`, { state: update.state === "draft" ? "published" : "draft" }), update.state === "draft" ? "Update published." : "Update moved to drafts.")}>{update.state === "draft" ? "Publish" : "Unpublish"}</Button>
                          {update.state === "published" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => patchJson(context.api, `${endpoint}/${update.id}`, { pinned: !update.pinned }), update.pinned ? "Update unpinned." : "Pinned as the key update.")}>{update.pinned ? "Unpin" : "Pin"}</Button> : null}
                        </>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setRemoving(update)}>Delete</Button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ol>
      {data.hasMore ? <p className="text-center text-xs text-muted-foreground">Showing the latest {data.updates.length} updates.</p> : null}

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this update?</AlertDialogTitle>
            <AlertDialogDescription>{removing?.state === "published" && data.storyPublished ? "It disappears from the live coverage readers see at the next publication." : "This draft is removed."} This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => { const target = removing; if (target) void run(() => deleteJson(context.api, `${endpoint}/${target.id}`, {}), "Update deleted.").then(() => setRemoving(null)); }}>Delete update</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
