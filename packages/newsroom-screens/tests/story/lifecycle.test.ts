import { describe, expect, it } from "vitest";
import { lifecyclePhase, PHASE_STATUSES, phaseFromId, storedStage, STORED_STAGES, workflowMatches } from "../../src/story/lifecycle";

describe("lifecycle projection", () => {
  it("reads every stored stage as one of five phases or a sidelined state", () => {
    expect(STORED_STAGES.map((stage) => lifecyclePhase(stage))).toEqual(["pitch", "reporting", "reporting", "drafting", "review", "ready", "on-hold", "dropped"]);
  });

  it("derives Published and defaults unknown or missing stages to Pitch", () => {
    expect(lifecyclePhase("writing", "published")).toBe("published");
    expect(lifecyclePhase(undefined)).toBe("pitch");
    expect(lifecyclePhase("published")).toBe("pitch");
    expect(lifecyclePhase("nonsense")).toBe("pitch");
  });

  it("stores one canonical value per phase and never writes Assigned again", () => {
    expect(storedStage("drafting")).toBe("writing");
    expect(storedStage("review")).toBe("editing");
    expect(storedStage("reporting")).toBe("reporting");
    expect(storedStage("assigned")).toBe("reporting");
    expect(storedStage("ready-for-review")).toBe("editing");
    expect(storedStage("published")).toBeNull();
    expect(Object.values(Object.fromEntries(["pitch", "reporting", "drafting", "review", "ready", "on-hold", "dropped"].map((phase) => [phase, storedStage(phase)])))).not.toContain("assigned");
  });

  it("accepts legacy ids from links, saved views and API callers", () => {
    expect(phaseFromId("writing")).toBe("drafting");
    expect(phaseFromId("editing")).toBe("review");
    expect(phaseFromId("drafting")).toBe("drafting");
    expect(phaseFromId("__proto__")).toBeNull();
  });

  it("shows five main columns, two sidelined, Published derived; Ready is not Ready for Review", () => {
    expect(PHASE_STATUSES.filter((status) => status.group === "main").map((status) => status.label)).toEqual(["Pitch", "Reporting", "Drafting", "Review", "Ready"]);
    expect(PHASE_STATUSES.filter((status) => status.group === "sidelined").map((status) => status.id)).toEqual(["on-hold", "dropped"]);
    expect(PHASE_STATUSES.find((status) => status.id === "published")?.selectable).toBe(false);
    expect(PHASE_STATUSES.some((status) => status.label === "Ready for Review" || status.label === "Assigned")).toBe(false);
  });

  it("matches old saved filters against new phases, and WordPress ids exactly", () => {
    expect(workflowMatches("drafting", "writing")).toBe(true);
    expect(workflowMatches("review", "editing")).toBe(true);
    expect(workflowMatches("reporting", "assigned")).toBe(false);
    expect(workflowMatches("writing", "writing")).toBe(true);
    expect(workflowMatches("ready", "editing")).toBe(false);
  });
});
