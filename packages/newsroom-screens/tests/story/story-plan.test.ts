import { describe, expect, it } from "vitest";
import { deliverables, otherContributors } from "../../src/story-context/StoryPlan";

const assignment = (type: string, assignee: { id: number; name: string } | null = null) => ({ type, assignee }) as never;

describe("Plan's Story brief", () => {
  it("states what the Story is expected to deliver from its type and media assignments", () => {
    expect(deliverables({ format: undefined, mediaAssignments: [] })).toEqual(["Article"]);
    expect(deliverables({ format: { format: "video" } as never, mediaAssignments: [] })).toEqual(["Video"]);
    expect(deliverables({ format: undefined, mediaAssignments: [assignment("photo"), assignment("photo"), assignment("graphic"), assignment("gallery"), assignment("gallery")] }))
      .toEqual(["Article", "2 photos", "1 graphic", "2 galleries"]);
  });

  it("names everyone else working on the Story once, never its writers or editor", () => {
    const data = {
      story: { authors: [{ id: 1, name: "Ana Ruiz" }], editor: { id: 2, name: "Ed Itor" } },
      contributors: { contributors: [] },
      mediaAssignments: [assignment("photo", { id: 3, name: "Maya Torres" }), assignment("graphic", { id: 1, name: "Ana Ruiz" })],
      tasks: [{ state: "open", assignee: { id: 4, name: "Jordan Lee" } }, { state: "completed", assignee: { id: 5, name: "Done Person" } }, { state: "open", assignee: { id: 3, name: "Maya Torres" } }],
      appointments: [{ assignees: [{ id: 2, name: "Ed Itor" }, { id: 6, name: "Sam Park" }] }]
    } as never;
    expect(otherContributors(data)).toEqual(["Maya Torres", "Jordan Lee", "Sam Park"]);
  });
});
