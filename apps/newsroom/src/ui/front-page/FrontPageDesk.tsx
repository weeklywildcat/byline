"use client";

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, History, Monitor, PanelLeft, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { FrontPageDesk as Desk } from "../../front-page/server";
import { deleteJson, getJson, postJson } from "../story/api";

type PoolStory = { id: number; headline: string; section: string; sectionSlug: string; publishedAt: string; thumbnail: string | null };
type Pool = { stories: PoolStory[]; sections: Array<{ slug: string; name: string }> };

/** Container width above which pool, preview and inspector sit side by side (measured: preview needs ~640px, each rail ~280px). */
const THREE_UP = 1240;

async function putPlacement(api: string, data: Record<string, unknown>) {
  const response = await fetch(`${api}/byline/front-page/placements`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "Byline couldn't change the homepage.");
  return body;
}

/**
 * The Front Page Desk (docs/front-page.md): editorial priority over the
 * code-owned homepage. The middle is the real homepage (the same resolver and
 * components as the static build) in a frame at Desktop or Mobile width, with
 * slot overlays. Editors pin a published Story into a slot or return it to
 * automatic; changes stay pending until Publish changes (or Schedule).
 * Every drag has a click and keyboard equivalent.
 */
export function FrontPageDesk({ api, admin }: { api: string; admin: string }) {
  // AdminRoot mounts its children a render late; the desk (and its measured frame) lives inside it.
  return <AdminRoot className="byline-front-page" toaster={false}><DeskBody api={api} admin={admin} /></AdminRoot>;
}

function DeskBody({ api, admin }: { api: string; admin: string }) {
  const queries = useQueryClient();
  const desk = useQuery({ queryKey: ["byline", "front-page"], queryFn: () => getJson<Desk>(api, "/byline/front-page") });
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dragging, setDragging] = useState<PoolStory | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const data = desk.data;
  const wide = width >= THREE_UP;
  const refresh = useCallback(() => queries.invalidateQueries({ queryKey: ["byline", "front-page"] }), [queries]);
  const version = data?.draft?.updatedAt ?? data?.active?.activatedAt ?? "auto";

  // The preview frame says which slot an editor chose on the rendered homepage.
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "byline-front-page:choose" || typeof event.data.slot !== "string") return;
      setSelected(event.data.slot);
      if (!wide) setInspectorOpen(true);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [wide]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "byline-front-page:selected", slot: selected }, window.location.origin);
  }, [selected, version]);

  const place = useMutation({
    mutationFn: (input: { slot: string; storyId: number | null }) => putPlacement(api, { slot: input.slot, storyId: input.storyId, expectedUpdatedAt: data?.draft?.updatedAt }),
    onSuccess: async (_result, input) => { toast.success(input.storyId === null ? "Returned to automatic." : "Pinned. Publish changes to update the homepage."); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const act = useMutation({
    mutationFn: async (action: { kind: "publish" | "discard" | "unschedule" } | { kind: "schedule"; at: string } | { kind: "use"; id: number }) => {
      if (action.kind === "publish") return postJson<{ summary: string }>(api, "/byline/front-page/publish", {});
      if (action.kind === "discard") return postJson(api, "/byline/front-page/discard", {});
      if (action.kind === "unschedule") return deleteJson(api, "/byline/front-page/schedule", {});
      if (action.kind === "schedule") return postJson(api, "/byline/front-page/schedule", { at: action.at });
      return postJson(api, `/byline/front-page/history/${(action as { id: number }).id}/use`, {});
    },
    onSuccess: async (result, action) => {
      const messages = { publish: "Homepage changes published. The site will update after the next build.", discard: "Changes discarded.", unschedule: "Scheduled change cancelled.", schedule: "Homepage change scheduled.", use: "That lineup is now your pending change." } as const;
      toast.success(action.kind === "publish" && (result as { summary?: string })?.summary ? `${(result as { summary: string }).summary}. Published.` : messages[action.kind]);
      if (action.kind === "use") setHistoryOpen(false);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const slotLabel = useCallback((id: string | number | undefined | null) => data?.slots.find((slot) => slot.id === id)?.label ?? String(id ?? ""), [data]);
  const announcements: Announcements = useMemo(() => ({
    onDragStart: ({ active }) => `Picked up ${String(active.data.current?.headline ?? "story")}. Move to a slot and press Space to pin it, or Escape to cancel.`,
    onDragOver: ({ over }) => (over ? `Over ${slotLabel(over.id)}.` : "Not over a slot."),
    onDragEnd: ({ active, over }) => (over ? `Pinned ${String(active.data.current?.headline ?? "story")} in ${slotLabel(over.id)}.` : "Dropped outside a slot. Nothing changed."),
    onDragCancel: () => "Cancelled. Nothing changed."
  }), [slotLabel]);
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const story = Number(event.active.data.current?.storyId);
    if (event.over && story) { setSelected(String(event.over.id)); place.mutate({ slot: String(event.over.id), storyId: story }); }
  };

  if (desk.isError) return <div className="p-6"><InlineAlert title="The Front Page Desk isn't available" onAction={() => void desk.refetch()}>{(desk.error as Error).message}</InlineAlert></div>;
  const pending = data?.changes.length ?? 0;
  const current = data?.draft?.placements ?? data?.active?.placements ?? {};
  const chooseForSelected = (story: PoolStory) => {
    if (!selected) { toast.message("Choose a slot first: click a slot on the homepage or in the slot list."); return; }
    place.mutate({ slot: selected, storyId: story.id });
    setPoolOpen(false);
  };
  const pool = <StoryPool api={api} onChoose={chooseForSelected} selectedLabel={selected ? slotLabel(selected) : null} placed={new Set(Object.values(current))} />;
  const inspector = data ? <SlotInspector desk={data} selected={selected} onSelect={(id) => setSelected(id)} onAutomatic={(slot) => place.mutate({ slot, storyId: null })} onChoose={() => { if (!wide) { setInspectorOpen(false); setPoolOpen(true); } }} busy={place.isPending} /> : null;

  return (
    <>
      <DndContext sensors={sensors} accessibility={{ announcements }} onDragStart={(event) => setDragging((event.active.data.current?.story as PoolStory) ?? null)} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
        <div ref={frameRef} className="flex min-w-0 flex-col gap-4 px-4 py-6 md:px-8" data-front-page-desk="">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Front Page</p>
              <h1 className="text-xl font-semibold">Live homepage</h1>
              <p className="text-sm text-muted-foreground" role="status">
                {!data ? "Loading…" : pending ? `${pending} unpublished change${pending === 1 ? "" : "s"}` : data.scheduled ? "No unpublished changes · a change is scheduled" : "No unpublished changes"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setHistoryOpen(true)}><History data-icon="inline-start" />History</Button>
              <Button type="button" variant="outline" disabled={!data?.draft || act.isPending} onClick={() => act.mutate({ kind: "discard" })}>Discard changes</Button>
              <SchedulePopover disabled={!data?.draft || act.isPending} onSchedule={(at) => act.mutate({ kind: "schedule", at })} />
              <Button type="button" disabled={!pending || act.isPending || Boolean(data?.issues.length)} onClick={() => act.mutate({ kind: "publish" })}>Publish changes</Button>
            </div>
          </header>
          {data?.issues.length ? (
            <Alert variant="destructive">
              <AlertTitle>These changes can't be published yet</AlertTitle>
              <AlertDescription>{data.issues.map((issue) => `${slotLabel(issue.slotId)}: ${issue.reason === "story-unavailable" ? "that story is no longer published" : issue.reason === "unknown-slot" ? "that slot no longer exists" : "the story is placed twice"}.`).join(" ")} Return the slot to automatic or choose another story.</AlertDescription>
            </Alert>
          ) : null}
          {data?.scheduled ? (
            <Alert>
              <AlertTitle>Scheduled for {new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(data.scheduled.scheduledAt))}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">{data.scheduled.failure ? `It could not be activated: ${data.scheduled.failure}` : "It activates by itself at that time."}<Button type="button" size="xs" variant="outline" onClick={() => act.mutate({ kind: "unschedule" })}>Cancel scheduled change</Button></AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Preview width" value={[device]} onValueChange={(next: unknown[]) => { if (next[0] === "desktop" || next[0] === "mobile") setDevice(next[0]); }}>
              <ToggleGroupItem value="desktop"><Monitor data-icon="inline-start" />Desktop</ToggleGroupItem>
              <ToggleGroupItem value="mobile"><Smartphone data-icon="inline-start" />Mobile</ToggleGroupItem>
            </ToggleGroup>
            {!wide ? <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPoolOpen(true)}><PanelLeft data-icon="inline-start" />Stories</Button><Button type="button" variant="outline" size="sm" onClick={() => setInspectorOpen(true)}>Slots{selected ? `: ${slotLabel(selected)}` : ""}</Button></div> : null}
          </div>
          <div className="grid min-w-0 gap-4" style={wide ? { gridTemplateColumns: "17.5rem minmax(0, 1fr) 18rem" } : undefined}>
            {wide ? <aside aria-label="Stories" className="min-w-0">{pool}</aside> : null}
            <PreviewFrame device={device}>
              {(style) => <iframe ref={frame} key={version} title={`Homepage preview (${device})`} src={`${admin.replace(/\/admin$/, "")}/preview/front-page?view=pending`} className="border-0 bg-white" style={style} onLoad={() => frame.current?.contentWindow?.postMessage({ type: "byline-front-page:selected", slot: selected }, window.location.origin)} />}
            </PreviewFrame>
            {wide ? <aside aria-label="Slots" className="min-w-0">{inspector}</aside> : null}
          </div>
        </div>
        <DragOverlay>{dragging ? <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-lg">{dragging.headline}</div> : null}</DragOverlay>
        <Sheet open={poolOpen && !wide} onOpenChange={setPoolOpen}>
          <SheetContent side="left" className="overflow-y-auto data-[side=left]:w-full data-[side=left]:sm:max-w-sm">
            <SheetHeader><SheetTitle>Stories</SheetTitle><SheetDescription>{selected ? `Choose a story for ${slotLabel(selected)}.` : "Choose a slot, then a story."}</SheetDescription></SheetHeader>
            <div className="px-4 pb-6">{pool}</div>
          </SheetContent>
        </Sheet>
        <Sheet open={inspectorOpen && !wide} onOpenChange={setInspectorOpen}>
          <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-sm">
            <SheetHeader><SheetTitle>Slots</SheetTitle><SheetDescription>Pin a story or return a slot to automatic.</SheetDescription></SheetHeader>
            <div className="px-4 pb-6">{inspector}</div>
          </SheetContent>
        </Sheet>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetHeader><SheetTitle>History</SheetTitle><SheetDescription>Every published homepage change. Using an old lineup makes a new pending change; history never changes.</SheetDescription></SheetHeader>
            <ul className="divide-y border-y px-4">
              {(data?.history ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><span className="block">{new Intl.DateTimeFormat("en-US", { timeZone: data!.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(row.at))}{row.by ? ` — ${row.by}` : ""}</span><span className="text-muted-foreground">{row.summary}{row.state === "active" ? " · Live now" : ""}</span></span>
                  {row.state !== "active" ? <Button type="button" size="sm" variant="outline" onClick={() => act.mutate({ kind: "use", id: row.id })}>Use this lineup</Button> : null}
                </li>
              ))}
              {data && !data.history.length ? <li className="py-3 text-sm text-muted-foreground">No homepage changes have been published yet. The homepage is automatic.</li> : null}
            </ul>
          </SheetContent>
        </Sheet>
      </DndContext>
    </>
  );
}

/** Desktop is the real desktop width (1280px) scaled to fit; Mobile is a 390px phone. Only the preview viewport changes, never the design. */
const DESKTOP_WIDTH = 1280;
function PreviewFrame({ device, children }: { device: "desktop" | "mobile"; children: (style: React.CSSProperties) => React.ReactNode }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = typeof window === "undefined" ? 800 : Math.round(window.innerHeight * 0.78);
  const scale = device === "desktop" && width ? Math.min(1, width / DESKTOP_WIDTH) : 1;
  const frameWidth = device === "desktop" ? DESKTOP_WIDTH : 390;
  return (
    <div ref={ref} className="min-w-0 overflow-hidden rounded-lg border bg-muted/40" style={{ height }} data-preview-device={device}>
      <div className="mx-auto" style={{ width: frameWidth * scale, height }}>
        {children({ width: frameWidth, height: height / scale, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "0 0" })}
      </div>
    </div>
  );
}

/** Lightweight published Story summaries from a remote, async search (Command); never article bodies. */
function StoryPool({ api, onChoose, selectedLabel, placed }: { api: string; onChoose: (story: PoolStory) => void; selectedLabel: string | null; placed: Set<number> }) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const pool = useQuery({ queryKey: ["byline", "front-page", "pool", search, section], queryFn: () => getJson<Pool>(api, `/byline/front-page/stories?search=${encodeURIComponent(search)}&section=${encodeURIComponent(section)}`), placeholderData: (previous) => previous });
  const sections = pool.data?.sections ?? [];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-story-pool="">
      <p className="text-xs text-muted-foreground">{selectedLabel ? `Choose a story for ${selectedLabel}, or drag one onto a slot.` : "Select a slot, then choose a story. You can also drag a story onto a slot."}</p>
      <Select items={[{ value: "", label: "All sections" }, ...sections.map((entry) => ({ value: entry.slug, label: entry.name }))]} value={section} onValueChange={(next) => setSection(String(next ?? ""))}>
        <SelectTrigger aria-label="Section" size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectItem value="">All sections</SelectItem>{sections.map((entry) => <SelectItem key={entry.slug} value={entry.slug}>{entry.name}</SelectItem>)}</SelectContent>
      </Select>
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput value={search} onValueChange={setSearch} placeholder="Search published stories" />
        <CommandList className="max-h-[60vh]">
          {pool.data && !pool.data.stories.length ? <CommandEmpty>No published stories match.</CommandEmpty> : null}
          {(pool.data?.stories ?? []).map((story) => <PoolItem key={story.id} story={story} placed={placed.has(story.id)} onChoose={() => onChoose(story)} />)}
        </CommandList>
      </Command>
    </div>
  );
}

function PoolItem({ story, placed, onChoose }: { story: PoolStory; placed: boolean; onChoose: () => void }) {
  const drag = useDraggable({ id: `story-${story.id}`, data: { storyId: story.id, headline: story.headline, story } });
  return (
    <CommandItem value={String(story.id)} onSelect={onChoose} className="items-start gap-2" data-pool-story={story.id}>
      {/* A dedicated handle: dragging never steals a normal click on the story. */}
      <button type="button" ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} aria-label={`Drag ${story.headline} to a slot`} className="mt-0.5 shrink-0 cursor-grab rounded text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50" onClick={(event) => event.stopPropagation()}><GripVertical className="size-4" /></button>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{story.headline}</span><span className="block text-xs text-muted-foreground">{story.section}{placed ? " · On the homepage" : ""}</span></span>
    </CommandItem>
  );
}

/** The selected slot's actions and the whole slot list: every drag target is also a click and keyboard target. */
function SlotInspector({ desk, selected, onSelect, onAutomatic, onChoose, busy }: { desk: Desk; selected: string | null; onSelect: (slot: string) => void; onAutomatic: (slot: string) => void; onChoose: () => void; busy: boolean }) {
  const placements = desk.draft?.placements ?? desk.active?.placements ?? {};
  const slot = desk.slots.find((entry) => entry.id === selected) ?? null;
  const pinned = slot ? placements[slot.id] : undefined;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 text-sm" data-slot-inspector="">
      {slot ? (
        <section aria-label="Selected slot" className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border p-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{slot.label} · {pinned ? "Pinned" : "Automatic"}</p>
          <p className="font-medium">{pinned ? desk.stories[pinned]?.headline ?? "A story" : "Byline chooses this story automatically."}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onChoose}>{pinned ? "Replace" : "Choose story"}</Button>
            {pinned ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAutomatic(slot.id)}>Return to automatic</Button> : null}
          </div>
        </section>
      ) : <p className="text-muted-foreground">Select a slot on the homepage or below.</p>}
      <section aria-label="All slots" className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Slots</h2>
        <ul className="divide-y border-y">{desk.slots.map((entry) => <li key={entry.id}><SlotRow slot={entry} story={placements[entry.id] ? desk.stories[placements[entry.id]]?.headline ?? "A story" : null} selected={entry.id === selected} changed={desk.changes.includes(entry.id)} onSelect={() => onSelect(entry.id)} /></li>)}</ul>
      </section>
    </div>
  );
}

function SlotRow({ slot, story, selected, changed, onSelect }: { slot: { id: string; label: string }; story: string | null; selected: boolean; changed: boolean; onSelect: () => void }) {
  const drop = useDroppable({ id: slot.id });
  return (
    <button ref={drop.setNodeRef} type="button" onClick={onSelect} aria-pressed={selected} data-slot-row={slot.id} className={`flex w-full items-center gap-2 px-1 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 ${selected ? "bg-accent" : ""} ${drop.isOver ? "outline-2 outline-primary" : ""}`}>
      <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{slot.label}</span><span className="block truncate">{story ?? "Automatic"}</span></span>
      {story ? <Badge variant="outline">Pinned</Badge> : null}
      {changed ? <span className="text-xs text-muted-foreground">Unpublished</span> : null}
    </button>
  );
}

/** Schedule…: a newsroom-local time (read in the newsroom's timezone on the server). */
function SchedulePopover({ disabled, onSchedule }: { disabled: boolean; onSchedule: (at: string) => void }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>Schedule…</PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (at) { onSchedule(at); setOpen(false); } }}>
          <label className="text-sm font-medium" htmlFor="front-page-schedule">Change the homepage at</label>
          <Input id="front-page-schedule" type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} required />
          <p className="text-xs text-muted-foreground">Newsroom time. It activates by itself; you can cancel before then.</p>
          <Button type="submit" size="sm" disabled={!at}>Schedule changes</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
