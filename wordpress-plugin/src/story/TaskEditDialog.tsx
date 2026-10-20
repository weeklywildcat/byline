import { useEffect, useState } from "react";
import type { ContributorEntry, EditorialTask, TaskPriority } from "../editorial/editorial-model";
import { AssigneePicker, DatePicker } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Spinner } from "../admin-ui/ui/spinner";
import { TASK_PRIORITY_OPTIONS } from "./TaskQuickFields";
import type { StoryFetchers } from "./story-fetchers";
import { useUpdateTask } from "./use-update-task";

export function TaskEditDialog({
  open,
  onClose,
  fetchers,
  task,
  people,
  canAssign,
  timezone
}: {
  open: boolean;
  onClose: () => void;
  fetchers: StoryFetchers;
  task: EditorialTask | null;
  people: ContributorEntry[];
  canAssign: boolean;
  timezone: string;
}) {
  const update = useUpdateTask(fetchers);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<ContributorEntry | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("normal");

  useEffect(() => {
    if (!open || !task) return;
    setTitle(task.title);
    setAssignee(task.assignee ? people.find((person) => Number(person.id) === Number(task.assignee?.id)) || ({ ...task.assignee, kind: "user" } as ContributorEntry) : null);
    setDueAt(task.dueAt || null);
    setPriority(task.priority);
  }, [open, task?.id]);

  if (!task) return null;
  const pending = update.isPending;
  const changed = title.trim() !== task.title || (task.dueAt || null) !== dueAt || task.priority !== priority || (canAssign && Number(task.assigneeId || task.assignee?.id || 0) !== Number(assignee?.id || 0));

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>Change the assignment without leaving what you’re working on.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => {
        event.preventDefault();
        const nextTitle = title.trim();
        if (!nextTitle || !changed) return;
        update.mutate({
          task,
          patch: { title: nextTitle, dueAt, priority, ...(canAssign ? { assigneeId: Number(assignee?.id) || null } : {}) },
          optimistic: { title: nextTitle, dueAt, priority, ...(canAssign ? { assigneeId: Number(assignee?.id) || null, assignee: assignee ? { id: assignee.id, kind: assignee.kind, name: assignee.name, imageUrl: assignee.imageUrl } : null } : {}) }
        }, { onSuccess: onClose });
      }}>
        <FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="task-edit-title">Task</FieldLabel><Input id="task-edit-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required autoFocus disabled={pending} /></Field>
          {canAssign ? <Field><FieldLabel htmlFor="task-edit-assignee">Assigned to</FieldLabel><AssigneePicker id="task-edit-assignee" people={people} value={assignee} onChange={setAssignee} disabled={pending} /></Field> : null}
          <Field><FieldLabel htmlFor="task-edit-due">Due</FieldLabel><DatePicker id="task-edit-due" label="Task due date" value={dueAt} timezone={timezone} onChange={setDueAt} disabled={pending} /></Field>
          <Field><FieldLabel htmlFor="task-edit-priority">Priority</FieldLabel><Select items={TASK_PRIORITY_OPTIONS} value={priority} disabled={pending} onValueChange={(value) => { if (value) setPriority(value as TaskPriority); }}><SelectTrigger id="task-edit-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TASK_PRIORITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
        </FieldGroup>
        <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !title.trim() || !changed}>{pending ? <><Spinner data-icon="inline-start" />Saving…</> : "Save task"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
