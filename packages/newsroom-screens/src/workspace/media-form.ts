/**
 * Media & Production: form <-> API mapping, due dates and readiness hints.
 *
 * A production due date is a calendar day with a time that matters little. It
 * is sent as site-local wall time (`YYYY-MM-DDTHH:mm`, 17:00 by default) and
 * read back in the site timezone.
 */
import { siteWallParts, isDayValue } from "./appointment-form";
import type { MediaAssignmentInput, MediaAssignmentStatus, MediaAssignmentType, StoryMediaAssignment } from "./workspace-types";

export const DEFAULT_DUE_TIME = "17:00";

export type MediaForm = {
  title: string;
  type: MediaAssignmentType;
  status: MediaAssignmentStatus;
  assigneeId: number;
  /** `YYYY-MM-DD`, or "" for no due date. */
  dueDay: string;
  /** Kept from the stored value so a re-save does not move the clock time. */
  dueTime: string;
  notes: string;
  attachmentIds: number[];
};

export const emptyMediaForm = (assigneeId = 0): MediaForm => ({ title: "", type: "photo", status: "needed", assigneeId, dueDay: "", dueTime: DEFAULT_DUE_TIME, notes: "", attachmentIds: [] });

export function mediaToForm(assignment: StoryMediaAssignment, timezone: string): MediaForm {
  const due = siteWallParts(assignment.dueAt, timezone);
  return {
    title: assignment.title,
    type: assignment.type,
    status: assignment.status,
    assigneeId: assignment.assigneeId || 0,
    dueDay: due?.date || "",
    dueTime: due?.time || DEFAULT_DUE_TIME,
    notes: assignment.notes,
    attachmentIds: [...assignment.attachmentIds]
  };
}

export function validateMediaForm(form: MediaForm): Partial<Record<"title" | "dueDay" | "notes", string>> {
  const errors: Partial<Record<"title" | "dueDay" | "notes", string>> = {};
  if (form.title.trim().length > 160) errors.title = "Keep the title under 160 characters.";
  if (form.dueDay && !isDayValue(form.dueDay)) errors.dueDay = "Choose a valid due date.";
  if (form.notes.length > 4000) errors.notes = "Notes can be up to 4000 characters.";
  return errors;
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * `manage`: a reporter/editor who may change every field. Anyone else holds only
 * their own assignment and may change just its status, notes and files; sending
 * anything more is rejected by the server.
 */
export function mediaFormToInput(form: MediaForm, original: StoryMediaAssignment | undefined, options: { manage: boolean; assign: boolean }, timezone = "UTC"): MediaAssignmentInput {
  const before = original ? mediaToForm(original, timezone) : null;
  if (original && before && !options.manage) {
    return { status: form.status, notes: form.notes, ...(sameIds(form.attachmentIds, before.attachmentIds) ? {} : { attachmentIds: form.attachmentIds }), expectedUpdatedAt: original.updatedAt };
  }
  const input: MediaAssignmentInput = {
    title: form.title.trim(),
    type: form.type,
    status: form.status,
    notes: form.notes,
    attachmentIds: form.attachmentIds
  };
  if (!before || form.assigneeId !== before.assigneeId) {
    if (options.assign || !before) input.assigneeId = form.assigneeId;
  }
  if (!before || form.dueDay !== before.dueDay) input.dueAt = form.dueDay ? `${form.dueDay}T${form.dueTime || DEFAULT_DUE_TIME}` : null;
  if (before && sameIds(form.attachmentIds, before.attachmentIds)) delete input.attachmentIds;
  return original ? { ...input, expectedUpdatedAt: original.updatedAt } : input;
}

/** Short, specific readiness hints for linked files ("Missing credit · 2"). */
export function mediaReadinessHints(assignment: Pick<StoryMediaAssignment, "mediaReadiness" | "attachmentIds" | "invalidAttachmentIds">): string[] {
  const readiness = assignment.mediaReadiness;
  const hints: string[] = [];
  const count = (ids?: number[]) => (ids?.length && ids.length > 1 ? ` · ${ids.length}` : "");
  if (readiness?.missingAltIds?.length) hints.push(`Missing alt text${count(readiness.missingAltIds)}`);
  if (readiness?.missingCreditIds?.length) hints.push(`Missing credit${count(readiness.missingCreditIds)}`);
  if (readiness?.missingRightsIds?.length) hints.push(`Missing rights${count(readiness.missingRightsIds)}`);
  if (assignment.invalidAttachmentIds?.length) hints.push(`${assignment.invalidAttachmentIds.length} unavailable`);
  return hints;
}

export const fileCountLabel = (count: number) => (count === 1 ? "1 file" : `${count} files`);
