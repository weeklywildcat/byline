"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardFooter } from "@byline/newsroom-ui/ui/card";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { RadioTower, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LiveDeskResponse, LiveDeskUpdate, LivePostResult } from "../../newsroom/live-coverage";
import { ShellLink } from "../shell/navigation";
import { deleteJson, patchJson, postJson } from "../story/api";
import { EMPTY_DRAFT, liveEndpoint, liveKey, postedMessage, type LiveDraft } from "./api";
import { LiveDeliveryButtons } from "./LiveDelivery";
import { LiveFields } from "./LiveFields";
import { useLiveCoverage } from "./LiveCoverageProvider";
import { LiveTimeline, liveTime, type TimelineControls } from "./LiveTimeline";

/** The "● LIVE" badge: the word is always there, never color alone. */
export function LiveBadge({ desk, timeZone }: { desk: Pick<LiveDeskResponse, "status" | "endedAt">; timeZone: string }) {
  if (desk.status === "live") return <Badge variant="destructive" data-live-badge="live"><span aria-hidden="true">●</span> LIVE</Badge>;
  if (desk.status === "ended") return <Badge variant="outline" data-live-badge="ended">Ended{desk.endedAt ? ` · ${liveTime(desk.endedAt, timeZone)}` : ""}</Badge>;
  return <Badge variant="outline" data-live-badge="off">Not started</Badge>;
}

/** "Open Field Mode": straight to this Story in Field, skipping the generic picker. */
export function OpenFieldButton({ href, prominent }: { href: string; prominent?: boolean }) {
  return (
    <Button type="button" nativeButton={false} variant={prominent ? "default" : "outline"} size="sm" className="no-underline max-sm:min-h-11" render={<ShellLink href={href} />}>
      <Smartphone data-icon="inline-start" aria-hidden="true" />Open Field Mode
    </Button>
  );
}

const names = (desk: LiveDeskResponse) => (desk.publishers.length ? desk.publishers.map((person) => person.name).join(", ") : "none yet");

/**
 * LIVE COVERAGE, under the article in Write (never a top-level tab): the status, the composer, the timeline.
 * Standard mode renders none of it. A Story stays one Story; this is the same record Field posts to.
 */
export function LiveCoverageSection() {
  const live = useLiveCoverage();
  const cache = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<LiveDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{ id: number; draft: LiveDraft } | null>(null);
  const [removing, setRemoving] = useState<LiveDeskUpdate | null>(null);
  const [working, setWorking] = useState(false);
  const desk = live?.desk;
  const mode = desk?.mode;

  // `?tab=live` (the old Live tab's address) and Field's "Open full story" land here, on this section.
  useEffect(() => {
    if (mode !== "live") return;
    const wants = new URLSearchParams(window.location.search).get("tab") === "live" || window.location.hash === "#live-coverage";
    if (!wants) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const land = () => heading.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    land();
    heading.current?.focus({ preventScroll: true });
    // The article editor above finishes mounting after this section does and moves it; land once more.
    const again = window.setTimeout(land, 800);
    return () => window.clearTimeout(again);
  }, [mode]);

  if (!live || !desk || desk.mode !== "live") return null;
  const { api, storyId, timeZone, readOnly } = live;
  const endpoint = liveEndpoint(storyId);
  const refresh = () => cache.invalidateQueries({ queryKey: liveKey(storyId) });
  const control = desk.canControl && !readOnly;

  async function run<T>(work: () => Promise<T>, success: string | ((result: T) => string)): Promise<T | undefined> {
    setWorking(true);
    try {
      const result = await work();
      await refresh();
      toast.success(typeof success === "function" ? success(result) : success);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Byline could not save that update.");
      return undefined;
    } finally {
      setWorking(false);
    }
  }

  const body = (value: LiveDraft) => ({ title: value.title, text: value.text, photoId: value.photo?.id ?? null, pinned: value.pinned });

  async function deliver(delivery: "publish" | "desk") {
    if (!draft.text.trim()) return;
    const result = await run(() => postJson<LivePostResult>(api, endpoint, { ...body(draft), delivery }), (posted) => postedMessage(posted, delivery));
    if (result) setDraft(EMPTY_DRAFT);
  }

  const controls: TimelineControls = {
    canPublish: desk.canPublish && !readOnly,
    busy: working || live.busy,
    editingId: editing?.id ?? null,
    // An update readers can see belongs to editors and direct publishers; staff change their own drafts.
    canChange: (update) => !readOnly && (desk.canPublish || (update.state === "draft" && (desk.canManage || update.author?.id === live.userId))),
    renderEditor: (update) => (
      <div role="group" className="grid gap-3" aria-label="Edit live update">
        <LiveFields value={editing!.draft} onChange={(next) => setEditing({ id: update.id, draft: next })} name={`edit-${update.id}`} canPin={false} />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={working || !editing!.draft.text.trim()} onClick={() => void run(() => patchJson(api, `${endpoint}/${update.id}`, { title: editing!.draft.title, text: editing!.draft.text, photoId: editing!.draft.photo?.id ?? null }), "Update saved.").then((saved) => { if (saved) setEditing(null); })}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    ),
    onEdit: (update) => setEditing({ id: update.id, draft: { title: update.title, text: update.text, photo: update.photo, pinned: update.pinned } }),
    onPublish: (update) => void run(() => patchJson(api, `${endpoint}/${update.id}`, { state: update.state === "draft" ? "published" : "draft" }), update.state === "draft" ? "Update published." : "Update moved to drafts."),
    onPin: (update) => void run(() => patchJson(api, `${endpoint}/${update.id}`, { pinned: !update.pinned }), update.pinned ? "Update unpinned." : "Pinned as the key update."),
    onDelete: (update) => setRemoving(update)
  };

  const started = desk.status !== "off";
  return (
    <section id="live-coverage" aria-labelledby="live-coverage-heading" className="mx-auto flex w-full max-w-[760px] flex-col gap-4 border-t border-border px-4 pt-6 md:px-0" data-live-coverage={desk.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="live-coverage-heading" ref={heading} tabIndex={-1} className="text-sm font-semibold tracking-wide uppercase outline-none">Live coverage</h2>
          <LiveBadge desk={desk} timeZone={timeZone} />
        </div>
        {started ? (
          <div className="flex flex-wrap items-center gap-2">
            <OpenFieldButton href={live.fieldHref} prominent={desk.status === "live"} />
            {control ? <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" onClick={live.openPublishers}>Direct publishers</Button> : null}
            {control && desk.status === "live" ? <Button type="button" variant="outline" size="sm" className="text-destructive max-sm:min-h-11" disabled={live.busy} onClick={live.requestEnd}>End coverage</Button> : null}
            {control && desk.status === "ended" ? <Button type="button" size="sm" className="max-sm:min-h-11" disabled={live.busy} onClick={() => void live.goLive()}>{live.busy ? <Spinner /> : null}Resume live coverage</Button> : null}
          </div>
        ) : null}
      </div>

      {desk.status === "off" ? (
        <Alert>
          <RadioTower aria-hidden="true" />
          <AlertTitle>{control ? "Ready for live coverage" : "Live coverage is ready"}</AlertTitle>
          <AlertDescription>
            {control ? (
              <p>Direct publishers: {names(desk)}.{desk.storyPublished ? "" : " This story isn't published yet; going live publishes it through the normal checks."}</p>
            ) : (
              <p>Live coverage is ready but hasn't started yet. You can continue reporting and use Field Mode.</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {control ? <Button type="button" size="sm" className="max-sm:min-h-11" disabled={live.busy} onClick={() => void live.goLive()}>{live.busy ? <Spinner /> : null}{desk.storyPublished ? "Go live" : "Publish & go live"}</Button> : null}
              <OpenFieldButton href={live.fieldHref} />
              {control ? <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" onClick={live.openPublishers}>Manage publishers</Button> : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {desk.status === "ended" ? (
        <Alert>
          <AlertTitle>Coverage ended{desk.endedAt ? ` · ${liveTime(desk.endedAt, timeZone)}` : ""}</AlertTitle>
          <AlertDescription>Updates stay with the story. {control ? "Resume live coverage to publish new live updates." : "An editor can resume coverage; until then live updates can't be published."}</AlertDescription>
        </Alert>
      ) : null}

      {desk.status === "live" && !desk.storyPublished ? <Alert variant="destructive"><AlertTitle>This story isn't public</AlertTitle><AlertDescription>Readers can't see it, so new updates go to the desk until it is published.</AlertDescription></Alert> : null}

      {desk.status === "live" && desk.canCompose && !readOnly ? (
        // Not a <form>: this renders inside Payload's document form, and forms cannot nest.
        <Card role="group" aria-label="Post a live update" size="sm" data-live-composer="">
          <CardContent><LiveFields value={draft} onChange={setDraft} name="live-new" canPin={desk.canPublishNow} /></CardContent>
          <CardFooter className="border-t-0 bg-transparent pt-0"><LiveDeliveryButtons canPublishNow={desk.canPublishNow} disabled={working || !draft.text.trim()} onDeliver={(delivery) => void deliver(delivery)} helperId="live-composer-helper" /></CardFooter>
        </Card>
      ) : null}

      {started || desk.updates.length ? <LiveTimeline updates={desk.updates} timeZone={timeZone} storyPublished={desk.storyPublished} controls={controls} /> : null}
      {desk.hasMore ? <p className="text-center text-xs text-muted-foreground">Showing the latest {desk.updates.length} updates.</p> : null}

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this live update?</AlertDialogTitle>
            <AlertDialogDescription>{removing?.state === "published" && desk.storyPublished ? "It disappears from the live coverage readers see." : "This draft is removed."} This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={working}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={working} onClick={() => { const target = removing; if (target) void run(() => deleteJson(api, `${endpoint}/${target.id}`, {}), "Update deleted.").then(() => setRemoving(null)); }}>Delete update</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
