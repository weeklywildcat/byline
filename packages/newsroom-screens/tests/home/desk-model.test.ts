import { describe, expect, it } from "vitest";
import { deskStages } from "../../src/home/desk-model";
import type { PlanningStory } from "../../src/planning/planning-model";

const story = (id: number, workflow: string): PlanningStory => ({
  id,
  title: `Story ${id}`,
  workflow: { id: workflow, label: workflow },
  publicationState: { id: "draft", isPublished: false },
  authors: [],
  modifiedAt: "2026-11-09T12:00:00Z"
}) as unknown as PlanningStory;

describe("Home Desk", () => {
  it("lists stages in lifecycle order, sidelined last", () => {
    const stories = ["on-hold", "review", "drafting", "ready", "reporting", "pitch"].map((workflow, index) => story(index + 1, workflow));
    expect(deskStages(stories, "America/New_York", new Date("2026-11-10T12:00:00Z")).map((stage) => stage.id))
      .toEqual(["pitch", "reporting", "drafting", "review", "ready", "on-hold"]);
  });

  it("places legacy stored stages where they fall in the lifecycle", () => {
    const stories = ["editing", "assigned", "writing", "pitch"].map((workflow, index) => story(index + 1, workflow));
    expect(deskStages(stories, "America/New_York").map((stage) => stage.id)).toEqual(["pitch", "assigned", "writing", "editing"]);
  });
});
