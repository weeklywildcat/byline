import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type ContributorEntry, type EditorialTask } from "../editorial/editorial-model";
import { EmptyState } from "../admin-ui/components/empty-state";
import { TextField } from "../admin-ui/components/form-fields";
import { ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { AssigneePicker, DatePicker } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Checkbox } from "../admin-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../admin-ui/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../admin-ui/ui/field";
import { WorkspaceDialog } from "./dialog-shell";
import { AddButton, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { appendNewTasks, applyTask } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { completedTasks, dueText, isOverdue, openTasks, peopleOptions } from "./workspace-model";

const TASK_LIMIT = 10;

function TaskItem({ task, timezone, now, busy, onToggle }: { task: EditorialTask; timezone: string; now: Date; busy: boolean; onToggle: (task: EditorialTask, state: "open" | "completed") => void }) {
  const done = task.state === "completed";
  const due = done ? "" : dueText(task.dueAt, timezone, now);
  const overdue = !done && isOverdue(task.dueAt, timezone, now);
  const meta = [task.assignee?.name, task.priority === "urgent" ? "Urgent" : ""].filter(Boolean).join(" · ");
  const id = `ws-task-${task.id}`;
  return <Field orientation="horizontal" role="none" data-task-id={task.id} className="px-3 py-2.5 hover:bg-muted">
    <Checkbox id={id} aria-label={task.title} checked={done} aria-disabled={busy || undefined} onCheckedChange={(checked) => { if (!busy) onToggle(task, checked ? "completed" : "open"); }} />
    <FieldContent>
      <FieldLabel htmlFor={id} className={done ? "font-medium text-muted-foreground line-through" : "font-medium"}>{task.title}</FieldLabel>
      {meta ? <FieldDescription>{meta}</FieldDescription> : null}
    </FieldContent>
    {due ? <time className={`text-xs whitespace-nowrap ${overdue ? "text-warning" : "text-muted-foreground"}`} dateTime={task.dueAt || undefined}>{due}</time> : null}
  </Field>;
}

type TaskDialogProps = { open: boolean; onClose: () => void; finalFocus: () => HTMLElement | null };

function TaskDialog({ open, onClose, finalFocus }: TaskDialogProps) {
  const { storyId, editorial, data, timezone, caps, currentUserId, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const people = peopleOptions(data.people);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<ContributorEntry | null>(() => people.find((person) => Number(person.id) === currentUserId) ?? null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => editorial.createTask({ title: title.trim(), storyId, assigneeId: Number(assignee?.id) || (caps.assign ? null : currentUserId || null), dueAt, priority: "normal" }),
    onSuccess: (response) => {
      cache.write((current) => appendNewTasks(current, response.tasks));
      announce("Task added.");
      toast.success("Task added.");
      onClose();
    },
    onError: (failure) => setError(describeEditorialError(failure, "The task couldn't be added. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title="Add task" description="Work that has to happen before this story can run." submitLabel="Add task" pendingLabel="Adding…" pending={create.isPending} error={error} onSubmit={() => { setAttempted(true); setError(""); if (title.trim()) create.mutate(); }}>
    <TextField label="What needs doing?" value={title} onChange={setTitle} maxLength={240} autoFocus error={attempted && !title.trim() ? "Add a title." : undefined} />
    <div className="grid gap-4 sm:grid-cols-2">
      {caps.assign ? <Field><FieldLabel htmlFor="ws-task-assignee">Assigned to</FieldLabel><AssigneePicker id="ws-task-assignee" people={people} value={assignee} onChange={setAssignee} /></Field> : null}
      <Field><FieldLabel htmlFor="ws-task-due">Due</FieldLabel><DatePicker id="ws-task-due" label="Task due date" value={dueAt} timezone={timezone} onChange={setDueAt} /></Field>
    </div>
  </WorkspaceDialog>;
}

export function TasksSection() {
  const { editorial, data, timezone, now, caps, announce, sectionError, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<true>("[data-ws-add=task]");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const failed = sectionError("tasks");
  const open = openTasks(data.tasks);
  const done = completedTasks(data.tasks);

  const setBusyFor = (id: string, on: boolean) => setBusy((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const toggle = useMutation({
    mutationFn: ({ task, state }: { task: EditorialTask; state: "open" | "completed" }) => editorial.updateTask(task.id, { state }),
    onMutate: async ({ task, state }) => {
      setBusyFor(String(task.id), true);
      await cache.cancel();
      const previous = cache.read()?.tasks.find((item) => String(item.id) === String(task.id)) ?? task;
      cache.write((current) => applyTask(current, setTaskCompletionState(previous, state)));
      return { previous };
    },
    onSuccess: (updated, { task, state }) => {
      cache.write((current) => applyTask(current, updated));
      announce(state === "completed" ? `Completed ${task.title}.` : `Reopened ${task.title}.`);
    },
    onError: (error, { task, state }, context) => {
      cache.write((current) => applyTask(current, context?.previous ?? task));
      const message = describeEditorialError(error, state === "completed" ? "The task couldn't be completed. Try again." : "The task couldn't be reopened. Try again.");
      announce(message);
      toast.error(message);
    },
    onSettled: (_result, _error, { task }) => { setBusyFor(String(task.id), false); void cache.invalidate(); }
  });

  const rows = (tasks: EditorialTask[]) => <ItemList>{tasks.map((task) => <TaskItem key={task.id} task={task} timezone={timezone} now={now} busy={busy.has(String(task.id))} onToggle={(item, state) => toggle.mutate({ task: item, state })} />)}</ItemList>;
  const add = caps.addTask && !failed ? <AddButton data-ws-add="task" onClick={(event) => dialog.openWith(true, event.currentTarget)}>Add task</AddButton> : null;

  return <Panel id="ws-tasks" title="Tasks" action={open.length || done.length ? add : null} contentClassName="px-0">
    {failed ? <SectionFailed what="tasks" onRetry={() => void reload()} /> : <>
      {open.length ? rows(showAll ? open : open.slice(0, TASK_LIMIT))
        : <div className="px-3"><EmptyState title={done.length ? "Nothing left to do." : caps.addTask ? "No tasks yet." : "No tasks are assigned to you."}>{done.length ? null : add}</EmptyState></div>}
      {open.length > TASK_LIMIT ? <Button type="button" variant="ghost" size="sm" className="mx-1.5 mt-1 text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer" : `Show ${open.length - TASK_LIMIT} more`}</Button> : null}
      {done.length ? <Collapsible className="mt-1 px-1.5">
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
          <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />Completed <span className="font-normal">{done.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>{rows(done)}</CollapsibleContent>
      </Collapsible> : null}
    </>}
    <TaskDialog key={`task-${dialog.session}`} open={dialog.open} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Panel>;
}
