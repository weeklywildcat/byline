// @vitest-environment jsdom
import "temporal-polyfill/global";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CalendarControls } from "../../src/calendar/CalendarControls";
import { NewsroomCalendar, type NewsroomCalendarProps } from "../../src/calendar/NewsroomCalendar";
import { dayAtPoint } from "../../src/calendar/calendar-drag";
import { createCalendarWorkspace, type CalendarWorkspace } from "../../src/calendar/calendar-workspace";
import { CalendarWorkspaceProvider } from "../../src/calendar/calendar-workspace-context";
import type { PlanningStory } from "../../src/planning/planning-model";
import type { ScheduleAppointment, ScheduleResponse } from "../../src/workspace/workspace-types";

/**
 * The shared Calendar mounted with the real Schedule-X: the toolbar, the
 * controls and the calendar share one workspace, story events open Story
 * Peek, and appointment links go to the host's Story screen.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const TZ = "America/New_York";

const story = (patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id: 41, title: "Cafeteria changes", editUrl: "/admin/collections/stories/41", authors: [], writer: null, editor: null,
  workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
  publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false, scheduledAt: null, publishedAt: null },
  deadline: "2026-11-17", plannedPublication: null, modifiedAt: null, visual: { type: "none", status: "needed" }, openTaskCount: 0, featuredImage: null, ...patch
});
const appointment = (patch: Partial<ScheduleAppointment> = {}): ScheduleAppointment => ({
  id: "appt-1", title: "Interview Mrs. Hamby", kind: "interview", status: "confirmed", scheduleMode: "exact", windowStart: null, windowEnd: null,
  startAt: "2026-11-18T15:00:00Z", endAt: "2026-11-18T15:30:00Z", assigneeIds: [7], assignees: [{ id: 7, name: "Riley Reporter" }], sourceId: null, sourceLabel: null, location: "",
  storyId: 0, storyTitle: "", ...patch
});

let root: Root;
let container: HTMLElement;
let workspace: CalendarWorkspace;
let getSchedule: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  container = document.createElement("div");
  container.className = "byline-ui-root";
  document.body.append(container);
  root = createRoot(container);
  workspace = createCalendarWorkspace();
  getSchedule = vi.fn(async (from: string, to: string): Promise<ScheduleResponse> => ({
    timezone: TZ, from, to,
    appointments: [appointment()],
    needsScheduling: [appointment({ id: "w", title: "Coach interview", scheduleMode: "window", windowStart: "2026-11-23", windowEnd: "2026-11-25", startAt: null, endAt: null, status: "planned", storyId: 41, storyTitle: "Cafeteria changes" })],
    mediaDeadlines: [],
    taskDeadlines: []
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

/** Let React, TanStack Query and Schedule-X (which renders on its own schedule) settle. */
const flush = async () => { for (let index = 0; index < 4; index += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };

async function render(props: Partial<NewsroomCalendarProps> = {}) {
  const onOpenStory = vi.fn();
  const navigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}>
      <CalendarWorkspaceProvider workspace={workspace}>
        <aside data-testid="controls"><CalendarControls timezone={TZ} scheduleFeed currentUserId={7} /></aside>
        <NewsroomCalendar stories={[story()]} timezone={TZ} getSchedule={getSchedule} currentUserId={7} links={{ story: (id, appointmentId) => `/admin/collections/stories/${id}${appointmentId ? `?appointment=${appointmentId}` : ""}` }} onOpenStory={onOpenStory} navigate={navigate} controls="external" {...props} />
      </CalendarWorkspaceProvider>
    </QueryClientProvider>);
  });
  await flush();
  await vi.waitFor(() => expect(workspace.getState().calendar.ready).toBe(true));
  await flush();
  return { onOpenStory, navigate };
}

const controls = () => container.querySelector<HTMLElement>("[data-testid=controls]")!;
const dayButton = (label: RegExp) => [...controls().querySelectorAll<HTMLButtonElement>("button")].find((button) => label.test(button.getAttribute("aria-label") ?? ""))!;
const heading = () => container.querySelector("[data-calendar] h2")!.textContent;
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); await flush(); };

describe("the shared Calendar", () => {
  it("opens on today in the newsroom timezone, with the controls and the calendar agreeing", async () => {
    await render();
    expect(workspace.getState().calendar.ready).toBe(true);
    expect(workspace.getState().date).toBe("2026-11-06");
    expect(heading()).toBe("November 2026");
    expect(dayButton(/November 6(th)?, 2026/).getAttribute("aria-label")).toMatch(/selected/i);
  });

  it("a day clicked in the mini calendar moves Schedule-X; navigating Schedule-X moves the mini calendar", async () => {
    await render();
    await click(dayButton(/November 17(th)?, 2026/));
    expect(workspace.getState().calendar.date?.toString()).toBe("2026-11-17");
    await click(container.querySelector("[aria-label=Next]")!);
    expect(heading()).toBe("December 2026");
    expect(workspace.getState().date).toBe("2026-12-17");
    // The mini calendar now shows December, with the 17th selected.
    expect(dayButton(/December 17(th)?, 2026/)).toBeTruthy();
    expect(dayButton(/December 17(th)?, 2026/).getAttribute("aria-label")).toMatch(/selected/i);
  });

  it("loads the schedule feed for what is visible, and shows Needs scheduling without a fake date", async () => {
    await render();
    expect(getSchedule).toHaveBeenCalled();
    const [from, to, tasks] = getSchedule.mock.calls.at(-1)!;
    expect(from <= "2026-11-01" && to >= "2026-11-30").toBe(true);
    expect(tasks).toBe(false);
    const region = container.querySelector("[aria-labelledby=needs-scheduling-title]")!;
    expect(region.textContent).toContain("Coach interview");
    expect(region.textContent).toContain("Target: Nov 23–25");
    expect(workspace.getState().needsScheduling).toBe(1);
    const schedule = [...region.querySelectorAll("a")].find((link) => link.textContent?.startsWith("Schedule"))!;
    expect(schedule.getAttribute("href")).toBe("/admin/collections/stories/41?appointment=w");
  });

  it("filters from the controls change what Schedule-X shows, and Task due dates ask the feed for tasks", async () => {
    await render();
    const row = (label: string) => [...controls().querySelectorAll<HTMLElement>("[role=checkbox]")].find((item) => item.textContent?.includes(label))!;
    expect(row("Story deadlines").getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("[data-event-type=deadline]")).not.toBeNull();
    await click(row("Story deadlines"));
    expect(workspace.getState().filters.deadlines).toBe(false);
    expect(row("Story deadlines").getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector("[data-event-type=deadline]")).toBeNull();
    await click(row("Task due dates"));
    expect(getSchedule.mock.calls.at(-1)![2]).toBe(true);
  });

  it("My schedule narrows assigned work to the reader", async () => {
    await render({ currentUserId: 8 });
    const mine = [...controls().querySelectorAll<HTMLElement>("[role=checkbox]")].find((item) => item.textContent?.includes("My schedule"))!;
    expect(container.querySelector("[data-event-type=appointment]")).not.toBeNull();
    await click(mine);
    expect(workspace.getState().filters.mine).toBe(true);
    // The controls were rendered for user 7; the calendar narrows to its own reader (8), who holds none.
    expect(container.querySelector("[data-event-type=appointment]")).toBeNull();
    expect(container.querySelector("[data-event-type=deadline]")).not.toBeNull();
  });

  it("a story event opens Story Peek, never Schedule-X's own modal", async () => {
    const { onOpenStory } = await render();
    const deadline = container.querySelector("[data-event-type=deadline]")!;
    await click(deadline.closest(".sx__event") ?? deadline);
    expect(onOpenStory).toHaveBeenCalledWith(41);
    expect(document.querySelector(".sx__event-modal")).toBeNull();
  });

  it("Month / Week / Day / List come from Schedule-X, and choosing one is the workspace's view", async () => {
    await render();
    const offered = workspace.getState().calendar.views.map((item) => item.label);
    expect(offered).toEqual(expect.arrayContaining(["Month", "Week", "Day", "List"]));
    act(() => workspace.setView("day"));
    await flush();
    expect(workspace.getState().calendar.view).toBe("day");
    expect(workspace.getState().view).toBe("day");
    expect(heading()).toBe("Friday, November 6, 2026");
  });

  it("with the controls in a sheet, the toolbar offers them; with a contextual pane, it does not repeat them", async () => {
    await render({ controls: "external" });
    expect(container.querySelector("[data-calendar-controls-trigger]")).toBeNull();
    await render({ controls: "sheet" });
    expect(container.querySelector("[data-calendar-controls-trigger]")).not.toBeNull();
  });
});

describe("dragging events between days", () => {
  const host = (allowed: string[]) => ({ can: (kind: string) => allowed.includes(kind), apply: vi.fn(async () => ({})) });
  const chip = (type: string) => container.querySelector<HTMLElement>(`[data-event-type=${type}]`);

  it("is read-only without a host: nothing can be picked up", async () => {
    await render();
    expect(chip("deadline")).not.toBeNull();
    expect(container.querySelector("[data-draggable]")).toBeNull();
    expect(chip("deadline")!.getAttribute("draggable")).toBeNull();
  });

  it("lets a reader pick up only the kinds the host allows, and never a published date", async () => {
    getSchedule.mockImplementation(async (from: string, to: string): Promise<ScheduleResponse> => ({ timezone: TZ, from, to, appointments: [appointment({ storyId: 41, storyTitle: "Cafeteria changes" })], needsScheduling: [], mediaDeadlines: [], taskDeadlines: [] }));
    await render({ stories: [story({ plannedPublication: "2026-11-19", publicationState: { id: "published", label: "Published", isPublished: true, isScheduled: false, scheduledAt: null, publishedAt: "2026-11-20T15:00:00Z" } })], reschedule: host(["deadline", "appointment"]) as never });
    expect(chip("deadline")!.hasAttribute("data-draggable")).toBe(true);
    expect(chip("deadline")!.getAttribute("draggable")).toBe("true");
    expect(chip("appointment")!.hasAttribute("data-draggable")).toBe(true);
    // Allowed by no one: the host does not offer planned publication here, and published is history.
    expect(chip("planned")!.hasAttribute("data-draggable")).toBe(false);
    expect(chip("published")!.hasAttribute("data-draggable")).toBe(false);
  });

  it("does not offer a shared interview, which has no story to save through", async () => {
    await render({ reschedule: host(["appointment"]) as never });
    expect(chip("appointment")!.hasAttribute("data-draggable")).toBe(false);
  });
});

describe("finding the day under the pointer", () => {
  const cell = (attribute: string, day: string) => { const element = document.createElement("div"); element.setAttribute(attribute, day); return element; };
  const rootAt = (hit: Element | null) => ({ elementFromPoint: () => hit }) as unknown as Document;

  it("reads a month cell, a week column and an all-day cell", () => {
    const month = cell("data-date", "2026-11-18"); month.className = "sx__month-grid-day";
    expect(dayAtPoint(rootAt(month), 0, 0)?.day).toBe("2026-11-18");
    expect(dayAtPoint(rootAt(cell("data-time-grid-date", "2026-11-19")), 0, 0)?.day).toBe("2026-11-19");
    expect(dayAtPoint(rootAt(cell("data-date-grid-date", "2026-11-20")), 0, 0)?.day).toBe("2026-11-20");
  });

  it("ignores anything that is not a day: the week header, an agenda row, empty space", () => {
    expect(dayAtPoint(rootAt(cell("data-date", "2026-11-18")), 0, 0)).toBeNull();
    expect(dayAtPoint(rootAt(null), 0, 0)).toBeNull();
    expect(dayAtPoint(rootAt(cell("data-time-grid-date", "not-a-day")), 0, 0)).toBeNull();
  });
});

describe("the shared Calendar source", () => {
  const dir = path.resolve(__dirname, "../../src/calendar");
  it("has no host dependency and no host vocabulary", () => {
    for (const file of readdirSync(dir)) {
      const text = readFileSync(path.join(dir, file), "utf8");
      expect(text, file).not.toMatch(/@wordpress\/|WordPress|@payloadcms|Payload/);
    }
  });
});
