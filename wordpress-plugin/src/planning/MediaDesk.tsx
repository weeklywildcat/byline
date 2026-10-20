import { Button, SelectControl, TextControl } from "@wordpress/components";
import { useEffect, useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import { createWorkspaceUrlBuilder, type WorkspaceUrl } from "./calendar-model";
import {
  EMPTY_MEDIA_DESK_FILTERS,
  MEDIA_STATUS_OPTIONS,
  MEDIA_TYPE_OPTIONS,
  filterMediaRows,
  mediaDeskRows,
  mediaDueDay,
  mediaReadinessHint,
  mediaTypeLabel,
  sortMediaRows,
  type MediaDeskFilters,
  type MediaDeskRow
} from "./media-desk-model";
import {
  exactPlanningDate,
  mergeMediaAttachmentIds,
  removeMediaAttachmentId,
  relativePlanningDate,
  type MediaAttachment,
  type MediaDeskResponse,
  type OptionalResource,
  type PlanningPerson,
  type PlanningVisualStatus
} from "./planning-model";
import { describeMediaDeskError } from "./media-desk-errors";
import { PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, ViewHeader } from "./planning-ui";

export type MediaDeskProps = {
  resource: OptionalResource<MediaDeskResponse>;
  onRetry?: () => void;
  /** Legacy per-story update. Used for older servers and for the story-level featured image. */
  updateRequest?: (requestId: number, changes: Record<string, unknown>) => Promise<unknown>;
  /** Per-assignment update (`POST /editorial/stories/<id>/media-assignments/<assignmentId>`). */
  updateAssignment?: (storyId: number, assignmentId: string, changes: Record<string, unknown>) => Promise<unknown>;
  /** Story Workspace URL builder; each row links to its story's workspace. */
  workspaceUrl?: WorkspaceUrl;
  onOpenStory?: (storyId: number) => void;
};

function statusLabel(status: PlanningVisualStatus): string {
  return MEDIA_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function statusTone(status: PlanningVisualStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "done" || status === "selected") return "success";
  if (status === "needed") return "warning";
  if (status === "in-progress" || status === "uploaded") return "info";
  return "neutral";
}

function DueDateField({ row, timezone, disabled, onCommit }: { row: MediaDeskRow; timezone?: string; disabled: boolean; onCommit: (value: string | null) => void }) {
  const current = mediaDueDay(row.dueAt, timezone);
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  return (
    <TextControl
      __nextHasNoMarginBottom
      type="date"
      label={__("Due date", "weekly-wildcat-headless")}
      value={value}
      disabled={disabled}
      onChange={setValue}
      onBlur={() => {
        if (value !== current) onCommit(value || null);
      }}
    />
  );
}

function AssignmentCard({
  row,
  assignees,
  timezone,
  canManage,
  canAssign,
  isSaving,
  update,
  canUpdate,
  workspaceUrl,
  onOpenStory
}: {
  row: MediaDeskRow;
  assignees: PlanningPerson[];
  timezone?: string;
  canManage: boolean;
  canAssign: boolean;
  isSaving: boolean;
  update: (row: MediaDeskRow, changes: Record<string, unknown>, options?: { featured?: boolean }) => Promise<void>;
  canUpdate: boolean;
  workspaceUrl: WorkspaceUrl;
  onOpenStory?: (storyId: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const editable = canManage && canUpdate;

  const run = async (changes: Record<string, unknown>, options?: { featured?: boolean }) => {
    setError(null);
    try {
      await update(row, changes, options);
    } catch (reason) {
      setError(describeMediaDeskError(reason));
    }
  };

  const attachments: MediaAttachment[] = row.attachments?.length ? row.attachments : row.attachmentIds.map((id) => ({ id }));
  const featuredId = row.featuredAttachmentId || row.mediaReadiness?.featuredAttachmentId || 0;
  const hint = mediaReadinessHint(row);
  const heading = row.title || mediaTypeLabel(row.type);

  const chooseMedia = () => {
    if (!editable || !window.wp?.media) return;

    const frame = window.wp.media({
      title: __("Link WordPress media", "weekly-wildcat-headless"),
      button: { text: __("Link selected media", "weekly-wildcat-headless") },
      multiple: true
    });
    frame.on("select", () => {
      const selection = frame.state().get("selection") as unknown as {
        toJSON?: () => unknown;
        models?: Array<{ get?: (key: string) => unknown; toJSON?: () => Record<string, unknown> }>;
      };
      const selected = typeof selection.toJSON === "function"
        ? selection.toJSON()
        : (selection.models || []).map((model) => typeof model.toJSON === "function" ? model.toJSON() : model.get?.("id"));
      void run({ attachmentIds: mergeMediaAttachmentIds(row.attachmentIds, selected) });
    });
    frame.open();
  };

  const unlinkMedia = (attachmentId: number) => {
    void run({ attachmentIds: removeMediaAttachmentId(row.attachmentIds, attachmentId) });
  };

  return (
    <article className="byline-planning-media-card" aria-busy={isSaving}>
      <div className="byline-planning-media-card-heading">
        <div>
          <h4 className="byline-planning-media-assignment-title">{heading}</h4>
          <p className="byline-planning-media-story">
            {onOpenStory ? (
              <a className="byline-planning-story-title" href={row.story.editUrl} onClick={(event) => { event.preventDefault(); onOpenStory(row.story.id); }}>
                {row.story.title || __("Untitled story", "weekly-wildcat-headless")}
              </a>
            ) : (
              <a className="byline-planning-story-title" href={workspaceUrl(row.story.id)}>{row.story.title || __("Untitled story", "weekly-wildcat-headless")}</a>
            )}
          </p>
        </div>
        <PlanningStatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} />
      </div>
      <div className="byline-planning-media-chips">
        <span className="byline-planning-media-type">{mediaTypeLabel(row.type)}</span>
        <PlanningStatusBadge label={hint.label} tone={hint.tone} />
        <a className="byline-planning-media-workspace-link" href={workspaceUrl(row.story.id)}>{__("Open story workspace", "weekly-wildcat-headless")}</a>
      </div>
      {row.notes ? <p className="byline-planning-media-notes">{row.notes}</p> : null}
      <dl className="byline-planning-media-meta">
        <div><dt>{__("Assignee", "weekly-wildcat-headless")}</dt><dd>{row.assignee?.name || __("Unassigned", "weekly-wildcat-headless")}</dd></div>
        <div>
          <dt>{__("Due", "weekly-wildcat-headless")}</dt>
          <dd>
            {row.dueAt ? (
              <time dateTime={mediaDueDay(row.dueAt, timezone)} title={exactPlanningDate(row.dueAt)}>
                {mediaDueDay(row.dueAt, timezone) ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${mediaDueDay(row.dueAt, timezone)}T12:00:00Z`)) : exactPlanningDate(row.dueAt)}
                {" "}
                <span className="byline-planning-list-date-note">{timezone ? "" : relativePlanningDate(row.dueAt)}</span>
              </time>
            ) : <span className="byline-planning-muted">{__("No due date", "weekly-wildcat-headless")}</span>}
          </dd>
        </div>
        <div><dt>{__("Attachments", "weekly-wildcat-headless")}</dt><dd>{row.attachmentIds.length ? row.attachmentIds.length : __("None selected", "weekly-wildcat-headless")}</dd></div>
        {row.isPrimary ? <div><dt>{__("Featured", "weekly-wildcat-headless")}</dt><dd>{featuredId ? __("Linked visual", "weekly-wildcat-headless") : __("Not linked", "weekly-wildcat-headless")}</dd></div> : null}
      </dl>
      <div className="byline-planning-media-attachments">
        {attachments.length ? attachments.map((attachment) => {
          const isFeatured = featuredId === attachment.id;
          const checks = attachment.checks;
          return (
            <div className="byline-planning-media-attachment" key={attachment.id}>
              {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.alt || ""} width={64} height={48} /> : null}
              <div>
                <strong>{attachment.title || `Media ${attachment.id}`}</strong>
                <div className="byline-planning-help">
                  {checks && !checks.alt && __("Alt text missing", "weekly-wildcat-headless")}
                  {checks && !checks.alt && (!checks.credit || !checks.rights) ? " · " : ""}
                  {checks && !checks.credit && __("Credit missing", "weekly-wildcat-headless")}
                  {checks && !checks.credit && !checks.rights ? " · " : ""}
                  {checks && !checks.rights && __("Rights missing", "weekly-wildcat-headless")}
                  {checks && checks.alt && checks.credit && checks.rights ? __("Metadata ready", "weekly-wildcat-headless") : null}
                </div>
              </div>
              {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer">{__("Preview", "weekly-wildcat-headless")}</a> : null}
              {attachment.isImage ? (
                <Button
                  variant={isFeatured ? "primary" : "secondary"}
                  disabled={!editable || isSaving || !row.isPrimary}
                  title={row.isPrimary ? undefined : __("The featured image is set from the story's primary visual assignment.", "weekly-wildcat-headless")}
                  onClick={() => void run({ featuredAttachmentId: attachment.id }, { featured: true })}
                >
                  {isFeatured ? __("Featured", "weekly-wildcat-headless") : __("Set featured", "weekly-wildcat-headless")}
                </Button>
              ) : null}
              <Button
                variant="tertiary"
                isDestructive
                disabled={!editable || isSaving}
                onClick={() => unlinkMedia(attachment.id)}
              >
                {__("Unlink", "weekly-wildcat-headless")}
              </Button>
            </div>
          );
        }) : null}
        {row.invalidAttachmentIds?.length ? <PlanningNotice status="warning">{__("Some linked media is no longer available. Relink the assignment.", "weekly-wildcat-headless")}</PlanningNotice> : null}
        <Button variant="secondary" disabled={!editable || isSaving || !window.wp?.media} onClick={chooseMedia}>
          {__("Link from Media Library", "weekly-wildcat-headless")}
        </Button>
      </div>
      <div className="byline-planning-media-controls">
        <SelectControl
          __nextHasNoMarginBottom
          label={__("Status", "weekly-wildcat-headless")}
          value={row.status}
          options={MEDIA_STATUS_OPTIONS}
          disabled={!editable || isSaving}
          onChange={(value: string) => void run({ status: value })}
        />
        <SelectControl
          __nextHasNoMarginBottom
          label={__("Assignee", "weekly-wildcat-headless")}
          value={row.assignee?.id ? String(row.assignee.id) : ""}
          options={[{ label: __("Unassigned", "weekly-wildcat-headless"), value: "" }, ...assignees.map((person) => ({ label: person.name, value: String(person.id) }))]}
          disabled={!editable || !canAssign || isSaving}
          onChange={(value: string) => void run({ assigneeId: value ? Number(value) : 0 })}
        />
        <DueDateField row={row} timezone={timezone} disabled={!editable || isSaving} onCommit={(value) => void run({ dueAt: value })} />
      </div>
      {row.status !== "done" ? <Button variant="primary" disabled={!editable || isSaving} onClick={() => void run({ status: "done" })}>{__("Mark complete", "weekly-wildcat-headless")}</Button> : null}
      {error ? <PlanningNotice>{error}</PlanningNotice> : null}
      {!canUpdate ? <p className="byline-planning-help">{__("The protected media update API is not available in this install.", "weekly-wildcat-headless")}</p> : null}
    </article>
  );
}

export function MediaDesk({ resource, onRetry, updateRequest, updateAssignment, workspaceUrl: workspaceUrlProp, onOpenStory }: MediaDeskProps) {
  const [filters, setFilters] = useState<MediaDeskFilters>(EMPTY_MEDIA_DESK_FILTERS);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const data = resource.data;
  const workspaceUrl = useMemo(() => workspaceUrlProp || createWorkspaceUrlBuilder(), [workspaceUrlProp]);
  const rows = useMemo(() => mediaDeskRows(data), [data]);
  const assignees = data?.assignees || [];
  const timezone = data?.timezone;
  const canManage = data?.capabilities?.canManageMedia !== false;
  const canAssign = data?.capabilities?.canAssign !== false;
  const setFilter = <K extends keyof MediaDeskFilters>(key: K, value: MediaDeskFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  const filtered = useMemo(() => sortMediaRows(filterMediaRows(rows, filters, timezone), timezone), [rows, filters, timezone]);
  const grouped = MEDIA_STATUS_OPTIONS.map((status) => ({ ...status, rows: filtered.filter((row) => row.status === status.value) })).filter((group) => group.rows.length);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_MEDIA_DESK_FILTERS);

  const rowKey = (row: MediaDeskRow) => `${row.story.id}:${row.id}`;
  const canUpdate = (row: MediaDeskRow) => (row.source === "assignment" ? Boolean(updateAssignment) : Boolean(updateRequest));

  // Assignment rows write to their own assignment. The story-level featured
  // image (and the legacy collection) still goes through the per-story route.
  const update = async (row: MediaDeskRow, changes: Record<string, unknown>, options?: { featured?: boolean }) => {
    const key = rowKey(row);
    setSavingKey(key);
    try {
      if (options?.featured && updateRequest) await updateRequest(row.story.id, changes);
      else if (row.source === "assignment" && updateAssignment) await updateAssignment(row.story.id, row.id, changes);
      else if (updateRequest) await updateRequest(row.story.id, changes);
    } finally {
      setSavingKey(null);
    }
  };

  if (!data && !resource.available) return <PlanningUnavailable label={__("Media Desk", "weekly-wildcat-headless")} message={resource.error || __("Media planning is unavailable right now.", "weekly-wildcat-headless")} onRetry={onRetry} />;
  if (!data) return <PlanningEmpty label={__("Media Desk", "weekly-wildcat-headless")} instructions={__("No media request data is available.", "weekly-wildcat-headless")} />;

  return (
    <section className="byline-planning-media" aria-labelledby="byline-planning-media-heading">
      <ViewHeader title={__("Media Desk", "weekly-wildcat-headless")} description={__("Track each photo, video, graphic and audio assignment without creating a parallel media library. Attachments remain owned by WordPress Media.", "weekly-wildcat-headless")} />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}
      <div className="byline-planning-filter-grid">
        <SelectControl __nextHasNoMarginBottom label={__("Filter by type", "weekly-wildcat-headless")} value={filters.type} options={[{ label: __("All types", "weekly-wildcat-headless"), value: "" }, ...MEDIA_TYPE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))]} onChange={(value: string) => setFilter("type", value as MediaDeskFilters["type"])} />
        <SelectControl __nextHasNoMarginBottom label={__("Filter by status", "weekly-wildcat-headless")} value={filters.status} options={[{ label: __("All statuses", "weekly-wildcat-headless"), value: "" }, ...MEDIA_STATUS_OPTIONS]} onChange={(value: string) => setFilter("status", value as MediaDeskFilters["status"])} />
        <SelectControl __nextHasNoMarginBottom label={__("Filter by assignee", "weekly-wildcat-headless")} value={filters.assigneeId} options={[{ label: __("Everyone", "weekly-wildcat-headless"), value: "" }, ...assignees.map((person) => ({ label: person.name, value: String(person.id) }))]} onChange={(value: string) => setFilter("assigneeId", value)} />
        <TextControl __nextHasNoMarginBottom label={__("Find a story or assignment", "weekly-wildcat-headless")} value={filters.story} onChange={(value: string) => setFilter("story", value)} />
        <TextControl __nextHasNoMarginBottom type="date" label={__("Due from", "weekly-wildcat-headless")} value={filters.dueFrom} onChange={(value: string) => setFilter("dueFrom", value)} />
        <TextControl __nextHasNoMarginBottom type="date" label={__("Due to", "weekly-wildcat-headless")} value={filters.dueTo} onChange={(value: string) => setFilter("dueTo", value)} />
      </div>
      {filtersActive ? <Button variant="tertiary" onClick={() => setFilters(EMPTY_MEDIA_DESK_FILTERS)}>{__("Clear filters", "weekly-wildcat-headless")}</Button> : null}
      {!filtered.length ? <PlanningEmpty label={__("Media assignments", "weekly-wildcat-headless")} instructions={rows.length ? __("No media assignments match these filters.", "weekly-wildcat-headless") : __("No visual assignments have been recorded yet.", "weekly-wildcat-headless")} /> : (
        <div className="byline-planning-media-groups">
          {grouped.map((group) => (
            <section className="byline-planning-media-group" key={group.value} aria-labelledby={`byline-planning-media-group-${group.value}`}>
              <h3 id={`byline-planning-media-group-${group.value}`}>{group.label} <span className="byline-planning-count">{group.rows.length}</span></h3>
              <div className="byline-planning-media-list">
                {group.rows.map((row) => (
                  <AssignmentCard
                    key={rowKey(row)}
                    row={row}
                    assignees={assignees}
                    timezone={timezone}
                    canManage={canManage}
                    canAssign={canAssign}
                    isSaving={savingKey === rowKey(row)}
                    update={update}
                    canUpdate={canUpdate(row)}
                    workspaceUrl={workspaceUrl}
                    onOpenStory={onOpenStory}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
