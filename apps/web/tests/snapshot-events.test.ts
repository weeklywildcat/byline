import { expect, it } from "vitest";
import { upcomingSnapshotEvents } from "@/lib/snapshot-events";
import type { SchoolEvent } from "@/lib/headless";
it("applies the canonical CMS timezone and upcoming cutoff again on every build", () => {
  const events = [
    { id: 1, startDate: "2026-10-17T16:59" },
    { id: 2, startDate: "2026-10-17T17:00" },
    { id: 3, startDate: "2026-10-18T08:00" }
  ] as SchoolEvent[];
  expect(upcomingSnapshotEvents(events, "America/New_York", 1, new Date("2026-10-17T21:00:00Z")).map((e) => e.id)).toEqual([2]);
  expect(upcomingSnapshotEvents(events, "America/New_York", 12, new Date("2026-10-18T12:01:00Z"))).toEqual([]);
});
