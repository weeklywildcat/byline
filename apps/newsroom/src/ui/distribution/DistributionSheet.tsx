"use client";

import { useMediaAsset } from "@byline/newsroom-screens/media/media-query";
import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@byline/newsroom-ui/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Copy, ExternalLink, ImagePlus, Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import type { DistributionItemView, DistributionPatch, DistributionSlotView, PersonRef } from "../../distribution/server";
import { useMediaWorkspace } from "../media/MediaWorkspaceShell";
import { ApiError, getJson, patchJson } from "../story/api";
import { formatDay } from "../story/parts";

type Item = DistributionItemView & { owners: PersonRef[] };
type CopyPatch = Pick<DistributionPatch, "headline" | "text">;

export const distributionItemKey = (id: number) => ["byline", "distribution-item", id] as const;

/** Restrained state badges: only a failure is loud. */
export function DistributionStateBadge({ state, label }: { state: DistributionItemView["state"]; label: string }) {
  return <Badge variant={state === "failed" ? "destructive" : state === "ready" ? "default" : state === "posted" ? "secondary" : "outline"}>{label}</Badge>;
}

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Byline could not copy to the clipboard."));
/** One-line inputs inside the Story screen sit in Payload's form: Enter must never submit it. */
const onEnter = (run: () => void) => (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); run(); } };

/**
 * One destination's detail (docs/distribution.md#the-sheet), from a Story or
 * the desk: status, what still blocks it, its content (each slot inherits the
 * Story until someone chooses Custom), the copy/open/paste-the-permalink
 * workflow, owner and timing, a private note, and what actually went out.
 */
export function DistributionSheet({ api, itemId, timeZone, userId, onClose, showStory = false, admin }: { api: string; itemId: number | null; timeZone: string; userId: number; onClose: () => void; showStory?: boolean; admin?: string }) {
  const queries = useQueryClient();
  const item = useQuery({ queryKey: distributionItemKey(itemId ?? 0), queryFn: () => getJson<Item>(api, `/byline/distribution/${itemId}`), enabled: itemId !== null });
  const [linkError, setLinkError] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [copyDraft, setCopyDraft] = useState<CopyPatch>({});
  const pendingCopy = useRef<CopyPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingCopy = useRef<Promise<boolean> | null>(null);
  const change = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: DistributionPatch }) => patchJson<Item>(api, `/byline/distribution/${id}`, patch),
    networkMode: "always",
    scope: { id: `distribution-${itemId}` },
    onSuccess: (next) => {
      queries.setQueryData(distributionItemKey(next.id), next);
      void queries.invalidateQueries({ queryKey: ["byline", "story-distribution"] });
      void queries.invalidateQueries({ queryKey: ["byline", "distribution-desk"] });
    }
  });
  const flushCopy = (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (savingCopy.current) return savingCopy.current;
    if (itemId === null || !Object.keys(pendingCopy.current).length) return Promise.resolve(true);
    savingCopy.current = (async () => {
      while (Object.keys(pendingCopy.current).length) {
        const patch = pendingCopy.current;
        pendingCopy.current = {};
        try {
          await change.mutateAsync({ id: itemId, patch });
          setCopyDraft(pendingCopy.current);
          setCopyError(false);
        } catch {
          pendingCopy.current = { ...patch, ...pendingCopy.current };
          setCopyError(true);
          return false;
        }
      }
      return true;
    })().finally(() => { savingCopy.current = null; });
    return savingCopy.current;
  };
  const queueCopy = (name: "headline" | "text", value: string) => {
    pendingCopy.current = { ...pendingCopy.current, [name]: value };
    setCopyDraft((current) => ({ ...current, [name]: value }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushCopy(), 700);
  };
  const run = async (patch: DistributionPatch, done?: (next: Item) => void) => {
    if (itemId === null || !(await flushCopy())) return;
    try {
      const next = await change.mutateAsync({ id: itemId, patch });
      done?.(next);
    } catch (error) {
      if ("permalink" in patch && error instanceof ApiError && error.status < 500) setLinkError(error.message);
      else toast.error((error as Error).message);
    }
  };
  useEffect(() => setLinkError(""), [itemId]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (savingCopy.current || Object.keys(pendingCopy.current).length) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => { clearTimeout(timer.current); window.removeEventListener("beforeunload", guard); };
  }, []);
  const data = item.data;

  return (
    <Sheet open={itemId !== null} onOpenChange={(open) => { if (!open) void flushCopy().then((saved) => { if (saved) onClose(); }); }}>
      <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2">{data ? <>{data.label}<DistributionStateBadge state={data.state} label={data.stateLabel} /></> : "Distribution"}</SheetTitle>
          <SheetDescription className="[overflow-wrap:anywhere]">
            {data ? <>{showStory && admin ? <a className="underline-offset-2 hover:underline" href={`${admin}/collections/stories/${data.storyId}?view=history`}>{data.story.headline}</a> : data.story.headline}{data.story.published ? null : <span className="text-destructive"> · Story unpublished</span>}</> : item.isError ? (item.error as Error).message : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        {copyError ? <div className="flex flex-wrap items-center gap-2 border-b p-3" role="alert">
          <span className="text-sm text-destructive">Byline could not save your copy. Your edits are still here.</span>
          <Button type="button" size="sm" variant="outline" disabled={change.isPending} onClick={() => void flushCopy()}>Retry save</Button>
        </div> : null}
        {data ? <SheetBody key={data.id} item={data} timeZone={timeZone} userId={userId} run={run} busy={change.isPending} linkError={linkError} setLinkError={setLinkError}
          copyDraft={copyDraft} queueCopy={queueCopy} flushCopy={flushCopy} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ item, timeZone, userId, run, busy, linkError, setLinkError, copyDraft, queueCopy, flushCopy }: {
  item: Item; timeZone: string; userId: number; run: (patch: DistributionPatch, done?: (next: Item) => void) => void;
  busy: boolean; linkError: string; setLinkError: (message: string) => void;
  copyDraft: CopyPatch; queueCopy: (name: "headline" | "text", value: string) => void; flushCopy: () => Promise<boolean>;
}) {
  const { can, destination } = item;
  const pending = item.state !== "posted" && item.state !== "skipped";
  const readyBlockers = item.problems.filter((problem) => problem.blocks === "ready");
  const textNoun = item.text ? item.text.label.toLowerCase() : "text";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4">
      {/* Status: what is wrong, and the one next step */}
      <section className="grid gap-3" aria-label="Status">
        {item.failure ? <p role="alert" className="flex gap-2 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{item.failure}</p> : null}
        {item.problems.length && pending ? (
          <ul className="grid gap-1 text-sm" aria-label="Before it goes out">
            {item.problems.map((problem) => <li key={problem.message} className="flex gap-2 text-muted-foreground"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />{problem.message}</li>)}
          </ul>
        ) : null}
        {item.state === "ready" && item.requiresApproval && !item.approvedAt ? <p className="text-sm text-muted-foreground">Waiting for an editor to approve.</p> : null}
        {item.approvedAt && item.state === "ready" ? <p className="text-sm text-muted-foreground">Approved{item.approvedBy ? ` by ${item.approvedBy.name}` : ""}.</p> : null}
        <StateActions item={item} timeZone={timeZone} run={run} busy={busy} readyBlocked={readyBlockers.length > 0} />
      </section>

      {/* Going out: copy, open, paste the final address */}
      {pending ? (
        <section className="grid gap-3" aria-label="Post">
          <ButtonGroup>
            <Button type="button" size="sm" onClick={() => copy(item.effective.copy, item.text ? item.text.label : "Text")} disabled={!item.effective.copy}><Copy data-icon="inline-start" />Copy {textNoun}</Button>
            {destination.openUrl ? <Button nativeButton={false} size="sm" variant="outline" render={<a href={destination.openUrl} target="_blank" rel="noopener noreferrer" />}>Open {item.label}<ExternalLink data-icon="inline-end" /></Button> : null}
          </ButtonGroup>
          {destination.permalink !== "none" ? <PermalinkField item={item} run={run} busy={busy} error={linkError} setError={setLinkError} /> : null}
        </section>
      ) : null}

      {item.state === "posted" ? <PostedSummary item={item} /> : null}

      {/* Content: inherited until deliberately customized, slot by slot */}
      {pending && (item.headline || item.text || item.media) ? (
        <FieldGroup className="gap-4">
          {item.headline ? <SlotField slot={item.headline} name="headline" editable={can.edit} run={run} draft={copyDraft.headline} queueCopy={queueCopy} flushCopy={flushCopy} /> : null}
          {item.text ? <SlotField slot={item.text} name="text" editable={can.edit} run={run} draft={copyDraft.text} queueCopy={queueCopy} flushCopy={flushCopy} /> : null}
          {item.media ? <MediaField item={item} run={run} /> : null}
        </FieldGroup>
      ) : null}

      <Separator />
      <FieldGroup className="gap-4">
        <OwnerField item={item} userId={userId} run={run} />
        {pending ? <TimeField label="Planned for" timeZone={timeZone} value={item.plannedForLocal} disabled={!can.edit} onCommit={(value) => run({ plannedFor: value || null })} /> : null}
        <NoteField item={item} run={run} />
      </FieldGroup>

      {item.sent.length ? <SentHistory item={item} timeZone={timeZone} /> : null}
    </div>
  );
}

function StateActions({ item, timeZone, run, busy, readyBlocked }: { item: Item; timeZone: string; run: (patch: DistributionPatch, done?: (next: Item) => void) => void; busy: boolean; readyBlocked: boolean }) {
  const { can, state, destination } = item;
  const [scheduleAt, setScheduleAt] = useState(item.scheduledForLocal);
  const [scheduling, setScheduling] = useState(false);
  const buttons: React.ReactNode[] = [];
  if (can.edit && (state === "planned" || state === "draft" || (state === "failed" && can.skip))) buttons.push(<Button key="ready" type="button" size="sm" disabled={busy || readyBlocked} onClick={() => run({ state: "ready" }, () => toast.success(item.requiresApproval && !can.approve && !can.skip ? "Ready. The editors were asked to approve it." : "Marked ready."))}>{item.requiresApproval && can.skip ? "Mark ready and approve" : "Mark ready"}</Button>);
  if (can.approve) buttons.push(<Button key="approve" type="button" size="sm" disabled={busy} onClick={() => run({ approve: true }, () => toast.success("Approved."))}>Approve</Button>);
  // Without a required final address, recording that it went out is the action (Newsletter "Mark sent").
  if (destination.permalink !== "required" && can.post && (state === "ready" || state === "scheduled" || state === "draft" || state === "planned")) buttons.push(<Button key="post" type="button" size="sm" variant={state === "ready" ? "default" : "outline"} disabled={busy} onClick={() => run({ state: "posted" }, () => toast.success(`Marked ${destination.postedLabel.toLowerCase()}.`))}>Mark {destination.postedLabel.toLowerCase()}</Button>);
  if (can.edit && destination.supportsScheduling && (state === "ready" || state === "draft" || state === "planned") && can.post) buttons.push(<Button key="schedule" type="button" size="sm" variant="outline" disabled={busy} aria-expanded={scheduling} onClick={() => setScheduling((open) => !open)}>Scheduled…</Button>);
  if (can.edit && state === "scheduled") buttons.push(<Button key="unschedule" type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ state: "ready" })}>Not scheduled</Button>);
  if (can.edit && state === "ready") buttons.push(<Button key="back" type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run({ state: "draft" })}>Back to draft</Button>);
  if (can.reopen) buttons.push(<Button key="reopen" type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ state: "draft" }, () => toast.success("Reopened. What went out is kept in its history."))}>Reopen to post again</Button>);
  if (can.restore) buttons.push(<Button key="restore" type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ state: "planned" })}>Bring back</Button>);
  if (can.skip) buttons.push(<Button key="skip" type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run({ state: "skipped" }, () => toast.success(`Skipped ${item.label}.`, { action: { label: "Undo", onClick: () => run({ state: "planned" }) } }))}>Skip</Button>);
  return (
    <>
      {buttons.length ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
      {item.state === "scheduled" && item.scheduledFor ? <p className="text-sm">Scheduled on {item.label} for {formatDay(item.scheduledFor, timeZone)}.</p> : null}
      {scheduling ? (
        <div className="grid gap-2">
          <DateTimeField label={`Scheduled on ${item.label} for`} value={scheduleAt} onChange={setScheduleAt} timeZone={timeZone} clearable={false} hint={`Byline records the time. Schedule it on ${item.label} first.`} />
          <Button type="button" size="sm" className="w-fit" disabled={busy || !scheduleAt} onClick={() => run({ scheduledFor: scheduleAt, state: "scheduled" }, () => { setScheduling(false); toast.success("Recorded as scheduled."); })}>Save</Button>
        </div>
      ) : null}
    </>
  );
}

function PermalinkField({ item, run, busy, error, setError }: { item: Item; run: (patch: DistributionPatch, done?: (next: Item) => void) => void; busy: boolean; error: string; setError: (message: string) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  const blocked = !item.can.post;
  const reason = !item.can.edit ? "Only its owner or an editor records this." : item.problems[0]?.message ?? (item.requiresApproval && !item.approvedAt ? "An editor needs to approve this first." : "");
  const save = () => {
    if (!value.trim()) { setError(`${item.destination.placeholder}.`); return; }
    setError("");
    run({ permalink: value.trim() }, (next) => { setValue(""); toast.success(`${next.label}: ${next.stateLabel.toLowerCase()}.`); });
  };
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{item.destination.permalink === "required" ? `After it's posted` : "Link (optional)"}</FieldLabel>
      <InputGroup>
        <InputGroupInput id={id} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={item.destination.placeholder} value={value} aria-invalid={error ? true : undefined} disabled={blocked || busy}
          onChange={(event) => { setValue(event.target.value); if (error) setError(""); }} onKeyDown={onEnter(save)} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="button" size="sm" variant="secondary" disabled={blocked || busy} onClick={save}><Link2 data-icon="inline-start" />Save link</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{blocked && reason ? reason : `Paste the address of the published post. Byline records it as ${item.destination.postedLabel.toLowerCase()}.`}</FieldDescription>}
    </Field>
  );
}

function PostedSummary({ item }: { item: Item }) {
  return (
    <section className="grid gap-2" aria-label={item.destination.postedLabel}>
      <p className="text-sm">{item.destination.postedLabel}{item.postedBy ? ` by ${item.postedBy.name}` : ""}.</p>
      {item.permalink ? <Button nativeButton={false} size="sm" className="w-fit" render={<a href={item.permalink} target="_blank" rel="noopener noreferrer" />}>Open {item.label} post<ExternalLink data-icon="inline-end" /></Button> : null}
    </section>
  );
}

function SlotField({ slot, name, editable, run, draft, queueCopy, flushCopy }: {
  slot: DistributionSlotView; name: "headline" | "text"; editable: boolean; run: (patch: DistributionPatch) => void;
  draft?: string; queueCopy: (name: "headline" | "text", value: string) => void; flushCopy: () => Promise<boolean>;
}) {
  const id = useId();
  const modeKey = name === "headline" ? "headlineMode" : "textMode";
  const choose = (mode: "story" | "custom") => {
    if (mode === slot.mode) return;
    // Custom starts from the Story. Returning to Story retains the custom copy.
    if (mode === "custom") run({ [modeKey]: "custom", [name]: slot.custom ?? slot.inherited });
    else run({ [modeKey]: "story" });
  };
  const value = slot.mode === "custom" ? draft ?? slot.custom ?? "" : slot.inherited;
  const flush = () => void flushCopy();
  const length = value.trim().length;
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{slot.label}</FieldLabel>
        <ToggleGroup variant="outline" size="sm" spacing={0} aria-label={`${slot.label} source`} value={[slot.mode]} disabled={!editable} onValueChange={(next: unknown[]) => { if (next[0] === "story" || next[0] === "custom") choose(next[0]); }}>
          <ToggleGroupItem value="story">Story</ToggleGroupItem>
          <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {slot.mode === "story" ? (
        <p id={id} className="rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" aria-live="polite">{slot.inherited || <span className="text-muted-foreground">The Story has no {slot.label.toLowerCase()} yet.</span>}</p>
      ) : slot.multiline ? (
        <Textarea id={id} rows={5} className="min-h-28!" value={value} disabled={!editable} onChange={(event) => queueCopy(name, event.target.value)} onBlur={flush} />
      ) : (
        <Input id={id} value={value} disabled={!editable} onChange={(event) => queueCopy(name, event.target.value)} onBlur={flush} onKeyDown={onEnter(flush)} />
      )}
      <FieldDescription className={cn("flex justify-between gap-2", length > slot.max && "text-destructive")}>
        <span>{slot.mode === "story" ? "Follows the Story until you choose Custom." : "Custom for this destination only."}</span>
        {slot.multiline ? <span className="tabular-nums">{length.toLocaleString("en-US")} / {slot.max.toLocaleString("en-US")}</span> : null}
      </FieldDescription>
    </Field>
  );
}

function MediaThumb({ id }: { id: number | null }) {
  const { fetchers } = useMediaWorkspace();
  const asset = useMediaAsset(fetchers, id);
  if (id === null) return <div className="flex aspect-[4/3] w-28 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">No image</div>;
  const preview = asset.data?.previewUrl;
  return preview ? <img src={preview} alt={asset.data?.alt ?? ""} className="aspect-[4/3] w-28 rounded-md bg-muted object-cover" /> : <div className="flex aspect-[4/3] w-28 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">{asset.isError ? "Not in Media" : "…"}</div>;
}

function MediaField({ item, run }: { item: Item; run: (patch: DistributionPatch) => void }) {
  const media = item.media!;
  const { pick } = useMediaWorkspace();
  const editable = item.can.edit;
  const choose = async () => {
    const [chosen] = await pick({ kind: "image", multiple: false, title: `Image for ${item.label}`, confirmLabel: "Use this image" });
    if (chosen) run({ mediaMode: "custom", media: chosen.id });
  };
  const select = (mode: "story" | "custom" | "none") => {
    if (mode === media.mode) return;
    if (mode === "custom" && media.customId === null) void choose();
    else run({ mediaMode: mode });
  };
  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Image</FieldLabel>
        <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Image source" value={[media.mode]} disabled={!editable} onValueChange={(next: unknown[]) => { if (next[0] === "story" || next[0] === "custom" || next[0] === "none") select(next[0]); }}>
          <ToggleGroupItem value="story">Featured image</ToggleGroupItem>
          <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
          {media.use === "optional" ? <ToggleGroupItem value="none">None</ToggleGroupItem> : null}
        </ToggleGroup>
      </div>
      <div className="flex items-end gap-3">
        <MediaThumb id={media.effectiveId} />
        {media.mode === "custom" && editable ? <Button type="button" size="sm" variant="outline" onClick={() => void choose()}><ImagePlus data-icon="inline-start" />Choose…</Button> : null}
      </div>
      <FieldDescription>{media.mode === "story" ? (media.featuredId === null ? "The Story has no featured image." : "Follows the Story's featured image.") : media.mode === "custom" ? "A different image from Media, for this destination only." : "Goes out without an image."}</FieldDescription>
    </Field>
  );
}

function OwnerField({ item, userId, run }: { item: Item; userId: number; run: (patch: DistributionPatch) => void }) {
  type Option = { id: number | null; label: string };
  const options: Option[] = [{ id: null, label: "Unassigned" }, ...item.owners.map((owner) => ({ id: owner.id, label: owner.name }))];
  const selected = options.find((option) => option.id === (item.owner?.id ?? null)) ?? { id: item.owner?.id ?? null, label: item.owner?.name ?? "Unassigned" };
  return (
    <Field>
      <FieldLabel>Owner</FieldLabel>
      {item.can.assign ? (
        <Combobox items={options} value={selected} onValueChange={(next: Option | null) => { if (next && next.id !== (item.owner?.id ?? null)) run({ owner: next.id }); }} itemToStringLabel={(option: Option) => option.label} isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}>
          <ComboboxTrigger render={<Button type="button" variant="outline" size="sm" className="w-full justify-start font-normal sm:w-64" aria-label={`Owner: ${selected.label}`} />}>
            <span className={cn("truncate", item.owner ? "" : "text-muted-foreground")}>{selected.label}</span>
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput showTrigger={false} aria-label="Search people" placeholder="Search…" />
            <ComboboxEmpty>Nobody found.</ComboboxEmpty>
            <ComboboxList>{(option: Option) => <ComboboxItem key={String(option.id)} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className={item.owner ? "" : "text-muted-foreground"}>{item.owner?.name ?? "Unassigned"}</span>
          {item.can.claim ? <Button type="button" size="xs" variant="outline" onClick={() => run({ owner: userId })}>I'll post it</Button> : null}
        </div>
      )}
      <FieldDescription>Who is supposed to {item.destination.verb.toLowerCase()} it.</FieldDescription>
    </Field>
  );
}

function TimeField({ label, timeZone, value, disabled, onCommit }: { label: string; timeZone: string; value: string; disabled: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  // A pick is a draft: it is recorded once, when the calendar closes.
  return <DateTimeField label={label} value={draft} timeZone={timeZone} disabled={disabled} optional onChange={setDraft} onClose={(next) => { if (next !== value) onCommit(next); }} />;
}

function NoteField({ item, run }: { item: Item; run: (patch: DistributionPatch) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(item.note);
  useEffect(() => setDraft(item.note), [item.note]);
  return (
    <Field>
      <FieldLabel htmlFor={id}>Private note</FieldLabel>
      <Textarea id={id} rows={2} className="min-h-0 resize-y" value={draft} disabled={!item.can.annotate} placeholder="For the newsroom only" onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== item.note) run({ note: draft }); }} />
    </Field>
  );
}

function SentHistory({ item, timeZone }: { item: Item; timeZone: string }) {
  return (
    <section className="grid gap-3" aria-label="What went out">
      <h3 className="text-sm font-medium">What went out</h3>
      <ol className="grid gap-3">
        {item.sent.map((entry) => (
          <li key={entry.at} className="grid gap-2 rounded-md border p-3 text-sm">
            <p className="text-xs text-muted-foreground">{item.destination.postedLabel} {formatDay(entry.at, timeZone)}{entry.byName ? ` · ${entry.byName}` : ""}</p>
            {entry.headline ? <p className="font-medium [overflow-wrap:anywhere]">{entry.headline}</p> : null}
            {entry.text ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p> : null}
            {entry.mediaIds.length ? <div className="flex gap-2">{entry.mediaIds.map((mediaId) => <MediaThumb key={mediaId} id={mediaId} />)}</div> : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {entry.permalink ? <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={entry.permalink} target="_blank" rel="noopener noreferrer">Open {entry.label} post<ExternalLink aria-hidden="true" className="size-3" /></a> : null}
              {entry.storyUrl ? <span className="text-muted-foreground [overflow-wrap:anywhere]">{entry.storyUrl}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
