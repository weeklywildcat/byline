"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ComponentType } from "react";
import { toast } from "sonner";
import type { LiveDeskResponse, LiveDeskUpdate } from "../../newsroom/live-coverage";
import { deleteJson, patchJson } from "../story/api";
import { liveEndpoint, liveKey, type LiveDraft } from "./api";
import type { TimelineControls } from "./LiveTimeline";

export type LiveFieldsComponent = ComponentType<{ value: LiveDraft; onChange: (next: LiveDraft) => void; name: string; tap?: boolean }>;

/**
 * The live desk's timeline actions, shared by Write and Field (docs/live-coverage.md): edit, publish or unpublish,
 * pin as the key update, delete. The server decides every one again (newsroom/live-coverage.ts); this only
 * offers what the desk says the person may do. Write edits with a photo; Field edits the words only, so it
 * passes its own fields and never loads the Media picker.
 */
export function useLiveDeskControls({ api, storyId, desk, readOnly = false, busy = false, tap = false, Fields, withPhoto = false }: {
  api: string;
  storyId: number;
  desk: LiveDeskResponse | undefined;
  readOnly?: boolean;
  busy?: boolean;
  /** Field: 44px controls. */
  tap?: boolean;
  Fields: LiveFieldsComponent;
  /** Write: the edit includes the photo. */
  withPhoto?: boolean;
}) {
  const cache = useQueryClient();
  const [editing, setEditing] = useState<{ id: number; draft: LiveDraft } | null>(null);
  const [removing, setRemoving] = useState<LiveDeskUpdate | null>(null);
  const [working, setWorking] = useState(false);
  const endpoint = liveEndpoint(storyId);

  const run = useCallback(async <T,>(work: () => Promise<T>, success: string | ((result: T) => string)): Promise<T | undefined> => {
    setWorking(true);
    try {
      const result = await work();
      // The timeline is what the person is looking at; Field's own views catch up behind it.
      void cache.invalidateQueries({ queryKey: ["byline", "field"] });
      await cache.invalidateQueries({ queryKey: liveKey(storyId) });
      toast.success(typeof success === "function" ? success(result) : success);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Byline could not save that update.");
      return undefined;
    } finally {
      setWorking(false);
    }
  }, [cache, storyId]);

  const size = tap ? "min-h-11 px-4 text-base" : "";
  const controls: TimelineControls | undefined = desk ? {
    canPublish: desk.canPublish && !readOnly,
    canPublishNow: desk.canPublishNow && !readOnly,
    busy: working || busy,
    editingId: editing?.id ?? null,
    // An update readers can see belongs to editors and direct publishers; staff change their own drafts.
    canChange: (update) => !readOnly && (desk.canPublish || (update.state === "draft" && (desk.canManage || update.author?.id === desk.me.id))),
    renderEditor: (update) => (
      <div role="group" className="grid gap-3" aria-label="Edit live update">
        <Fields value={editing!.draft} onChange={(next) => setEditing({ id: update.id, draft: next })} name={`edit-${update.id}`} tap={tap} />
        <div className="flex gap-2">
          <Button type="button" size="sm" className={size} disabled={working || !editing!.draft.text.trim()} onClick={() => void run(() => patchJson(api, `${endpoint}/${update.id}`, { title: editing!.draft.title, text: editing!.draft.text, ...(withPhoto ? { photoId: editing!.draft.photo?.id ?? null } : {}) }), "Update saved.").then((saved) => { if (saved) setEditing(null); })}>Save</Button>
          <Button type="button" size="sm" variant="ghost" className={size} onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    ),
    onEdit: (update) => setEditing({ id: update.id, draft: { title: update.title, text: update.text, photo: update.photo, pinned: update.pinned } }),
    onPublish: (update) => void run(() => patchJson(api, `${endpoint}/${update.id}`, { state: update.state === "draft" ? "published" : "draft" }), update.state === "draft" ? "Update published." : "Update moved to drafts."),
    onPin: (update) => void run(() => patchJson(api, `${endpoint}/${update.id}`, { pinned: !update.pinned }), update.pinned ? "Update unpinned." : "Pinned as the key update."),
    onDelete: (update) => setRemoving(update)
  } : undefined;

  const dialog = (
    <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this live update?</AlertDialogTitle>
          <AlertDialogDescription>{removing?.state === "published" && desk?.storyPublished ? "It disappears from the live coverage readers see." : "This draft is removed."} This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" className={size} disabled={working}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" className={size} disabled={working} onClick={() => { const target = removing; if (target) void run(() => deleteJson(api, `${endpoint}/${target.id}`, {}), "Update deleted.").then(() => setRemoving(null)); }}>Delete update</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { controls, dialog, run, working };
}
