import {
  describeNotification, DIGEST_LIMIT, isNotificationKind, NOTIFICATION_PREFERENCES_KEY, notificationEmail, resolveNotificationPreferences,
  type DigestItem, type NotificationFacts, type NotificationKind, type NotificationPreferences
} from "../domain/notifications";
import type { Payload, PayloadRequest, TaskConfig, Where } from "payload";
import { relationId, requestUser, type NewsroomUser } from "../access/user";
import { addDays, localDay, localToInstant, newsroomTimeZone } from "../domain/dates";
import type { ScreenContext } from "./screen-models";

/**
 * Notifications (gap 1 of the editorial review): the WordPress eight,
 * delivered to an in-app inbox and, when SMTP is configured, by email.
 *
 * Triggers are collection hooks (`notification-hooks.ts`) that call
 * `notify()` inside the saving request's transaction, so a notification exists
 * exactly when the change that caused it commits. A notification never fails
 * or slows a save: delivery by email is a queued job on the `maintenance`
 * queue. Preferences are the account's Payload Preferences (never a Users
 * field); defaults are all on.
 */

export const NOTIFICATION_QUEUE = "maintenance";
export const DELIVER_NOTIFICATION_TASK = "deliver-notification";
export const DUE_DIGEST_TASK = "send-due-digest";
/** Read notices are kept this long; unread ones twice as long. */
const RETENTION_DAYS = 60;

type Id = number | string;
const system = (req?: PayloadRequest) => ({ req, depth: 0, overrideAccess: true as const });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Email is configured when a transport was supplied (`BYLINE_SMTP_URL`); otherwise inbox only. */
export const emailConfigured = () => Boolean(process.env.BYLINE_SMTP_URL?.trim());

/* ---------------------------------------------------------------- preferences */

export async function preferencesFor(payload: Payload, userIds: readonly Id[], req?: PayloadRequest): Promise<Map<string, NotificationPreferences>> {
  const result = new Map<string, NotificationPreferences>();
  for (const id of userIds) result.set(String(id), resolveNotificationPreferences(undefined));
  if (!userIds.length) return result;
  const { docs } = await payload.find({
    collection: "payload-preferences", pagination: false, ...system(req),
    where: { and: [{ key: { equals: NOTIFICATION_PREFERENCES_KEY } }, { "user.relationTo": { equals: "users" } }, { "user.value": { in: [...userIds] } }] }
  });
  for (const row of docs) {
    const owner = relationId((row.user as { value?: unknown } | undefined)?.value);
    if (owner !== null) result.set(String(owner), resolveNotificationPreferences(row.value));
  }
  return result;
}

/* --------------------------------------------------------------------- notify */

export type NotifyInput = {
  kind: NotificationKind;
  recipients: ReadonlyArray<unknown>;
  story?: unknown;
  /** A short reference, never copied story text: a task title, "editor"/"byline", a failed job's name. */
  detail?: string;
  data?: object;
  /** Makes the notification idempotent per recipient (a retried job never repeats). */
  dedupe?: string;
  /** Defaults to the signed-in account; a person is never notified of their own action. */
  actor?: unknown;
};

/**
 * Records a notification for each recipient who wants it (in the inbox, by
 * email, or both) and queues email delivery. Returns how many were created.
 * Never throws: a failure is logged and the caller's save proceeds.
 */
export async function notify(req: PayloadRequest, input: NotifyInput): Promise<number> {
  try {
    const context = (req.context ?? {}) as Record<string, unknown>;
    if (context.bylineImport === true || context.bylineSuppressNotifications === true) return 0;
    const actor = input.actor !== undefined ? relationId(input.actor) : (requestUser(req)?.id ?? null);
    const wanted = [...new Set(input.recipients.map(relationId).filter((id): id is Id => id !== null && String(id) !== String(actor)))];
    if (!wanted.length) return 0;
    const { payload } = req;
    const [{ docs: users }, preferences] = await Promise.all([
      payload.find({ collection: "users", where: { and: [{ id: { in: wanted } }, { enabled: { equals: true } }] }, pagination: false, select: { email: true }, ...system(req) }),
      preferencesFor(payload, wanted, req)
    ]);
    let created = 0;
    for (const user of users) {
      const chosen = preferences.get(String(user.id)) ?? resolveNotificationPreferences(undefined);
      const inbox = chosen.inApp[input.kind];
      const email = chosen.email[input.kind] && Boolean(user.email) && emailConfigured();
      if (!inbox && !email) continue;
      const dedupeKey = input.dedupe ? `${input.dedupe}:${user.id}` : undefined;
      if (dedupeKey) {
        const existing = await payload.find({ collection: "notifications", where: { dedupeKey: { equals: dedupeKey } }, limit: 1, select: {}, ...system(req) });
        if (existing.docs.length) continue;
      }
      const row = await payload.create({
        collection: "notifications", ...system(req),
        data: {
          recipient: user.id, kind: input.kind, inbox, emailState: email ? "pending" : "none", dedupeKey,
          story: relationId(input.story) as number | undefined, actor: (actor ?? undefined) as number | undefined,
          detail: input.detail ? text(input.detail, 200) : undefined, data: input.data as never
        }
      });
      created += 1;
      if (email) {
        const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<unknown> };
        await jobs.queue({ task: DELIVER_NOTIFICATION_TASK, queue: NOTIFICATION_QUEUE, input: { notificationId: row.id }, req });
      }
    }
    return created;
  } catch (error) {
    req.payload.logger.warn({ err: error, msg: `Could not record a ${input.kind} notification.` });
    return 0;
  }
}

/** Enabled accounts that are editors or administrators. */
export async function editorRecipients(req: PayloadRequest): Promise<Id[]> {
  const { docs } = await req.payload.find({ collection: "users", where: { and: [{ enabled: { equals: true } }, { role: { in: ["editor", "administrator"] } }] }, pagination: false, select: {}, ...system(req) });
  return docs.map((user) => user.id);
}

/** Enabled accounts linked to any of these People. */
export async function usersForPeople(req: PayloadRequest, personIds: readonly Id[]): Promise<Id[]> {
  if (!personIds.length) return [];
  const { docs } = await req.payload.find({ collection: "users", where: { and: [{ enabled: { equals: true } }, { linkedPerson: { in: [...personIds] } }] }, pagination: false, select: {}, ...system(req) });
  return docs.map((user) => user.id);
}

/* ------------------------------------------------------------------- delivery */

type Row = { id: Id; recipient?: unknown; kind?: string | null; story?: unknown; actor?: unknown; detail?: string | null; data?: unknown; emailState?: string | null; readAt?: string | null; inbox?: boolean | null; createdAt?: string };

const digestItems = (data: unknown): DigestItem[] => (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items) ? ((data as { items: DigestItem[] }).items) : []);

/**
 * Headlines and actor names for a set of rows. `visibleTo` applies that
 * request's access (the inbox shows only headlines the reader may read);
 * without it the system reads (email delivery, which already went to a
 * participant).
 */
async function nameMaps(payload: Payload, rows: readonly Row[], visibleTo?: PayloadRequest) {
  const stories = [...new Set(rows.map((row) => relationId(row.story)).filter((id): id is Id => id !== null))];
  const actors = [...new Set(rows.map((row) => relationId(row.actor)).filter((id): id is Id => id !== null))];
  const [storyRows, actorRows] = await Promise.all([
    stories.length
      ? payload.find({ collection: "stories", where: { id: { in: stories } }, draft: true, pagination: false, depth: 0, select: { headline: true }, req: visibleTo, overrideAccess: !visibleTo }).catch(() => ({ docs: [] }))
      : { docs: [] },
    actors.length ? payload.find({ collection: "users", where: { id: { in: actors } }, pagination: false, select: { name: true }, ...system(visibleTo) }) : { docs: [] }
  ]);
  return {
    headlines: new Map((storyRows.docs as Array<{ id: Id; headline?: string | null }>).map((story) => [String(story.id), story.headline ?? null])),
    names: new Map((actorRows.docs as Array<{ id: Id; name?: string | null }>).map((user) => [String(user.id), user.name ?? null]))
  };
}

const factsFor = (row: Row, headlines: Map<string, string | null>, names: Map<string, string | null>): NotificationFacts => ({
  kind: row.kind as NotificationKind,
  actor: names.get(String(relationId(row.actor))) ?? null,
  story: headlines.get(String(relationId(row.story))) ?? null,
  detail: row.detail ?? null,
  items: digestItems(row.data)
});

const origin = () => (process.env.BYLINE_NEWSROOM_URL ?? "").replace(/\/+$/, "");

/**
 * Sends one notification's email and records the outcome. Without a transport
 * the notification stays in the inbox and is marked skipped; a send failure
 * throws so the job retries.
 */
export async function deliverNotification(payload: Payload, id: Id, options: { configured?: boolean; req?: PayloadRequest } = {}): Promise<"sent" | "skipped" | "gone"> {
  const found = await payload.find({ collection: "notifications", where: { id: { equals: id } }, limit: 1, ...system(options.req) });
  const row = found.docs[0] as Row | undefined;
  if (!row) return "gone";
  const setState = (emailState: "sent" | "failed" | "skipped") => payload.update({ collection: "notifications", id, data: { emailState }, ...system(options.req) });
  if (row.emailState !== "pending") return "skipped";
  const recipient = relationId(row.recipient);
  const user = recipient === null ? null : (await payload.find({ collection: "users", where: { and: [{ id: { equals: recipient } }, { enabled: { equals: true } }] }, limit: 1, select: { email: true }, ...system(options.req) })).docs[0];
  if (!user?.email || !(options.configured ?? emailConfigured())) {
    await setState("skipped");
    return "skipped";
  }
  const storyId = relationId(row.story);
  const { headlines, names } = await nameMaps(payload, [row]);
  const admin = payload.config.routes.admin;
  const link = `${origin()}${admin}${storyId !== null ? `/collections/stories/${storyId}` : ""}`;
  const message = notificationEmail(factsFor(row, headlines, names), link);
  await payload.sendEmail({ to: user.email, subject: message.subject, text: message.text, html: message.html });
  await setState("sent");
  return "sent";
}

export const deliverNotificationTask: TaskConfig = {
  slug: DELIVER_NOTIFICATION_TASK,
  label: "Email a notification",
  inputSchema: [{ name: "notificationId", type: "number", required: true }],
  retries: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
  onFail: async ({ req, job }) => {
    const id = Number(((job as { input?: { notificationId?: unknown } }).input)?.notificationId);
    if (Number.isFinite(id)) await req.payload.update({ collection: "notifications", id, data: { emailState: "failed" }, ...system(req) }).catch(() => undefined);
  },
  handler: async ({ req, input }) => {
    await deliverNotification(req.payload, Number((input as { notificationId: number }).notificationId), { req });
    return { output: {} };
  }
};

/* ---------------------------------------------------------------------- inbox */

/** A notification may open a particular tab of the Story screen (transcripts open Reporting). */
function notificationTab(data: unknown): string {
  const record = (data && typeof data === "object" ? data : {}) as { tab?: unknown; transcriptId?: unknown };
  if (record.tab !== "reporting" && record.tab !== "publish") return "";
  const transcript = Number(record.transcriptId);
  return `?tab=${record.tab}${Number.isSafeInteger(transcript) && transcript > 0 ? `&transcript=${transcript}` : ""}`;
}

export type InboxItem = { id: number; kind: NotificationKind; text: string; createdAt: string; readAt: string | null; storyId: number | null; href: string | null; items: DigestItem[] };
export type InboxResponse = { unread: number; items: InboxItem[]; hasMore: boolean; emailConfigured: boolean };

/** The signed-in person's own notifications, newest first (the collection's read access is their own rows). */
export async function inbox(ctx: ScreenContext, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<InboxResponse> {
  const { payload } = ctx.req;
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 50);
  const mine: Where[] = [{ recipient: { equals: ctx.user.id } }, { inbox: { equals: true } }];
  const unreadOnly: Where[] = options.unreadOnly ? [{ readAt: { exists: false } }] : [];
  const [page, unread] = await Promise.all([
    payload.find({ collection: "notifications", where: { and: [...mine, ...unreadOnly] }, sort: "-createdAt", limit, depth: 0, req: ctx.req, overrideAccess: false }),
    payload.count({ collection: "notifications", where: { and: [...mine, { readAt: { exists: false } }] }, req: ctx.req, overrideAccess: false })
  ]);
  const rows = page.docs as Row[];
  const { headlines, names } = await nameMaps(payload, rows, ctx.req);
  const admin = payload.config.routes.admin;
  return {
    unread: unread.totalDocs,
    hasMore: page.hasNextPage,
    emailConfigured: emailConfigured(),
    items: rows.filter((row) => isNotificationKind(row.kind)).map((row) => {
      const facts = factsFor(row, headlines, names);
      const storyId = relationId(row.story);
      return {
        id: Number(row.id), kind: facts.kind, text: describeNotification(facts), createdAt: String(row.createdAt), readAt: row.readAt ?? null,
        storyId: storyId === null ? null : Number(storyId), href: storyId === null ? null : `${admin}/collections/stories/${storyId}${notificationTab(row.data)}`, items: facts.items ? [...facts.items] : []
      };
    })
  };
}

/** Marks the person's own notifications read: the given ids, or all unread. Only ever their own rows. */
export async function markNotificationsRead(ctx: ScreenContext, selection: "all" | readonly number[]): Promise<{ unread: number }> {
  const { payload } = ctx.req;
  const ids = selection === "all" ? null : selection.filter((id) => Number.isSafeInteger(id)).slice(0, 100);
  if (ids && !ids.length) return { unread: (await inbox(ctx, { limit: 1 })).unread };
  await payload.update({
    collection: "notifications", ...system(ctx.req),
    where: { and: [{ recipient: { equals: ctx.user.id } }, { readAt: { exists: false } }, ...(ids ? [{ id: { in: ids } }] : [])] },
    data: { readAt: ctx.now.toISOString() }
  });
  return { unread: (await inbox(ctx, { limit: 1 })).unread };
}

/* ------------------------------------------------------------ publishing failures */

/** Wraps a task so that a final failure tells the editors; the task's own `onFail` still runs. */
export function withFailureNotice(task: TaskConfig, label: string): TaskConfig {
  return {
    ...task,
    onFail: async (args) => {
      await task.onFail?.(args);
      const { req, job } = args;
      await notify(req, { kind: "publishingFailures", recipients: await editorRecipients(req), detail: label, actor: null, dedupe: `failure:${task.slug}:${String((job as { id?: unknown }).id ?? "")}` });
    }
  };
}

/* --------------------------------------------------------------------- digest */

const ACTIVE_PLAN_STAGES_EXCLUDED = ["ready", "on-hold", "dropped"];

/** What is due for one person by the end of `today` (their newsroom day): open tasks, media work, today's appointments, their story deadlines. */
export async function dueItemsFor(payload: Payload, user: Pick<NewsroomUser, "id" | "linkedPerson">, today: string, timeZone: string, req?: PayloadRequest): Promise<DigestItem[]> {
  const dayStart = localToInstant(`${today}T00:00`, timeZone);
  const dayEnd = localToInstant(`${addDays(today, 1)}T00:00`, timeZone);
  const mine = { assignees: { equals: user.id } };
  const opts = { pagination: false as const, ...system(req) };
  const person = relationId(user.linkedPerson);
  const [tasks, production, exact, windows, planned] = await Promise.all([
    payload.find({ collection: "tasks", where: { and: [mine, { state: { equals: "open" } }, { due: { less_than: dayEnd } }] }, ...opts }),
    payload.find({ collection: "production-assignments", where: { and: [mine, { status: { not_equals: "done" } }, { deadline: { less_than: dayEnd } }] }, ...opts }),
    payload.find({ collection: "appointments", where: { and: [mine, { status: { not_in: ["completed", "cancelled"] } }, { scheduleMode: { equals: "exact" } }, { startAt: { greater_than_equal: dayStart } }, { startAt: { less_than: dayEnd } }] }, ...opts }),
    payload.find({ collection: "appointments", where: { and: [mine, { status: { not_in: ["completed", "cancelled"] } }, { scheduleMode: { equals: "window" } }, { windowStart: { less_than_equal: today } }] }, ...opts }),
    payload.find({ collection: "story-plans", where: { and: [{ deadline: { less_than_equal: today } }, { workflow: { not_in: ACTIVE_PLAN_STAGES_EXCLUDED } }, { or: [{ editor: { equals: user.id } }, ...(person !== null ? [{ contributors: { equals: person } }] : [])] }] }, ...opts })
  ]);
  const planStories = planned.docs.map((plan) => relationId(plan.story)).filter((id): id is Id => id !== null);
  const [published, headlines] = planStories.length
    ? await Promise.all([
        payload.find({ collection: "stories", where: { and: [{ id: { in: planStories } }, { _status: { equals: "published" } }] }, draft: false, select: {}, ...opts }),
        payload.find({ collection: "stories", where: { id: { in: planStories } }, draft: true, select: { headline: true }, ...opts })
      ])
    : [{ docs: [] }, { docs: [] }];
  const live = new Set((published.docs as Array<{ id: Id }>).map((story) => String(story.id)));
  const title = new Map((headlines.docs as Array<{ id: Id; headline?: string | null }>).map((story) => [String(story.id), story.headline || "Untitled story"]));
  const when = (instant: string | null | undefined) => (instant ? (localDay(instant, timeZone) < today ? "overdue" : "today") : "today");
  const items: DigestItem[] = [
    ...tasks.docs.map((task) => ({ type: "task" as const, title: String(task.title), storyId: Number(relationId(task.story)) || null, when: when(task.due) })),
    ...production.docs.map((work) => ({ type: "production" as const, title: String(work.title), storyId: Number(relationId(work.story)) || null, when: when(work.deadline) })),
    ...[...exact.docs, ...windows.docs.filter((appointment) => !appointment.windowEnd || appointment.windowEnd >= today)].map((appointment) => ({ type: "appointment" as const, title: String(appointment.title), storyId: Number(relationId(appointment.story)) || null, when: "today" })),
    ...planned.docs.filter((plan) => !live.has(String(relationId(plan.story)))).map((plan) => ({ type: "deadline" as const, title: title.get(String(relationId(plan.story))) ?? "Untitled story", storyId: Number(relationId(plan.story)) || null, when: String(plan.deadline) < today ? "overdue" : "today" }))
  ];
  return items.slice(0, DIGEST_LIMIT);
}

/** Sends the daily digest to everyone who has it on and has something due, then prunes old notices. */
export async function sendDueDigests(req: PayloadRequest, now = new Date(), timeZone = newsroomTimeZone()): Promise<{ sent: number; pruned: number }> {
  const { payload } = req;
  const today = localDay(now, timeZone);
  const { docs: users } = await payload.find({ collection: "users", where: { enabled: { equals: true } }, pagination: false, select: { linkedPerson: true, role: true }, ...system(req) });
  const preferences = await preferencesFor(payload, users.map((user) => user.id), req);
  let sent = 0;
  for (const user of users) {
    const chosen = preferences.get(String(user.id)) ?? resolveNotificationPreferences(undefined);
    if (!chosen.inApp.dueDigest && !chosen.email.dueDigest) continue;
    const items = await dueItemsFor(payload, { id: user.id, linkedPerson: relationId(user.linkedPerson) }, today, timeZone, req);
    if (!items.length) continue;
    sent += await notify(req, { kind: "dueDigest", recipients: [user.id], actor: null, data: { items }, dedupe: `digest:${today}` });
  }
  const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const pruned = await payload.delete({
    collection: "notifications", ...system(req),
    where: { or: [{ and: [{ readAt: { exists: true } }, { createdAt: { less_than: cutoff(RETENTION_DAYS) } }] }, { createdAt: { less_than: cutoff(RETENTION_DAYS * 2) } }] }
  });
  return { sent, pruned: pruned.docs.length };
}

export const sendDueDigestTask: TaskConfig = {
  slug: DUE_DIGEST_TASK,
  label: "Send the daily due digest",
  // The newsroom day starts at 7: the server clock's hour (set TZ to the newsroom timezone on the worker).
  schedule: [{ cron: "0 0 7 * * *", queue: NOTIFICATION_QUEUE }],
  concurrency: { key: () => "due-digest", exclusive: true },
  handler: async ({ req }) => {
    await sendDueDigests(req);
    return { output: {} };
  }
};

