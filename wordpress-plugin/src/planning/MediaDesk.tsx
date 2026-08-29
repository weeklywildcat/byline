import { Button, SelectControl, TextControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import {
  exactPlanningDate,
  mergeMediaAttachmentIds,
  removeMediaAttachmentId,
  relativePlanningDate,
  type MediaAttachment,
  type MediaDeskResponse,
  type MediaRequest,
  type OptionalResource,
  type PlanningPerson,
  type PlanningVisualStatus,
  type PlanningVisualType
} from "./planning-model";
import { describeMediaDeskError } from "./media-desk-errors";
import { PlanningDateValue, PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, StoryLink, ViewHeader } from "./planning-ui";

export type MediaDeskProps = {
  resource: OptionalResource<MediaDeskResponse>;
  onRetry?: () => void;
  updateRequest?: (requestId: number, changes: Record<string, unknown>) => Promise<unknown>;
  onOpenStory?: (storyId: number) => void;
};

const STATUS_OPTIONS: Array<{ value: PlanningVisualStatus; label: string }> = [
  { value: "needed", label: "Needed" },
  { value: "assigned", label: "Assigned" },
  { value: "in-progress", label: "In progress" },
  { value: "uploaded", label: "Uploaded" },
  { value: "selected", label: "Selected" },
  { value: "done", label: "Done" }
];

const TYPE_LABELS: Record<PlanningVisualType, string> = {
  none: "None",
  photo: "Photo",
  gallery: "Gallery",
  graphic: "Graphic",
  video: "Video",
  other: "Other"
};

function statusLabel(status: PlanningVisualStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function statusTone(status: PlanningVisualStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "done" || status === "selected") return "success";
  if (status === "needed") return "warning";
  if (status === "in-progress" || status === "uploaded") return "info";
  return "neutral";
}

function RequestCard({
  request,
  assignees,
  canManage,
  canAssign,
  isSaving,
  updateRequest,
  onOpenStory
}: {
  request: MediaRequest;
  assignees: PlanningPerson[];
  canManage: boolean;
  canAssign: boolean;
  isSaving: boolean;
  updateRequest?: (requestId: number, changes: Record<string, unknown>) => Promise<unknown>;
  onOpenStory?: (storyId: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const update = async (changes: Record<string, unknown>) => {
    if (!updateRequest) return;
    setError(null);
    try {
      await updateRequest(request.id, changes);
    } catch (reason) {
      setError(describeMediaDeskError(reason));
    }
  };

  const attachments: MediaAttachment[] = request.attachments?.length
    ? request.attachments
    : request.attachmentIds.map((id) => ({ id }));
  const featuredId = request.featuredAttachmentId || request.mediaReadiness?.featuredAttachmentId || 0;

  const chooseMedia = () => {
    if (!canManage || !updateRequest || !window.wp?.media) return;

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
      void update({ attachmentIds: mergeMediaAttachmentIds(request.attachmentIds, selected) });
    });
    frame.open();
  };

  const unlinkMedia = (attachmentId: number) => {
    void update({ attachmentIds: removeMediaAttachmentId(request.attachmentIds, attachmentId) });
  };

  const story = { id: request.story.id, title: request.story.title, editUrl: request.story.editUrl, authors: [], writer: null, editor: null, workflow: { id: "", label: "", group: "main" as const, selectable: false }, wordpressState: { id: "", label: "", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null, visual: { type: request.type, status: request.status }, openTaskCount: 0, coverage: [], featuredImage: null };

  return (
    <article className="byline-planning-media-card" aria-busy={isSaving}>
      <div className="byline-planning-media-card-heading">
        <StoryLink
          story={story}
          onOpenStory={onOpenStory ? (selectedStory) => onOpenStory(selectedStory.id) : undefined}
          className="byline-planning-story-title"
        />
        <PlanningStatusBadge label={statusLabel(request.status)} tone={statusTone(request.status)} />
      </div>
      <p className="byline-planning-media-type">{TYPE_LABELS[request.type] || request.type}</p>
      {request.notes || request.legacyNotes ? <p className="byline-planning-media-notes">{request.notes || request.legacyNotes}</p> : <p className="byline-planning-muted">{__("No notes supplied.", "weekly-wildcat-headless")}</p>}
      <dl className="byline-planning-media-meta">
        <div><dt>{__("Due", "weekly-wildcat-headless")}</dt><dd><PlanningDateValue value={request.dueAt} relative empty={__("No due date", "weekly-wildcat-headless")} /></dd></div>
        <div><dt>{__("Attachments", "weekly-wildcat-headless")}</dt><dd>{request.attachmentIds.length ? request.attachmentIds.length : __("None selected", "weekly-wildcat-headless")}</dd></div>
        <div><dt>{__("Featured", "weekly-wildcat-headless")}</dt><dd>{featuredId ? __("Linked visual", "weekly-wildcat-headless") : __("Not linked", "weekly-wildcat-headless")}</dd></div>
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
                  disabled={!canManage || !updateRequest || isSaving}
                  onClick={() => void update({ featuredAttachmentId: attachment.id })}
                >
                  {isFeatured ? __("Featured", "weekly-wildcat-headless") : __("Set featured", "weekly-wildcat-headless")}
                </Button>
              ) : null}
              <Button
                variant="tertiary"
                isDestructive
                disabled={!canManage || !updateRequest || isSaving}
                onClick={() => unlinkMedia(attachment.id)}
              >
                {__("Unlink", "weekly-wildcat-headless")}
              </Button>
            </div>
          );
        }) : null}
        {request.invalidAttachmentIds?.length ? <PlanningNotice status="warning">{__("Some linked media is no longer available. Relink the request.", "weekly-wildcat-headless")}</PlanningNotice> : null}
        <Button variant="secondary" disabled={!canManage || !updateRequest || isSaving || !window.wp?.media} onClick={chooseMedia}>
          {__("Link from Media Library", "weekly-wildcat-headless")}
        </Button>
      </div>
      <div className="byline-planning-media-controls">
        <SelectControl
          __nextHasNoMarginBottom
          label={__("Status", "weekly-wildcat-headless")}
          value={request.status}
          options={STATUS_OPTIONS}
          disabled={!canManage || !updateRequest || isSaving}
          onChange={(value: string) => void update({ status: value })}
        />
        <SelectControl
          __nextHasNoMarginBottom
          label={__("Assignee", "weekly-wildcat-headless")}
          value={request.assignee?.id ? String(request.assignee.id) : ""}
          options={[{ label: __("Unassigned", "weekly-wildcat-headless"), value: "" }, ...assignees.map((person) => ({ label: person.name, value: String(person.id) }))]}
          disabled={!canManage || !canAssign || !updateRequest || isSaving}
          onChange={(value: string) => void update({ assigneeId: value ? Number(value) : 0 })}
        />
      </div>
      {request.status !== "done" ? <Button variant="primary" disabled={!canManage || !updateRequest || isSaving} onClick={() => void update({ status: "done" })}>{__("Mark complete", "weekly-wildcat-headless")}</Button> : null}
      {request.dueAt ? <p className="byline-planning-list-date-note" title={exactPlanningDate(request.dueAt)}>{relativePlanningDate(request.dueAt)}</p> : null}
      {error ? <PlanningNotice>{error}</PlanningNotice> : null}
      {!updateRequest ? <p className="byline-planning-help">{__("The protected media update API is not available in this install.", "weekly-wildcat-headless")}</p> : null}
    </article>
  );
}

export function MediaDesk({ resource, onRetry, updateRequest, onOpenStory }: MediaDeskProps) {
  const [statusFilter, setStatusFilter] = useState<"" | PlanningVisualStatus>("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [storyFilter, setStoryFilter] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const data = resource.data;
  const requests = data?.requests || [];
  const assignees = data?.assignees || [];
  const canManage = data?.capabilities?.canManageMedia !== false;
  const canAssign = data?.capabilities?.canAssign !== false;

  const filtered = useMemo(() => requests.filter((request) => {
    if (statusFilter && request.status !== statusFilter) return false;
    if (assigneeFilter && String(request.assignee?.id || "") !== assigneeFilter) return false;
    if (storyFilter && !request.story.title.toLocaleLowerCase().includes(storyFilter.toLocaleLowerCase())) return false;
    return true;
  }), [requests, statusFilter, assigneeFilter, storyFilter]);

  const grouped = STATUS_OPTIONS.map((status) => ({ ...status, requests: filtered.filter((request) => request.status === status.value) })).filter((group) => group.requests.length);

  if (!data && !resource.available) return <PlanningUnavailable label={__("Media Desk", "weekly-wildcat-headless")} message={resource.error || __("Media planning is unavailable right now.", "weekly-wildcat-headless")} onRetry={onRetry} />;
  if (!data) return <PlanningEmpty label={__("Media Desk", "weekly-wildcat-headless")} instructions={__("No media request data is available.", "weekly-wildcat-headless")} />;

  return (
    <section className="byline-planning-media" aria-labelledby="byline-planning-media-heading">
      <ViewHeader title={__("Media Desk", "weekly-wildcat-headless")} description={__("Track visual requests without creating a parallel media library. Attachments remain owned by WordPress Media.", "weekly-wildcat-headless")} />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}
      <div className="byline-planning-filter-grid">
        <SelectControl __nextHasNoMarginBottom label={__("Filter by status", "weekly-wildcat-headless")} value={statusFilter} options={[{ label: __("All statuses", "weekly-wildcat-headless"), value: "" }, ...STATUS_OPTIONS]} onChange={setStatusFilter} />
        <SelectControl __nextHasNoMarginBottom label={__("Filter by assignee", "weekly-wildcat-headless")} value={assigneeFilter} options={[{ label: __("Everyone", "weekly-wildcat-headless"), value: "" }, ...assignees.map((person) => ({ label: person.name, value: String(person.id) }))]} onChange={setAssigneeFilter} />
        <TextControl __nextHasNoMarginBottom label={__("Find a story", "weekly-wildcat-headless")} value={storyFilter} onChange={setStoryFilter} />
      </div>
      {!filtered.length ? <PlanningEmpty label={__("Media requests", "weekly-wildcat-headless")} instructions={requests.length ? __("No media requests match these filters.", "weekly-wildcat-headless") : __("No visual requests have been recorded yet.", "weekly-wildcat-headless")} /> : (
        <div className="byline-planning-media-groups">
          {grouped.map((group) => (
            <section className="byline-planning-media-group" key={group.value} aria-labelledby={`byline-planning-media-group-${group.value}`}>
              <h3 id={`byline-planning-media-group-${group.value}`}>{group.label} <span className="byline-planning-count">{group.requests.length}</span></h3>
              <div className="byline-planning-media-list">
                {group.requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    assignees={assignees}
                    canManage={canManage}
                    canAssign={canAssign}
                    isSaving={savingId === request.id}
                    updateRequest={updateRequest ? async (id, changes) => {
                      setSavingId(id);
                      try { await updateRequest(id, changes); } finally { setSavingId(null); }
                    } : undefined}
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
