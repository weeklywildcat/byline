import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type ContributorEntry, type EditorialTask } from "../editorial/editorial-model";
import { AssigneePicker, DatePicker } from "../home/components/pickers";
import { Button } from "../home/ui/button";
import { Checkbox } from "../home/ui/checkbox";
import { Input } from "../home/ui/input";
import { AddButton, InlineError, Note, SectionFailed, SectionHeading } from "./fields";
import { appendNewTasks, applyTask } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { completedTasks, dueText, isOverdue, openTasks, peopleOptions } from "./workspace-model";

const TASK_LIMIT = 10;

function TaskItem({ task, timezone, now, busy, onToggle }: { task: EditorialTask; timezone: string; now: Date; busy: boolean; onToggle: (task: EditorialTask, state: "open" | "completed") => void }) {
  const done = task.state === "completed";
  const due = done ? "" : dueText(task.dueAt, timezone, now);
  const overdue = !done && isOverdue(task.dueAt, timezone, now);
  const meta = [task.assignee?.name, task.priority === "urgent" ? "Urgent" : ""].filter(Boolean).join(" · ");
  return <li className={`ws-task${done ? " ws-task-done" : ""}`} data-task-id={task.id}>
    <Checkbox aria-label={task.title} checked={done} aria-disabled={busy || undefined} onCheckedChange={(checked) => { if (!busy) onToggle(task, checked ? "completed" : "open"); }} />
    <span className="ws-row-main"><span className="ws-row-title">{task.title}</span>{meta ? <span className="ws-row-sub">{meta}</span> : null}</span>
    {due ? <time className={`ws-due${overdue ? " ws-overdue" : ""}`} dateTime={task.dueAt || undefined}>{due}</time> : null}
  </li>;
}

export function TasksSection() {
  const { storyId, editorial, data, timezone, now, caps, currentUserId, announce, sectionError, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<ContributorEntry | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const people = peopleOptions(data.people);
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

  const create = useMutation({
    mutationFn: () => editorial.createTask({ title: title.trim(), storyId, assigneeId: Number(assignee?.id) || (caps.assign ? null : currentUserId || null), dueAt, priority: "normal" }),
    onSuccess: (response) => {
      cache.write((current) => appendNewTasks(current, response.tasks));
      announce("Task added.");
      setAdding(false); setTitle(""); setAssignee(null); setDueAt(null); setCreateError("");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-ws-add=task]")?.focus());
    },
    onError: (error) => setCreateError(describeEditorialError(error, "The task couldn't be added. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });

  const startAdding = () => {
    setAssignee(peopleOptions(data.people).find((person) => Number(person.id) === currentUserId) ?? null);
    setCreateError("");
    setAdding(true);
  };

  return <section aria-labelledby="ws-tasks" className="ws-section ws-tasks">
    <SectionHeading id="ws-tasks" title="Tasks">{caps.addTask && !failed && !adding ? <AddButton data-ws-add="task" onClick={startAdding}>Add task</AddButton> : null}</SectionHeading>
    {failed ? <SectionFailed what="tasks" onRetry={() => void reload()} /> : <>
      {adding ? <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !create.isPending) create.mutate(); }}>
        <Input aria-label="Task title" placeholder="What needs doing?" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} autoFocus required className="ws-input" />
        <div className="ws-inline-fields">
          {caps.assign ? <AssigneePicker people={people} value={assignee} onChange={setAssignee} /> : null}
          <DatePicker label="Task due date" value={dueAt} timezone={timezone} onChange={setDueAt} />
        </div>
        {createError ? <InlineError>{createError}</InlineError> : null}
        <div className="ws-inline-actions"><Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending || !title.trim()}>{create.isPending ? "Adding…" : "Add task"}</Button></div>
      </form> : null}
      {open.length ? <ul className="ws-rows ws-task-list">{(showAll ? open : open.slice(0, TASK_LIMIT)).map((task) => <TaskItem key={task.id} task={task} timezone={timezone} now={now} busy={busy.has(String(task.id))} onToggle={(item, state) => toggle.mutate({ task: item, state })} />)}</ul> : !adding ? <Note>{done.length ? "Nothing left to do." : caps.addTask ? "No tasks yet." : "No tasks are assigned to you."}</Note> : null}
      {open.length > TASK_LIMIT ? <Button type="button" variant="ghost" className="ws-more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer" : `Show ${open.length - TASK_LIMIT} more`}</Button> : null}
      {done.length ? <div className="ws-group">
        <button type="button" className="ws-disclosure" aria-expanded={showDone} aria-controls="ws-done-tasks" onClick={() => setShowDone((value) => !value)}><ChevronRight aria-hidden="true" />Completed <span>{done.length}</span></button>
        {showDone ? <ul className="ws-rows ws-task-list" id="ws-done-tasks">{done.map((task) => <TaskItem key={task.id} task={task} timezone={timezone} now={now} busy={busy.has(String(task.id))} onToggle={(item, state) => toggle.mutate({ task: item, state })} />)}</ul> : null}
      </div> : null}
    </>}
  </section>;
}
