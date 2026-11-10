import type { ScheduleAppointment, ScheduleMediaDeadline, ScheduleResponse, ScheduleTaskDeadline } from "@byline/newsroom-screens/workspace/workspace-types";
import { APIError, type Where } from "payload";
import { inIds } from "../access/story-context";
import { relationId, relationIds } from "../access/user";
import { addDays, localToInstant } from "../domain/dates";
import { dateOnly, TimingError } from "../domain/schedule";
import type { Appointment, CollectionInterview, ProductionAssignment, Task } from "../payload-types";
import { collectionNames } from "./collections";
import { collectionStoryIds } from "./planning";
import { assigneeList, loadPeople, localToday, readableStories, userPerson, type People, type ScreenContext } from "./screen-models";

/**
 * The Calendar's schedule feed (`GET /api/byline/schedule`): the shared
 * `ScheduleResponse` read model, built from the records that already exist
 * (appointments, production assignments, tasks). There is no calendar
 * collection: the Calendar is a read model, and story dates (deadline,
 * planned publication, publication) come from the Stories collection.
 *
 * Every read runs as the signed-in user (`overrideAccess: false`), so the
 * feed holds exactly the records Story Work access lets them see: everything
 * on stories they manage, and on other stories only what is assigned to them.
 * It is never built with administrator access and filtered afterwards.
 * Private notes are never read.
 *
 *
 * - exact appointments overlapping the newsroom-day range, cancelled ones
 *   excluded, completed and tentative ones kept (the screens mark them);
 * - open appointments with a target window or no date, whatever the range,
 *   under `needsScheduling`: never given a day or a time;
 * - open production with a deadline in range;
 * - open tasks due in range, only when asked for, Collection tasks included;
 * - Collection interviews (shared reporting): an exact one in range is an
 *   event, a window or unscheduled one waits under `needsScheduling`. They
 *   link to their Collection, never carry notes or private source details.
 */

/** The longest range one request may ask for, as in WordPress ("up to four months"). */
export const SCHEDULE_MAX_DAYS = 124;
/** Defaults when a range is not given: a week back, two months ahead (as in WordPress). */
const DEFAULT_BACK_DAYS = 7;
const DEFAULT_AHEAD_DAYS = 60;

export type ScheduleQuery = { from: string; to: string; includeTasks: boolean; collectionId: number | null };

const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;

/**
 * `from`, `to` (newsroom days), `tasks=1` and `collectionId=<id>` from the query
 * string; a bad range is a 400. `coverage=` and `collection=` were the earlier
 * names of the Collection scope and are still accepted here, at the boundary.
 */
export function parseScheduleQuery(params: URLSearchParams, today: string): ScheduleQuery {
  let from: string;
  let to: string;
  try {
    from = dateOnly(params.get("from")) || addDays(today, -DEFAULT_BACK_DAYS);
    to = dateOnly(params.get("to")) || addDays(today, DEFAULT_AHEAD_DAYS);
  } catch (error) {
    throw new APIError(error instanceof TimingError ? `Use dates like 2026-11-12. ${error.message}` : "Use dates like 2026-11-12.", 400);
  }
  if (to < from) throw new APIError("The date range cannot end before it starts.", 400);
  if (dayNumber(to) - dayNumber(from) > SCHEDULE_MAX_DAYS) throw new APIError("Choose a date range of up to four months.", 400);
  const flag = params.get("tasks") ?? params.get("includeTasks");
  const collection = Number(params.get("collectionId") ?? params.get("collection") ?? params.get("coverage") ?? "");
  return { from, to, includeTasks: flag === "1" || flag === "true", collectionId: Number.isSafeInteger(collection) && collection > 0 ? collection : null };
}

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0, pagination: false as const });

/** The fields the feed needs. `notes` is deliberately absent: it is never read, so it can never leak. */
const APPOINTMENT_FIELDS = { story: true, title: true, kind: true, status: true, scheduleMode: true, windowStart: true, windowEnd: true, startAt: true, endAt: true, assignees: true, source: true, location: true } as const;

function scheduleAppointment(people: People, row: Appointment, titles: Map<number, string>, sources: Map<string, string>): ScheduleAppointment {
  const assignees = assigneeList(people, row.assignees);
  const storyId = Number(relationId(row.story));
  const sourceId = relationId(row.source);
  return {
    id: String(row.id),
    title: row.title,
    kind: row.kind as ScheduleAppointment["kind"],
    status: row.status as ScheduleAppointment["status"],
    scheduleMode: row.scheduleMode as ScheduleAppointment["scheduleMode"],
    windowStart: row.windowStart ?? null,
    windowEnd: row.windowEnd ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    assigneeIds: assignees.map((person) => person.id),
    assignees,
    sourceId: sourceId === null ? null : String(sourceId),
    sourceLabel: sourceId === null ? null : (sources.get(String(sourceId)) ?? null),
    location: row.location ?? "",
    storyId,
    storyTitle: titles.get(storyId) ?? "Story"
  };
}

function mediaDeadline(people: People, row: ProductionAssignment, titles: Map<number, string>): ScheduleMediaDeadline {
  const storyId = Number(relationId(row.story));
  const assignee = relationIds(row.assignees)[0];
  return {
    id: String(row.id),
    storyId,
    storyTitle: titles.get(storyId) ?? "Story",
    title: row.title,
    type: row.type as ScheduleMediaDeadline["type"],
    status: row.status as ScheduleMediaDeadline["status"],
    dueAt: row.deadline!,
    assignee: assignee === undefined ? null : userPerson(people, assignee)
  };
}

function taskDeadline(people: People, row: Task, titles: Map<number, string>, collections: Map<number, string>): ScheduleTaskDeadline {
  const storyId = Number(relationId(row.story));
  const collectionId = Number(relationId(row.collection)) || null;
  const assignee = relationIds(row.assignees)[0];
  return {
    id: row.id,
    collectionId,
    storyId: Number.isSafeInteger(storyId) && storyId > 0 ? storyId : null,
    storyTitle: titles.get(storyId) ?? (collectionId ? (collections.get(collectionId) ?? "Collection") : ""),
    title: row.title,
    dueAt: row.due!,
    assignee: assignee === undefined ? null : userPerson(people, assignee)
  };
}

/** The fields the feed reads from a Collection interview: never notes, follow-ups or private contacts. */
const INTERVIEW_FIELDS = { collection: true, interviewee: true, status: true, scheduleMode: true, windowStart: true, windowEnd: true, startAt: true, endAt: true, interviewers: true, location: true } as const;

/** A shared Collection interview in the schedule feed: an appointment of its Collection, with no story. */
export function interviewAppointment(people: People, row: CollectionInterview, collections: Map<number, string>): ScheduleAppointment {
  const assignees = assigneeList(people, row.interviewers);
  const collectionId = Number(relationId(row.collection));
  return {
    id: `collection-interview-${row.id}`,
    title: row.interviewee,
    kind: "interview",
    status: row.status === "completed" || row.status === "follow-up" ? "completed" : row.status === "scheduled" ? "confirmed" : row.status === "cancelled" ? "cancelled" : "planned",
    scheduleMode: row.scheduleMode as ScheduleAppointment["scheduleMode"],
    windowStart: row.windowStart ?? null,
    windowEnd: row.windowEnd ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    assigneeIds: assignees.map((person) => person.id),
    assignees,
    sourceId: null,
    sourceLabel: row.interviewee,
    location: row.location ?? "",
    storyId: 0,
    storyTitle: collections.get(collectionId) ?? "Collection",
    collectionId,
    interviewId: row.id
  };
}

const byThenId = <T extends { id: string | number }>(key: (item: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b)) || String(a.id).localeCompare(String(b.id));

export async function scheduleResponse(ctx: ScreenContext, query: ScheduleQuery): Promise<ScheduleResponse> {
  const { from, to, includeTasks, collectionId } = query;
  // The newsroom days [from, to] as instants: from local midnight to the next day's local midnight.
  const start = localToInstant(`${from}T00:00`, ctx.timeZone);
  const end = localToInstant(`${addDays(to, 1)}T00:00`, ctx.timeZone);
  const scope: Where[] = collectionId ? [inIds("story", await collectionStoryIds(ctx, collectionId))] : [];
  const where = (...conditions: Where[]): Where => ({ and: [...scope, ...conditions] });
  // A Collection's own work is in scope too: its tasks and its shared interviews.
  const taskScope: Where[] = collectionId ? [{ or: [...scope, { collection: { equals: collectionId } }] }] : [];
  const interviewScope: Where[] = collectionId ? [{ collection: { equals: collectionId } }] : [];

  const [people, exact, waiting, production, tasks, interviews, waitingInterviews] = await Promise.all([
    loadPeople(ctx),
    ctx.req.payload.find({
      collection: "appointments",
      where: where(
        { scheduleMode: { equals: "exact" } },
        { status: { not_equals: "cancelled" } },
        { startAt: { less_than: end } },
        // Overlaps the range: starts in it, or started before it and ends in or after it.
        { or: [{ startAt: { greater_than_equal: start } }, { endAt: { greater_than_equal: start } }] }
      ),
      select: APPOINTMENT_FIELDS,
      sort: "startAt",
      ...asUser(ctx)
    }),
    ctx.req.payload.find({
      collection: "appointments",
      where: where({ scheduleMode: { in: ["window", "unscheduled"] } }, { status: { not_in: ["completed", "cancelled"] } }),
      select: APPOINTMENT_FIELDS,
      ...asUser(ctx)
    }),
    ctx.req.payload.find({
      collection: "production-assignments",
      where: where({ status: { not_equals: "done" } }, { deadline: { greater_than_equal: start } }, { deadline: { less_than: end } }),
      select: { story: true, title: true, type: true, status: true, deadline: true, assignees: true },
      sort: "deadline",
      ...asUser(ctx)
    }),
    includeTasks
      ? ctx.req.payload.find({
          collection: "tasks",
          where: { and: [...taskScope, { state: { equals: "open" } }, { due: { greater_than_equal: start } }, { due: { less_than: end } }] },
          select: { story: true, collection: true, title: true, due: true, assignees: true },
          sort: "due",
          ...asUser(ctx)
        })
      : Promise.resolve({ docs: [] as Task[] }),
    ctx.req.payload.find({
      collection: "collection-interviews",
      where: { and: [...interviewScope, { scheduleMode: { equals: "exact" } }, { status: { not_equals: "cancelled" } }, { startAt: { less_than: end } }, { or: [{ startAt: { greater_than_equal: start } }, { endAt: { greater_than_equal: start } }] }] },
      select: INTERVIEW_FIELDS,
      sort: "startAt",
      ...asUser(ctx)
    }),
    ctx.req.payload.find({
      collection: "collection-interviews",
      where: { and: [...interviewScope, { scheduleMode: { in: ["window", "unscheduled"] } }, { status: { not_in: ["completed", "follow-up", "cancelled"] } }] },
      select: INTERVIEW_FIELDS,
      ...asUser(ctx)
    })
  ]);

  const appointments = [...exact.docs, ...waiting.docs] as Appointment[];
  const storyIds = [...new Set([...appointments, ...production.docs, ...tasks.docs].map((row) => Number(relationId((row as { story?: unknown }).story))).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const sourceIds = [...new Set(appointments.map((row) => relationId(row.source)).filter((id): id is number | string => id !== null))];
  const [stories, sources] = await Promise.all([
    readableStories(ctx, storyIds, { headline: true }),
    sourceIds.length
      ? ctx.req.payload.find({ collection: "sources", where: { id: { in: sourceIds } }, select: { label: true }, ...asUser(ctx) })
      : Promise.resolve({ docs: [] as Array<{ id: number; label: string }> })
  ]);
  const titles = new Map(stories.map((story) => [story.id, story.headline?.trim() || "Untitled story"]));
  const shared = [...interviews.docs, ...waitingInterviews.docs] as CollectionInterview[];
  const collections = await collectionNames(ctx, [...new Set([...shared.map((row) => Number(relationId(row.collection))), ...(tasks.docs as Task[]).map((row) => Number(relationId(row.collection)))].filter((id) => id > 0))]);
  const labels = new Map(sources.docs.map((source) => [String(source.id), source.label]));

  return {
    timezone: ctx.timeZone,
    from,
    to,
    appointments: [
      ...(exact.docs as Appointment[]).map((row) => scheduleAppointment(people, row, titles, labels)),
      ...(interviews.docs as CollectionInterview[]).map((row) => interviewAppointment(people, row, collections))
    ].sort(byThenId((item) => item.startAt ?? "")),
    needsScheduling: [
      ...(waiting.docs as Appointment[]).map((row) => scheduleAppointment(people, row, titles, labels)),
      ...(waitingInterviews.docs as CollectionInterview[]).map((row) => interviewAppointment(people, row, collections))
    ].sort(byThenId((item) => item.windowStart ?? "9999")),
    mediaDeadlines: (production.docs as ProductionAssignment[]).map((row) => mediaDeadline(people, row, titles)).sort(byThenId((item) => item.dueAt)),
    taskDeadlines: (tasks.docs as Task[]).map((row) => taskDeadline(people, row, titles, collections)).sort(byThenId((item) => item.dueAt))
  };
}

/** Today in the newsroom, for the default range. */
export const scheduleToday = localToday;
