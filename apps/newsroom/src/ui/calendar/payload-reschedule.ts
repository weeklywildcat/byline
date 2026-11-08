import type { RescheduleChange, RescheduleHost, RescheduleKind } from "@byline/newsroom-screens/calendar/calendar-reschedule";
import { createBylineRequest } from "../home/payload-fetchers";

/**
 * Who may drag which kind of date. The server decides every save; this only
 * decides what can be picked up. Deadlines, publication plans and publish
 * times are editor decisions, a production due date is a manager's field
 * (anyone else's change would be dropped silently), and an appointment is
 * saved by whoever may edit its story.
 */
export function canReschedule(kind: RescheduleKind, isEditor: boolean): boolean {
  return kind === "appointment" ? true : isEditor;
}

/** Each move goes through the endpoint that owns the date, the same ones the Story screen uses. */
export function rescheduleRequest(api: string): RescheduleHost["apply"] {
  const request = createBylineRequest(api);
  return (change: RescheduleChange) => {
    switch (change.kind) {
      case "deadline": return request(`/stories/${change.storyId}/workflow`, "POST", { deadline: change.deadline });
      case "planned": return request(`/stories/${change.storyId}/workflow`, "POST", { plannedPublication: change.plannedPublication });
      case "scheduled": return request(`/stories/${change.storyId}/schedule-publication`, "POST", { at: change.at, expected: change.expected });
      case "appointment": return request(`/stories/${change.storyId}/appointments/${encodeURIComponent(change.appointmentId)}`, "POST", { startAt: change.startAt, endAt: change.endAt });
      case "media": return request(`/stories/${change.storyId}/media-assignments/${encodeURIComponent(change.assignmentId)}`, "POST", { dueAt: change.dueAt });
    }
  };
}
