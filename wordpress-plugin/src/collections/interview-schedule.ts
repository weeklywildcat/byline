import type { StoryAppointment } from "../workspace/workspace-types";
import type { Interview } from "./collection-model";
/** Feed the existing scheduling form without creating a per-story appointment copy. */
export function interviewAppointment(interview: Interview): StoryAppointment {
  return {
    id: String(interview.id),
    title: interview.interviewee,
    kind: "interview",
    status:
      interview.status === "completed" || interview.status === "follow-up"
        ? "completed"
        : interview.status === "cancelled"
        ? "cancelled"
        : interview.status === "scheduled"
        ? "confirmed"
        : "planned",
    scheduleMode:
      interview.scheduleMode ||
      (interview.scheduledAt ? "exact" : "unscheduled"),
    windowStart: interview.windowStart || null,
    windowEnd: interview.windowEnd || null,
    startAt: interview.scheduledAt || null,
    endAt: interview.endAt || null,
    assigneeIds: interview.interviewers.map((p) => p.id),
    assignees: interview.interviewers,
    sourceId: null,
    sourceLabel: interview.interviewee,
    location: interview.location || "",
    notes: interview.notes,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
  };
}
