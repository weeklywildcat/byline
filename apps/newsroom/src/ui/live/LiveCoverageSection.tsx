"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { RadioTower, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LiveDeskResponse, LivePostResult } from "../../newsroom/live-coverage";
import { ShellLink } from "../shell/navigation";
import { postJson } from "../story/api";
import { EMPTY_DRAFT, liveEndpoint, postedMessage, type LiveDraft } from "./api";
import { LiveDeliveryButtons } from "./LiveDelivery";
import { LiveFields } from "./LiveFields";
import { useLiveCoverage } from "./LiveCoverageProvider";
import { LiveTimeline, liveTime } from "./LiveTimeline";
import { POSTING_AS_HELP, PostingAsList, PostingAsRow, type PostingAuthor } from "./PostingAs";
import { useLiveDeskControls, type LiveFieldsComponent } from "./useLiveDeskControls";

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

/** Editing an update in Write: words and photo; pinning is the timeline's own action. */
const EditFields: LiveFieldsComponent = ({ value, onChange, name }) => <LiveFields value={value} onChange={onChange} name={name} canPin={false} />;

const names = (desk: LiveDeskResponse) => (desk.publishers.length ? desk.publishers.map((person) => person.name).join(", ") : "none yet");

/**
 * LIVE COVERAGE, under the article in Write (never a top-level tab): the status, the composer, the timeline.
 * Standard mode renders none of it. A Story stays one Story; this is the same record Field posts to.
 */
export function LiveCoverageSection() {
  const live = useLiveCoverage();
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<LiveDraft>(EMPTY_DRAFT);
  // Typing up what a reporter phoned in: credit them (editors only, posting-as.ts). Kept until switched back.
  const [author, setAuthor] = useState<PostingAuthor | null>(null);
  const [choosing, setChoosing] = useState(false);
  const desk = live?.desk;
  const { controls, dialog, run, working } = useLiveDeskControls({ api: live?.api ?? "", storyId: live?.storyId ?? 0, desk, readOnly: live?.readOnly, busy: live?.busy, Fields: EditFields, withPhoto: true });
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
  const control = desk.canControl && !readOnly;
  const postAs = desk.canPostAs && !readOnly;

  const body = (value: LiveDraft) => ({ title: value.title, text: value.text, photoId: value.photo?.id ?? null, pinned: value.pinned });

  async function deliver(delivery: "publish" | "desk") {
    if (!draft.text.trim()) return;
    const result = await run(() => postJson<LivePostResult>(api, endpoint, { ...body(draft), delivery, ...(postAs && author ? { as: author.id } : {}) }), (posted) => postedMessage(posted, delivery));
    if (result) setDraft(EMPTY_DRAFT);
  }

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
        <div role="group" aria-label="Post a live update" className="grid gap-3 rounded-lg border p-4" data-live-composer="">
          <LiveFields value={draft} onChange={setDraft} name="live-new" canPin={desk.canPublishNow} />
          {postAs ? (
            <PostingAsRow author={author} me={desk.me} switchButton={(
              <Popover open={choosing} onOpenChange={setChoosing}>
                <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="shrink-0 max-sm:min-h-11" aria-label={`Switch who this live update is by (now ${author ? author.name : "you"})`} />}>Switch</PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <p className="px-3 pt-3 text-xs text-muted-foreground">{POSTING_AS_HELP}</p>
                  <PostingAsList api={api} storyId={storyId} me={desk.me} current={author?.id ?? null} enabled={choosing} onPick={(person) => { setAuthor(person); setChoosing(false); }} />
                </PopoverContent>
              </Popover>
            )} />
          ) : null}
          <LiveDeliveryButtons canPublishNow={desk.canPublishNow} disabled={working || !draft.text.trim()} onDeliver={(delivery) => void deliver(delivery)} helperId="live-composer-helper" />
        </div>
      ) : null}

      {started || desk.updates.length ? <LiveTimeline updates={desk.updates} timeZone={timeZone} storyPublished={desk.storyPublished} controls={controls} /> : null}
      {desk.hasMore ? <p className="text-center text-xs text-muted-foreground">Showing the latest {desk.updates.length} updates.</p> : null}

      {dialog}
    </section>
  );
}
