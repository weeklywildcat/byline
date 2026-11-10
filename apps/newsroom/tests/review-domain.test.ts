import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_STEPS,
  normalizeStep,
  resolveStep,
  resolveWorkflow,
  schoolYearFor,
  selectWorkflow,
  workflowProblems,
  type ReviewWorkflowDef,
  type RoutingDirectory,
  type RoutingStory,
  type WorkflowStep
} from "../src/domain/newsroom-roles";
import { activateStep, changedCategories, initialSteps, mayReview, staleness, storyFingerprint } from "../src/domain/review";

const SECTION_EDITOR = 1;
const COPY_DESK = 2;
const VISUAL_DESK = 3;
const NEWS = 10;
const SPORTS = 11;
const ARTS = 12;

const users = new Map([
  [20, { id: 20, name: "Maycie Krajewski", role: "staff" as const }],
  [21, { id: 21, name: "Jeremy Lauten", role: "staff" as const }],
  [22, { id: 22, name: "Gibson Bell", role: "editor" as const }],
  [23, { id: 23, name: "Caroline Elrod", role: "staff" as const }],
  [24, { id: 24, name: "Addyson Reed", role: "staff" as const }]
]);

function directory(overrides: Partial<RoutingDirectory> = {}): RoutingDirectory {
  return {
    roles: new Map([
      [SECTION_EDITOR, { id: SECTION_EDITOR, key: "section-editor", name: "Section Editor", scopeKind: "section", waitingLabel: "{scope} Editor", archived: false }],
      [COPY_DESK, { id: COPY_DESK, key: "copy-desk", name: "Copy Desk", scopeKind: "none", waitingLabel: null, archived: false }],
      [VISUAL_DESK, { id: VISUAL_DESK, key: "visual-desk", name: "Visual Desk", scopeKind: "media", waitingLabel: null, archived: false }]
    ]),
    assignments: [
      { id: 1, roleId: SECTION_EDITOR, userId: 20, yearId: 1, scopeMode: "scoped", sectionIds: [NEWS], mediaTypes: [] },
      { id: 2, roleId: SECTION_EDITOR, userId: 21, yearId: 1, scopeMode: "scoped", sectionIds: [SPORTS], mediaTypes: [] },
      { id: 3, roleId: SECTION_EDITOR, userId: 22, yearId: 1, scopeMode: "scoped", sectionIds: [ARTS], mediaTypes: [] },
      { id: 4, roleId: COPY_DESK, userId: 20, yearId: 1, scopeMode: "global", sectionIds: [], mediaTypes: [] },
      { id: 5, roleId: COPY_DESK, userId: 22, yearId: 1, scopeMode: "global", sectionIds: [], mediaTypes: [] },
      { id: 6, roleId: VISUAL_DESK, userId: 23, yearId: 1, scopeMode: "scoped", sectionIds: [], mediaTypes: ["photo"] },
      { id: 7, roleId: VISUAL_DESK, userId: 22, yearId: 1, scopeMode: "scoped", sectionIds: [], mediaTypes: ["video"] },
      { id: 8, roleId: VISUAL_DESK, userId: 20, yearId: 1, scopeMode: "global", sectionIds: [], mediaTypes: [] },
      // Last year's Sports Editor stays in history and never routes this year.
      { id: 9, roleId: SECTION_EDITOR, userId: 24, yearId: 0, scopeMode: "scoped", sectionIds: [SPORTS], mediaTypes: [] }
    ],
    users,
    sections: new Map([[NEWS, "News"], [SPORTS, "Sports"], [ARTS, "Arts & Culture"]]),
    year: { id: 1, name: "2026–27" },
    ...overrides
  };
}

const sportsStory: RoutingStory = { id: 5, title: "Patriot Games", sectionId: SPORTS, sectionName: "Sports", format: "standard", hasVisuals: true, mediaTypes: ["photo"], editorId: 22, writerIds: [24] };

function step(overrides: Partial<WorkflowStep>): WorkflowStep {
  return { stepId: "s", label: "Step", target: "whole", resolver: "role", roleId: null, roleMatch: "any", userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "none", ...overrides };
}

const sectionEdit = step({ stepId: "section", label: "Section Edit", roleId: SECTION_EDITOR, roleMatch: "story-section" });
const visualReview = step({ stepId: "visual", label: "Visual Review", target: "visuals", roleId: VISUAL_DESK, roleMatch: "story-media", conditions: { sections: [], formats: [], onlyWithVisuals: true, mediaTypes: [] } });
const copyReview = step({ stepId: "copy", label: "Copy Review", target: "copy", roleId: COPY_DESK });
const finalReview = step({ stepId: "final", label: "Final Review", resolver: "person", userId: 22 });

describe("review routing", () => {
  it("resolves scoped roles first and names the scope for reporters", () => {
    expect(resolveStep(sectionEdit, sportsStory, directory())).toEqual({ kind: "person", userId: 21, name: "Jeremy Lauten", waitingFor: "Sports Editor", via: "Section Editor · Sports" });
    expect(resolveStep(visualReview, sportsStory, directory())).toMatchObject({ kind: "person", userId: 23, waitingFor: "Visual Desk", via: "Visual Desk · Photo" });
  });

  it("forms a queue when several reviewers are equally valid, never a random pick", () => {
    expect(resolveStep(copyReview, sportsStory, directory())).toEqual({ kind: "queue", userIds: [20, 22], waitingFor: "Copy Desk", via: "Copy Desk", roleId: COPY_DESK });
  });

  it("falls back to global assignments when no scoped member covers the story", () => {
    const opinion = { ...sportsStory, mediaTypes: ["graphic"] };
    expect(resolveStep(visualReview, opinion, directory())).toMatchObject({ kind: "person", userId: 20, waitingFor: "Visual Desk" });
  });

  it("explains failures in newsroom terms with a fix", () => {
    const without = directory({ assignments: directory().assignments.filter((row) => row.userId !== 21) });
    expect(resolveStep(sectionEdit, sportsStory, without)).toEqual({ kind: "failed", failure: "Sports has no active Section Editor for 2026–27.", fix: { kind: "role", roleId: SECTION_EDITOR } });
    expect(resolveStep(sectionEdit, sportsStory, directory({ year: null }))).toMatchObject({ kind: "failed", fix: { kind: "school-year" } });
  });

  it("never routes a story to its own writer unless the step allows it", () => {
    const written = { ...sportsStory, writerIds: [21] };
    expect(resolveStep(sectionEdit, written, directory())).toMatchObject({ kind: "failed" });
    expect(resolveStep({ ...sectionEdit, selfReview: "allow" }, written, directory())).toMatchObject({ kind: "person", userId: 21 });
    expect(resolveStep({ ...sectionEdit, fallback: "editors" }, written, directory())).toMatchObject({ kind: "person", userId: 22, waitingFor: "an editor" });
  });

  it("skips steps whose conditions do not apply, with a reason", () => {
    expect(resolveStep(visualReview, { ...sportsStory, hasVisuals: false, mediaTypes: [] }, directory())).toEqual({ kind: "skipped", reason: "Only for stories with visuals" });
    expect(resolveStep(step({ ...copyReview, conditions: { sections: [NEWS], formats: [], onlyWithVisuals: false, mediaTypes: [] } }), sportsStory, directory())).toEqual({ kind: "skipped", reason: "Only for News" });
  });

  it("routes the default workflow to the story's editor, or the editors when it has none", () => {
    expect(resolveStep(DEFAULT_WORKFLOW_STEPS[0]!, sportsStory, directory())).toMatchObject({ kind: "person", userId: 22, waitingFor: "Gibson Bell" });
    expect(resolveStep(DEFAULT_WORKFLOW_STEPS[0]!, { ...sportsStory, editorId: null }, directory())).toMatchObject({ kind: "person", userId: 22, waitingFor: "an editor" });
  });

  it("previews a whole workflow with the same resolver", () => {
    const workflow: ReviewWorkflowDef = { id: 1, name: "Standard News", isDefault: true, archived: false, appliesTo: { sections: [], formats: [] }, steps: [sectionEdit, visualReview, copyReview, finalReview] };
    expect(resolveWorkflow(workflow, sportsStory, directory()).map((entry) => entry.resolution.kind)).toEqual(["person", "person", "queue", "person"]);
  });

  it("selects the most specific matching workflow, then the default", () => {
    const base = { archived: false, steps: [copyReview] };
    const standard: ReviewWorkflowDef = { ...base, id: 1, name: "Standard", isDefault: true, appliesTo: { sections: [], formats: [] } };
    const sports: ReviewWorkflowDef = { ...base, id: 3, name: "Sports", isDefault: false, appliesTo: { sections: [SPORTS], formats: [] } };
    const video: ReviewWorkflowDef = { ...base, id: 2, name: "Video", isDefault: false, appliesTo: { sections: [], formats: ["video"] } };
    const sportsVideo: ReviewWorkflowDef = { ...base, id: 4, name: "Sports video", isDefault: false, appliesTo: { sections: [SPORTS], formats: ["video"] } };
    const all = [standard, sports, video, sportsVideo];
    expect(selectWorkflow(all, sportsStory)?.name).toBe("Sports");
    expect(selectWorkflow(all, { ...sportsStory, format: "video" })?.name).toBe("Sports video");
    expect(selectWorkflow(all, { ...sportsStory, sectionId: NEWS })?.name).toBe("Standard");
    expect(selectWorkflow([{ ...standard, archived: true }], sportsStory)).toBeNull();
  });

  it("normalizes stored steps and reports problems", () => {
    expect(normalizeStep({ stepId: "Bad Id", label: "x" })).toBeNull();
    expect(normalizeStep({ stepId: "copy", label: " Copy ", resolver: "nonsense", conditions: { sections: ["4", 4, -1] } })).toMatchObject({ label: "Copy", resolver: "story-editor", conditions: { sections: [4] } });
    expect(workflowProblems([step({ stepId: "a", label: "A" }), step({ stepId: "a", label: "B", resolver: "person" })])).toEqual(["Choose a newsroom role for A.", "Two steps share the id a.", "Choose a person for B."]);
  });

  it("names school years from August", () => {
    expect(schoolYearFor("2026-11-09")).toEqual({ name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31" });
    expect(schoolYearFor("2027-03-01").name).toBe("2026–27");
    expect(schoolYearFor("2027-08-01").name).toBe("2027–28");
  });
});

describe("review runs", () => {
  it("activates a step for a person or a queue and checks who may act", () => {
    const [first] = initialSteps({ workflowId: 1, workflowName: "Standard", steps: [copyReview] });
    const queued = activateStep(first!, { kind: "queue", userIds: [20, 22], waitingFor: "Copy Desk", via: "Copy Desk", roleId: COPY_DESK });
    expect(mayReview(queued, 20)).toBe(true);
    expect(mayReview(queued, 21)).toBe(false);
    const claimed = { ...queued, assigneeId: 22, queue: null };
    expect(mayReview(claimed, 20)).toBe(false);
    expect(mayReview({ ...claimed, state: "approved" }, 22)).toBe(false);
  });
});

describe("approval staleness", () => {
  const body = (text: string, image = 5) => ({ root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text }] }, { type: "upload", value: image }] } });
  const story = { headline: "Canteen could return", deck: "", featuredMedia: 9, body: body("The canteen closed in May.") };

  it("separates copy from visuals", () => {
    const before = storyFingerprint(story);
    expect(changedCategories(before, storyFingerprint({ ...story, headline: "Canteen will return" }))).toEqual(["copy"]);
    expect(changedCategories(before, storyFingerprint({ ...story, featuredMedia: 10 }))).toEqual(["visuals"]);
    expect(changedCategories(before, storyFingerprint({ ...story, body: body("The canteen closed in May.", 6) }))).toEqual(["visuals"]);
    expect(changedCategories(before, storyFingerprint({ ...story, body: body("The canteen  closed in May. ") }))).toEqual([]);
  });

  it("stales only the approvals a change touches, in human terms", () => {
    expect(staleness("copy", ["visuals"])).toBeNull();
    expect(staleness("visuals", ["visuals"])).toBe("The visuals changed after this approval.");
    expect(staleness("whole", ["copy"])).toBe("The text changed after this approval.");
    expect(staleness("whole", [])).toBeNull();
  });
});
