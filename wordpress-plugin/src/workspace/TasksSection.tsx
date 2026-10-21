import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type ContributorEntry, type EditorialTask, type TaskPatch, type TaskPriority } from "../editorial/editorial-model";
import { SelectField, TextField } from "../admin-ui/components/form-fields";
import { AssigneePicker, DatePicker } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Checkbox } from "../admin-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../admin-ui/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Field, FieldLabel } from "../admin-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { WorkspaceDialog } from "./dialog-shell";
import { AddButton, SectionFailed } from "./parts";
import { TASK_PRIORITY_OPTIONS, TaskQuickFields, type TaskQuickUpdate } from "../story/TaskQuickFields";
import { useDialogTarget } from "./dialog-target";
import { appendNewTasks, applyTask } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { completedTasks, dueText, isOverdue, openTasks, peopleOptions } from "./workspace-model";

const TASK_LIMIT = 10;
function TaskItem({ task, timezone, now, busy, editable, people, canAssign, onToggle, onEdit, onUpdate }: { task: EditorialTask; timezone: string; now: Date; busy: boolean; editable: boolean; people: ContributorEntry[]; canAssign: boolean; onToggle: (task: EditorialTask, state: "open" | "completed") => void; onEdit: (task: EditorialTask, element: HTMLElement) => void; onUpdate: TaskQuickUpdate }) {
  const done = task.state === "completed";
  const due = done ? "" : dueText(task.dueAt, timezone, now);
  const overdue = !done && isOverdue(task.dueAt, timezone, now);
  const meta = [task.assignee?.name, task.priority !== "normal" ? TASK_PRIORITY_OPTIONS.find((item) => item.value === task.priority)?.label : ""].filter(Boolean).join(" · ");
  const id = `ws-task-${task.id}`;
  return <ContextMenu>
    <ContextMenuTrigger render={<Item size="sm" data-task-id={task.id} />}>
      <ItemMedia><Checkbox id={id} aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`} checked={done} aria-disabled={busy || undefined} onCheckedChange={(checked) => { if (!busy) onToggle(task, checked ? "completed" : "open"); }} /></ItemMedia>
      <ItemContent>
        <ItemTitle>{editable ? <button type="button" className={done ? "text-left text-muted-foreground line-through hover:underline" : "text-left hover:underline"} onClick={(event) => onEdit(task, event.currentTarget)}>{task.title}</button> : <span className={done ? "text-muted-foreground line-through" : undefined}>{task.title}</span>}</ItemTitle>
        {editable && !done ? <TaskQuickFields task={task} timezone={timezone} now={now} people={people} canAssign={canAssign} disabled={busy} onUpdate={onUpdate} /> : meta ? <ItemDescription>{meta}</ItemDescription> : null}
      </ItemContent>
      {!editable && due ? <ItemActions><time className={`text-xs whitespace-nowrap ${overdue ? "text-warning" : "text-muted-foreground"}`} dateTime={task.dueAt || undefined}>{due}</time></ItemActions> : null}
    </ContextMenuTrigger>
    <ContextMenuContent className="w-48">
      <ContextMenuLabel className="max-w-44 truncate">{task.title}</ContextMenuLabel>
      <ContextMenuSeparator />
      {editable ? <ContextMenuItem disabled={busy} onClick={(event) => onEdit(task, event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit task</ContextMenuItem> : null}
      <ContextMenuItem disabled={busy} onClick={() => onToggle(task, done ? "open" : "completed")}>{done ? "Reopen task" : "Mark complete"}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

type TaskDialogProps = { open: boolean; task: EditorialTask | null; onClose: () => void; finalFocus: () => HTMLElement | null };

function TaskDialog({ open, task, onClose, finalFocus }: TaskDialogProps) {
  const { storyId, editorial, data, timezone, caps, currentUserId, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const people = peopleOptions(data.people);
  const [title, setTitle] = useState(task?.title || "");
  const [assignee, setAssignee] = useState<ContributorEntry | null>(() => task?.assignee ? people.find((person) => Number(person.id) === Number(task.assignee?.id)) ?? task.assignee as ContributorEntry : people.find((person) => Number(person.id) === currentUserId) ?? null);
  const [dueAt, setDueAt] = useState<string | null>(task?.dueAt ?? null);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => editorial.createTask({ title: title.trim(), storyId, assigneeId: Number(assignee?.id) || (caps.assign ? null : currentUserId || null), dueAt, priority }),
    onSuccess: (response) => {
      cache.write((current) => appendNewTasks(current, response.tasks));
      announce("Task added.");
      toast.success("Task added.");
      onClose();
    },
    onError: (failure) => setError(describeEditorialError(failure, "The task couldn't be added. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const edit = useMutation({
    mutationFn: () => editorial.updateTask(task!.id, { title: title.trim(), dueAt, priority, ...(caps.assign ? { assigneeId: Number(assignee?.id) || null } : {}) }),
    onSuccess: (updated) => { cache.write((current) => applyTask(current, updated)); announce("Task saved."); toast.success("Task saved."); onClose(); },
    onError: (failure) => setError(describeEditorialError(failure, "The task couldn't be saved. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });

  const pending = create.isPending || edit.isPending;
  const dirty = task ? title.trim() !== task.title || (task.dueAt || null) !== dueAt || task.priority !== priority || (caps.assign && Number(task.assigneeId || task.assignee?.id || 0) !== Number(assignee?.id || 0)) : Boolean(title.trim() || dueAt || priority !== "normal");

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title={task ? "Edit task" : "Add task"} description="Work that has to happen before this story can run." submitLabel={task ? "Save task" : "Add task"} pendingLabel={task ? "Saving…" : "Adding…"} pending={pending} dirty={dirty} error={error} onSubmit={() => { setAttempted(true); setError(""); if (title.trim()) task ? edit.mutate() : create.mutate(); }}>
    <TextField label="What needs doing?" value={title} onChange={setTitle} maxLength={240} autoFocus error={attempted && !title.trim() ? "Add a title." : undefined} />
    <div className="grid gap-4 sm:grid-cols-2">
      {caps.assign ? <Field><FieldLabel htmlFor="ws-task-assignee">Assigned to</FieldLabel><AssigneePicker id="ws-task-assignee" people={people} value={assignee} onChange={setAssignee} disabled={pending} /></Field> : null}
      <Field><FieldLabel htmlFor="ws-task-due">Due</FieldLabel><DatePicker id="ws-task-due" label="Task due date" value={dueAt} timezone={timezone} onChange={setDueAt} disabled={pending} /></Field>
    </div>
    <SelectField label="Priority" value={priority} options={TASK_PRIORITY_OPTIONS} onChange={(value) => setPriority(value as TaskPriority)} />
  </WorkspaceDialog>;
}

export function TasksSection() {
  const { editorial, data, timezone, now, caps, announce, sectionError, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<EditorialTask>("[data-ws-add=task]");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const failed = sectionError("tasks");
  const open = openTasks(data.tasks);
  const done = completedTasks(data.tasks);

  const setBusyFor = (id: string, on: boolean) => setBusy((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const quickEdit = useMutation({
    mutationFn: ({ task, patch }: { task: EditorialTask; patch: TaskPatch; optimistic?: Partial<EditorialTask> }) => editorial.updateTask(task.id, patch),
    onMutate: async ({ task, patch, optimistic }) => {
      setBusyFor(String(task.id), true);
      await cache.cancel();
      const previous = cache.read()?.tasks.find((item) => String(item.id) === String(task.id)) ?? task;
      cache.write((current) => applyTask(current, { ...previous, ...patch, ...optimistic }));
      return { previous };
    },
    onSuccess: (updated) => cache.write((current) => applyTask(current, updated)),
    onError: (error, { task }, context) => {
      cache.write((current) => applyTask(current, context?.previous ?? task));
      const message = describeEditorialError(error, "The task couldn't be saved. The previous value was restored.");
      announce(message);
      toast.error(message);
    },
    onSettled: (_result, _error, { task }) => { setBusyFor(String(task.id), false); void cache.invalidate(); }
  });

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
      const message = state === "completed" ? `Completed ${task.title}.` : `Reopened ${task.title}.`;
      announce(message);
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: () => {
            void editorial.updateTask(task.id, { state: task.state }).then((restored) => {
              cache.write((current) => applyTask(current, restored));
              announce(`Restored ${task.title}.`);
              void cache.invalidate();
            }).catch((failure) => toast.error(describeEditorialError(failure, "The task change couldn’t be undone.")));
          }
        }
      });
    },
    onError: (error, { task, state }, context) => {
      cache.write((current) => applyTask(current, context?.previous ?? task));
      const message = describeEditorialError(error, state === "completed" ? "The task couldn't be completed. Try again." : "The task couldn't be reopened. Try again.");
      announce(message);
      toast.error(message);
    },
    onSettled: (_result, _error, { task }) => { setBusyFor(String(task.id), false); void cache.invalidate(); }
  });

  const rows = (tasks: EditorialTask[], label: string) => <ItemGroup role="group" aria-label={label} className="gap-0">{tasks.map((task) => <TaskItem key={task.id} task={task} timezone={timezone} now={now} busy={busy.has(String(task.id))} editable={caps.addTask} people={peopleOptions(data.people)} canAssign={caps.assign} onToggle={(item, state) => toggle.mutate({ task: item, state })} onEdit={(item, element) => dialog.openWith(item, element)} onUpdate={(patch, optimistic) => quickEdit.mutate({ task, patch, optimistic })} />)}</ItemGroup>;
  const add = caps.addTask && !failed ? <AddButton data-ws-add="task" onClick={(event) => dialog.openWith(null, event.currentTarget)}>Add task</AddButton> : null;

  return <Card size="sm" role="region" aria-labelledby="ws-tasks-title" id="ws-tasks">
    <CardHeader>
      <CardTitle id="ws-tasks-title" role="heading" aria-level={2}>Tasks</CardTitle>
      {add && (open.length || done.length) ? <CardAction>{add}</CardAction> : null}
    </CardHeader>
    <CardContent className="px-0">
      {failed ? <div className="px-3"><SectionFailed what="tasks" onRetry={() => void reload()} /></div> : <>
        {open.length ? rows(showAll ? open : open.slice(0, TASK_LIMIT), "Open tasks")
          : <div className="px-3"><Empty className="py-5"><EmptyHeader><EmptyTitle>{done.length ? "Nothing left to do." : caps.addTask ? "No tasks yet." : "No tasks are assigned to you."}</EmptyTitle></EmptyHeader>{done.length || !add ? null : <EmptyContent>{add}</EmptyContent>}</Empty></div>}
        {open.length > TASK_LIMIT ? <Button type="button" variant="ghost" size="sm" className="mx-1.5 mt-1 text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer" : `Show ${open.length - TASK_LIMIT} more`}</Button> : null}
        {done.length ? <Collapsible className="mt-1 px-1.5">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
            <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />Completed <span className="font-normal">{done.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>{rows(done, "Completed tasks")}</CollapsibleContent>
        </Collapsible> : null}
      </>}
    </CardContent>
    <TaskDialog key={`task-${dialog.session}`} open={dialog.open} task={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Card>;
}
