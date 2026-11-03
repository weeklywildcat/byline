import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportingPlan } from "../src/workspace/ReportingPlan";
import { WorkspaceContext, type WorkspaceContextValue } from "../src/workspace/workspace-context";
import type { StoryAppointment, StorySource } from "../src/workspace/workspace-types";

const source: StorySource = {
  id: "source-1", label: "Athletic director", role: "", organization: "", status: "planned",
  assigneeIds: [], assignees: [], notes: "", createdAt: "", updatedAt: ""
};
const appointment: StoryAppointment = {
  id: "appointment-1", title: "Interview the athletic director", kind: "interview", status: "planned",
  scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null,
  assigneeIds: [], assignees: [], sourceId: null, sourceLabel: null, location: "", notes: "", createdAt: "", updatedAt: ""
};

function render(sources: StorySource[], appointments: StoryAppointment[], canAdd = true, failed = false) {
  const value = {
    storyId: 7, currentUserId: 1, appointmentId: "", timezone: "America/New_York",
    data: { sources, appointments, people: [] },
    caps: { addSource: canAdd, addAppointment: canAdd, manageReporting: false },
    sectionError: () => failed ? "Reporting unavailable" : undefined
  } as unknown as WorkspaceContextValue;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceContext value={value}><ReportingPlan /></WorkspaceContext>
    </QueryClientProvider>
  );
}

describe("Reporting plan add actions", () => {
  it.each([
    { state: "empty", sources: [], appointments: [] },
    { state: "source added first", sources: [source], appointments: [] },
    { state: "appointment added first", sources: [], appointments: [appointment] },
    { state: "both populated", sources: [source], appointments: [appointment] }
  ])("keeps both add buttons available when $state", ({ sources, appointments }) => {
    const html = render(sources, appointments);
    expect(html.match(/<button\b[^>]*data-ws-add="source"/g)).toHaveLength(1);
    expect(html.match(/<button\b[^>]*data-ws-add="appointment"/g)).toHaveLength(1);
  });

  it("hides add actions without permission or when reporting fails to load", () => {
    for (const html of [render([source], [], false), render([], [appointment], false), render([source], [], true, true)]) {
      expect(html).not.toContain('data-ws-add="source"');
      expect(html).not.toContain('data-ws-add="appointment"');
    }
  });
});
