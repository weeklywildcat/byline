import type { ContributorEntry, EditorialTask, TaskPatch, TaskPriority } from "../editorial/editorial-model";
import { dateLabel, dayDistance } from "../home/newsroom-model";
import { AssigneePicker, DatePicker, valueSelectTriggerClass } from "../editorial/pickers";
import { WorkStatusBadge, type WorkIntensity } from "@byline/newsroom-ui/components/work-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@byline/newsroom-ui/ui/select";
import { cn } from "@byline/newsroom-ui/lib/utils";

export const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
];

const priorityIntensity = (priority: TaskPriority): WorkIntensity => priority === "urgent" ? "action" : priority === "high" ? "active" : "settled";

export type TaskQuickUpdate = (patch: TaskPatch, optimistic?: Partial<EditorialTask>) => void;

/** Direct-edit controls for the task fields people change constantly. */
export function TaskQuickFields({
  task,
  timezone,
  now,
  people,
  canAssign,
  disabled,
  onUpdate,
  showAssignee = true,
  className
}: {
  task: EditorialTask;
  timezone: string;
  now: Date;
  people: ContributorEntry[];
  canAssign: boolean;
  disabled?: boolean;
  onUpdate: TaskQuickUpdate;
  showAssignee?: boolean;
  className?: string;
}) {
  const assignee = task.assignee
    ? people.find((person) => Number(person.id) === Number(task.assignee?.id)) || ({ ...task.assignee, kind: "user" } as ContributorEntry)
    : null;

  return <span className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)} data-task-quick-fields="">
    {showAssignee && canAssign ? <span className="contents" data-task-assignee=""><AssigneePicker
      people={people}
      value={assignee}
      appearance="value"
      label="Task assignee"
      placeholder="Unassigned"
      disabled={disabled}
      onChange={(person) => onUpdate(
        { assigneeId: Number(person?.id) || null },
        { assigneeId: Number(person?.id) || null, assignee: person ? { id: person.id, kind: person.kind, name: person.name, imageUrl: person.imageUrl } : null }
      )}
    /></span> : null}
    <Select
      items={TASK_PRIORITY_OPTIONS}
      value={task.priority}
      disabled={disabled}
      onValueChange={(value) => {
        const priority = value as TaskPriority | undefined;
        if (priority && priority !== task.priority) onUpdate({ priority }, { priority });
      }}
    >
      <SelectTrigger aria-label={`Task priority: ${task.priority}`} className={valueSelectTriggerClass}>
        <WorkStatusBadge kind="task" intensity={priorityIntensity(task.priority)}>{TASK_PRIORITY_OPTIONS.find((item) => item.value === task.priority)?.label || task.priority}</WorkStatusBadge>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {TASK_PRIORITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
    {/* Overdue is the one warning: the due date keeps the warning color wherever the task is listed. */}
    <span className={task.state === "open" && dayDistance(task.dueAt, timezone, now) < 0 ? "contents [&_button]:text-warning" : "contents"} data-task-overdue={task.state === "open" && dayDistance(task.dueAt, timezone, now) < 0 || undefined}>
    <DatePicker
      appearance="value"
      dateOnly
      label="Task due date"
      value={task.dueAt}
      timezone={timezone}
      disabled={disabled}
      placeholder="No due date"
      displayValue={task.dueAt ? dateLabel(task.dueAt, timezone, now) : undefined}
      onChange={(dueAt) => onUpdate({ dueAt }, { dueAt })}
    />
    </span>
  </span>;
}
