import { Button, Notice, SelectControl, Spinner, TextControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import type { FormEvent } from "react";
import type { ContributorRef, EditorialTask, TaskInput, TaskPatch, TaskPermissionContext, TaskPriority } from "./editorial-model";
import {
  canAssignTask,
  canDeleteTask,
  canEditTask,
  describeEditorialError,
  formatExactEditorialDate,
  setTaskCompletionState,
  taskStateLabel
} from "./editorial-model";
import "./editorial.css";

export type TasksPanelProps = {
  storyId?: number;
  coverageId?: number;
  tasks: EditorialTask[];
  people?: ContributorRef[];
  capabilities: TaskPermissionContext;
  isLoading?: boolean;
  error?: unknown;
  onCreate: (input: TaskInput) => Promise<void> | void;
  onUpdate: (taskId: number | string, patch: TaskPatch) => Promise<void> | void;
  onDelete: (taskId: number | string) => Promise<void> | void;
};

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" }
];

function taskDateInput(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? "";
}

function taskAssigneeId(task: EditorialTask): string {
  if (task.assigneeId != null) return String(task.assigneeId);
  if (typeof task.assignee?.id === "number") return String(task.assignee.id);
  return "";
}

/** Lightweight newsroom tasks with explicit permission and idempotent actions. */
export function TasksPanel({
  storyId,
  coverageId,
  tasks,
  people = [],
  capabilities,
  isLoading = false,
  error,
  onCreate,
  onUpdate,
  onDelete
}: TasksPanelProps) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Deleting a small newsroom task is reversible through the same create API,
  // so the panel performs it and offers Undo instead of asking twice first.
  const [undoDelete, setUndoDelete] = useState<{ title: string; run: () => Promise<void> } | null>(null);

  const isLinked = storyId != null;
  const canCreate = canEditTask({ storyId: storyId ?? null }, capabilities);
  const peopleOptions = useMemo(
    () => [{ label: "Unassigned", value: "" }, ...people.map((person) => ({ label: person.name, value: String(person.id) }))],
    [people]
  );

  const run = (id: string | null, operation: () => Promise<void> | void) => {
    setActionError(null);
    setBusyId(id);
    void Promise.resolve()
      .then(operation)
      .catch((caught: unknown) => setActionError(describeEditorialError(caught)))
      .finally(() => setBusyId(null));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || !title.trim()) {
      setActionError("Enter a task title before adding it.");
      return;
    }
    const parsedAssignee = assigneeId ? Number(assigneeId) : null;
    run(null, async () => {
      await onCreate({
        title: title.trim(),
        assigneeId: parsedAssignee != null && Number.isFinite(parsedAssignee) ? parsedAssignee : null,
        dueAt: dueAt || null,
        priority,
        storyId: storyId ?? null,
        coverageId: coverageId ?? null
      });
      setTitle("");
      setAssigneeId("");
      setDueAt("");
      setPriority("normal");
    });
  };

  const patchTask = (task: EditorialTask, patch: TaskPatch) => {
    if (!canEditTask(task, capabilities)) return;
    run(String(task.id), () => onUpdate(task.id, patch));
  };

  const toggleTask = (task: EditorialTask) => {
    if (!canEditTask(task, capabilities)) return;
    const next = setTaskCompletionState(task, task.state === "completed" ? "open" : "completed");
    // The model returns the original object for a repeated same-state request;
    // this toggle always changes state, while retries remain safe server-side.
    patchTask(task, { state: next.state });
  };

  const deleteTask = (task: EditorialTask) => {
    if (!canDeleteTask(task, capabilities)) return;
    const restore: TaskInput = {
      title: task.title,
      assigneeId: task.assigneeId ?? (typeof task.assignee?.id === "number" ? task.assignee.id : null),
      dueAt: task.dueAt ?? null,
      priority: task.priority,
      storyId: task.storyId ?? storyId ?? null,
      coverageId: task.coverageId ?? coverageId ?? null
    };
    setUndoDelete(null);
    run(String(task.id), async () => {
      await onDelete(task.id);
      setUndoDelete({
        title: task.title,
        // Undo is a real create request. If it fails, the panel says so rather
        // than pretending the task came back.
        run: async () => {
          await onCreate(restore);
          setUndoDelete(null);
        }
      });
    });
  };

  return (
    <section className="byline-editorial-panel byline-editorial-tasks-panel" aria-labelledby="byline-editorial-tasks-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">Small newsroom work</span>
          <h2 id="byline-editorial-tasks-heading">Tasks</h2>
        </div>
        {isLoading ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)}</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}
      {undoDelete ? (
        <Notice status="success" isDismissible onRemove={() => setUndoDelete(null)}>
          {`Deleted “${undoDelete.title}”.`}{" "}
          <Button
            variant="link"
            disabled={busyId !== null}
            onClick={() => run(null, undoDelete.run)}
          >
            Undo
          </Button>
        </Notice>
      ) : null}

      <form className="byline-editorial-task-form" onSubmit={submit}>
        <TextControl
          label="Add a task"
          value={title}
          onChange={setTitle}
          disabled={!canCreate || busyId === null && isLoading}
          placeholder="Example: Confirm crowd photo credit"
        />
        <SelectControl
          label="Assignee"
          value={assigneeId}
          options={peopleOptions}
          disabled={!canCreate || !capabilities.canAssign}
          onChange={setAssigneeId}
        />
        <TextControl label="Due date" type="date" value={dueAt} disabled={!canCreate} onChange={setDueAt} />
        <SelectControl
          label="Priority"
          value={priority}
          options={priorityOptions}
          disabled={!canCreate}
          onChange={(value) => setPriority(value as TaskPriority)}
        />
        <Button variant="primary" type="submit" disabled={!canCreate || !title.trim() || busyId !== null}>
          Add task
        </Button>
      </form>

      {!canCreate ? (
        <p className="byline-editorial-empty-state">
          You can view these tasks, but need permission to edit the {isLinked ? "linked story" : "unlinked newsroom task list"}.
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="byline-editorial-empty-state">No tasks yet. Add the next small piece of work above.</p>
      ) : (
        <ul className="byline-editorial-task-list" aria-label="Newsroom tasks">
          {tasks.map((task) => {
            const editable = canEditTask(task, capabilities);
            const assignable = canAssignTask(task, capabilities);
            const deletable = canDeleteTask(task, capabilities);
            const taskBusy = busyId === String(task.id);
            return (
              <li className={`byline-editorial-task ${task.state === "completed" ? "is-completed" : ""}`} key={String(task.id)}>
                <div className="byline-editorial-task-main">
                  <strong>{task.title}</strong>
                  <span className="byline-editorial-muted">
                    {taskStateLabel(task.state)} · {task.priority}
                    {task.dueAt ? ` · Due ${formatExactEditorialDate(task.dueAt)}` : " · No due date"}
                  </span>
                </div>
                <div className="byline-editorial-task-controls">
                  <SelectControl
                    label={`Assignee for ${task.title}`}
                    hideLabelFromVision={false}
                    value={taskAssigneeId(task)}
                    options={peopleOptions}
                    disabled={!assignable || taskBusy}
                    onChange={(value) => {
                      const parsed = value ? Number(value) : null;
                      patchTask(task, { assigneeId: parsed != null && Number.isFinite(parsed) ? parsed : null });
                    }}
                  />
                  <TextControl
                    label={`Due date for ${task.title}`}
                    type="date"
                    value={taskDateInput(task.dueAt)}
                    disabled={!editable || taskBusy}
                    onChange={(value) => patchTask(task, { dueAt: value || null })}
                  />
                  <SelectControl
                    label={`Priority for ${task.title}`}
                    value={task.priority}
                    options={priorityOptions}
                    disabled={!editable || taskBusy}
                    onChange={(value) => patchTask(task, { priority: value as TaskPriority })}
                  />
                </div>
                <div className="byline-editorial-inline-actions">
                  <Button
                    variant={task.state === "completed" ? "secondary" : "primary"}
                    disabled={!editable || taskBusy}
                    onClick={() => toggleTask(task)}
                    aria-label={`${task.state === "completed" ? "Reopen" : "Complete"} task ${task.title}`}
                  >
                    {task.state === "completed" ? "Reopen" : "Complete"}
                  </Button>
                  <Button variant="tertiary" isDestructive disabled={!deletable || taskBusy} onClick={() => deleteTask(task)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
