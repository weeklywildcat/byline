import { APIError, type Where } from "payload";
import { canChangeMaterial, reportingAudience } from "../access/reporting-context";
import { canPublishLive, readLiveSettings } from "../access/live-context";
import { scopeManages, scopeParticipates } from "../access/story-context";
import { atLeast, relationId } from "../access/user";
import { localDay } from "../domain/dates";
import {
  normalizeGroundRules,
  sortMaterial,
  type GroundRule,
  type GroundRulesSnapshot,
  type LiveUpdateMaterial,
  type MaterialPerson,
  type MediaMaterial,
  type ReportingFileKind,
  type ReportingFileMaterial,
  type ReportingNoteMaterial,
  type ResourceMaterial,
  type StoryMaterialItem,
  type TranscriptSummary
} from "../domain/reporting";
import { lexicalToPlainText } from "../newsroom/live-text";
import type { ScreenContext } from "../newsroom/screen-models";

/**
 * The Story Material read model (docs/reporting.md#story-material).
 *
 * One chronological feed assembled from each capture's canonical home:
 * reporting notes, private reporting files (with a transcript *summary*,
 * never its body), Media captured for or assigned to the Story, the Story's
 * links, and its live updates. Every read runs as the signed-in person, so
 * the collections' access (including confidentiality) decides what appears.
 * It is a read model: nothing is copied into a shared table.
 */

export type ReportingSource = {
  id: number;
  label: string;
  role: string;
  organization: string;
  status: string;
  groundRules: GroundRule;
  recordingPermission: boolean;
  groundRulesNote: string;
};

export type ReportingAppointment = {
  id: number;
  title: string;
  kind: string;
  status: string;
  startAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  location: string;
  sourceId: number | null;
};

export type ReportingWorkspace = {
  story: { id: number; headline: string; published: boolean; liveState: "off" | "live" | "ended" };
  capabilities: {
    capture: boolean;
    manage: boolean;
    postLive: boolean;
    overrideOffRecord: boolean;
  };
  /** Appointments still to happen (or without a time yet), soonest first. */
  upNext: ReportingAppointment[];
  sources: ReportingSource[];
  appointments: ReportingAppointment[];
  materials: StoryMaterialItem[];
  timeZone: string;
};

const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
const num = (value: unknown) => Number(relationId(value)) || 0;
const iso = (value: unknown) => (typeof value === "string" && value ? value : new Date(0).toISOString());

export async function storyReporting(ctx: ScreenContext, storyId: number): Promise<ReportingWorkspace> {
  const audience = await reportingAudience(ctx.req);
  if (!audience) throw new APIError("Sign in to use the newsroom.", 401);
  const manager = scopeManages(audience.scope, storyId);
  if (!manager && !scopeParticipates(audience.scope, storyId)) throw new APIError("You are not part of this story.", 403);
  const { payload } = ctx.req;

  const story = await payload.findByID({ collection: "stories", id: storyId, draft: true, select: { headline: true, _status: true }, ...as(ctx) });
  const liveSettings = await readLiveSettings(ctx.req, storyId);
  const byStory: Where = { story: { equals: storyId } };
  const [sourcesPage, appointmentsPage, notesPage, filesPage, plans, assignments, captured, postLive] = await Promise.all([
    payload.find({ collection: "sources", where: byStory, pagination: false, sort: "label", ...as(ctx) }),
    payload.find({ collection: "appointments", where: byStory, pagination: false, sort: "startAt", ...as(ctx) }),
    payload.find({ collection: "reporting-notes", where: byStory, limit: 200, sort: "-capturedAt", ...as(ctx) }),
    payload.find({ collection: "reporting-files", where: byStory, limit: 200, sort: "-capturedAt", ...as(ctx) }),
    payload.find({ collection: "story-plans", where: byStory, limit: 1, select: { resources: true, createdBy: true, updatedAt: true }, ...as(ctx) }),
    payload.find({ collection: "production-assignments", where: byStory, pagination: false, select: { media: true, title: true }, ...as(ctx) }),
    payload.find({ collection: "media", where: { "capture.story": { equals: storyId } }, limit: 100, sort: "-createdAt", ...as(ctx) }),
    canPublishLive(ctx.req, storyId)
  ]);

  const sources: ReportingSource[] = sourcesPage.docs.map((row) => ({
    id: row.id, label: row.label, role: row.role ?? "", organization: row.organization ?? "", status: row.status ?? "planned",
    groundRules: (row.groundRules ?? "unspecified") as GroundRule, recordingPermission: row.recordingPermission === true, groundRulesNote: row.groundRulesNote ?? ""
  }));
  const appointments: ReportingAppointment[] = appointmentsPage.docs.map((row) => ({
    id: row.id, title: row.title, kind: row.kind, status: row.status, startAt: row.scheduleMode === "exact" ? row.startAt ?? null : null,
    windowStart: row.scheduleMode === "window" ? row.windowStart ?? null : null, windowEnd: row.scheduleMode === "window" ? row.windowEnd ?? null : null,
    location: row.location ?? "", sourceId: relationId(row.source) === null ? null : num(row.source)
  }));
  const sourceLabel = new Map(sources.map((source) => [source.id, source.label]));
  const appointmentTitle = new Map(appointments.map((appointment) => [appointment.id, appointment.title]));
  const contextOf = (row: { source?: unknown; appointment?: unknown }) => {
    const source = num(row.source);
    const appointment = num(row.appointment);
    return {
      // A participant may not read every source; the link is still shown, by a neutral name.
      source: source ? { id: source, label: sourceLabel.get(source) ?? "A source" } : null,
      appointment: appointment ? { id: appointment, title: appointmentTitle.get(appointment) ?? "An appointment" } : null
    };
  };

  // Transcript summaries: the fields the feed needs, never segments or search text.
  const fileIds = filesPage.docs.map((row) => row.id);
  const transcripts = fileIds.length
    ? (await payload.find({ collection: "reporting-transcripts", where: { file: { in: fileIds } }, pagination: false, select: { file: true, state: true, origin: true, language: true, durationMs: true }, ...as(ctx) })).docs
    : [];
  const selections = transcripts.length
    ? (await payload.find({ collection: "transcript-selections", where: { and: [{ transcript: { in: transcripts.map((row) => row.id) } }, { kind: { equals: "quote" } }] }, pagination: false, select: { transcript: true, state: true, usedIn: true }, ...as(ctx) })).docs
    : [];
  const quoteCounts = new Map<number, { total: number; verified: number; used: number }>();
  for (const row of selections) {
    const id = num(row.transcript);
    const entry = quoteCounts.get(id) ?? { total: 0, verified: 0, used: 0 };
    entry.total += 1;
    if (row.state === "verified") entry.verified += 1;
    if (Array.isArray(row.usedIn) && row.usedIn.length > 0) entry.used += 1;
    quoteCounts.set(id, entry);
  }
  const transcriptFor = new Map<number, TranscriptSummary>(transcripts.map((row) => [num(row.file), {
    id: row.id, state: row.state, origin: row.origin, language: row.language ?? null, durationMs: row.durationMs ?? null,
    quoteCount: quoteCounts.get(row.id)?.total ?? 0,
    verifiedCount: quoteCounts.get(row.id)?.verified ?? 0,
    usedQuoteCount: quoteCounts.get(row.id)?.used ?? 0
  }]));

  // Media linked through production assignments, plus Media captured for the Story; one asset appears once.
  const assignedIds = [...new Set(assignments.docs.flatMap((row) => (Array.isArray(row.media) ? row.media.map(num) : [])).filter(Boolean))];
  const capturedIds = new Set(captured.docs.map((row) => row.id));
  const assigned = assignedIds.filter((id) => !capturedIds.has(id)).length
    ? (await payload.find({ collection: "media", where: { id: { in: assignedIds.filter((id) => !capturedIds.has(id)) } }, limit: 200, ...as(ctx) })).docs
    : [];

  const live = await payload.find({
    collection: "live-updates",
    where: { and: [byStory, ...(manager || postLive ? [] : [{ or: [{ state: { equals: "published" } }, { author: { equals: ctx.user.id } }] }])] },
    limit: 100, sort: "-publishedAt", ...as(ctx)
  });

  const people = new Set<number>();
  for (const row of [...notesPage.docs, ...filesPage.docs]) people.add(num(row.createdBy));
  for (const row of [...captured.docs, ...assigned]) people.add(num(row.uploadedBy));
  for (const row of live.docs) people.add(num(row.author));
  people.delete(0);
  const users = people.size ? (await payload.find({ collection: "users", where: { id: { in: [...people] } }, pagination: false, select: { name: true }, req: ctx.req, overrideAccess: true, depth: 0 })).docs : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const person = (id: unknown): MaterialPerson | null => {
    const key = num(id);
    return key ? { id: key, name: names.get(key) ?? "Former newsroom member" } : null;
  };

  const notes: ReportingNoteMaterial[] = notesPage.docs.map((row) => ({
    kind: "note", key: `note:${row.id}`, id: row.id, occurredAt: iso(row.capturedAt ?? row.createdAt), author: person(row.createdBy), confidential: row.confidential === true,
    canEdit: canChangeMaterial(audience, row, row.createdBy), text: row.text, ...contextOf(row)
  }));
  const files: ReportingFileMaterial[] = filesPage.docs.map((row) => ({
    kind: "file", key: `file:${row.id}`, id: row.id, occurredAt: iso(row.capturedAt ?? row.createdAt), author: person(row.createdBy), confidential: row.confidential === true,
    canEdit: canChangeMaterial(audience, row, row.createdBy), fileKind: (row.kind ?? "other") as ReportingFileKind, filename: row.originalFilename || row.filename || "File",
    mimeType: row.mimeType ?? "", filesize: row.filesize ?? 0, durationMs: row.durationMs ?? null, url: row.url ?? "",
    groundRules: normalizeGroundRules(row.groundRules) as GroundRulesSnapshot, transcript: transcriptFor.get(row.id) ?? null, ...contextOf(row)
  }));
  const mediaItem = (row: (typeof captured.docs)[number], via: MediaMaterial["via"]): MediaMaterial => ({
    kind: "media", key: `media:${row.id}`, id: row.id, occurredAt: iso(row.capturedAt ?? row.createdAt), author: person(row.uploadedBy), confidential: false, canEdit: false,
    filename: row.filename ?? "Photo", previewUrl: (row.sizes as { library?: { url?: string | null } } | undefined)?.library?.url ?? row.thumbnailURL ?? null, alt: row.alt ?? "", via,
    source: null, appointment: null
  });
  const plan = plans.docs[0];
  const resources: ResourceMaterial[] = (plan?.resources ?? []).map((row, index) => ({
    kind: "resource", key: `resource:${row.id ?? index}`, id: index, occurredAt: iso(plan?.updatedAt), author: null, confidential: false, canEdit: manager,
    label: row.label, url: row.url, purpose: row.purpose ?? "other", source: null, appointment: null
  }));
  const liveItems: LiveUpdateMaterial[] = live.docs.map((row) => ({
    kind: "live", key: `live:${row.id}`, id: row.id, occurredAt: iso(row.publishedAt ?? row.createdAt), author: person(row.author), confidential: false, canEdit: false,
    text: [row.headline, lexicalToPlainText(row.body)].filter(Boolean).join(" — ").slice(0, 400), state: row.state === "draft" ? "draft" : "published", source: null, appointment: null
  }));

  const today = localDay(ctx.now, ctx.timeZone);
  const upNext = appointments
    .filter((appointment) => appointment.status !== "completed" && appointment.status !== "cancelled")
    .filter((appointment) => appointment.startAt ? appointment.startAt >= new Date(ctx.now.getTime() - 3 * 3600_000).toISOString() : (appointment.windowEnd ?? appointment.windowStart ?? today) >= today)
    .sort((a, b) => (a.startAt ?? `${a.windowStart ?? "9999"}T99`).localeCompare(b.startAt ?? `${b.windowStart ?? "9999"}T99`))
    .slice(0, 5);

  return {
    story: { id: storyId, headline: story.headline ?? "Untitled story", published: story._status === "published", liveState: liveSettings.mode === "live" ? liveSettings.state : "off" },
    capabilities: {
      capture: true,
      manage: manager,
      postLive,
      overrideOffRecord: atLeast(ctx.user, "editor")
    },
    upNext,
    sources,
    appointments,
    materials: sortMaterial([...notes, ...files, ...captured.docs.map((row) => mediaItem(row, "capture")), ...assigned.map((row) => mediaItem(row, "assignment")), ...resources, ...liveItems]),
    timeZone: ctx.timeZone
  };
}
