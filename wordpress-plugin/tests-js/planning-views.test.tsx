import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { decodeEntities } from "../src/admin-ui/lib/text";
import { StoryBoard } from "../src/planning/StoryBoard";
import { StoryList } from "../src/planning/StoryList";
import { DEFAULT_PLANNING_SORT, DEFAULT_WORKFLOW_STATUSES, isPlannedDayOnly, type PlanningStory } from "../src/planning/planning-model";
import { destinationForTab, initialStoriesView, storiesViewHref } from "../src/planning/planning-routing";
import { productionSignal, storySignals } from "../src/story/story-parts";

const now = new Date("2026-10-20T12:00:00Z");
const person = (id: number, name: string) => ({ id, name });

function story(patch: Partial<PlanningStory> & { id: number }): PlanningStory {
  const workflow = patch.workflow || DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === "reporting")!;
  return {
    title: `Story ${patch.id}`, editUrl: `/wp-admin/post.php?post=${patch.id}&action=edit`, previewUrl: `/?p=${patch.id}&preview=true`, authors: [], writer: null, editor: null, workflow,
    wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null,
    visual: { type: "none", status: "needed" }, openTaskCount: 0, coverage: [], featuredImage: null, ...patch
  };
}
const stage = (id: string) => DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === id)!;
const props = (stories: PlanningStory[], canMove = true) => ({ stories, statuses: DEFAULT_WORKFLOW_STATUSES, canMoveStories: canMove, timezone: "America/New_York", now, workspaceUrl: (id: number) => `/wp-admin/admin.php?page=byline-planning&story=${id}`, onMoveStory: vi.fn(), onOpenStory: vi.fn() });

describe("StoryBoard", () => {
  const stories = [
    story({ id: 1, title: "Canteen could return", workflow: stage("reporting"), authors: [person(1, "Caroline Elrod"), person(2, "Gibson Bell")], deadline: "2026-10-21", openTaskCount: 2, visual: { type: "photo", status: "assigned" } }),
    story({ id: 2, title: "Homecoming", workflow: stage("reporting"), authors: ["Ava", "Mia", "Noah", "Pat", "Sam"].map((name, index) => person(10 + index, name)) }),
    story({ id: 3, title: "Unassigned pitch", workflow: stage("pitch") }),
    story({ id: 4, title: "Robotics", workflow: stage("reporting"), deadline: "2026-10-19", visual: { type: "photo", status: "needed" } }),
    story({ id: 5, title: "Paused", workflow: stage("on-hold") })
  ];
  const html = renderToStaticMarkup(<StoryBoard {...props(stories)} />);

  it("lays out the main stages and keeps sidelined ones apart, with a count on each", () => {
    for (const label of ["Pitch", "Assigned", "Reporting", "Writing", "Editing", "Ready for Review", "Sidelined", "On Hold", "Dropped"]) expect(html).toContain(label);
    expect(html).toMatch(/aria-label="3 stories"/);
    expect(html).toMatch(/aria-label="1 story"/);
  });

  it("keeps empty columns quiet: tiny copy, not an Empty state", () => {
    expect(html).toContain("No stories");
    expect(html).not.toContain('data-slot="empty"');
  });

  it("answers who, when and what needs attention, and nothing more", () => {
    expect(html).toContain("Canteen could return");
    expect(html).toContain("Caroline Elrod, Gibson Bell");
    expect(html).toContain("Due tomorrow");
    expect(html).toContain("2 tasks");
    expect(html).toContain("Photo assigned");
    expect(html).toContain("1d overdue");
    expect(html).toContain("Photo needed");
    expect(html).toContain("Unassigned");
    expect(html).toContain("No deadline");
    for (const noise of ["Editor:", "Draft", "Planned", "Modified", "Coverage"]) expect(html).not.toContain(noise);
  });

  it("does not silently truncate people: five writers show three avatars and a +2", () => {
    expect(html).toContain("+2");
    expect(html).toContain("and 2 more: Pat, Sam");
  });

  it("gives every card an actions menu named for its story", () => {
    expect(html).toContain('aria-label="Actions for Canteen could return"');
  });

  it("opens Story Peek from the title, never the editor", () => {
    expect(html).toMatch(/<button[^>]*data-story-title="1"[^>]*>Canteen could return<\/button>/);
    expect(html).not.toMatch(/<a[^>]*>Canteen could return/);
  });

  it("is a drop target in every column only when the viewer may move stories", () => {
    expect(renderToStaticMarkup(<StoryBoard {...props(stories, false)} />)).toContain("your account cannot move stories");
  });
});

describe("StoryList", () => {
  const stories = [
    story({ id: 1, title: "Canteen could return", workflow: stage("reporting"), authors: [person(1, "Caroline Elrod")], editor: person(2, "Gibson Bell"), deadline: "2026-10-21", plannedPublication: "2026-10-24T12:00:00", modifiedAt: "2026-10-20T11:30:00Z", openTaskCount: 3, visual: { type: "photo", status: "assigned" } }),
    story({ id: 2, title: "Winter concert", workflow: stage("ready"), wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-10-26T13:00:00Z" } })
  ];
  const html = renderToStaticMarkup(<StoryList {...props(stories)} sort={DEFAULT_PLANNING_SORT} onSortChange={vi.fn()} />);

  it("has the seven scannable columns, not ten", () => {
    const heads = [...html.matchAll(/<th[^>]*data-slot="table-head"[^>]*>(.*?)<\/th>/g)].map((match) => match[1]!.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
    expect(heads).toEqual(["Story", "Workflow", "People", "Deadline", "Publication", "Work", "Updated", "Actions"]);
  });

  it("marks the sorted column and offers the others", () => {
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('aria-sort="none"');
  });

  it("folds tasks and production into one Work cell, and shows a planned day without the placeholder noon", () => {
    expect(html).toContain("3 tasks");
    expect(html).toContain("Photo assigned");
    expect(html).toContain("Oct 24, 2026");
    expect(html).not.toMatch(/>[^<]*12:00\s?PM/);
  });

  it("keeps WordPress state quiet and in words under Publication", () => {
    expect(html).toContain("Scheduled Oct 26");
    expect(html).toContain("Not planned");
  });
});

describe("story signals", () => {
  it("raises what needs a person and keeps the rest quiet", () => {
    const signals = storySignals(story({ id: 1, needsReview: true, openTaskCount: 1, reporting: { sources: 0, interviewed: 0, needsScheduling: 2, toSchedule: 2, nextAppointment: null }, visual: { type: "photo", status: "needed" } }));
    expect(signals.map((signal) => [signal.key, signal.tone])).toEqual([["review", "attention"], ["scheduling", "attention"], ["tasks", "neutral"], ["media", "attention"]]);
    expect(productionSignal(story({ id: 2 }))).toBeNull();
  });
});

describe("Planning addresses", () => {
  it("opens the view the address names, then Calendar for the Calendar entry, then the last view", () => {
    const storage = { getItem: () => "list", setItem: () => undefined } as unknown as Storage;
    expect(initialStoriesView("stories", "calendar", storage)).toBe("calendar");
    expect(initialStoriesView("calendar", undefined, storage)).toBe("calendar");
    expect(initialStoriesView("stories", undefined, storage)).toBe("list");
    expect(initialStoriesView("stories", undefined, null)).toBe("board");
    expect(initialStoriesView("stories", "bogus", null)).toBe("board");
  });

  it("builds a deep link that keeps unrelated parameters and drops the open story", () => {
    expect(storiesViewHref("http://localhost/wp-admin/admin.php?page=byline-planning&tab=calendar&mine=1&story=5", "list")).toBe("/wp-admin/admin.php?page=byline-planning&tab=stories&mine=1&view=list");
  });

  it("maps every sidebar tab to a destination", () => {
    expect(["stories", "calendar", "media", "coverage", "performance", "content-health", "contentHealth", "feedback", "nonsense"].map(destinationForTab)).toEqual(["stories", "stories", "media", "coverage", "performance", "content-health", "content-health", "feedback", "stories"]);
  });
});

describe("text and dates from WordPress", () => {
  it("turns texturized entities back into characters without treating anything as markup", () => {
    expect(decodeEntities("Debate team&#8217;s streak &amp; more")).toBe("Debate team’s streak & more");
    expect(decodeEntities("&#x2014; &lt;b&gt; &unknown;")).toBe("— <b> &unknown;");
  });

  it("knows a planned publication that is only a day, in any of its forms", () => {
    expect(isPlannedDayOnly("2026-10-24")).toBe(true);
    expect(isPlannedDayOnly("2026-10-24T12:00:00")).toBe(true);
    expect(isPlannedDayOnly("2026-10-24T12:00:00Z", "UTC")).toBe(true);
    expect(isPlannedDayOnly("2026-10-24T16:00:00Z", "America/New_York")).toBe(true);
    expect(isPlannedDayOnly("2026-10-24T08:30:00")).toBe(false);
    expect(isPlannedDayOnly("2026-10-24T12:00:00Z", "America/New_York")).toBe(false);
  });
});
