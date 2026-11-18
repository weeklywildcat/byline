import { randomUUID, createHash } from "node:crypto";
import { addDataAndFileToRequest, APIError, commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";
import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { relationId, relationIds, sameId } from "../access/user";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { ScreenContext } from "../newsroom/screen-models";
import { canAdministerPolls, canInterview, canManagePolls, canRunSession, canSeeSurvey, canViewResults, requireAdministrator, requireManager } from "./access";
import { POLL_LOCATIONS, POLL_SURVEYS, POLL_VERSIONS, SURVEY_STATUSES, type SurveyStatus } from "./collections";
import { pollPublicStarts, pollResponses, pollSessionEvents, pollSessions } from "./db";
import { normalizeDefinition } from "./definition";
import { aggregateHandoff, HANDOFF_FIELDS } from "./engine/handoff";
import { compareOptions, fieldworkRow, responseTimeline, responsesCsv, summarize, summaryCsv, type EventCounts, type ResponseRow } from "./engine/results";
import { emptyDefinition, isAnswerable, type StoredAnswers, type SurveyDefinition } from "./engine/types";
import { definitionToSheets, hasErrors, importWorkbook, validateDefinition, type ImportIssue } from "./engine/xlsform";
import { readWorkbook, WorkbookError, writeWorkbook } from "./engine/xlsx";
import { hashPin, newPublicKey, normalizeAccessCode } from "./kiosk";
import { EXAMPLE_SHEETS, EXAMPLE_WORKBOOK_FILE, SPREADSHEET_GUIDE_FILE, TEMPLATE_SHEETS, TEMPLATE_WORKBOOK_FILE } from "./workbooks/example";
import { SPREADSHEET_GUIDE } from "./workbooks/guide";
import { collectionPeriods } from "./periods";
import { createDataset, createRows, deleteDataset } from "../data/server";

/**
 * Poll Studio's server (docs/wildcat-polls.md). Every operation re-checks the
 * account against the poll (src/polls/access.ts) and reads Payload with
 * explicit access decisions. Answers are read only for results and exports,
 * and only by people allowed to see that poll's results.
 */

export type SurveyDoc = {
  id: number;
  title: string;
  description?: string | null;
  status: SurveyStatus;
  owner?: unknown;
  currentVersion?: unknown;
  draft?: unknown;
  draftRevision?: number | null;
  draftSource?: string | null;
  openToAllStaff?: boolean | null;
  interviewers?: unknown;
  analysts?: unknown;
  kioskEnabled?: boolean | null;
  publicLink?: { enabled?: boolean | null; key?: string | null; opensAt?: string | null; closesAt?: string | null; accessCodeHash?: string | null; hourlyLimit?: number | null } | null;
  linkedStory?: unknown;
  linkedCollection?: unknown;
  methodology?: string | null;
  minimumGroup?: number | null;
  updatedAt: string;
  createdAt: string;
};

export type VersionDoc = { id: number; survey: unknown; number: number; label?: string | null; definition: unknown; sourceFilename?: string | null; note?: string | null; publishedBy?: unknown; publishedAt: string; questionCount?: number | null };

export type Drizzle = PostgresAdapter["drizzle"];

/** Drizzle for the poll tables, inside the request's Payload transaction when it has one. */
export async function pollDb(payload: Payload, req?: Partial<PayloadRequest>): Promise<Drizzle> {
  const adapter = payload.db as unknown as PostgresAdapter;
  if (req?.transactionID) {
    const id = await req.transactionID;
    return (adapter.sessions?.[String(id)]?.db as Drizzle | undefined) ?? adapter.drizzle;
  }
  return adapter.drizzle;
}

const system = { overrideAccess: true as const, depth: 0 };

export async function loadSurvey(payload: Payload, id: number, req?: PayloadRequest): Promise<SurveyDoc> {
  try {
    return await payload.findByID({ collection: POLL_SURVEYS, id, ...system, req }) as unknown as SurveyDoc;
  } catch {
    throw new APIError("This poll does not exist.", 404);
  }
}

export async function loadVersion(payload: Payload, id: number, req?: PayloadRequest): Promise<VersionDoc> {
  try {
    return await payload.findByID({ collection: POLL_VERSIONS, id, ...system, req }) as unknown as VersionDoc;
  } catch {
    throw new APIError("This poll version does not exist.", 404);
  }
}

/** A published definition is trusted (it passed every check when it was published). */
export const versionDefinition = (version: VersionDoc): SurveyDefinition => version.definition as SurveyDefinition;

function draftOf(survey: SurveyDoc): SurveyDefinition {
  return survey.draft ? normalizeDefinition(survey.draft) : emptyDefinition(survey.title);
}

async function userNames(payload: Payload, ids: Array<number | string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))].filter(Boolean).map(Number).filter(Number.isSafeInteger);
  if (!unique.length) return new Map();
  const { docs } = await payload.find({ collection: "users", where: { id: { in: unique } }, pagination: false, ...system, select: { name: true } });
  return new Map(docs.map((doc) => [String(doc.id), String((doc as { name?: string }).name ?? "Someone")]));
}

async function responseCounts(payload: Payload, surveyIds: number[]): Promise<Map<number, number>> {
  if (!surveyIds.length) return new Map();
  const db = await pollDb(payload);
  const rows = await db.select({ surveyId: pollResponses.surveyId, count: sql<number>`count(*)::int` }).from(pollResponses).where(inArray(pollResponses.surveyId, surveyIds)).groupBy(pollResponses.surveyId);
  return new Map(rows.map((row) => [row.surveyId, Number(row.count)]));
}

function surveySummary(survey: SurveyDoc, ctx: ScreenContext, extra: { responses: number; versionNumber: number | null; activeSessions?: number; draftChanged?: boolean }) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description ?? "",
    status: survey.status,
    versionNumber: extra.versionNumber,
    responses: extra.responses,
    updatedAt: survey.updatedAt,
    kioskEnabled: survey.kioskEnabled !== false,
    publicLink: survey.publicLink?.enabled === true,
    activeSessions: extra.activeSessions ?? 0,
    /** Editors only: the draft differs from the published version (or nothing is published yet). */
    draftChanged: extra.draftChanged ?? false,
    canInterview: canInterview(ctx.user, survey) && survey.status === "open" && relationId(survey.currentVersion) !== null && survey.kioskEnabled !== false,
    canViewResults: canViewResults(ctx.user, survey),
    canManage: canManagePolls(ctx.user),
    canAdminister: canAdministerPolls(ctx.user)
  };
}

export type SessionSummary = Awaited<ReturnType<typeof sessionSummaries>>[number];

export async function sessionSummaries(payload: Payload, where: ReturnType<typeof eq> | undefined, limit = 50) {
  const db = await pollDb(payload);
  const sessions = await db.select({
    id: pollSessions.id, surveyId: pollSessions.surveyId, versionId: pollSessions.versionId, interviewerId: pollSessions.interviewerId,
    locationId: pollSessions.locationId, locationName: pollSessions.locationName, period: pollSessions.period, method: pollSessions.method,
    status: pollSessions.status, startedAt: pollSessions.startedAt, endedAt: pollSessions.endedAt, kioskActive: sql<boolean>`${pollSessions.kioskTokenHash} is not null and ${pollSessions.kioskExpiresAt} > now()`,
    pairingExpiresAt: sql<Date | null>`case when ${pollSessions.pairingCodeHash} is not null and ${pollSessions.pairingExpiresAt} > now() then ${pollSessions.pairingExpiresAt} end`
  }).from(pollSessions).where(where).orderBy(desc(pollSessions.startedAt)).limit(limit);
  const counts = await eventCounts(payload, sessions.map((session) => session.id));
  const names = await userNames(payload, sessions.map((session) => session.interviewerId));
  return sessions.map((session) => ({
    ...session,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    // Whether a pairing code is waiting to be used (never the code itself).
    pairingExpiresAt: session.pairingExpiresAt ? new Date(session.pairingExpiresAt).toISOString() : null,
    interviewer: names.get(String(session.interviewerId)) ?? "Someone",
    counts: counts.get(session.id) ?? { started: 0, declined: 0, completed: 0, abandoned: 0 }
  }));
}

export async function eventCounts(payload: Payload, sessionIds: string[]): Promise<Map<string, EventCounts>> {
  const result = new Map<string, EventCounts>();
  if (!sessionIds.length) return result;
  const db = await pollDb(payload);
  const rows = await db.select({ sessionId: pollSessionEvents.sessionId, kind: pollSessionEvents.kind, count: sql<number>`count(*)::int` })
    .from(pollSessionEvents).where(inArray(pollSessionEvents.sessionId, sessionIds)).groupBy(pollSessionEvents.sessionId, pollSessionEvents.kind);
  for (const row of rows) {
    const entry = result.get(row.sessionId) ?? { started: 0, declined: 0, completed: 0, abandoned: 0 };
    entry[row.kind] = Number(row.count);
    result.set(row.sessionId, entry);
  }
  return result;
}

/* ------------------------------------------------------------------ overview */

export async function pollsOverview(ctx: ScreenContext) {
  const { payload } = ctx.req;
  const { docs } = await payload.find({ collection: POLL_SURVEYS, req: ctx.req, overrideAccess: false, depth: 0, pagination: false, sort: "-updatedAt" });
  const surveys = (docs as unknown as SurveyDoc[]).filter((survey) => canSeeSurvey(ctx.user, survey));
  const versionIds = surveys.map((survey) => Number(relationId(survey.currentVersion))).filter(Boolean);
  const manage = canManagePolls(ctx.user);
  const versions = versionIds.length ? (await payload.find({ collection: POLL_VERSIONS, where: { id: { in: versionIds } }, pagination: false, ...system, select: manage ? { number: true, definition: true } : { number: true } })).docs as unknown as VersionDoc[] : [];
  const versionNumber = new Map(versions.map((version) => [version.id, version.number]));
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const counts = await responseCounts(payload, surveys.filter((survey) => canViewResults(ctx.user, survey)).map((survey) => survey.id));
  const running = await activeSessionCounts(payload, surveys.map((survey) => survey.id));
  const draftChanged = (survey: SurveyDoc) => {
    if (!manage) return false;
    const current = versionById.get(Number(relationId(survey.currentVersion)));
    return current ? !sameDefinition(draftOf(survey), current.definition) : Boolean(survey.draft);
  };
  const mine = canManagePolls(ctx.user) ? ne(pollSessions.status, "ended") : and(ne(pollSessions.status, "ended"), eq(pollSessions.interviewerId, Number(ctx.user.id)));
  const sessions = await sessionSummaries(payload, mine, 30);
  const { docs: locations } = await payload.find({ collection: POLL_LOCATIONS, ...system, pagination: false, sort: "name" });
  return {
    me: { id: ctx.user.id, role: ctx.user.role, canManage: canManagePolls(ctx.user), canAdminister: canAdministerPolls(ctx.user) },
    surveys: surveys.map((survey) => surveySummary(survey, ctx, { responses: counts.get(survey.id) ?? 0, versionNumber: versionNumber.get(Number(relationId(survey.currentVersion))) ?? null, activeSessions: running.get(survey.id) ?? 0, draftChanged: draftChanged(survey) })),
    sessions: sessions.map((session) => ({ ...session, survey: surveys.find((survey) => survey.id === session.surveyId)?.title ?? "A poll" })),
    locations: locations.map((location) => ({ id: location.id, name: String((location as { name: string }).name), notes: String((location as { notes?: string }).notes ?? ""), active: (location as { active?: boolean }).active !== false })),
    periods: collectionPeriods(),
    timeZone: ctx.timeZone
  };
}

async function activeSessionCounts(payload: Payload, surveyIds: number[]): Promise<Map<number, number>> {
  if (!surveyIds.length) return new Map();
  const db = await pollDb(payload);
  const rows = await db.select({ surveyId: pollSessions.surveyId, count: sql<number>`count(*)::int` }).from(pollSessions).where(and(inArray(pollSessions.surveyId, surveyIds), ne(pollSessions.status, "ended"))).groupBy(pollSessions.surveyId);
  return new Map(rows.map((row) => [row.surveyId, Number(row.count)]));
}

/* ------------------------------------------------------------------ import */

export async function importSpreadsheet(ctx: ScreenContext, req: PayloadRequest) {
  requireManager(ctx.user);
  await addDataAndFileToRequest(req);
  const file = req.file;
  if (!file?.data) throw new APIError("Choose an .xlsx workbook to upload.", 400);
  if (!/\.xlsx$/i.test(file.name ?? "")) throw new APIError("Upload an Excel workbook (.xlsx). In Google Sheets choose File → Download → Microsoft Excel.", 400);
  const bytes = new Uint8Array(file.data);
  try {
    const result = importWorkbook(await readWorkbook(bytes));
    return { ...result, source: { filename: String(file.name).slice(0, 300), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength } };
  } catch (error) {
    if (error instanceof WorkbookError) throw new APIError(error.message, 400);
    throw error;
  }
}

/* ------------------------------------------------------------------ surveys */

type CreateInput = { title?: unknown; definition?: unknown; sourceFilename?: unknown; example?: unknown };

export async function createSurvey(ctx: ScreenContext, input: CreateInput) {
  requireManager(ctx.user);
  let definition: SurveyDefinition;
  let sourceFilename = typeof input.sourceFilename === "string" ? input.sourceFilename.slice(0, 300) : "";
  if (input.example === true) {
    // The example is installed exactly as any workbook is: read and imported.
    const result = importWorkbook(await readWorkbook(writeWorkbook(EXAMPLE_SHEETS)));
    if (hasErrors(result.issues)) throw new APIError("The example workbook has errors.", 500);
    definition = result.definition;
    sourceFilename = EXAMPLE_WORKBOOK_FILE;
  } else {
    definition = input.definition ? normalizeDefinition(input.definition) : emptyDefinition(typeof input.title === "string" ? input.title : undefined);
  }
  const title = (typeof input.title === "string" && input.title.trim() ? input.title.trim() : definition.settings.title || "Untitled poll").slice(0, 200);
  definition.settings.title ||= title;
  const survey = await ctx.req.payload.create({
    collection: POLL_SURVEYS, req: ctx.req, overrideAccess: true, depth: 0,
    data: { title, description: definition.settings.description.slice(0, 2000), status: "draft", owner: ctx.user.id as number, draft: definition as never, draftRevision: 1, draftSource: sourceFilename || null, openToAllStaff: false, kioskEnabled: true, minimumGroup: 5, publicLink: { enabled: false, key: newPublicKey() } }
  });
  return { id: survey.id };
}

export async function surveyDetail(ctx: ScreenContext, id: number) {
  const { payload } = ctx.req;
  const survey = await loadSurvey(payload, id, ctx.req);
  if (!canSeeSurvey(ctx.user, survey)) throw new APIError("This poll does not exist.", 404);
  const manage = canManagePolls(ctx.user);
  const { docs: versionDocs } = await payload.find({ collection: POLL_VERSIONS, where: { survey: { equals: id } }, sort: "-number", pagination: false, ...system, select: { number: true, label: true, sourceFilename: true, note: true, publishedBy: true, publishedAt: true, questionCount: true } });
  const versions = versionDocs as unknown as VersionDoc[];
  const current = relationId(survey.currentVersion) ? await loadVersion(payload, Number(relationId(survey.currentVersion)), ctx.req) : null;
  const names = await userNames(payload, [...versions.map((version) => relationId(version.publishedBy) ?? ""), ...relationIds(survey.interviewers), ...relationIds(survey.analysts), relationId(survey.owner) ?? ""]);
  const draft = manage ? draftOf(survey) : null;
  const counts = canViewResults(ctx.user, survey) ? await responseCounts(payload, [id]) : new Map<number, number>();
  const linked = await linkedRecords(ctx, survey);
  const sessions = await sessionSummaries(payload, canManagePolls(ctx.user) ? eq(pollSessions.surveyId, id) : and(eq(pollSessions.surveyId, id), eq(pollSessions.interviewerId, Number(ctx.user.id))), 100);
  const byMode = canViewResults(ctx.user, survey) ? await responseCountsByMode(payload, id) : null;
  const changed = Boolean(draft && current && !sameDefinition(draft, current.definition));
  const { docs: locationDocs } = await payload.find({ collection: POLL_LOCATIONS, where: { active: { equals: true } }, ...system, pagination: false, sort: "name" });
  return {
    me: { id: ctx.user.id },
    timeZone: ctx.timeZone,
    periods: collectionPeriods(),
    locations: locationDocs.map((location) => ({ id: location.id, name: String((location as { name: string }).name) })),
    responsesByMode: byMode,
    survey: {
      ...surveySummary(survey, ctx, { responses: counts.get(id) ?? 0, versionNumber: current?.number ?? null, activeSessions: sessions.filter((session) => session.status !== "ended").length, draftChanged: changed || Boolean(draft && !current) }),
      owner: names.get(String(relationId(survey.owner))) ?? "",
      methodology: survey.methodology ?? "",
      minimumGroup: survey.minimumGroup ?? 5,
      ...(manage ? {
        openToAllStaff: survey.openToAllStaff === true,
        interviewers: relationIds(survey.interviewers).map((userId) => ({ id: userId, name: names.get(String(userId)) ?? "Someone" })),
        analysts: relationIds(survey.analysts).map((userId) => ({ id: userId, name: names.get(String(userId)) ?? "Someone" })),
        publicLinkSettings: { enabled: survey.publicLink?.enabled === true, key: survey.publicLink?.key ?? "", opensAt: survey.publicLink?.opensAt ?? null, closesAt: survey.publicLink?.closesAt ?? null, hasAccessCode: Boolean(survey.publicLink?.accessCodeHash), hourlyLimit: survey.publicLink?.hourlyLimit ?? 300 },
        draftRevision: survey.draftRevision ?? 0,
        draftSource: survey.draftSource ?? ""
      } : {}),
      linkedStory: linked.story,
      linkedCollection: linked.collection
    },
    draft,
    draftIssues: draft ? validateDefinition(draft) : [],
    draftChanged: changed,
    current: current ? { id: current.id, number: current.number, definition: versionDefinition(current) } : null,
    versions: versions.map((version) => ({ id: version.id, number: version.number, label: version.label ?? "", sourceFilename: version.sourceFilename ?? "", note: version.note ?? "", publishedAt: version.publishedAt, publishedBy: names.get(String(relationId(version.publishedBy))) ?? "", questionCount: version.questionCount ?? 0 })),
    sessions
  };
}

/** Whether two definitions ask the same thing. PostgreSQL's jsonb reorders keys, so both are rebuilt first; workbook row numbers don't count. */
export function sameDefinition(a: unknown, b: unknown): boolean {
  const canonical = (definition: unknown) => JSON.stringify(normalizeDefinition(definition), (key, value) => (key === "source" ? undefined : value));
  return canonical(a) === canonical(b);
}

async function responseCountsByMode(payload: Payload, surveyId: number): Promise<{ kiosk: number; public: number }> {
  const db = await pollDb(payload);
  const rows = await db.select({ mode: pollResponses.mode, count: sql<number>`count(*)::int` }).from(pollResponses).where(eq(pollResponses.surveyId, surveyId)).groupBy(pollResponses.mode);
  return { kiosk: Number(rows.find((row) => row.mode === "kiosk")?.count ?? 0), public: Number(rows.find((row) => row.mode === "public")?.count ?? 0) };
}

async function linkedRecords(ctx: ScreenContext, survey: SurveyDoc) {
  const { payload } = ctx.req;
  const storyId = relationId(survey.linkedStory);
  const collectionId = relationId(survey.linkedCollection);
  const story = storyId ? await payload.findByID({ collection: "stories", id: storyId, draft: true, req: ctx.req, overrideAccess: false, depth: 0, disableErrors: true, select: { headline: true } }) : null;
  const collection = collectionId ? await payload.findByID({ collection: "collections", id: collectionId, req: ctx.req, overrideAccess: false, depth: 0, disableErrors: true, select: { name: true } }) : null;
  return {
    story: storyId ? { id: Number(storyId), title: story ? String((story as { headline?: string }).headline ?? "Untitled story") : "A story you can't open" } : null,
    collection: collectionId ? { id: Number(collectionId), title: collection ? String((collection as { name?: string }).name ?? "Untitled collection") : "A collection you can't open" } : null
  };
}

type UpdateInput = {
  title?: unknown; description?: unknown; status?: unknown; methodology?: unknown; minimumGroup?: unknown;
  draft?: unknown; draftRevision?: unknown; draftSource?: unknown;
  openToAllStaff?: unknown; interviewers?: unknown; analysts?: unknown; kioskEnabled?: unknown;
  publicLink?: { enabled?: unknown; opensAt?: unknown; closesAt?: unknown; accessCode?: unknown; hourlyLimit?: unknown; regenerateKey?: unknown };
  linkedStory?: unknown; linkedCollection?: unknown;
};

const ids = (value: unknown) => (Array.isArray(value) ? [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100) : []);
const optionalId = (value: unknown) => (value === null ? null : Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined);
const dateOrNull = (value: unknown) => (value === null || value === "" ? null : typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);

export async function updateSurvey(ctx: ScreenContext, id: number, input: UpdateInput) {
  requireManager(ctx.user);
  const { payload } = ctx.req;
  const shouldCommit = await initTransaction(ctx.req);
  try {
    const db = await pollDb(payload, ctx.req);
    // One writer at a time: a stale draft save is refused, never silently merged.
    await db.execute(sql`select id from poll_surveys where id = ${id} for update`);
    const survey = await loadSurvey(payload, id, ctx.req);
    const data: Record<string, unknown> = {};
    if (typeof input.title === "string") { if (!input.title.trim()) throw new APIError("A poll needs a title.", 400); data.title = input.title.trim().slice(0, 200); }
    if (typeof input.description === "string") data.description = input.description.slice(0, 2000);
    if (typeof input.methodology === "string") data.methodology = input.methodology.slice(0, 4000);
    if (input.minimumGroup !== undefined) {
      const minimum = Number(input.minimumGroup);
      if (!Number.isInteger(minimum) || minimum < 3 || minimum > 50) throw new APIError("The smallest reported group must be between 3 and 50.", 400);
      data.minimumGroup = minimum;
    }
    if (input.status !== undefined) {
      if (!SURVEY_STATUSES.some((status) => status.value === input.status)) throw new APIError("Unknown status.", 400);
      if (input.status === "open" && !relationId(survey.currentVersion)) throw new APIError("Publish the poll before opening it.", 409);
      if (input.status === "draft" && relationId(survey.currentVersion)) throw new APIError("A published poll can be open, closed or archived.", 409);
      data.status = input.status;
    }
    if (input.draft !== undefined) {
      if (Number(input.draftRevision) !== (survey.draftRevision ?? 0)) throw new APIError("Someone else changed this draft. Reload to see their changes.", 409);
      const draft = normalizeDefinition(input.draft);
      data.draft = draft;
      data.draftRevision = (survey.draftRevision ?? 0) + 1;
      if (typeof input.draftSource === "string") data.draftSource = input.draftSource.slice(0, 300);
    }
    if (input.openToAllStaff !== undefined) data.openToAllStaff = input.openToAllStaff === true;
    if (input.kioskEnabled !== undefined) data.kioskEnabled = input.kioskEnabled === true;
    if (input.interviewers !== undefined) data.interviewers = await enabledUsers(payload, ids(input.interviewers), ctx.req);
    if (input.analysts !== undefined) data.analysts = await enabledUsers(payload, ids(input.analysts), ctx.req);
    if (input.linkedStory !== undefined) data.linkedStory = optionalId(input.linkedStory) ?? null;
    if (input.linkedCollection !== undefined) data.linkedCollection = optionalId(input.linkedCollection) ?? null;
    if (input.publicLink) {
      const link = { ...(survey.publicLink ?? {}) } as Record<string, unknown>;
      if (input.publicLink.enabled !== undefined) link.enabled = input.publicLink.enabled === true;
      const opensAt = dateOrNull(input.publicLink.opensAt);
      const closesAt = dateOrNull(input.publicLink.closesAt);
      if (opensAt !== undefined) link.opensAt = opensAt;
      if (closesAt !== undefined) link.closesAt = closesAt;
      if (input.publicLink.hourlyLimit !== undefined) link.hourlyLimit = Math.min(5000, Math.max(10, Math.round(Number(input.publicLink.hourlyLimit) || 300)));
      if (input.publicLink.accessCode !== undefined) {
        const code = String(input.publicLink.accessCode ?? "").trim();
        if (code && (code.length < 4 || code.length > 40)) throw new APIError("An access code is 4 to 40 characters.", 400);
        link.accessCodeHash = code ? await hashPin(normalizeAccessCode(code)) : null;
      }
      if (input.publicLink.regenerateKey === true || !link.key) link.key = newPublicKey();
      delete link.id;
      data.publicLink = link;
    }
    await payload.update({ collection: POLL_SURVEYS, id, data: data as never, req: ctx.req, ...system });
    if (shouldCommit) await commitTransaction(ctx.req);
  } catch (error) {
    if (shouldCommit) await killTransaction(ctx.req);
    throw error;
  }
  return surveyDetail(ctx, id);
}

async function enabledUsers(payload: Payload, userIds: number[], req: PayloadRequest): Promise<number[]> {
  if (!userIds.length) return [];
  const { docs } = await payload.find({ collection: "users", where: { and: [{ id: { in: userIds } }, { enabled: { equals: true } }] }, pagination: false, ...system, req, select: { name: true } });
  return docs.map((doc) => Number(doc.id));
}

/** Copies the draft into a new, immutable version and makes it current. Refused while the draft has errors. */
export async function publishSurvey(ctx: ScreenContext, id: number, input: { draftRevision?: unknown; note?: unknown }) {
  requireManager(ctx.user);
  const { payload } = ctx.req;
  const shouldCommit = await initTransaction(ctx.req);
  try {
    const db = await pollDb(payload, ctx.req);
    await db.execute(sql`select id from poll_surveys where id = ${id} for update`);
    const survey = await loadSurvey(payload, id, ctx.req);
    if (Number(input.draftRevision) !== (survey.draftRevision ?? 0)) throw new APIError("Someone else changed this draft. Reload before publishing.", 409);
    if (survey.status === "archived") throw new APIError("Unarchive the poll before publishing.", 409);
    const draft = draftOf(survey);
    const issues = validateDefinition(draft);
    if (hasErrors(issues)) throw new APIError("Fix the errors in the questions before publishing.", 422, { issues });
    const { docs: latest } = await payload.find({ collection: POLL_VERSIONS, where: { survey: { equals: id } }, sort: "-number", limit: 1, ...system, req: ctx.req, select: { number: true, definition: true } });
    const previous = latest[0] as unknown as VersionDoc | undefined;
    if (previous && sameDefinition(previous.definition, draft)) throw new APIError("Nothing has changed since the last published version.", 409);
    const number = (previous?.number ?? 0) + 1;
    const version = await payload.create({
      collection: POLL_VERSIONS, req: ctx.req, ...system,
      data: {
        survey: id, number, label: `${draft.settings.title} · v${number}`.slice(0, 240), definition: draft as never,
        sourceFilename: survey.draftSource ?? null, note: typeof input.note === "string" ? input.note.slice(0, 500) : null,
        publishedBy: ctx.user.id as number, publishedAt: ctx.now.toISOString(), questionCount: draft.questions.filter(isAnswerable).length
      }
    });
    await payload.update({ collection: POLL_SURVEYS, id, req: ctx.req, ...system, data: { currentVersion: version.id, title: draft.settings.title.slice(0, 200) || survey.title, ...(survey.status === "draft" ? { status: "open" as const } : {}) } });
    if (shouldCommit) await commitTransaction(ctx.req);
  } catch (error) {
    if (shouldCommit) await killTransaction(ctx.req);
    throw error;
  }
  return surveyDetail(ctx, id);
}

/** Administrators only: the poll, every version, session, event and response. */
export async function deleteSurvey(ctx: ScreenContext, id: number, input: { confirmTitle?: unknown }) {
  requireAdministrator(ctx.user);
  const { payload } = ctx.req;
  const survey = await loadSurvey(payload, id, ctx.req);
  if (String(input.confirmTitle ?? "").trim() !== survey.title.trim()) throw new APIError("Type the poll's title to confirm.", 400);
  const shouldCommit = await initTransaction(ctx.req);
  try {
    const db = await pollDb(payload, ctx.req);
    await db.delete(pollResponses).where(eq(pollResponses.surveyId, id));
    await db.delete(pollSessionEvents).where(eq(pollSessionEvents.surveyId, id));
    await db.delete(pollSessions).where(eq(pollSessions.surveyId, id));
    await db.delete(pollPublicStarts).where(eq(pollPublicStarts.surveyId, id));
    await payload.update({ collection: POLL_SURVEYS, id, data: { currentVersion: null }, req: ctx.req, ...system });
    await payload.db.deleteMany({ collection: POLL_VERSIONS, where: { survey: { equals: id } }, req: ctx.req });
    await payload.delete({ collection: POLL_SURVEYS, id, req: ctx.req, ...system });
    if (shouldCommit) await commitTransaction(ctx.req);
  } catch (error) {
    if (shouldCommit) await killTransaction(ctx.req);
    throw error;
  }
  return { deleted: true };
}

export async function versionDetail(ctx: ScreenContext, surveyId: number, versionId: number) {
  const survey = await loadSurvey(ctx.req.payload, surveyId, ctx.req);
  if (!canSeeSurvey(ctx.user, survey)) throw new APIError("This poll does not exist.", 404);
  const version = await loadVersion(ctx.req.payload, versionId, ctx.req);
  if (!sameId(relationId(version.survey), surveyId)) throw new APIError("This poll version does not exist.", 404);
  return { id: version.id, number: version.number, definition: versionDefinition(version) };
}

/* ------------------------------------------------------------------ files */

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const download = (body: Uint8Array | string, type: string, filename: string) => new Response(body as BodyInit, {
  headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
});

export function pollTemplate(_ctx: ScreenContext, file: string) {
  if (file === EXAMPLE_WORKBOOK_FILE) return download(writeWorkbook(EXAMPLE_SHEETS), XLSX_TYPE, file);
  if (file === TEMPLATE_WORKBOOK_FILE) return download(writeWorkbook(TEMPLATE_SHEETS), XLSX_TYPE, file);
  if (file === SPREADSHEET_GUIDE_FILE) return download(SPREADSHEET_GUIDE, "text/markdown; charset=utf-8", file);
  throw new APIError("Unknown file.", 404);
}

const slugify = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "poll";

/** The draft (or a published version) as a workbook in the same format the importer reads. */
export async function surveyWorkbook(ctx: ScreenContext, id: number, versionId: number | null) {
  requireManager(ctx.user);
  const survey = await loadSurvey(ctx.req.payload, id, ctx.req);
  let definition = draftOf(survey);
  let suffix = "draft";
  if (versionId) {
    const version = await loadVersion(ctx.req.payload, versionId, ctx.req);
    if (!sameId(relationId(version.survey), id)) throw new APIError("This poll version does not exist.", 404);
    definition = versionDefinition(version);
    suffix = `v${version.number}`;
  }
  return download(writeWorkbook(definitionToSheets(definition)), XLSX_TYPE, `${slugify(survey.title)}-${suffix}.xlsx`);
}

/* ------------------------------------------------------------------ people, links, locations */

export async function pollPeople(ctx: ScreenContext) {
  requireManager(ctx.user);
  const { docs } = await ctx.req.payload.find({ collection: "users", where: { enabled: { equals: true } }, pagination: false, sort: "name", ...system, select: { name: true, role: true } });
  return { people: docs.map((doc) => ({ id: Number(doc.id), name: String((doc as { name?: string }).name ?? ""), role: String((doc as { role?: string }).role ?? "staff") })) };
}

export async function pollLinkChoices(ctx: ScreenContext, search: string) {
  requireManager(ctx.user);
  const query = search.trim().slice(0, 80);
  const [stories, collections] = await Promise.all([
    ctx.req.payload.find({ collection: "stories", draft: true, req: ctx.req, overrideAccess: false, depth: 0, limit: 8, sort: "-updatedAt", select: { headline: true }, ...(query ? { where: { headline: { like: query } } } : {}) }),
    ctx.req.payload.find({ collection: "collections", req: ctx.req, overrideAccess: false, depth: 0, limit: 8, sort: "-updatedAt", select: { name: true }, ...(query ? { where: { name: { like: query } } } : {}) })
  ]);
  return {
    stories: stories.docs.map((doc) => ({ id: Number(doc.id), title: String((doc as { headline?: string }).headline ?? "Untitled story") })),
    collections: collections.docs.map((doc) => ({ id: Number(doc.id), title: String((doc as { name?: string }).name ?? "Untitled collection") }))
  };
}

export async function saveLocation(ctx: ScreenContext, id: number | null, input: { name?: unknown; notes?: unknown; active?: unknown }) {
  requireManager(ctx.user);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = String(input.name ?? "").trim().slice(0, 120);
    if (!name) throw new APIError("A location needs a name.", 400);
    data.name = name;
  }
  if (input.notes !== undefined) data.notes = String(input.notes ?? "").slice(0, 300);
  if (input.active !== undefined) data.active = input.active === true;
  try {
    const doc = id
      ? await ctx.req.payload.update({ collection: POLL_LOCATIONS, id, data: data as never, req: ctx.req, ...system })
      : await ctx.req.payload.create({ collection: POLL_LOCATIONS, data: { active: true, ...data } as never, req: ctx.req, ...system });
    return { id: doc.id };
  } catch (error) {
    if (/unique|duplicate/i.test(String((error as Error).message))) throw new APIError("There is already a location with that name.", 409);
    throw error;
  }
}

/* ------------------------------------------------------------------ sessions (studio side) */

type SessionInput = { surveyId?: unknown; locationId?: unknown; locationName?: unknown; period?: unknown; method?: unknown };

export async function createSession(ctx: ScreenContext, input: SessionInput) {
  const { payload } = ctx.req;
  const surveyId = Number(input.surveyId);
  if (!Number.isSafeInteger(surveyId) || surveyId <= 0) throw new APIError("Choose a poll.", 400);
  const survey = await loadSurvey(payload, surveyId, ctx.req);
  if (!canInterview(ctx.user, survey)) throw new APIError("You haven't been given fieldwork for this poll.", 403);
  const versionId = Number(relationId(survey.currentVersion));
  if (survey.status !== "open" || !versionId) throw new APIError("This poll is not open.", 409);
  if (survey.kioskEnabled === false) throw new APIError("This poll is not collected in person.", 409);
  let locationId: number | null = null;
  let locationName = typeof input.locationName === "string" ? input.locationName.trim().slice(0, 120) : "";
  if (input.locationId !== undefined && input.locationId !== null && input.locationId !== "") {
    locationId = Number(input.locationId);
    const location = await payload.findByID({ collection: POLL_LOCATIONS, id: locationId, ...system, disableErrors: true }) as { name?: string; active?: boolean } | null;
    if (!location || location.active === false) throw new APIError("Choose an active location.", 400);
    locationName = String(location.name);
  }
  if (!locationName) throw new APIError("Choose where you are polling.", 400);
  const id = randomUUID();
  const db = await pollDb(payload);
  await db.insert(pollSessions).values({
    id, surveyId, versionId, interviewerId: Number(ctx.user.id), locationId, locationName,
    period: typeof input.period === "string" ? input.period.trim().slice(0, 120) : "",
    method: typeof input.method === "string" ? input.method.trim().slice(0, 200) : "",
    status: "active", kioskMode: "locked"
  });
  return { id };
}

export async function loadSession(payload: Payload, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new APIError("This session does not exist.", 404);
  const db = await pollDb(payload);
  const [session] = await db.select().from(pollSessions).where(eq(pollSessions.id, id)).limit(1);
  if (!session) throw new APIError("This session does not exist.", 404);
  return session;
}

export async function endSessionFromStudio(ctx: ScreenContext, id: string) {
  const session = await loadSession(ctx.req.payload, id);
  if (!canRunSession(ctx.user, session)) throw new APIError("Only the interviewer or an editor can end this session.", 403);
  await endSession(ctx.req.payload, session.id, ctx.now);
  return { ended: true };
}

/** Ends a session: revokes any kiosk credential and records an unfinished survey as abandoned. */
export async function endSession(payload: Payload, id: string, now: Date) {
  const db = await pollDb(payload);
  await db.transaction(async (tx) => {
    const [session] = await tx.select().from(pollSessions).where(eq(pollSessions.id, id)).for("update");
    if (!session) return;
    if (session.kioskTicket) await abandonTicket(tx as unknown as Drizzle, session, session.kioskTicket, now);
    await tx.update(pollSessions).set({
      status: "ended", endedAt: session.endedAt ?? now, kioskTokenHash: null, kioskExpiresAt: null, kioskPinHash: null, kioskMode: "locked", kioskTicket: null, kioskUnlockedUntil: null,
      pairingCodeHash: null, pairingExpiresAt: null, pairingPinHash: null, pairingReplaces: false, updatedAt: now
    }).where(eq(pollSessions.id, id));
  });
}

/** Records a started survey that will not be submitted, unless it already ended either way. */
export async function abandonTicket(db: Drizzle, session: { id: string; surveyId: number; locationName: string }, ticket: string, now: Date) {
  const [response] = await db.select({ id: pollResponses.id }).from(pollResponses).where(eq(pollResponses.ticket, ticket)).limit(1);
  if (response) return;
  await db.insert(pollSessionEvents).values({ sessionId: session.id, surveyId: session.surveyId, kind: "abandoned", eventKey: `abandoned:${ticket}`, ticket, locationName: session.locationName, occurredAt: now }).onConflictDoNothing();
}

/* ------------------------------------------------------------------ results */

export type ResultFilters = { from: string | null; to: string | null; location: string | null; session: string | null; version: number | null; mode: "kiosk" | "public" | null; compare: string | null };

export function resultFilters(params: URLSearchParams): ResultFilters {
  const date = (value: string | null) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);
  const mode = params.get("mode");
  const version = Number(params.get("version"));
  return {
    from: date(params.get("from")), to: date(params.get("to")),
    location: params.get("location")?.slice(0, 120) || null,
    session: /^[0-9a-f-]{36}$/.test(params.get("session") ?? "") ? params.get("session") : null,
    version: Number.isSafeInteger(version) && version > 0 ? version : null,
    mode: mode === "kiosk" || mode === "public" ? mode : null,
    compare: /^[A-Za-z_][\w.-]{0,80}$/.test(params.get("compare") ?? "") ? params.get("compare") : null
  };
}

async function responsesFor(payload: Payload, surveyId: number, filters: ResultFilters): Promise<ResponseRow[]> {
  const db = await pollDb(payload);
  const conditions = [eq(pollResponses.surveyId, surveyId)];
  if (filters.from) conditions.push(gte(pollResponses.submittedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(pollResponses.submittedAt, new Date(filters.to)));
  if (filters.location) conditions.push(eq(pollResponses.locationName, filters.location));
  if (filters.session) conditions.push(eq(pollResponses.sessionId, filters.session));
  if (filters.version) conditions.push(eq(pollResponses.versionId, filters.version));
  if (filters.mode) conditions.push(eq(pollResponses.mode, filters.mode));
  const rows = await db.select().from(pollResponses).where(and(...conditions)).orderBy(pollResponses.submittedAt).limit(50_000);
  return rows.map((row) => ({ id: row.id, versionId: row.versionId, sessionId: row.sessionId, mode: row.mode, location: row.locationName, submittedAt: row.submittedAt.toISOString(), answers: row.answers as StoredAnswers }));
}

async function resultContext(ctx: ScreenContext, id: number) {
  const survey = await loadSurvey(ctx.req.payload, id, ctx.req);
  if (!canViewResults(ctx.user, survey)) throw new APIError("You haven't been given this poll's results.", 403);
  const { docs } = await ctx.req.payload.find({ collection: POLL_VERSIONS, where: { survey: { equals: id } }, sort: "-number", pagination: false, ...system });
  const versions = docs as unknown as VersionDoc[];
  if (!versions.length) throw new APIError("This poll has not been published yet.", 409);
  return { survey, versions };
}

export async function surveyResults(ctx: ScreenContext, id: number, params: URLSearchParams) {
  const { payload } = ctx.req;
  const { survey, versions } = await resultContext(ctx, id);
  const filters = resultFilters(params);
  const version = (filters.version && versions.find((entry) => entry.id === filters.version)) || versions.find((entry) => sameId(entry.id, relationId(survey.currentVersion))) || versions[0];
  const definition = versionDefinition(version);
  const rows = await responsesFor(payload, id, filters);
  const minimumGroup = survey.minimumGroup ?? 5;
  // Breakdowns only for the one "Compare by" question asked for, and only one the poll configured.
  const comparable = compareOptions(definition);
  const compare = comparable.find((option) => option.name === filters.compare)?.name ?? null;
  const results = summarize(definition, rows, { minimumGroup, breakdowns: compare ? [compare] : [] });

  // Fieldwork: approaches and endings by session, location and collection method.
  const db = await pollDb(payload);
  const eventConditions = [eq(pollSessionEvents.surveyId, id)];
  if (filters.from) eventConditions.push(gte(pollSessionEvents.occurredAt, new Date(filters.from)));
  if (filters.to) eventConditions.push(lte(pollSessionEvents.occurredAt, new Date(filters.to)));
  if (filters.location) eventConditions.push(eq(pollSessionEvents.locationName, filters.location));
  if (filters.session) eventConditions.push(eq(pollSessionEvents.sessionId, filters.session));
  const events = filters.mode === "public" ? [] : await db.select({ sessionId: pollSessionEvents.sessionId, location: pollSessionEvents.locationName, kind: pollSessionEvents.kind, count: sql<number>`count(*)::int` })
    .from(pollSessionEvents).where(and(...eventConditions)).groupBy(pollSessionEvents.sessionId, pollSessionEvents.locationName, pollSessionEvents.kind);
  const sessions = await sessionSummaries(payload, eq(pollSessions.surveyId, id), 500);
  const add = (map: Map<string, EventCounts>, key: string, kind: keyof EventCounts, count: number) => {
    const entry = map.get(key) ?? { started: 0, declined: 0, completed: 0, abandoned: 0 };
    entry[kind] += count;
    map.set(key, entry);
  };
  const bySession = new Map<string, EventCounts>();
  const byLocation = new Map<string, EventCounts>();
  const byMethod = new Map<string, EventCounts>();
  const total: EventCounts = { started: 0, declined: 0, completed: 0, abandoned: 0 };
  for (const event of events) {
    const count = Number(event.count);
    add(bySession, event.sessionId, event.kind, count);
    add(byLocation, event.location, event.kind, count);
    add(byMethod, sessions.find((session) => session.id === event.sessionId)?.method || "Not recorded", event.kind, count);
    total[event.kind] += count;
  }
  const sessionLabel = (sessionId: string) => {
    const session = sessions.find((entry) => entry.id === sessionId);
    return session ? `${session.interviewer} · ${session.locationName}${session.period ? ` · ${session.period}` : ""}` : "Session";
  };
  return {
    survey: { id: survey.id, title: survey.title, methodology: survey.methodology ?? "", minimumGroup, status: survey.status, linked: await linkedRecords(ctx, survey) },
    version: { id: version.id, number: version.number },
    versions: versions.map((entry) => ({ id: entry.id, number: entry.number, publishedAt: entry.publishedAt })),
    filters: { ...filters, compare },
    options: {
      locations: [...new Set([...sessions.map((session) => session.locationName)])].sort(),
      sessions: sessions.map((session) => ({ id: session.id, label: sessionLabel(session.id), startedAt: session.startedAt, endedAt: session.endedAt, method: session.method }))
    },
    modes: { kiosk: rows.filter((row) => row.mode === "kiosk").length, public: rows.filter((row) => row.mode === "public").length },
    compare: { options: comparable, selected: compare },
    timeline: responseTimeline(rows, ctx.timeZone),
    canCreateDataset: canManagePolls(ctx.user),
    results,
    fieldwork: {
      total: fieldworkRow("total", "All interviewer-led sessions", total, minimumGroup),
      sessions: [...bySession.entries()].map(([key, counts]) => fieldworkRow(key, sessionLabel(key), counts, minimumGroup)),
      locations: [...byLocation.entries()].map(([key, counts]) => fieldworkRow(key, key, counts, minimumGroup)).sort((a, b) => a.label.localeCompare(b.label)),
      methods: [...byMethod.entries()].map(([key, counts]) => fieldworkRow(key, key, counts, minimumGroup))
    },
    firstResponseAt: rows[0]?.submittedAt ?? null,
    lastResponseAt: rows.at(-1)?.submittedAt ?? null
  };
}

export async function exportResponses(ctx: ScreenContext, id: number, params: URLSearchParams, kind: "responses" | "summary") {
  const { survey, versions } = await resultContext(ctx, id);
  const filters = resultFilters(params);
  const version = (filters.version && versions.find((entry) => entry.id === filters.version)) || versions.find((entry) => sameId(entry.id, relationId(survey.currentVersion))) || versions[0];
  const rows = await responsesFor(ctx.req.payload, id, filters);
  const definition = versionDefinition(version);
  const stamp = ctx.now.toISOString().slice(0, 10);
  if (kind === "summary") return download(summaryCsv(summarize(definition, rows, { minimumGroup: survey.minimumGroup ?? 5 })), "text/csv; charset=utf-8", `${slugify(survey.title)}-summary-${stamp}.csv`);
  ctx.req.payload.logger.info({ msg: "Poll responses exported", surveyId: id, userId: ctx.user.id, rows: rows.length });
  return download(responsesCsv(definition, rows, new Map(versions.map((entry) => [entry.id, entry.number]))), "text/csv; charset=utf-8", `${slugify(survey.title)}-responses-${stamp}.csv`);
}

/* ------------------------------------------------------------------ results → data */

/**
 * "Create dataset from results" (docs/wildcat-polls.md#results-to-byline-data):
 * the current filtered results, as reviewed aggregates, in a new private
 * working dataset made through Data's own server functions. No response,
 * written answer or respondent-level value is read into it, and nothing is
 * published: that is Data's Publish step, taken deliberately later.
 */
export async function createResultsDataset(ctx: ScreenContext, id: number, params: URLSearchParams) {
  requireManager(ctx.user);
  const view = await surveyResults(ctx, id, params);
  const minimumGroup = view.survey.minimumGroup;
  const handoff = aggregateHandoff(view.results, { minimumGroup, compare: view.results.breakdowns });
  if (!handoff.rows.length) throw new APIError("There are no results to put in a dataset yet (questions answered by fewer than the smallest reported group are left out).", 409);
  const f = view.filters;
  const scope = [
    f.from || f.to ? `responses ${f.from ? `from ${f.from.slice(0, 10)}` : ""}${f.to ? ` to ${f.to.slice(0, 10)}` : ""}`.trim() : null,
    f.location ? `at ${f.location}` : null,
    f.session ? "one session" : null,
    f.mode ? (f.mode === "kiosk" ? "in person" : "by web link") : null,
    f.version ? `version ${view.version.number}` : null,
    view.compare.selected ? `compared by ${view.compare.options.find((option) => option.name === view.compare.selected)?.label ?? view.compare.selected}` : null
  ].filter(Boolean).join(", ");
  const description = [
    `Aggregate results of the poll “${view.survey.title}” (${view.results.responses} responses${scope ? `; ${scope}` : ""}), made in Poll Studio on ${ctx.now.toISOString().slice(0, 10)}.`,
    `Groups and questions with fewer than ${minimumGroup} respondents are left out. No individual or written answers.`,
    handoff.withheld.length ? `${handoff.withheld.length} question${handoff.withheld.length === 1 ? " was" : "s were"} left out for having too few answers.` : ""
  ].filter(Boolean).join(" ").slice(0, 2000);
  const dataset = await createDataset(ctx, { title: `${view.survey.title} — results`.slice(0, 120), description, schema: { fields: HANDOFF_FIELDS, retiredKeys: [] } });
  try {
    for (let start = 0; start < handoff.rows.length; start += 1000) {
      await createRows(ctx, Number(dataset.id), { rows: handoff.rows.slice(start, start + 1000).map((values) => ({ values })) });
    }
  } catch (error) {
    await deleteDataset(ctx, Number(dataset.id)).catch(() => undefined);
    throw error;
  }
  ctx.req.payload.logger.info({ msg: "Poll results copied to a dataset", surveyId: id, datasetId: dataset.id, userId: ctx.user.id, rows: handoff.rows.length });
  return { datasetId: Number(dataset.id), rows: handoff.rows.length, withheld: handoff.withheld.length };
}

/* ------------------------------------------------------------------ linked coverage */

/**
 * The polls linked to a Story or Collection, as this account may see them:
 * Poll Studio stays the authority, so this is a read of its links, never a
 * copy. Response counts only for people allowed to read results.
 */
export async function linkedPolls(ctx: ScreenContext, params: URLSearchParams) {
  const story = Number(params.get("story"));
  const collection = Number(params.get("collection"));
  const field = Number.isSafeInteger(story) && story > 0 ? "linkedStory" : Number.isSafeInteger(collection) && collection > 0 ? "linkedCollection" : null;
  if (!field) throw new APIError("Name a story or a collection.", 400);
  const { docs } = await ctx.req.payload.find({ collection: POLL_SURVEYS, where: { [field]: { equals: field === "linkedStory" ? story : collection } }, req: ctx.req, overrideAccess: false, depth: 0, pagination: false, sort: "-updatedAt" });
  const surveys = (docs as unknown as SurveyDoc[]).filter((survey) => canSeeSurvey(ctx.user, survey));
  const counts = await responseCounts(ctx.req.payload, surveys.filter((survey) => canViewResults(ctx.user, survey)).map((survey) => survey.id));
  const running = await activeSessionCounts(ctx.req.payload, surveys.map((survey) => survey.id));
  return {
    polls: surveys.map((survey) => ({
      id: survey.id, title: survey.title, status: survey.status,
      responses: canViewResults(ctx.user, survey) ? counts.get(survey.id) ?? 0 : null,
      activeSessions: running.get(survey.id) ?? 0,
      publicLink: survey.publicLink?.enabled === true
    }))
  };
}
