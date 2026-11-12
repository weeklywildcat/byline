import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronRight, Clock3, Circle, FileUp, Link2, Mic, Pencil, Plus, StickyNote, UserPlus, CalendarPlus, Camera } from "lucide-react";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { AspectRatio } from "@byline/newsroom-ui/ui/aspect-ratio";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import { AppointmentDialog } from "../workspace/AppointmentDialog";
import { MediaDialog } from "../workspace/MediaDialog";
import { SourceDialog } from "../workspace/SourceDialog";
import { TaskDialog } from "../workspace/TasksSection";
import { useDialogTarget } from "../workspace/dialog-target";
import { BRIEF_MAX, MEDIA_STATUS_LABELS, labelFor } from "../workspace/reporting-model";
import { appointmentTiming, splitAppointments } from "../workspace/schedule-model";
import { applyBrief, applyMedia, applyTask } from "../workspace/workspace-cache";
import { useWorkspace, useWorkspaceCache } from "../workspace/workspace-context";
import { workspaceError, type WorkspaceError } from "../workspace/workspace-errors";
import { completedTasks, dueText, isOverdue, openTasks } from "../workspace/workspace-model";
import type { StoryAppointment, StoryMediaAssignment, StorySource } from "../workspace/workspace-types";

/**
 * Story Context (docs/story-screen.md#context): the complementary
 * information a reporter needs several times per Story — its Angle, where
 * the reporting stands, the media it needs and an optional checklist —
 * beside the article. One component, two presentations: a semantic `<aside>`
 * when the article has room, the same content in a right Sheet when it does
 * not. Sections render only when they matter; nothing here is a Card.
 *
 * It reads the shared Story Workspace (sources, appointments, media work,
 * tasks, the brief) and reuses its dialogs, so there is one way to add a
 * source or an appointment wherever the reporter is.
 */

export type CaptureAction = "note" | "record" | "file" | "photo" | "link" | "transcript";

export type StoryContextProps = {
  /** Opens full Reporting (optionally to capture something there). */
  onOpenReporting: (capture?: CaptureAction) => void;
  /** Host sections placed first (the review feedback a writer must act on). */
  before?: ReactNode;
  /** A lead image is chosen on the article (shown as "Lead image selected"). */
  leadImage?: { url: string | null; alt: string | null } | null;
  /** Reporting capture is available here (the host has a Reporting notebook). */
  canCapture?: boolean;
};

/** A quiet titled group: a small uppercase heading, an optional action, then content. Never a Card. */
export function ContextSection({ id, title, action, children, level = 2 }: { id: string; title: string; action?: ReactNode; children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-context-section={id}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Heading id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StoryContext({ onOpenReporting, before, leadImage, canCapture = true }: StoryContextProps) {
  const { data } = useWorkspace();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const sections: ReactNode[] = [];
  if (before) sections.push(<div key="before">{before}</div>);
  sections.push(<Angle key="angle" />);
  sections.push(<ReportingContext key="reporting" onOpenReporting={onOpenReporting} canCapture={canCapture} />);
  const media = <MediaContext key="media" leadImage={leadImage ?? null} />;
  if (data.mediaAssignments.length || leadImage || data.capabilities.manageMedia) sections.push(media);
  if (data.tasks.length || checklistOpen) sections.push(<Checklist key="checklist" startAdding={checklistOpen} onAdded={() => setChecklistOpen(false)} />);

  return (
    <div className="flex flex-col gap-5" data-story-context="">
      {sections.flatMap((section, index) => (index ? [<Separator key={`separator-${index}`} />, section] : [section]))}
      {!data.tasks.length && !checklistOpen && data.capabilities.addTask ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => setChecklistOpen(true)}>
          <Plus data-icon="inline-start" aria-hidden="true" />Add checklist item
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Angle */

/**
 * What this Story is trying to tell readers. Stored as the plan's brief (the
 * same text and the same conflict check); only the name changed.
 *
 * Plan's Story Brief shows the same text larger, as the assignment
 * (`prominent`), with its own title and prompt.
 */
export type AngleProps = { title?: string; prompt?: string; prominent?: boolean; level?: 2 | 3; id?: string };

export function Angle({ title = "Angle", prompt = "What is this story trying to tell readers?", prominent = false, level = 2, id = "context-angle" }: AngleProps = {}) {
  const { storyId, client, data, caps, reload, announce, sectionError } = useWorkspace();
  const cache = useWorkspaceCache();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<WorkspaceError | null>(null);
  const edit = useRef<HTMLButtonElement | null>(null);
  const failed = sectionError("brief");
  const canEdit = caps.editBrief && !failed;

  const save = useMutation({
    mutationFn: ({ text, expected }: { text: string; expected: string }) => client.saveBrief(storyId, text, expected),
    onMutate: async ({ text }) => {
      setError(null);
      await cache.cancel();
      const previous = cache.read()?.brief ?? "";
      cache.write((current) => applyBrief(current, text));
      return { previous };
    },
    onSuccess: (response) => {
      cache.write((current) => applyBrief(current, response.brief));
      setEditing(false);
      announce("Angle saved.");
      requestAnimationFrame(() => edit.current?.focus());
    },
    onError: (failure, _text, context) => {
      cache.write((current) => applyBrief(current, context?.previous ?? ""));
      setError(workspaceError(failure, "The angle couldn't be saved. Try again."));
    },
    onSettled: () => { void cache.invalidate(); }
  });

  const start = () => { setDraft(data.brief); setError(null); setEditing(true); };
  const cancel = () => { setEditing(false); setError(null); requestAnimationFrame(() => edit.current?.focus()); };

  return (
    <ContextSection id={id} title={title} level={level} action={canEdit && !editing ? <Button ref={edit} type="button" variant="ghost" size="xs" onClick={start} aria-label={`${data.brief ? "Edit" : "Add"} ${title.toLowerCase()}`}><Pencil data-icon="inline-start" aria-hidden="true" />{data.brief ? "Edit" : "Add"}</Button> : null}>
      {failed ? <InlineAlert onAction={() => void reload()}>The angle couldn't be loaded.</InlineAlert> : editing ? (
        // Not a native <form>: this sits inside Payload's document form, where a nested submit reloads the page.
        <div role="group" aria-label={`Edit ${title.toLowerCase()}`} className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`${id}-input`} className="sr-only">{title}</FieldLabel>
            <Textarea id={`${id}-input`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={BRIEF_MAX} rows={prominent ? 7 : 4} autoFocus disabled={save.isPending} placeholder={prompt} onKeyDown={(event) => { if (event.key === "Escape") cancel(); if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft !== data.brief && !save.isPending) { event.preventDefault(); save.mutate({ text: draft, expected: data.brief }); } }} />
            <FieldDescription>Private to the newsroom. Never article copy.</FieldDescription>
          </Field>
          {error ? <InlineAlert onAction={error.conflict ? () => void reload().then(() => setDraft(cache.read()?.brief ?? "")) : undefined} actionLabel="Reload latest">{error.message}</InlineAlert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={save.isPending}>Cancel</Button>
            <Button type="button" size="sm" disabled={save.isPending || draft === data.brief} onClick={() => save.mutate({ text: draft, expected: data.brief })}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save</Button>
          </div>
        </div>
      ) : data.brief
        ? <p className={prominent ? "max-w-prose text-base/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" : "text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"} data-story-brief-text="">{data.brief}</p>
        : <p className="text-sm text-muted-foreground">{canEdit ? prompt : `No ${title.toLowerCase()} yet.`}</p>}
    </ContextSection>
  );
}

/* --------------------------------------------------------------- Reporting */

const DAY = 86_400_000;

function sourceLine(source: StorySource, now: Date): { icon: ReactNode; detail: string } {
  if (source.status === "interviewed") return { icon: <Check aria-label="Interviewed" />, detail: "Interviewed" };
  if (source.status === "waiting" || source.status === "contacted") {
    const days = Math.max(0, Math.floor((now.getTime() - Date.parse(source.updatedAt)) / DAY));
    return { icon: <Clock3 aria-label="Waiting" />, detail: days ? `Waiting · ${days} ${days === 1 ? "day" : "days"}` : "Waiting" };
  }
  if (source.status === "scheduled") return { icon: <Clock3 aria-label="Scheduled" />, detail: "Scheduled" };
  if (source.status === "declined" || source.status === "unavailable") return { icon: <Circle aria-label={source.status} />, detail: source.status === "declined" ? "Declined" : "Unavailable" };
  return { icon: <Circle aria-label="Not yet contacted" />, detail: source.role || "To contact" };
}

export function ReportingContext({ onOpenReporting, canCapture }: { onOpenReporting: (capture?: CaptureAction) => void; canCapture: boolean }) {
  const { data, timezone, caps, now, sectionError, reload } = useWorkspace();
  const sourceDialog = useDialogTarget<StorySource>("[data-context-add=reporting]");
  const appointmentDialog = useDialogTarget<StoryAppointment>("[data-context-add=reporting]");
  const failed = sectionError("reporting");
  const { days } = splitAppointments(data.appointments, timezone);
  const upcoming = days.flatMap((day) => day.items).filter((item) => item.status !== "completed" && item.status !== "cancelled").slice(0, 2);
  const sources = [...data.sources].sort((a, b) => Number(a.status === "interviewed") - Number(b.status === "interviewed")).slice(0, 4);
  const more = data.sources.length - sources.length;
  const canAdd = caps.addSource || caps.addAppointment || canCapture;

  const add = canAdd ? (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Add reporting" data-context-add="reporting" />}><Plus aria-hidden="true" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add to reporting</DropdownMenuLabel>
          {caps.addSource ? <DropdownMenuItem onClick={() => sourceDialog.openWith(null)}><UserPlus aria-hidden="true" />Add source</DropdownMenuItem> : null}
          {caps.addAppointment ? <DropdownMenuItem onClick={() => appointmentDialog.openWith(null)}><CalendarPlus aria-hidden="true" />Add interview or event</DropdownMenuItem> : null}
        </DropdownMenuGroup>
        {canCapture ? <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onOpenReporting("note")}><StickyNote aria-hidden="true" />Capture note</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenReporting("record")}><Mic aria-hidden="true" />Record audio</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenReporting("file")}><FileUp aria-hidden="true" />Upload file</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenReporting("photo")}><Camera aria-hidden="true" />Add photo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenReporting("link")}><Link2 aria-hidden="true" />Add link</DropdownMenuItem>
          </DropdownMenuGroup>
        </> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <ContextSection id="context-reporting" title="Reporting" action={add}>
      {failed ? <InlineAlert onAction={() => void reload()}>Reporting couldn't be loaded.</InlineAlert> : (
        <>
          {sources.length ? (
            <ItemGroup className="gap-0" aria-label="Sources">
              {sources.map((source) => {
                const line = sourceLine(source, now);
                return (
                  <Item key={source.id} size="xs" className="px-0" render={<button type="button" onClick={() => sourceDialog.openWith(source)} />}>
                    <ItemMedia variant="icon" className="text-muted-foreground [&_svg]:size-4">{line.icon}</ItemMedia>
                    <ItemContent>
                      <ItemTitle className="font-normal">{source.label}</ItemTitle>
                      <ItemDescription>{line.detail}</ItemDescription>
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          ) : <p className="text-sm text-muted-foreground">No sources yet.{caps.addSource ? " " : ""}{caps.addSource ? <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => sourceDialog.openWith(null)}>Add source</Button> : null}</p>}
          {more > 0 ? <p className="text-xs text-muted-foreground">and {more} more</p> : null}
          {upcoming.length ? (
            <div className="flex flex-col gap-1 pt-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Up next</h3>
              <ItemGroup className="gap-0" aria-label="Up next">
                {upcoming.map((appointment) => (
                  <Item key={appointment.id} size="xs" className="px-0" render={<button type="button" onClick={() => appointmentDialog.openWith(appointment)} />}>
                    <ItemContent>
                      <ItemDescription>{appointmentTiming(appointment, timezone).primary}</ItemDescription>
                      <ItemTitle className="font-normal">{appointment.title}</ItemTitle>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          ) : null}
          <Button type="button" variant="link" size="sm" className="h-auto w-fit p-0" onClick={() => onOpenReporting()}>Open reporting<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
        </>
      )}
      <SourceDialog key={`source-${sourceDialog.session}`} open={sourceDialog.open} source={sourceDialog.target} onClose={sourceDialog.close} finalFocus={sourceDialog.finalFocus} />
      <AppointmentDialog key={`appointment-${appointmentDialog.session}`} open={appointmentDialog.open} appointment={appointmentDialog.target} onClose={appointmentDialog.close} finalFocus={appointmentDialog.finalFocus} />
    </ContextSection>
  );
}

/* ------------------------------------------------------------------- Media */

function mediaDone(assignment: StoryMediaAssignment): boolean {
  return assignment.status === "done" || assignment.status === "selected";
}

export function MediaContext({ leadImage, title = "Media", level = 2, id = "context-media" }: { leadImage: { url: string | null; alt: string | null } | null; title?: string; level?: 2 | 3; id?: string }) {
  const { storyId, client, data, timezone, now, caps, currentUserId, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<StoryMediaAssignment>("[data-context-add=media]");
  const complete = useMutation({
    mutationFn: ({ assignment, status }: { assignment: StoryMediaAssignment; status: "done" | "in-progress" }) => client.saveMediaAssignment(storyId, { status, expectedUpdatedAt: assignment.updatedAt }, assignment.id),
    onMutate: async ({ assignment, status }) => {
      await cache.cancel();
      const previous = cache.read();
      cache.write((current) => current ? { ...current, mediaAssignments: current.mediaAssignments.map((item) => item.id === assignment.id ? { ...item, status } : item) } : current);
      return { previous };
    },
    onSuccess: (response, { assignment, status }) => {
      cache.write((current) => applyMedia(current, response));
      const message = status === "done" ? `Marked ${assignment.title} done.` : `Reopened ${assignment.title}.`;
      announce(message);
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: () => {
            void client.saveMediaAssignment(storyId, { status: assignment.status }, assignment.id).then((restored) => {
              cache.write((current) => applyMedia(current, restored));
              announce(`Restored ${assignment.title}.`);
              void cache.invalidate();
            }).catch((failure) => toast.error(workspaceError(failure, "The media status change couldn’t be undone.").message));
          }
        }
      });
    },
    onError: (failure, _variables, context) => {
      if (context?.previous) cache.write(() => context.previous);
      const message = workspaceError(failure, "The media status couldn’t be saved. Try again.").message;
      announce(message);
      toast.error(message);
    },
    onSettled: () => { void cache.invalidate(); }
  });
  const assignments = [...data.mediaAssignments].sort((a, b) => a.order - b.order);
  return (
    <ContextSection id={id} title={title} level={level}>
      {leadImage?.url ? (
        <div className="flex items-center gap-3">
          <div className="w-16 shrink-0 overflow-hidden rounded-md bg-muted"><AspectRatio ratio={3 / 2}><img src={leadImage.url} alt={leadImage.alt ?? ""} className="size-full object-cover" /></AspectRatio></div>
          <p className="flex items-center gap-1.5 text-sm"><Check className="size-4 text-muted-foreground" aria-hidden="true" />Lead image selected</p>
        </div>
      ) : null}
      {assignments.length ? (
        <ItemGroup className="gap-0" aria-label="Media work">
          {assignments.map((assignment) => {
            const done = mediaDone(assignment);
            const due = done ? "" : dueText(assignment.dueAt, timezone, now);
            return (
              <Item key={assignment.id} size="xs" className="px-0" data-plan-media-assignment={assignment.id}>
                <ItemMedia>
                  {caps.manageMedia || assignment.assigneeId === currentUserId
                    ? <Checkbox aria-label={done ? `Reopen ${assignment.title}` : `Mark ${assignment.title} done`} checked={done} disabled={complete.isPending && complete.variables?.assignment.id === assignment.id} onCheckedChange={(checked) => complete.mutate({ assignment, status: checked ? "done" : "in-progress" })} />
                    : done ? <Check aria-label="Done" className="size-4 text-muted-foreground" /> : <Circle aria-label="Open" className="size-4 text-muted-foreground" />}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle><button type="button" className={done ? "touch-hit text-left font-normal text-muted-foreground line-through hover:underline" : "touch-hit text-left font-normal hover:underline"} onClick={(event) => dialog.openWith(assignment, event.currentTarget)}>{assignment.title}</button></ItemTitle>
                  <ItemDescription>
                    {[assignment.assignee?.name ?? "No one assigned", done ? labelFor(MEDIA_STATUS_LABELS, assignment.status) : due].filter(Boolean).join(" · ")}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {!done && isOverdue(assignment.dueAt, timezone, now) ? <span className="text-xs text-warning">Late</span> : null}
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit media assignment: ${assignment.title}`} onClick={(event) => dialog.openWith(assignment, event.currentTarget)}><Pencil /></Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      ) : null}
      {!assignments.length && !leadImage?.url ? <p className="text-sm text-muted-foreground">No photos, video or graphics assigned.</p> : null}
      {caps.manageMedia ? <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" data-context-add="media" onClick={(event) => dialog.openWith(null, event.currentTarget)}><Plus data-icon="inline-start" aria-hidden="true" />Add media assignment</Button> : null}
      <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
    </ContextSection>
  );
}

/* --------------------------------------------------------------- Checklist */

/**
 * Small things that don't belong anywhere better: confirm a number, check a
 * spelling. (Interviews are sources and appointments, photos are media,
 * writing is the Story, editing is review.) Stored as the Story's tasks.
 */
export function Checklist({ startAdding, onAdded, title = "Checklist", addLabel = "Add checklist item", level = 2, id = "context-checklist" }: { startAdding?: boolean; onAdded?: () => void; title?: string; addLabel?: string; level?: 2 | 3; id?: string }) {
  const { editorial, data, timezone, now, caps, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<EditorialTask>("[data-context-add=checklist]");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const started = useRef(false);
  if (startAdding && !started.current && !dialog.open) {
    started.current = true;
    queueMicrotask(() => dialog.openWith(null));
  }
  const open = openTasks(data.tasks);
  const done = completedTasks(data.tasks);
  const toggle = useMutation({
    mutationFn: ({ task, state }: { task: EditorialTask; state: "open" | "completed" }) => editorial.updateTask(task.id, { state }),
    onMutate: async ({ task, state }) => {
      setBusy((current) => new Set(current).add(String(task.id)));
      await cache.cancel();
      cache.write((current) => applyTask(current, setTaskCompletionState(task, state)));
    },
    onSuccess: (updated, { task, state }) => {
      cache.write((current) => applyTask(current, updated));
      announce(state === "completed" ? `Checked off ${task.title}.` : `Unchecked ${task.title}.`);
    },
    onError: (failure, { task }) => {
      cache.write((current) => applyTask(current, task));
      toast.error(workspaceError(failure, "That couldn't be saved. Try again.").message);
    },
    onSettled: (_result, _error, { task }) => {
      setBusy((current) => { const next = new Set(current); next.delete(String(task.id)); return next; });
      void cache.invalidate();
    }
  });

  const row = (task: EditorialTask) => {
    const complete = task.state === "completed";
    const due = complete ? "" : dueText(task.dueAt, timezone, now);
    const id = `context-check-${task.id}`;
    return (
      <Item key={task.id} size="xs" className="px-0">
        <ItemMedia><Checkbox id={id} checked={complete} aria-disabled={busy.has(String(task.id)) || undefined} onCheckedChange={(checked) => { if (!busy.has(String(task.id))) toggle.mutate({ task, state: checked ? "completed" : "open" }); }} /></ItemMedia>
        <ItemContent>
          <ItemTitle className="font-normal"><label htmlFor={id} className={complete ? "text-muted-foreground line-through" : undefined}>{task.title}</label></ItemTitle>
          {due || task.assignee ? <ItemDescription className={isOverdue(task.dueAt, timezone, now) && !complete ? "text-warning" : undefined}>{[due, task.assignee?.name].filter(Boolean).join(" · ")}</ItemDescription> : null}
        </ItemContent>
        {caps.addTask ? <ItemActions><Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${task.title}`} onClick={(event) => dialog.openWith(task, event.currentTarget)}><Pencil aria-hidden="true" /></Button></ItemActions> : null}
      </Item>
    );
  };

  return (
    <ContextSection id={id} title={title} level={level}>
      {open.length ? <ItemGroup className="gap-0" aria-label={`${title}: open`}>{open.map(row)}</ItemGroup> : <p className="text-sm text-muted-foreground">{done.length ? "All done." : "Nothing on the checklist."}</p>}
      {done.length ? (
        <Collapsible>
          <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" />}>
            <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />{done.length} completed
          </CollapsibleTrigger>
          <CollapsibleContent><ItemGroup className="gap-0" aria-label="Completed">{done.map(row)}</ItemGroup></CollapsibleContent>
        </Collapsible>
      ) : null}
      {/* A labelled add, like Add media assignment: an icon-only "+" beside the heading was easy to miss and unclear. */}
      {caps.addTask ? <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" data-context-add="checklist" onClick={(event) => dialog.openWith(null, event.currentTarget)}><Plus data-icon="inline-start" aria-hidden="true" />{addLabel}</Button> : null}
      <TaskDialog key={`task-${dialog.session}`} open={dialog.open} task={dialog.target} wording="checklist" onClose={() => { dialog.close(); onAdded?.(); }} finalFocus={dialog.finalFocus} />
    </ContextSection>
  );
}
