import { describe, expect, it } from "vitest";
import { getWeeklyWildcatCompatibilityDesign } from "@byline/design";
import {
  createDesignScheduleApi,
  designSchedulePath,
  DesignScheduleApiError,
  type DesignScheduleRequest
} from "../src/design-scheduling-api";

const document = getWeeklyWildcatCompatibilityDesign("home");

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    template: "home",
    document,
    baseLiveRevision: 3,
    scheduledAt: "2026-08-29T12:00:00Z",
    scheduledBy: 7,
    status: "scheduled",
    execution: {
      attempts: 0,
      idempotencyKey: "schedule-key",
      startedAt: null,
      completedAt: null,
      deploymentTriggered: false
    },
    idempotencyKey: "schedule-key",
    resultingRevision: null,
    error: null,
    ...overrides
  };
}

describe("Studio design scheduling API", () => {
  it("builds template-scoped protected routes", () => {
    expect(designSchedulePath("home:preview", "list")).toBe("/byline/v1/admin/design/home%3Apreview/schedules");
    expect(designSchedulePath("home", "reschedule", 12)).toBe("/byline/v1/admin/design/home/schedule/12/reschedule");
    expect(designSchedulePath("home", "cancel", 12)).toBe("/byline/v1/admin/design/home/schedule/12");
  });

  it("sends schedule mutations and validates every response", async () => {
    const requests: DesignScheduleRequest[] = [];
    const api = createDesignScheduleApi(async <T>(request: DesignScheduleRequest) => {
      requests.push(request);
      return schedule() as T;
    });

    const created = await api.create("home", {
      document,
      baseRevisionId: 3,
      scheduledAt: "2026-08-29T12:00:00Z",
      idempotencyKey: "schedule-key"
    });
    await api.reschedule("home", created.id, "2026-08-30T12:00:00Z");
    await api.rebase("home", created.id, 4);
    await api.cancel("home", created.id);

    expect(requests.map(({ path, method }) => `${method} ${path}`)).toEqual([
      "POST /byline/v1/admin/design/home/schedule",
      "POST /byline/v1/admin/design/home/schedule/12/reschedule",
      "POST /byline/v1/admin/design/home/schedule/12/rebase",
      "DELETE /byline/v1/admin/design/home/schedule/12"
    ]);
  });

  it("rejects a malformed protected response instead of inventing schedule state", async () => {
    const api = createDesignScheduleApi(async <T>(): Promise<T> => ({ status: "scheduled" } as T));

    await expect(api.list("home")).rejects.toBeInstanceOf(DesignScheduleApiError);
  });
});
