import type { PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import { activeStory } from "@byline/newsroom-screens/home/newsroom-model";
import { builtInStoryView, SIDEBAR_STORY_VIEWS, storyViewCount } from "@byline/newsroom-screens/planning/story-views";
import { describe, expect, it } from "vitest";
import { countStories, type CountedStory } from "../src/newsroom/navigation-counts";

const label: Record<string, string> = { pitch: "Pitch", reporting: "Reporting", review: "Review", dropped: "Dropped", published: "Published" };

/** A Stories read-model row as planningStory builds it from the same facts the counts read. */
function story(id: number, row: CountedStory): PlanningStory {
  const published = row.workflow === "published";
  return {
    id, title: `Story ${id}`, editUrl: "", authors: [], writer: null,
    editor: row.editorId === null ? null : { id: row.editorId, name: "Editor" },
    workflow: { id: row.workflow, label: label[row.workflow] ?? row.workflow, group: "main", selectable: true },
    publicationState: { id: published ? "published" : "draft", label: published ? "Published" : "Draft", isPublished: published, isScheduled: false },
    deadline: null, plannedPublication: null, modifiedAt: null,
    visual: { type: row.visualStatus === "needed" ? "none" : "photo", status: row.visualStatus as PlanningStory["visual"]["status"] },
    openTaskCount: 0, featuredImage: null, needsReview: row.workflow === "review"
  };
}

describe("sidebar navigation counts", () => {
  const rows: CountedStory[] = [
    { workflow: "review", editorId: 3, visualStatus: "assigned" },
    { workflow: "review", editorId: null, visualStatus: "needed" },
    { workflow: "reporting", editorId: null, visualStatus: "in-progress" },
    { workflow: "pitch", editorId: 3, visualStatus: "needed" },
    { workflow: "published", editorId: null, visualStatus: "needed" },
    { workflow: "dropped", editorId: null, visualStatus: "needed" }
  ];

  it("counts active stories and each promoted view", () => {
    expect(countStories(rows)).toEqual({ stories: 4, views: { review: 2, unassigned: 2, "art-needed": 2 } });
  });

  it("agrees with the shared Stories view filters on the same stories", () => {
    const stories = rows.map((row, index) => story(index + 1, row));
    const counted = countStories(rows);
    expect(counted.stories).toBe(stories.filter(activeStory).length);
    for (const id of SIDEBAR_STORY_VIEWS) expect(counted.views[id]).toBe(storyViewCount(stories, builtInStoryView(id)!, 7));
  });
});
