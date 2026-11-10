import { describe, expect, it } from "vitest";
import { workloadHint, workloadRows, type WorkloadInput } from "../src/domain/workload";

const people = [
  { id: 1, name: "Maycie Krajewski", role: "staff" as const },
  { id: 2, name: "Jeremy Lauten", role: "editor" as const },
  { id: 3, name: "Addyson Reed", role: "staff" as const }
];
// Wednesday 2026-11-11, noon in New York.
const base: WorkloadInput = { now: new Date("2026-11-11T17:00:00Z"), timeZone: "America/New_York", people, stories: [], reviews: [], media: [] };
const row = (input: Partial<WorkloadInput>, id: number) => workloadRows({ ...base, ...input }).find((entry) => entry.userId === id)!;

describe("workloadRows", () => {
  it("counts active Stories for writers and the editor, once each, and ignores pitches, sidelined and published work", () => {
    const stories = [
      { id: 10, phase: "reporting" as const, deadline: null, writerIds: [1, 1], editorId: 2 },
      { id: 11, phase: "drafting" as const, deadline: null, writerIds: [1], editorId: 1 },
      { id: 12, phase: "pitch" as const, deadline: null, writerIds: [1], editorId: null },
      { id: 13, phase: "on-hold" as const, deadline: null, writerIds: [1], editorId: null },
      { id: 14, phase: "dropped" as const, deadline: null, writerIds: [1], editorId: null },
      { id: 15, phase: "published" as const, deadline: null, writerIds: [1], editorId: null }
    ];
    expect(row({ stories }, 1).activeStories).toBe(2);
    expect(row({ stories }, 2).activeStories).toBe(1);
    expect(row({ stories }, 3).activeStories).toBe(0);
  });

  it("separates overdue from due this week by the newsroom's local day", () => {
    const stories = [
      { id: 1, phase: "drafting" as const, deadline: "2026-11-10T23:00:00-05:00", writerIds: [1], editorId: null }, // yesterday
      { id: 2, phase: "drafting" as const, deadline: "2026-11-12T03:00:00Z", writerIds: [1], editorId: null }, // Wed evening local: today
      { id: 3, phase: "drafting" as const, deadline: "2026-11-17T12:00:00Z", writerIds: [1], editorId: null }, // 6 days out
      { id: 4, phase: "drafting" as const, deadline: "2026-11-18T12:00:00Z", writerIds: [1], editorId: null }, // 7 days out: not this week
      { id: 5, phase: "review" as const, deadline: null, writerIds: [1], editorId: null }
    ];
    const result = row({ stories }, 1);
    expect(result).toMatchObject({ activeStories: 5, overdue: 1, dueThisWeek: 2 });
  });

  it("reads a date-only deadline as that calendar day, not shifted by the timezone", () => {
    const stories = [
      { id: 1, phase: "drafting" as const, deadline: "2026-11-10", writerIds: [1], editorId: null },
      { id: 2, phase: "drafting" as const, deadline: "2026-11-11", writerIds: [1], editorId: null },
      { id: 3, phase: "drafting" as const, deadline: "2026-11-17", writerIds: [1], editorId: null },
      { id: 4, phase: "drafting" as const, deadline: "2026-11-18", writerIds: [1], editorId: null }
    ];
    expect(row({ stories }, 1)).toMatchObject({ overdue: 1, dueThisWeek: 2, activeStories: 4 });
  });

  it("counts reviews waiting on a person (assigned or in a queue) and open media assignments", () => {
    const result = workloadRows({
      ...base,
      reviews: [{ storyId: 1, userIds: [1, 3] }, { storyId: 2, userIds: [1] }],
      media: [
        { status: "assigned", assigneeIds: [1] },
        { status: "in-progress", assigneeIds: [1, 3] },
        { status: "done", assigneeIds: [1] },
        { status: "uploaded", assigneeIds: [1] }
      ]
    });
    expect(result.find((entry) => entry.userId === 1)).toMatchObject({ reviews: 2, mediaAssignments: 2 });
    expect(result.find((entry) => entry.userId === 3)).toMatchObject({ reviews: 1, mediaAssignments: 1 });
  });

  it("ignores people who are not in the list and never ranks anyone", () => {
    const result = workloadRows({
      ...base,
      stories: [{ id: 1, phase: "reporting", deadline: null, writerIds: [99, 3], editorId: null }, { id: 2, phase: "reporting", deadline: null, writerIds: [3], editorId: null }]
    });
    expect(result.map((entry) => entry.name)).toEqual(["Addyson Reed", "Jeremy Lauten", "Maycie Krajewski"]);
    expect(result.find((entry) => entry.userId === 3)!.activeStories).toBe(2);
  });
});

describe("workloadHint", () => {
  it("reads as plain facts and is empty with nothing to say", () => {
    expect(workloadHint({ activeStories: 2, reviews: 1, dueThisWeek: 1, overdue: 0, mediaAssignments: 0 })).toBe("2 active Stories · 1 review · 1 due this week");
    expect(workloadHint({ activeStories: 1, reviews: 0, dueThisWeek: 0, overdue: 2, mediaAssignments: 3 })).toBe("1 active Story · 3 media assignments · 2 overdue");
    expect(workloadHint({ activeStories: 0, reviews: 0, dueThisWeek: 0, overdue: 0, mediaAssignments: 0 })).toBe("");
  });
});
