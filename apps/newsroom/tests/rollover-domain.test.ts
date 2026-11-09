import { describe, expect, it } from "vitest";
import type { ReviewWorkflowDef, RoutingDirectory } from "../src/domain/newsroom-roles";
import { carriedAssignments, cleanPlan, cleanYear, departing, routingCheck, suggestYear, unfinishedWork } from "../src/domain/rollover";

describe("school years", () => {
  it("suggests the year after the active one, or the one containing today", () => {
    expect(suggestYear({ endsOn: "2027-07-31" }, "2027-05-01")).toEqual({ name: "2027–28", startsOn: "2027-08-01", endsOn: "2028-07-31" });
    expect(suggestYear(null, "2026-11-09")).toEqual({ name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31" });
  });

  it("validates dates, names and overlap with earlier years", () => {
    const existing = [{ name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31" }];
    expect(cleanYear({ name: "2027–28", startsOn: "2027-08-01", endsOn: "2028-07-31" }, existing)).toMatchObject({ ok: true });
    expect(cleanYear({ name: "", startsOn: "nope", endsOn: "2028-02-30" }, existing)).toMatchObject({ ok: false, problems: ["Give the school year a name, like 2027–28.", "Choose the first day.", "Choose the last day."] });
    expect(cleanYear({ name: "2027–28", startsOn: "2028-07-31", endsOn: "2027-08-01" }, existing)).toMatchObject({ ok: false, problems: ["The last day must come after the first."] });
    expect(cleanYear({ name: "2026–27", startsOn: "2027-08-01", endsOn: "2028-07-31" }, existing)).toMatchObject({ ok: false, problems: ["There is already a school year named 2026–27."] });
    expect(cleanYear({ name: "Spring", startsOn: "2027-06-01", endsOn: "2027-12-31" }, existing)).toMatchObject({ ok: false, problems: ["These dates overlap 2026–27."] });
  });
});

describe("rollover plans", () => {
  const valid = { users: new Set([1, 2, 3]), assignments: new Map([[10, { userId: 1 }], [11, { userId: 2 }], [12, { userId: 3 }]]) };

  it("only carries responsibilities of people who return, and only titles and sign-in changes that make sense", () => {
    const plan = cleanPlan({ returning: [1, 2, 99, "x"], carry: [10, 11, 12, 77], titles: { 1: "  Editor-in-Chief ", 3: "Ghost", 2: "" }, disable: [1, 3, 99] }, valid);
    expect(plan).toEqual({ returning: [1, 2], carry: [10, 11], titles: { "1": "Editor-in-Chief" }, disable: [3] });
    expect(cleanPlan(null, valid)).toEqual({ returning: [], carry: [], titles: {}, disable: [] });
  });

  it("names who departs and carries the chosen assignments into the new year", () => {
    expect(departing([1, 2, 3], { returning: [1] })).toEqual([2, 3]);
    const previous = [{ id: 10, roleId: 1, userId: 1, yearId: 5, scopeMode: "global" as const, sectionIds: [], mediaTypes: [] }, { id: 11, roleId: 1, userId: 2, yearId: 5, scopeMode: "global" as const, sectionIds: [], mediaTypes: [] }];
    expect(carriedAssignments(previous, { carry: [10] }, 6)).toEqual([{ ...previous[0], yearId: 6 }]);
  });
});

describe("unfinished work", () => {
  it("lists the in-progress stories of each person who leaves, as writer or editor, and nothing else", () => {
    const stories = [
      { id: 1, title: "A", phase: "drafting", deadline: "2026-11-12", writerIds: [2], editorId: 1 },
      { id: 2, title: "B", phase: "review", deadline: null, writerIds: [1], editorId: 2 },
      { id: 3, title: "C", phase: "published", deadline: null, writerIds: [2], editorId: null },
      { id: 4, title: "D", phase: "pitch", deadline: null, writerIds: [2], editorId: null },
      { id: 5, title: "E", phase: "dropped", deadline: null, writerIds: [2], editorId: null }
    ];
    expect(unfinishedWork(stories, [2, 3])).toEqual([
      { userId: 2, stories: [{ id: 1, title: "A", phase: "drafting", deadline: "2026-11-12", as: "writer" }, { id: 2, title: "B", phase: "review", deadline: null, as: "editor" }] }
    ]);
  });
});

describe("routing check", () => {
  const step = (patch: Record<string, unknown>) => ({ stepId: "s", label: "Section Edit", target: "whole", resolver: "role", roleId: 1, roleMatch: "story-section", userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "none", ...patch });
  const workflow = (steps: unknown[]): ReviewWorkflowDef => ({ id: 1, name: "Standard", isDefault: true, archived: false, appliesTo: { sections: [], formats: [] }, steps: steps as never });
  const directory = (assignments: RoutingDirectory["assignments"]): RoutingDirectory => ({
    roles: new Map([[1, { id: 1, key: "section-editor", name: "Section Editor", scopeKind: "section", waitingLabel: "{scope} Editor", archived: false }]]),
    assignments,
    users: new Map([[7, { id: 7, name: "Jeremy", role: "staff" }]]),
    sections: new Map([[1, "Sports"], [2, "News"]]),
    year: { id: 9, name: "2027–28" }
  });
  const jeremy = (sectionIds: number[], scopeMode: "scoped" | "global" = "scoped") => ({ id: 1, roleId: 1, userId: 7, yearId: 9, scopeMode, sectionIds, mediaTypes: [] });

  it("passes when every Section has someone, with the same resolver submission uses", () => {
    expect(routingCheck([workflow([step({})])], directory([jeremy([1, 2])]), [])).toEqual([]);
    expect(routingCheck([workflow([step({})])], directory([jeremy([], "global")]), [])).toEqual([]);
  });

  it("names each Section nobody covers, and a role nobody holds, with where to fix it", () => {
    const sports = routingCheck([workflow([step({})])], directory([jeremy([1])]), []);
    expect(sports).toEqual([{ workflowId: 1, workflow: "Standard", step: "Section Edit", message: "News has no active Section Editor for 2027–28.", fix: { kind: "role", roleId: 1 } }]);
    const nobody = routingCheck([workflow([step({})])], directory([]), []);
    expect(nobody.map((issue) => issue.message)).toEqual(["Sports has no active Section Editor for 2027–28.", "News has no active Section Editor for 2027–28."]);
  });

  it("skips archived workflows and Story-specific steps, and reports a person who can no longer sign in", () => {
    expect(routingCheck([{ ...workflow([step({})]), archived: true }], directory([]), [])).toEqual([]);
    expect(routingCheck([workflow([step({ resolver: "story-editor" })])], directory([]), [])).toEqual([]);
    const person = routingCheck([workflow([step({ resolver: "person", userId: 99, roleId: null })])], directory([]), []);
    expect(person[0]).toMatchObject({ message: "Section Edit is routed to someone who can no longer sign in.", fix: { kind: "workflow" } });
  });
});
