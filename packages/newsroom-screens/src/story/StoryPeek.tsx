import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, MessageSquareText } from "lucide-react";
import type { ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { AssigneePicker, DatePicker, WritersPicker, fieldRow } from "../editorial/pickers";
import { buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Field, FieldContent, FieldGroup, FieldTitle } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { appointmentLine } from "../workspace/schedule-model";
import { sectionNames } from "../workspace/workspace-model";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { leadingSignals, relativeDay, type AttentionSignal } from "./attention";
import { openNotesLabel, visibleNotes } from "./notes-model";
import { RowSkeletons } from "./rows";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData, workspaceKey } from "./story-query";

/** How many attention lines the Peek shows: enough to orient, never a task list. */
const PEEK_NEXT = 3;

type PlanPatch = { deadline?: string | null; editorId?: number | null };

export type PeekNextLine = { key: string; title: string; detail: string | null; icon?: ReactNode; href?: string; external?: boolean };

/**
 * What this Story needs next: Story Attention (story/attention.ts, the
 * server's one calculation), then the next appointment when no signal covers
 * it, then open article notes. Hosts without attention (WordPress) still get
 * the appointment and notes lines. Nothing here recalculates attention.
 */
export function peekNextLines(data: StoryWorkspace, timezone: string): PeekNextLine[] {
  const lines: PeekNextLine[] = [];
  // "Due Friday" is already the Deadline row; every other signal is new information.
  const attention = data.story.attention ? { ...data.story.attention, signals: data.story.attention.signals.filter((signal) => signal.kind !== "deadline-soon") } : null;
  const signals: AttentionSignal[] = leadingSignals(attention, PEEK_NEXT);
  for (const signal of signals) lines.push({ key: `signal-${signal.kind}`, title: signal.label, detail: signal.detail });
  const next = (data.reporting ?? data.story.reporting)?.nextAppointment;
  if (next && !signals.some((signal) => signal.kind === "appointment-soon")) {
    lines.push({ key: "appointment", title: next.title, detail: appointmentLine({ ...next, status: "confirmed", endAt: null }, timezone), icon: <CalendarClock aria-hidden="true" /> });
  }
  const notes = visibleNotes(data.story.notes);
  if (notes && notes.openCount > 0 && notes.editUrl) {
    lines.push({ key: "notes", title: openNotesLabel(notes.openCount), detail: "Review in editor", icon: <MessageSquareText aria-hidden="true" />, href: notes.editUrl, external: true });
  }
  return lines;
}

function NextItem({ line }: { line: PeekNextLine }) {
  const body = <>
    {line.icon ? <ItemMedia variant="icon" className="text-muted-foreground">{line.icon}</ItemMedia> : null}
    <ItemContent><ItemTitle className="[overflow-wrap:anywhere]">{line.title}</ItemTitle>{line.detail ? <ItemDescription>{line.detail}</ItemDescription> : null}</ItemContent>
    {line.href ? <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />{line.external ? <span className="sr-only">(opens in a new tab)</span> : null}</ItemActions> : null}
  </>;
  return line.href
    ? <Item size="sm" render={<a href={line.href} {...(line.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-peek-next={line.key} {...(line.key === "notes" ? { "data-peek-notes": "" } : {})} />}>{body}</Item>
    : <Item size="sm" data-peek-next={line.key}>{body}</Item>;
}

export type StoryPeekContentProps = {
  data: StoryWorkspace;
  timezone: string;
  now: Date;
  workspaceUrl?: (storyId: number) => string;
  /** Quick edits; each control appears only for a reader with that capability. */
  onPlan: (patch: PlanPatch) => void;
  onWriters: (writers: ContributorEntry[]) => void;
  planning: boolean;
  writing: boolean;
  error: string;
};

/**
 * Story Peek's content (docs/story-screen.md#peek): is this the Story I
 * meant, where is it in the lifecycle, and what needs it next. The only edits
 * are the editor's quick ones — writers, editor, deadline; everything else
 * (reporting, media, checklist, files, activity) happens in the Story.
 */
export function StoryPeekContent({ data, timezone, now, workspaceUrl, onPlan, onWriters, planning, writing, error }: StoryPeekContentProps) {
  const { story } = data;
  const caps = data.capabilities;
  const writers = data.contributors.contributors.length ? data.contributors.contributors : story.authors;
  const editor: ContributorEntry | null = story.editor ? (data.people.find((person) => Number(person.id) === story.editor!.id) ?? { id: story.editor.id, name: story.editor.name, kind: "user" }) : null;
  const due = story.deadline ? `Due ${relativeDay(story.deadline.slice(0, 10), { now, timeZone: timezone })}` : "";
  const storyHref = workspaceUrl?.(story.id) || story.editUrl;
  const next = peekNextLines(data, timezone);
  return <>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      <FieldGroup className="gap-1 py-3" data-peek-facts="">
        <Field orientation="horizontal" className={fieldRow.field}>
          <FieldTitle className={fieldRow.label}>Writers</FieldTitle>
          <FieldContent className={fieldRow.value}>{data.contributors.canEdit
            ? <WritersPicker people={data.contributors.available || []} value={data.contributors.contributors} onChange={onWriters} disabled={writing} />
            : <span className="py-1 text-sm">{writers.map((person) => person.name).join(", ") || "No writers yet"}</span>}</FieldContent>
        </Field>
        <Field orientation="horizontal" className={fieldRow.field}>
          <FieldTitle className={fieldRow.label}>Editor</FieldTitle>
          <FieldContent className={fieldRow.value}>{caps.assign
            ? <AssigneePicker appearance="value" label="Editor" placeholder="Assign an editor" people={data.people} value={editor} disabled={planning} onChange={(person) => onPlan({ editorId: person ? Number(person.id) : null })} />
            : <span className="py-1 text-sm">{editor?.name ?? "No editor yet"}</span>}</FieldContent>
        </Field>
        <Field orientation="horizontal" className={fieldRow.field}>
          <FieldTitle className={fieldRow.label}>Deadline</FieldTitle>
          <FieldContent className={fieldRow.value}>{caps.assign
            ? <DatePicker appearance="value" label="Deadline" dateOnly value={story.deadline} displayValue={due} placeholder="Set a deadline" timezone={timezone} disabled={planning} onChange={(deadline) => onPlan({ deadline })} />
            : <span className="py-1 text-sm">{due || "No deadline"}</span>}</FieldContent>
        </Field>
        {error ? <InlineAlert>{error}</InlineAlert> : null}
      </FieldGroup>

      <section aria-labelledby="peek-next" className="flex flex-col gap-1 border-t py-3" data-peek-next-section="">
        <h3 id="peek-next" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next</h3>
        {next.length
          ? <ItemGroup aria-labelledby="peek-next" className="-mx-3 w-auto gap-0">{next.map((line) => <NextItem key={line.key} line={line} />)}</ItemGroup>
          : <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>}
      </section>
    </div>
    <SheetFooter className="flex-row items-center justify-end gap-2 border-t">
      {data.previewUrl ? <a className={buttonVariants({ variant: "outline" })} href={data.previewUrl} target="_blank" rel="noopener noreferrer">Preview<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : null}
      {storyHref ? <a className={buttonVariants()} href={storyHref} data-peek-open="">Open story</a> : null}
    </SheetFooter>
  </>;
}

export type StoryPeekProps = { storyId: number | null; fetchers: StoryFetchers; /** Used until the workspace names the site timezone. */ timezone?: string; onClose: () => void; origin: HTMLElement | null; now: Date; workspaceUrl?: (storyId: number) => string };

/** The one Story Peek (docs/stories-planning-ui.md): a right Sheet over Home, Stories, Calendar, Media and Collections. */
export function StoryPeek({ storyId, fetchers, timezone, onClose, origin, now, workspaceUrl }: StoryPeekProps) {
  const client = useQueryClient();
  const peek = useQuery({ queryKey: workspaceKey(storyId || 0), queryFn: () => fetchers.getWorkspace!(storyId!), enabled: Boolean(storyId && fetchers.getWorkspace) });
  const data = peek.data;
  const story = data?.story;
  const [editError, setEditError] = useState("");
  const refresh = () => invalidateStoryData(client, storyId);

  const planning = useMutation({
    mutationFn: (patch: PlanPatch) => fetchers.editorial!.updateWorkflow(storyId!, { ...patch, expectedRevision: data?.revision }),
    onMutate: async (patch) => {
      setEditError("");
      await client.cancelQueries({ queryKey: workspaceKey(storyId!) });
      const previous = client.getQueryData<StoryWorkspace>(workspaceKey(storyId!));
      client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => {
        if (!old) return old;
        const person = patch.editorId ? old.people.find((candidate) => Number(candidate.id) === patch.editorId) : null;
        return { ...old, story: {
          ...old.story,
          ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
          ...(patch.editorId !== undefined ? { editor: person ? { id: Number(person.id), name: person.name } : null } : {})
        } };
      });
      return previous;
    },
    onError: (error, _patch, previous) => { if (previous) client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (current) => current ? { ...current, story: previous.story } : current); setEditError(describeEditorialError(error, "The story couldn't be updated. Try again.")); },
    onSettled: refresh
  });
  const writers = useMutation({ mutationFn: (value: ContributorEntry[]) => fetchers.editorial!.saveContributors(storyId!, value), onError: (error) => setEditError(describeEditorialError(error, "Writers couldn't be saved.")), onSuccess: refresh });

  const description = story && data ? [story.workflow.label, sectionNames(data.sections)].filter(Boolean).join(" · ") : "Story";
  return <Sheet open={Boolean(storyId)} onOpenChange={(open) => { if (!open && !writers.isPending && !planning.isPending) { setEditError(""); onClose(); } }}>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sm" finalFocus={() => { if (origin?.isConnected) return origin; return document.querySelector<HTMLElement>("[data-home-search]"); }}>
      <SheetHeader className="gap-1 border-b pr-12">
        <SheetTitle className="text-lg leading-snug [overflow-wrap:anywhere]">{decodeEntities(story?.title) || "Story"}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {peek.isPending ? <div className="py-4"><RowSkeletons count={4} /></div> : peek.isError || !story || !data ? <div className="p-4"><InlineAlert title="The story couldn't be loaded." onAction={() => void peek.refetch()}>{describeEditorialError(peek.error, "The story couldn't be loaded.")}</InlineAlert></div>
        : <StoryPeekContent data={data} timezone={data.timezone || timezone || "UTC"} now={now} workspaceUrl={workspaceUrl}
          onPlan={(patch) => planning.mutate(patch)} onWriters={(value) => writers.mutate(value)}
          planning={planning.isPending} writing={writers.isPending} error={editError} />}
    </SheetContent>
  </Sheet>;
}
