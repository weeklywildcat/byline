// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { StoryPeekContent } from "../../src/story/StoryPeek";
import type { StoryAttention } from "../../src/story/attention";
import type { StoryWorkspace, WorkspaceCapabilities } from "../../src/workspace/workspace-types";

/**
 * Story Peek answers three questions — is this the Story, where is it, what
 * needs it next — and offers only writer / editor / deadline quick edits.
 * Next comes from Story Attention; nothing in the Peek recalculates it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-11-11T15:00:00Z"); // a Wednesday
const caps = (manager: boolean): WorkspaceCapabilities => ({ role: manager ? "manager" : "participant", editArticle: manager, changeStatus: manager, assign: manager, editContributors: manager, editBrief: manager, manageReporting: manager, addSource: manager, addAppointment: true, manageMedia: manager, assignMedia: manager, addTask: manager, manageResources: manager, review: manager });

const attention: StoryAttention = {
  storyId: 7, phase: "reporting", needsViewer: true, signals: [
    { kind: "appointment-soon", priority: 4, label: "Interview tomorrow · 8:00 AM", detail: "Principal Smith interview", explanation: "", target: { view: "reporting" }, mine: true, at: null },
    { kind: "waiting-on-source", priority: 7, label: "Waiting on district", detail: "4 days", explanation: "", target: { view: "reporting" }, mine: true, at: null },
    { kind: "media-needed", priority: 8, label: "Exterior photo still needed", detail: "No one assigned", explanation: "", target: { view: "media" }, mine: false, at: null },
    { kind: "deadline-soon", priority: 9, label: "Due Friday", detail: null, explanation: "", target: { view: "story" }, mine: true, at: null }
  ]
};

function workspace(manager: boolean, patch: Partial<StoryWorkspace["story"]> = {}): StoryWorkspace {
  const people = [{ id: 1, name: "Caroline Elrod", kind: "user" as const }, { id: 2, name: "Maycie Krajewski", kind: "user" as const }];
  return {
    story: {
      id: 7, title: "Canteen could return next semester", editUrl: "/admin/collections/stories/7", authors: [people[0]], writer: people[0], editor: { id: 2, name: "Maycie Krajewski" },
      workflow: { id: "reporting", label: "Reporting", group: "active", selectable: true }, publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
      deadline: "2026-11-13", plannedPublication: null, modifiedAt: null, visual: { type: "none", status: "needed" }, openTaskCount: 3, featuredImage: null,
      reporting: { sources: 2, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: null }, mediaSummary: null, attention, ...patch
    },
    revision: 1, timezone: "America/New_York", now: NOW.toISOString(), currentUser: null, brief: "", sections: ["News"],
    contributors: { storyId: 7, contributors: [people[0]], available: manager ? people : [], canEdit: manager, canCreateGuests: false },
    statuses: [], tasks: [], sources: [], appointments: [], reporting: null, mediaAssignments: [], resources: [], activity: [], previewUrl: "/preview/7",
    people, capabilities: caps(manager), errors: {}
  } as unknown as StoryWorkspace;
}

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

async function render(data: StoryWorkspace) {
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminPortalContext value={document.body}><StoryPeekContent data={data} timezone="America/New_York" now={NOW} workspaceUrl={(id) => `/stories/${id}`} onPlan={vi.fn()} onWriters={vi.fn()} planning={false} writing={false} error="" /></AdminPortalContext>);
  });
}

describe("Story Peek", () => {
  it("shows who, when and the top three attention signals, then Preview and Open story", async () => {
    await render(workspace(false));
    const text = host.textContent ?? "";
    expect(text).toContain("Caroline Elrod");
    expect(text).toContain("Maycie Krajewski");
    expect(text).toContain("Due Friday");
    const next = Array.from(host.querySelectorAll("[data-peek-next]")).map((item) => item.textContent);
    expect(next).toEqual(["Interview tomorrow · 8:00 AMPrincipal Smith interview", "Waiting on district4 days", "Exterior photo still neededNo one assigned"]);
    expect(host.querySelector<HTMLAnchorElement>("[data-peek-open]")?.getAttribute("href")).toBe("/stories/7");
    expect(Array.from(host.querySelectorAll("a")).map((link) => link.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Preview"), "Open story"]));
  });

  it("is not a miniature workspace: no tasks, production, reporting, files or activity sections", async () => {
    await render(workspace(true));
    for (const heading of ["Tasks", "Production", "Files & links", "Recent activity", "Reporting", "Workflow"]) {
      expect(Array.from(host.querySelectorAll("h3, [role=heading], [data-slot=field-title]")).map((node) => node.textContent)).not.toContain(heading);
    }
    expect(host.querySelector("form")).toBeNull();
  });

  it("offers writer, editor and deadline quick edits only to someone who may make them", async () => {
    await render(workspace(true));
    expect(host.querySelector("[aria-label^='Writers:']")).not.toBeNull();
    expect(host.querySelector("[aria-label^='Editor:']")).not.toBeNull();
    expect(host.querySelector("[aria-label='Change deadline']")).not.toBeNull();
    await act(async () => root?.unmount());
    root = null;
    await render(workspace(false));
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("falls back to the next appointment and open notes where the host has no attention (WordPress)", async () => {
    await render(workspace(false, {
      attention: undefined,
      reporting: { sources: 1, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: { id: 3, title: "Principal Smith interview", startAt: "2026-11-12T13:00:00Z", windowStart: null, windowEnd: null, scheduleMode: "exact" } },
      notes: { available: true, canView: true, openCount: 4, resolvedCount: 0, editUrl: "/wp-admin/post.php?post=7&action=edit" }
    } as Partial<StoryWorkspace["story"]>));
    const items = Array.from(host.querySelectorAll("[data-peek-next]"));
    expect(items.map((item) => item.getAttribute("data-peek-next"))).toEqual(["appointment", "notes"]);
    const notes = host.querySelector<HTMLAnchorElement>("a[data-peek-next=notes]")!;
    expect(notes.textContent).toContain("4 open notes");
    expect(notes.textContent).toContain("Review in editor");
  });
});
