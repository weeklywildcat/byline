import { Button, Notice, SelectControl, Spinner, TextControl } from "@wordpress/components";
import { useEffect, useMemo, useState } from "@wordpress/element";
import type { ContributorRef, EditorialWorkflowPayload, WorkflowDateChanges, WorkflowStatusDefinition, WorkflowStory } from "./editorial-model";
import {
  DEFAULT_WORKFLOW_STATUSES,
  describeDeadline,
  describeEditorialError,
  effectiveWorkflowStatus,
  formatExactEditorialDate,
  selectableWorkflowStatuses,
  workflowStages,
  workflowStatusLabel,
  workflowDateFields,
  type NotesAvailability,
  type WorkflowCapabilities
} from "./editorial-model";
import "./editorial.css";

export type WorkflowPanelProps = {
  story: WorkflowStory;
  statuses?: WorkflowStatusDefinition[];
  capabilities: WorkflowCapabilities;
  editors?: ContributorRef[];
  notes?: NotesAvailability;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: unknown;
  onMove: (status: string) => Promise<void> | void;
  onAssign?: (editorId: number | null) => Promise<void> | void;
  onUpdateDates?: (changes: WorkflowDateChanges) => Promise<void> | void;
  onOpenNotes?: () => void;
};

function inputDate(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? "";
}

function displayPerson(person: ContributorRef | null | undefined): string {
  return person?.name || "Unassigned";
}

function DateSummary({ story }: { story: WorkflowStory }) {
  const fields = workflowDateFields(story);
  return (
    <div className="byline-editorial-date-grid" aria-label="Story dates">
      {fields.map((field) => (
        <div className="byline-editorial-date-card" key={field.kind}>
          <span className="byline-editorial-eyebrow">{field.label}</span>
          <time dateTime={field.value ?? undefined}>
            {formatExactEditorialDate(field.value)}
          </time>
          {field.kind === "deadline" && field.value ? (
            <span className="byline-editorial-muted">{describeDeadline(field.value)}</span>
          ) : null}
          {field.kind === "plannedPublication" ? (
            <span className="byline-editorial-muted">Editorial target; does not schedule WordPress.</span>
          ) : null}
          {field.kind === "scheduled" ? (
            <span className="byline-editorial-muted">Actual WordPress publication event.</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Reusable workflow sidebar/panel. It keeps editorial progress and WordPress
 * publication state in separate labelled regions, and the Move to control is
 * the keyboard equivalent of any future drag-and-drop host surface.
 */
export function WorkflowPanel({
  story,
  statuses = [...DEFAULT_WORKFLOW_STATUSES],
  capabilities,
  editors = [],
  notes,
  isLoading = false,
  isSaving = false,
  error,
  onMove,
  onAssign,
  onUpdateDates,
  onOpenNotes
}: WorkflowPanelProps) {
  const effectiveStatus = effectiveWorkflowStatus(story);
  const storedStatus = story.storedStatus ?? story.status;
  const [moveStatus, setMoveStatus] = useState(storedStatus);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setMoveStatus(storedStatus), [storedStatus]);

  const stages = useMemo(() => workflowStages(statuses, effectiveStatus), [statuses, effectiveStatus]);
  const moveOptions = useMemo(() => selectableWorkflowStatuses(statuses), [statuses]);
  const editorValue = story.editorId ?? (typeof story.editor?.id === "number" ? story.editor.id : null);
  const canEditDates = Boolean(onUpdateDates) && capabilities.changeDeadline !== false;

  const run = (operation: () => Promise<void> | void) => {
    setActionError(null);
    void Promise.resolve()
      .then(operation)
      .catch((caught: unknown) => setActionError(describeEditorialError(caught)));
  };

  const move = (nextStatus: string) => {
    if (!capabilities.changeStatus || effectiveStatus === "published") return;
    if (!moveOptions.some((option) => option.id === nextStatus)) return;
    setMoveStatus(nextStatus);
    run(() => onMove(nextStatus));
  };

  const dateChange = (changes: WorkflowDateChanges) => {
    if (!canEditDates || !onUpdateDates) return;
    run(() => onUpdateDates(changes));
  };

  const editorOptions = [
    { label: "Unassigned", value: "" },
    ...editors.map((editor) => ({ label: editor.name, value: String(editor.id) }))
  ];

  return (
    <section className="byline-editorial-panel byline-editorial-workflow-panel" aria-labelledby="byline-editorial-workflow-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">Story workflow</span>
          <h2 id="byline-editorial-workflow-heading">{story.title || `Story ${story.postId}`}</h2>
        </div>
        {isLoading ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)}</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}

      <div className="byline-editorial-status-pair" aria-label="Story status">
        <div>
          <span className="byline-editorial-eyebrow">Editorial workflow</span>
          <strong>{workflowStatusLabel(effectiveStatus, statuses)}</strong>
        </div>
        <div>
          <span className="byline-editorial-eyebrow">WordPress publication</span>
          <strong>{story.postStatus || "Unknown"}</strong>
          <span className="byline-editorial-muted">
            {story.isPublished ? "Published state is derived from WordPress." : "Publication state is separate from workflow."}
          </span>
        </div>
      </div>

      <DateSummary story={story} />

      <fieldset className="byline-editorial-stage-fieldset">
        <legend>Workflow stages</legend>
        <div className="byline-editorial-stage-list">
          {stages.main.map((stage) => (
            <label className={`byline-editorial-stage ${stage.isCurrent ? "is-current" : ""}`} key={stage.id}>
              <input
                type="radio"
                name={`byline-editorial-stage-${story.postId}`}
                value={stage.id}
                checked={stage.isCurrent}
                disabled={!capabilities.changeStatus || story.isPublished || !stage.selectable || isSaving}
                onChange={() => move(stage.id)}
              />
              <span>{stage.label}</span>
              {stage.isDone ? <small>Complete</small> : null}
            </label>
          ))}
        </div>
      </fieldset>

      {stages.sidelined.length > 0 ? (
        <fieldset className="byline-editorial-stage-fieldset byline-editorial-stage-fieldset-sidelined">
          <legend>Sidelined</legend>
          <div className="byline-editorial-stage-list">
            {stages.sidelined.map((stage) => (
              <label className={`byline-editorial-stage ${stage.isCurrent ? "is-current" : ""}`} key={stage.id}>
                <input
                  type="radio"
                  name={`byline-editorial-stage-${story.postId}`}
                  value={stage.id}
                  checked={stage.isCurrent}
                  disabled={!capabilities.changeStatus || story.isPublished || !stage.selectable || isSaving}
                  onChange={() => move(stage.id)}
                />
                <span>{stage.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="byline-editorial-move-control">
        <SelectControl
          label="Move to…"
          value={story.isPublished ? "" : moveStatus}
          options={[
            { label: "Choose a workflow stage…", value: "" },
            ...moveOptions.map((status) => ({ label: status.label, value: status.id }))
          ]}
          disabled={!capabilities.changeStatus || story.isPublished || isSaving}
          onChange={setMoveStatus}
        />
        <Button
          variant="secondary"
          disabled={!capabilities.changeStatus || story.isPublished || !moveStatus || isSaving}
          onClick={() => move(moveStatus)}
        >
          Move story
        </Button>
      </div>

      <div className="byline-editorial-form-grid">
        <SelectControl
          label="Assigned editor"
          value={editorValue == null ? "" : String(editorValue)}
          options={editorOptions}
          disabled={!capabilities.assign || !onAssign || isSaving}
          onChange={(value) => {
            const next = value ? Number(value) : null;
            if (!value || Number.isFinite(next)) run(() => onAssign?.(next));
          }}
        />
        <TextControl
          label="Deadline"
          type="date"
          value={inputDate(story.deadline)}
          disabled={!canEditDates || isSaving}
          onChange={(value) => dateChange({ deadline: value || null })}
          help="When newsroom work is due."
        />
        <TextControl
          label="Planned publication"
          type="date"
          value={inputDate(story.plannedPublication)}
          disabled={!canEditDates || isSaving}
          onChange={(value) => dateChange({ plannedPublication: value || null })}
          help="Editorial target; it does not schedule the post."
        />
      </div>

      {notes?.available ? (
        <div className="byline-editorial-inline-actions">
          {notes.url ? <Button variant="secondary" href={notes.url}>Open notes</Button> : null}
          {!notes.url && onOpenNotes ? <Button variant="secondary" onClick={onOpenNotes}>Open notes</Button> : null}
        </div>
      ) : notes ? (
        <Notice status="info" isDismissible={false}>
          {notes.message || "Notes are not available in this WordPress version. Workflow review still works here."}
        </Notice>
      ) : null}

      <span className="byline-editorial-sr-status" aria-live="polite">
        {isSaving ? "Saving workflow changes…" : `Current workflow: ${workflowStatusLabel(effectiveStatus, statuses)}.`}
      </span>
      <span className="byline-editorial-muted">Assigned to {displayPerson(story.editor)}.</span>
    </section>
  );
}

/** Convenience adapter for hosts that already have the complete workflow payload. */
export function WorkflowPanelFromPayload(
  props: Omit<WorkflowPanelProps, "story" | "statuses" | "capabilities" | "editors" | "notes"> & { payload: EditorialWorkflowPayload }
) {
  const { payload, ...rest } = props;
  return (
    <WorkflowPanel
      {...rest}
      story={payload.story}
      statuses={payload.statuses}
      capabilities={payload.capabilities}
      editors={payload.editors}
      notes={payload.notes}
    />
  );
}
