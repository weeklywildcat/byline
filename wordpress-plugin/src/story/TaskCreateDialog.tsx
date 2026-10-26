import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeEditorialError, type ContributorEntry, type TaskPriority } from "../editorial/editorial-model";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { AssigneePicker, DatePicker } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "../admin-ui/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Spinner } from "../admin-ui/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { TASK_PRIORITY_OPTIONS } from "./TaskQuickFields";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData } from "./story-query";

export type TaskStoryChoice = { id: number; title: string };

export type TaskCreateDialogProps = {
  collectionId?: number;
  onCreated?: () => void;
  open: boolean;
  onClose: () => void;
  fetchers: StoryFetchers;
  /** Stories a task can be linked to. */
  stories: TaskStoryChoice[];
  /** Preselects a story (from Story Peek's Add task, or Home's story rows). */
  storyId?: number | null;
  people: ContributorEntry[];
  currentUser?: { id: number; name: string } | null;
  /** Only people who can assign work see the assignee picker. */
  canAssign: boolean;
  timezone: string;
};

/** The one New task experience: a title, the story it belongs to, an assignee and a due date. */
export function TaskCreateDialog({ open, onClose, fetchers, stories, storyId, people, currentUser, canAssign, timezone, collectionId, onCreated }: TaskCreateDialogProps) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(storyId || null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<ContributorEntry | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  useEffect(() => { setError(""); setSelectedStoryId(storyId || null); setDueAt(null); setAssignee(currentUser ? { ...currentUser, kind: "user" } : null); setPriority("normal"); }, [open, storyId, currentUser?.id]);
  const create = useMutation({
    mutationFn: async (title: string) => {
      if (!selectedStoryId && !collectionId) throw new Error("Choose a story for this task.");
      await fetchers.editorial!.createTask({ title, storyId: selectedStoryId, ...(collectionId ? { collectionId } : {}), assigneeId: Number(assignee?.id) || null, dueAt, priority });
    },
    onSuccess: () => { void invalidateStoryData(client, selectedStoryId); onCreated?.(); onClose(); },
    onError: (failure) => setError(describeEditorialError(failure, "The task couldn't be created. Try again."))
  });
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !create.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>Keep the work linked to its story.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title") || "").trim(); if (title) create.mutate(title); }}>
        <FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="task-create-title">Task title</FieldLabel><Input id="task-create-title" name="title" required maxLength={240} autoFocus disabled={create.isPending} /></Field>
          <Field><FieldLabel htmlFor="task-create-story">Story</FieldLabel><Combobox items={stories} itemToStringLabel={(s) => s.title} isItemEqualToValue={(a, b) => a.id === b.id} value={stories.find((s) => s.id === selectedStoryId) || null} onValueChange={(s) => setSelectedStoryId(s?.id || null)}><ComboboxInput id="task-create-story" required={!collectionId} placeholder={collectionId ? "Collection-wide task" : "Choose a story…"} showClear /><ComboboxContent><ComboboxEmpty>No active stories. Create a story first.</ComboboxEmpty><ComboboxList>{(story: TaskStoryChoice) => <ComboboxItem key={story.id} value={story}>{story.title}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
          {canAssign ? <Field><FieldLabel htmlFor="task-create-assignee">Assignee</FieldLabel><AssigneePicker id="task-create-assignee" people={people} value={assignee} onChange={setAssignee} /></Field> : null}
          <Field><FieldLabel htmlFor="task-create-due">Due</FieldLabel><DatePicker id="task-create-due" label="Task due date" value={dueAt} timezone={timezone} onChange={setDueAt} /></Field>
          <Field><FieldLabel htmlFor="task-create-priority">Priority</FieldLabel><Select items={TASK_PRIORITY_OPTIONS} value={priority} onValueChange={(value) => { if (value) setPriority(value as TaskPriority); }}><SelectTrigger id="task-create-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TASK_PRIORITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
          {error ? <InlineAlert>{error}</InlineAlert> : null}
        </FieldGroup>
        <DialogFooter className="mt-4"><Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending || (!selectedStoryId && !collectionId)}>{create.isPending ? <><Spinner data-icon="inline-start" />Creating…</> : "Create task"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
