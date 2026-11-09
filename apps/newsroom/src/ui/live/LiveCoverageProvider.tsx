"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { createContext, use, useCallback, useMemo, useState, type MutableRefObject, type ReactNode } from "react";
import { toast } from "sonner";
import type { LiveMode } from "../../domain/live-coverage";
import type { LiveDeskResponse } from "../../newsroom/live-coverage";
import { useCoverageChange, useLiveDesk } from "./api";
import { LiveSetupDialog } from "./LiveSetup";

/**
 * One owner of a Story's live coverage controls in the Story screen: the desk query (mode, coverage state,
 * permissions, timeline), every confirmation (set up, switch to Standard, end coverage) and the one place that
 * changes coverage through the server. Write's mode control, the live section and the header all use it, so
 * they can never disagree. The server is authoritative (editor-only, and never live unless the Story is
 * public); this only offers the right controls.
 */
export type PublishStory = () => Promise<boolean>;

type LiveCoverageContext = {
  api: string;
  admin: string;
  storyId: number;
  timeZone: string;
  readOnly: boolean;
  userId: number;
  desk: LiveDeskResponse | undefined;
  loading: boolean;
  error: Error | null;
  busy: boolean;
  /** Where Field Mode opens this Story (never a free-form return URL). */
  fieldHref: string;
  /** The Story header registers the exact normal publish action (with its readiness checks) here. */
  publishRef: MutableRefObject<PublishStory | null>;
  setMode: (next: LiveMode) => void;
  openSetup: () => void;
  openPublishers: () => void;
  goLive: () => Promise<boolean>;
  requestEnd: () => void;
};

const Context = createContext<LiveCoverageContext | null>(null);

/** The raw context provider: the Story screen uses `LiveCoverageProvider`; tests render components against a given state. */
export const LiveCoverageValue = Context;
export type LiveCoverageState = LiveCoverageContext;

export function useLiveCoverage(): LiveCoverageContext | null {
  return use(Context);
}

type Confirm = "to-standard-live" | "to-standard-ended" | "end" | null;

export function LiveCoverageProvider({ api, admin, storyId, timeZone, readOnly, userId, publishRef, children }: {
  api: string;
  admin: string;
  storyId: number;
  timeZone: string;
  readOnly: boolean;
  userId: number;
  publishRef: MutableRefObject<PublishStory | null>;
  children: ReactNode;
}) {
  const query = useLiveDesk(api, storyId);
  const { change, busy } = useCoverageChange(api, storyId);
  const [setup, setSetup] = useState<"setup" | "manage" | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const desk = query.data;

  /** Start (or resume) coverage. A Story that is not public is published first through the normal checks. */
  const goLive = useCallback(async (): Promise<boolean> => {
    if (!desk) return false;
    if (!desk.storyPublished) {
      const published = await publishRef.current?.().catch(() => false);
      if (!published) {
        toast.error("The story wasn't published, so coverage hasn't started. Fix the publication checks, then try again.");
        return false;
      }
    }
    const result = await change({ action: "start" }, desk.startedAt ? "Live coverage resumed." : "You're live. Readers see the LIVE badge now.");
    return result !== null;
  }, [change, desk, publishRef]);

  const setMode = useCallback((next: LiveMode) => {
    if (!desk || next === desk.mode) return;
    if (next === "live") {
      // First time: set up, never start silently. A session that already ran keeps its state.
      if (desk.status === "off") setSetup("setup");
      else void change({ action: "mode", mode: "live" }, desk.status === "ended" ? "Live mode restored. Coverage stays ended until you resume it." : "Live mode on.");
      return;
    }
    if (desk.status === "live") setConfirm("to-standard-live");
    else if (desk.status === "ended") setConfirm("to-standard-ended");
    else void change({ action: "mode", mode: "standard" }, "Standard mode.");
  }, [change, desk]);

  const value = useMemo<LiveCoverageContext>(() => ({
    api, admin, storyId, timeZone, readOnly, userId, desk, loading: query.isPending, error: query.error, busy,
    fieldHref: `${admin}/field?story=${storyId}&from=story`,
    publishRef, setMode, goLive,
    openSetup: () => setSetup("setup"), openPublishers: () => setSetup("manage"), requestEnd: () => setConfirm("end")
  }), [admin, api, busy, desk, goLive, publishRef, query.error, query.isPending, readOnly, setMode, storyId, timeZone, userId]);

  return (
    <Context value={value}>
      {children}
      {desk ? <LiveSetupDialog open={setup !== null} intent={setup ?? "setup"} onOpenChange={(open) => { if (!open) setSetup(null); }} api={api} desk={desk} busy={busy} readOnly={readOnly}
        onSetUp={async (publishers) => { const done = await change({ action: "setup", publishers }, "Live mode is set up. Coverage hasn't started."); if (done) setSetup(null); }}
        onManage={async (publishers) => { const done = await change({ action: "publishers", publishers }, "Direct publishers updated."); if (done) setSetup(null); }}
        onGoLive={async (publishers) => {
          // Save the setup, then publish the Story if needed (the normal checks), then start. Never LIVE on a Story readers cannot see.
          const configured = await change({ action: "setup", publishers });
          if (!configured) return;
          setSetup(null);
          await goLive();
        }} /> : null}

      <AlertDialog open={confirm === "to-standard-live" || confirm === "to-standard-ended"} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "to-standard-live" ? "End live coverage and switch to Standard?" : "Switch to Standard?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "to-standard-live"
                ? "Active coverage will end, and the live timeline will no longer be this story's primary live experience for readers. Existing updates are kept, not deleted. Switching back to Live later restores the timeline."
                : "The live timeline will no longer be this story's primary live experience for readers. Existing updates are kept, not deleted, and switching back to Live restores them. Coverage stays ended until you resume it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Keep Live mode</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={busy} onClick={() => { setConfirm(null); void change({ action: "mode", mode: "standard" }, confirm === "to-standard-live" ? "Coverage ended. This story is in Standard mode." : "Standard mode. Live updates are kept."); }}>
              {confirm === "to-standard-live" ? "End coverage and switch" : "Switch to Standard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "end"} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End live coverage?</AlertDialogTitle>
            <AlertDialogDescription>Existing updates will remain with the story, but reporters won't be able to publish new live updates until coverage is resumed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" disabled={busy} onClick={() => { setConfirm(null); void change({ action: "end" }, "Coverage ended. Updates stay with the story."); }}>End coverage</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context>
  );
}
