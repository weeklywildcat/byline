import { describe, expect, it } from "vitest";
import {
  designScheduleNeedsReview,
  designScheduleSnapshotHash,
  isDesignScheduleDue,
  nextDesignSchedule,
  parseDesignScheduleRecord
} from "../src/design-scheduling-model";

const document = {
  schemaVersion: 2 as const,
  template: "home",
  theme: "weekly-wildcat",
  packages: [{
    id: "home-special-coverage",
    type: "special-coverage-package" as const,
    props: { source: { type: "coverage" as const, coverageId: 42 } }
  }]
};

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    template: "home",
    document,
    baseLiveRevision: 3,
    scheduledAt: "2026-08-28T12:00:00Z",
    scheduledBy: 11,
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

describe("design scheduling model", () => {
  it("accepts a validated immutable schedule record", () => {
    const parsed = parseDesignScheduleRecord(schedule(), "home");

    expect(parsed.errors).toEqual([]);
    expect(parsed.record?.document.packages[0].props).toEqual(document.packages[0].props);
    expect(designScheduleSnapshotHash(document)).toBe(designScheduleSnapshotHash({ ...document }));
  });

  it("rejects malformed schedule state instead of guessing defaults", () => {
    expect(parseDesignScheduleRecord(schedule({ status: "unknown" })).record).toBeNull();
    expect(parseDesignScheduleRecord(schedule({ baseLiveRevision: -1 })).record).toBeNull();
    expect(parseDesignScheduleRecord(schedule({ document: { schemaVersion: 2 } })).record).toBeNull();
  });

  it("derives due, review, and upcoming states", () => {
    const parsed = parseDesignScheduleRecord(schedule());
    if (!parsed.record) throw new Error("expected valid schedule");

    expect(isDesignScheduleDue(parsed.record, new Date("2026-08-28T12:00:00Z"))).toBe(true);
    expect(designScheduleNeedsReview({ ...parsed.record, status: "conflict" })).toBe(true);
    expect(nextDesignSchedule([
      { ...parsed.record, id: 8, scheduledAt: "2026-08-29T12:00:00Z" },
      parsed.record
    ], new Date("2026-08-27T12:00:00Z"))?.id).toBe(7);
  });
});
