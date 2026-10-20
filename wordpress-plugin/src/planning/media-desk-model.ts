/**
 * Pure model for the Media Desk: one row per production assignment, with a
 * graceful fallback to the legacy one-request-per-story collection.
 */
import { siteDay } from "../home/newsroom-model";
import {
  parsePlanningDate,
  planningDateKey,
  type MediaAssignmentRow,
  type MediaAttachment,
  type MediaDeskResponse,
  type MediaRequest,
  type PlanningVisualStatus,
  type PlanningVisualType
} from "./planning-model";

export type MediaDeskRow = MediaAssignmentRow & {
  /** `assignment` rows update through the per-assignment route; `request` rows are the legacy story-level fallback. */
  source: "assignment" | "request";
  /**
   * The assignment the story-level featured-image route acts on (the first one
   * that is not done, else the first). Only this row can use "Set featured".
   */
  isPrimary: boolean;
};

export const MEDIA_TYPE_OPTIONS: Array<{ value: Exclude<PlanningVisualType, "none">; label: string }> = [
  { value: "photo", label: "Photo" },
  { value: "gallery", label: "Gallery" },
  { value: "graphic", label: "Graphic" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" }
];

export const MEDIA_STATUS_OPTIONS: Array<{ value: PlanningVisualStatus; label: string }> = [
  { value: "needed", label: "Needed" },
  { value: "assigned", label: "Assigned" },
  { value: "in-progress", label: "In progress" },
  { value: "uploaded", label: "Uploaded" },
  { value: "selected", label: "Selected" },
  { value: "done", label: "Done" }
];

export function mediaTypeLabel(type: PlanningVisualType): string {
  return MEDIA_TYPE_OPTIONS.find((option) => option.value === type)?.label || (type === "none" ? "No visual" : type);
}

function requestRow(request: MediaRequest): MediaDeskRow {
  return {
    id: String(request.id),
    story: request.story,
    title: "",
    type: request.type,
    status: request.status,
    assignee: request.assignee,
    dueAt: request.dueAt,
    notes: request.notes || request.legacyNotes || "",
    attachmentIds: request.attachmentIds || [],
    attachments: request.attachments,
    invalidAttachmentIds: request.invalidAttachmentIds,
    mediaReadiness: request.mediaReadiness,
    featuredAttachmentId: request.featuredAttachmentId,
    isLegacy: true,
    source: "request",
    isPrimary: true
  };
}

/** Rows for the desk: `assignments` when the server sends them, otherwise the per-story `requests`. */
export function mediaDeskRows(data: Pick<MediaDeskResponse, "requests" | "assignments"> | null | undefined): MediaDeskRow[] {
  if (!data) return [];
  if (Array.isArray(data.assignments)) {
    const primaryByStory = new Map<number, string>();
    data.assignments.forEach((assignment) => {
      const current = primaryByStory.get(assignment.story.id);
      if (current === undefined) {
        primaryByStory.set(assignment.story.id, assignment.id);
      } else {
        const currentRow = data.assignments!.find((candidate) => candidate.story.id === assignment.story.id && candidate.id === current);
        if (currentRow?.status === "done" && assignment.status !== "done") primaryByStory.set(assignment.story.id, assignment.id);
      }
    });
    return data.assignments.map((assignment) => ({
      ...assignment,
      attachmentIds: assignment.attachmentIds || [],
      source: "assignment" as const,
      isPrimary: primaryByStory.get(assignment.story.id) === assignment.id
    }));
  }
  return (data.requests || []).map(requestRow);
}

/** The day a due value falls on: the site timezone when known, else the browser's (as Planning always has). */
export function mediaDueDay(value: string | null | undefined, timezone?: string): string {
  if (!value) return "";
  if (timezone) return siteDay(value, timezone);
  const date = parsePlanningDate(value);
  return date ? planningDateKey(date) : "";
}

export type MediaDeskFilters = {
  status: "" | PlanningVisualStatus;
  type: "" | Exclude<PlanningVisualType, "none">;
  assigneeId: string;
  /** `YYYY-MM-DD`, inclusive. A row with no due date never matches a due range. */
  dueFrom: string;
  dueTo: string;
  story: string;
};

export const EMPTY_MEDIA_DESK_FILTERS: MediaDeskFilters = { status: "", type: "", assigneeId: "", dueFrom: "", dueTo: "", story: "" };

export function filterMediaRows(rows: MediaDeskRow[], filters: MediaDeskFilters, timezone?: string): MediaDeskRow[] {
  const story = filters.story.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.assigneeId && String(row.assignee?.id || "") !== filters.assigneeId) return false;
    if (story && !`${row.story.title} ${row.title}`.toLocaleLowerCase().includes(story)) return false;
    if (filters.dueFrom || filters.dueTo) {
      const day = mediaDueDay(row.dueAt, timezone);
      if (!day) return false;
      if (filters.dueFrom && day < filters.dueFrom) return false;
      if (filters.dueTo && day > filters.dueTo) return false;
    }
    return true;
  });
}

/** Earliest due first, undated last, then story and assignment title. */
export function sortMediaRows(rows: MediaDeskRow[], timezone?: string): MediaDeskRow[] {
  return [...rows].sort((left, right) => {
    const leftDay = mediaDueDay(left.dueAt, timezone) || "9999-99-99";
    const rightDay = mediaDueDay(right.dueAt, timezone) || "9999-99-99";
    return leftDay.localeCompare(rightDay)
      || left.story.title.localeCompare(right.story.title)
      || (left.title || "").localeCompare(right.title || "")
      || left.id.localeCompare(right.id);
  });
}

export type MediaReadinessHint = { label: string; tone: "success" | "warning" | "neutral" };

function attachmentGaps(attachments: MediaAttachment[] | undefined) {
  const gaps = { alt: 0, credit: 0, rights: 0 };
  (attachments || []).forEach((attachment) => {
    if (attachment.checks?.alt === false) gaps.alt += 1;
    if (attachment.checks?.credit === false) gaps.credit += 1;
    if (attachment.checks?.rights === false) gaps.rights += 1;
  });
  return gaps;
}

/** One short statement of whether the linked media is ready to publish. */
export function mediaReadinessHint(row: Pick<MediaDeskRow, "attachmentIds" | "attachments" | "invalidAttachmentIds" | "mediaReadiness">): MediaReadinessHint {
  if (row.invalidAttachmentIds?.length) return { label: "Linked media is missing", tone: "warning" };
  if (!row.attachmentIds.length) return { label: "No media linked", tone: "neutral" };

  const readiness = row.mediaReadiness;
  const fromChecks = attachmentGaps(row.attachments);
  const gaps = {
    alt: readiness?.missingAltIds?.length ?? fromChecks.alt,
    credit: readiness?.missingCreditIds?.length ?? fromChecks.credit,
    rights: readiness?.missingRightsIds?.length ?? fromChecks.rights
  };
  const missing = [gaps.alt ? "alt text" : "", gaps.credit ? "credit" : "", gaps.rights ? "rights" : ""].filter(Boolean);
  if (missing.length) return { label: `Needs ${missing.join(", ")}`, tone: "warning" };
  if (readiness?.ready === false) return { label: "Needs review", tone: "warning" };
  return { label: "Metadata ready", tone: "success" };
}
