import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_STEPS, resolveWorkflow, type ReviewWorkflowDef, type RoutingDirectory, type RoutingStory } from "../src/domain/newsroom-roles";
import { blankStep, cleanAssignment, moveStep, newStepId, parseSteps, roleKey, workflowSaveProblems } from "../src/domain/role-admin";

const valid = { sections: new Set([1, 2]), mediaTypes: new Set(["photo", "video"]) };
const sectionRole = { scopeKind: "section" as const, name: "Section Editor" };
const mediaRole = { scopeKind: "media" as const, name: "Visual Desk" };
const plainRole = { scopeKind: "none" as const, name: "Copy Desk" };

describe("cleanAssignment", () => {
  it("accepts a global membership and strips scope", () => {
    expect(cleanAssignment(plainRole, { userId: "5", scopeMode: "global" }, valid)).toEqual({ ok: true, value: { userId: 5, scopeMode: "global", sectionIds: [], mediaTypes: [] } });
  });

  it("requires a Section for a section-scoped member and rejects unknown ones", () => {
    expect(cleanAssignment(sectionRole, { userId: 5, scopeMode: "scoped", sectionIds: [] }, valid)).toMatchObject({ ok: false, problems: ["Choose at least one Section."] });
    expect(cleanAssignment(sectionRole, { userId: 5, scopeMode: "scoped", sectionIds: [9] }, valid)).toMatchObject({ ok: false });
    expect(cleanAssignment(sectionRole, { userId: 5, scopeMode: "scoped", sectionIds: [1, 1, 2] }, valid)).toEqual({ ok: true, value: { userId: 5, scopeMode: "scoped", sectionIds: [1, 2], mediaTypes: [] } });
  });

  it("requires a media type for a media role and refuses the wrong kind of scope", () => {
    expect(cleanAssignment(mediaRole, { userId: 5, scopeMode: "scoped", mediaTypes: ["photo"] }, valid)).toMatchObject({ ok: true });
    expect(cleanAssignment(mediaRole, { userId: 5, scopeMode: "scoped", mediaTypes: [] }, valid)).toMatchObject({ ok: false });
    expect(cleanAssignment(mediaRole, { userId: 5, scopeMode: "scoped", sectionIds: [1], mediaTypes: ["photo"] }, valid)).toMatchObject({ ok: false });
    expect(cleanAssignment(plainRole, { userId: 5, scopeMode: "scoped", sectionIds: [1] }, valid)).toMatchObject({ ok: false });
  });

  it("needs a person and refuses scope on a global membership", () => {
    expect(cleanAssignment(plainRole, { scopeMode: "global" }, valid)).toMatchObject({ ok: false, problems: ["Choose a person."] });
    expect(cleanAssignment(sectionRole, { userId: 5, scopeMode: "global", sectionIds: [1] }, valid)).toMatchObject({ ok: false });
  });
});

describe("roleKey", () => {
  it("makes a stable, readable key", () => {
    expect(roleKey("Sports Desk")).toBe("sports-desk");
    expect(roleKey("  Café & News!! ")).toBe("cafe-news");
    expect(roleKey("???")).toBe("role");
  });
});

describe("moveStep and step ids", () => {
  const steps = ["a", "b", "c", "d"];
  it("moves a step up, down and anywhere, leaving out-of-range moves alone", () => {
    expect(moveStep(steps, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(moveStep(steps, 1, 2)).toEqual(["a", "c", "b", "d"]);
    expect(moveStep(steps, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveStep(steps, 0, 0)).toEqual(steps);
    expect(moveStep(steps, 0, -1)).toEqual(steps);
    expect(moveStep(steps, 3, 4)).toEqual(steps);
    expect(steps).toEqual(["a", "b", "c", "d"]);
  });

  it("never reuses a step id", () => {
    const existing = [{ stepId: "step-2" }, { stepId: "step-3" }];
    expect(newStepId(existing)).toBe("step-4");
    expect(newStepId([{ stepId: "step-1" }, { stepId: "step-3" }])).toBe("step-4");
    expect(blankStep(existing).stepId).toBe("step-4");
  });
});

describe("parseSteps and workflowSaveProblems", () => {
  const known = { roles: new Map([[1, { name: "Copy Desk", archived: false, scopeKind: "none" as const }], [2, { name: "Old Desk", archived: true, scopeKind: "none" as const }], [3, { name: "Section Editor", archived: false, scopeKind: "section" as const }]]), users: new Set([7]), sections: new Set([1]) };
  const step = (patch: Record<string, unknown>) => ({ stepId: "s1", label: "Check", target: "copy", resolver: "role", roleId: 1, roleMatch: "any", ...patch });

  it("rejects non-lists and steps without a name by position", () => {
    expect(parseSteps("nope").problems).toEqual(["Steps must be a list."]);
    expect(parseSteps([step({}), { stepId: "s2", label: " " }]).problems).toEqual(["Step 2 needs a name."]);
  });

  it("accepts a valid workflow and explains each way one is wrong", () => {
    expect(workflowSaveProblems(parseSteps([step({})]).steps, known)).toEqual([]);
    expect(workflowSaveProblems([], known)).toEqual(["Add at least one review step."]);
    expect(workflowSaveProblems(parseSteps([step({ roleId: null })]).steps, known)).toEqual(["Choose a newsroom role for Check."]);
    expect(workflowSaveProblems(parseSteps([step({ roleId: 99 })]).steps, known)).toEqual(["Check uses a newsroom role that doesn't exist."]);
    expect(workflowSaveProblems(parseSteps([step({ roleId: 2 })]).steps, known)).toEqual(["Check uses Old Desk, which is archived."]);
    expect(workflowSaveProblems(parseSteps([step({ resolver: "person", userId: 8, roleId: null })]).steps, known)).toEqual(["Check is routed to someone who can't sign in."]);
    expect(workflowSaveProblems(parseSteps([step({ roleId: 1, roleMatch: "story-section" })]).steps, known)).toEqual(["Check matches the Story's Section, but Copy Desk isn't scoped by Section."]);
    expect(workflowSaveProblems(parseSteps([step({ roleId: 3, roleMatch: "story-section", conditions: { sections: [5] } })]).steps, known)).toEqual(["Check refers to a Section that doesn't exist."]);
    const twice = parseSteps([step({}), step({})]).steps;
    expect(workflowSaveProblems(twice, known)).toEqual(["Two steps share the id s1."]);
  });
});

describe("the routing preview resolves what production resolves", () => {
  // The preview endpoint calls resolveWorkflow with a saved or draft workflow; this pins that reordering and step edits change the answer the way submission would.
  const directory: RoutingDirectory = {
    roles: new Map([[1, { id: 1, key: "copy-desk", name: "Copy Desk", scopeKind: "none", waitingLabel: null, archived: false }]]),
    assignments: [{ id: 1, roleId: 1, userId: 7, yearId: 1, scopeMode: "global", sectionIds: [], mediaTypes: [] }],
    users: new Map([[7, { id: 7, name: "Maycie", role: "staff" }], [8, { id: 8, name: "Ed", role: "editor" }]]),
    sections: new Map(),
    year: { id: 1, name: "2026–27" }
  };
  const story: RoutingStory = { id: 1, title: "A story", sectionId: null, sectionName: null, format: "standard", hasVisuals: false, mediaTypes: [], editorId: 8, writerIds: [3] };
  const workflow = (steps: ReviewWorkflowDef["steps"]): ReviewWorkflowDef => ({ id: 1, name: "Standard", isDefault: true, archived: false, appliesTo: { sections: [], formats: [] }, steps });

  it("keeps the step order the editor arranged", () => {
    const [edit] = DEFAULT_WORKFLOW_STEPS;
    const copy = parseSteps([{ stepId: "copy", label: "Copy", target: "copy", resolver: "role", roleId: 1, roleMatch: "any" }]).steps[0]!;
    const steps = moveStep([edit!, copy], 0, 1);
    const resolved = resolveWorkflow(workflow(steps), story, directory);
    expect(resolved.map((entry) => entry.step.stepId)).toEqual(["copy", "edit"]);
    expect(resolved[0]!.resolution).toMatchObject({ kind: "person", name: "Maycie" });
    expect(resolved[1]!.resolution).toMatchObject({ kind: "person", name: "Ed" });
  });

  it("reports a missing role as a failure an editor can fix, never a silent skip", () => {
    const orphan = parseSteps([{ stepId: "copy", label: "Copy", target: "copy", resolver: "role", roleId: 42, roleMatch: "any" }]).steps;
    expect(resolveWorkflow(workflow(orphan), story, directory)[0]!.resolution).toMatchObject({ kind: "failed", fix: { kind: "workflow" } });
    const empty = { ...directory, assignments: [] };
    const copy = parseSteps([{ stepId: "copy", label: "Copy", target: "copy", resolver: "role", roleId: 1, roleMatch: "any" }]).steps;
    expect(resolveWorkflow(workflow(copy), story, empty)[0]!.resolution).toMatchObject({ kind: "failed", fix: { kind: "role", roleId: 1 } });
    expect(resolveWorkflow(workflow(copy), story, { ...directory, year: null })[0]!.resolution).toMatchObject({ kind: "failed", fix: { kind: "school-year" } });
  });
});
