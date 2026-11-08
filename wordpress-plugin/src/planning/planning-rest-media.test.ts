import { describe, expect, it } from "vitest";
import type { PlanningRequestOptions } from "@byline/newsroom-screens/planning/planning-api";
import { createPlanningFetchers, mediaAssignmentPath } from "./planning-rest";

/** The WordPress Media Desk routes (the shared desk model is tested in @byline/newsroom-screens). */
describe("per-assignment routes", () => {
  it("updates an assignment (including legacy-v1) and reads the schedule feed through the protected routes", async () => {
    const requests: PlanningRequestOptions[] = [];
    const api = createPlanningFetchers(async <T>(options: PlanningRequestOptions): Promise<T> => {
      requests.push(options);
      return {} as T;
    });
    await api.updateMediaAssignment?.(41, "9f8e", { status: "done", dueAt: "2026-10-30" });
    await api.updateMediaAssignment?.(41, "legacy-v1", { assigneeId: 0 });
    await api.getSchedule?.("2026-10-12", "2026-11-01");
    await api.getSchedule?.("2026-10-12", "2026-11-01", true);
    expect(requests.map(({ path, method, data }) => ({ path, method, data }))).toEqual([
      { path: "/byline/v1/editorial/stories/41/media-assignments/9f8e", method: "POST", data: { status: "done", dueAt: "2026-10-30" } },
      { path: "/byline/v1/editorial/stories/41/media-assignments/legacy-v1", method: "POST", data: { assigneeId: 0 } },
      { path: "/byline/v1/editorial/schedule?from=2026-10-12&to=2026-11-01", method: undefined, data: undefined },
      { path: "/byline/v1/editorial/schedule?from=2026-10-12&to=2026-11-01&includeTasks=1", method: undefined, data: undefined }
    ]);
    expect(mediaAssignmentPath(3, "a b")).toBe("/byline/v1/editorial/stories/3/media-assignments/a%20b");
  });
});
