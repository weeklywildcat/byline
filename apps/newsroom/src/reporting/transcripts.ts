import { APIError, type Where } from "payload";
import { canChangeMaterial, reportingAudience, type ReportingAudience } from "../access/reporting-context";
import { atLeast, relationId } from "../access/user";
import { inTransaction, lockRow } from "../db/locks";
import { groundRuleLabel, normalizeGroundRules, quoteUse, REPORTING_LIMITS, type GroundRulesSnapshot, type QuoteUse } from "../domain/reporting";
import {
  editSegment,
  normalizeSegments,
  parseTranscriptFile,
  renameSpeaker,
  selectionFromSegments,
  speakersOf,
  TranscriptImportError,
  transcriptFormat,
  type TranscriptSegment
} from "../domain/transcript";
import { recordStoryActivity } from "../newsroom/story-activity";
import type { ScreenContext } from "../newsroom/screen-models";
import { existingCapture, resolveCaptureContext } from "./context";

/**
 * Transcripts, selections and verified quotes on the server
 * (docs/reporting.md#transcripts).
 *
 * Provenance chain, kept inspectable end to end:
 *
 *   Source → Appointment → Recording → Transcript → Selection → Verified quote
 *          → Reported Quote block → Published Story
 *
 * Each step inherits the step before (Story, Source, appointment, ground
 * rules, confidentiality) when it is made; nobody types them again.
 */

const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
const num = (value: unknown) => Number(relationId(value)) || 0;
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

async function audienceOf(ctx: ScreenContext): Promise<ReportingAudience> {
  const audience = await reportingAudience(ctx.req);
  if (!audience) throw new APIError("Sign in to use the newsroom.", 401);
  return audience;
}

export type SelectionView = {
  id: number;
  kind: "highlight" | "quote";
  text: string;
  attribution: string;
  speaker: string;
  startMs: number | null;
  endMs: number | null;
  segmentIds: string[];
  note: string;
  state: "saved" | "verified";
  verifiedBy: { id: number; name: string } | null;
  verifiedAt: string | null;
  groundRules: GroundRulesSnapshot;
  use: QuoteUse;
  offRecordOverride: { by: string; at: string; reason: string } | null;
  usedIn: Array<{ id: number; headline: string }>;
  createdAt: string;
  canEdit: boolean;
  transcriptId: number;
  fileId: number;
  audioUrl: string | null;
};

export type TranscriptDetail = {
  id: number;
  storyId: number;
  state: "queued" | "processing" | "ready" | "failed";
  origin: "machine" | "manual";
  provider: string | null;
  model: string | null;
  language: string | null;
  durationMs: number | null;
  updatedAt: string;
  editedAt: string | null;
  segments: TranscriptSegment[];
  speakers: string[];
  file: { id: number; filename: string; mimeType: string; url: string | null; kind: string; confidential: boolean };
  source: { id: number; label: string; role: string; organization: string; currentGroundRules: string } | null;
  appointment: { id: number; title: string } | null;
  groundRules: GroundRulesSnapshot;
  selections: SelectionView[];
  canEdit: boolean;
  canOverrideOffRecord: boolean;
};

async function namesFor(ctx: ScreenContext, ids: number[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<number, string>();
  const users = await ctx.req.payload.find({ collection: "users", where: { id: { in: unique } }, pagination: false, select: { name: true }, req: ctx.req, overrideAccess: true, depth: 0 });
  return new Map(users.docs.map((user) => [user.id, user.name]));
}

async function headlinesFor(ctx: ScreenContext, ids: number[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<number, string>();
  // Read as the person: a story they cannot see is never named.
  const stories = await ctx.req.payload.find({ collection: "stories", where: { id: { in: unique } }, pagination: false, draft: true, select: { headline: true }, ...as(ctx) });
  return new Map(stories.docs.map((story) => [story.id, story.headline]));
}

type SelectionRow = Record<string, unknown> & { id: number; story?: unknown; confidential?: unknown };

async function selectionViews(ctx: ScreenContext, audience: ReportingAudience, rows: SelectionRow[], files: Map<number, { url: string | null }>): Promise<SelectionView[]> {
  const names = await namesFor(ctx, rows.flatMap((row) => [num(row.verifiedBy), num((row.offRecordOverride as { by?: unknown } | undefined)?.by)]));
  const headlines = await headlinesFor(ctx, rows.flatMap((row) => (Array.isArray(row.usedIn) ? row.usedIn.map(num) : [])));
  return rows.map((row) => {
    const groundRules = normalizeGroundRules(row.groundRules);
    const override = row.offRecordOverride as { by?: unknown; at?: unknown; reason?: unknown } | undefined;
    const overridden = Boolean(override?.at);
    return {
      id: row.id,
      kind: row.kind === "highlight" ? "highlight" : "quote",
      text: String(row.text ?? ""),
      attribution: String(row.attribution ?? ""),
      speaker: String(row.speaker ?? ""),
      startMs: typeof row.startMs === "number" ? row.startMs : null,
      endMs: typeof row.endMs === "number" ? row.endMs : null,
      segmentIds: Array.isArray(row.segmentIds) ? (row.segmentIds as unknown[]).filter((id): id is string => typeof id === "string") : [],
      note: String(row.note ?? ""),
      state: row.state === "verified" ? "verified" : "saved",
      verifiedBy: num(row.verifiedBy) ? { id: num(row.verifiedBy), name: names.get(num(row.verifiedBy)) ?? "Former newsroom member" } : null,
      verifiedAt: typeof row.verifiedAt === "string" ? row.verifiedAt : null,
      groundRules,
      use: quoteUse(groundRules.rule, overridden),
      offRecordOverride: overridden ? { by: names.get(num(override?.by)) ?? "An editor", at: String(override?.at), reason: String(override?.reason ?? "") } : null,
      usedIn: (Array.isArray(row.usedIn) ? row.usedIn.map(num) : []).flatMap((id) => (headlines.has(id) ? [{ id, headline: headlines.get(id)! }] : [])),
      createdAt: String(row.createdAt ?? ""),
      canEdit: canChangeMaterial(audience, row, row.createdBy),
      transcriptId: num(row.transcript),
      fileId: num(row.file),
      audioUrl: files.get(num(row.file))?.url ?? null
    };
  });
}

/** The full transcript, loaded only when it is opened (the Reporting feed carries summaries). */
export async function transcriptDetail(ctx: ScreenContext, id: number): Promise<TranscriptDetail> {
  const audience = await audienceOf(ctx);
  const { payload } = ctx.req;
  const found = await payload.find({
    collection: "reporting-transcripts", where: { id: { equals: id } }, limit: 1,
    ...as(ctx), context: { bylineReadTranscriptDraft: true }
  });
  const row = found.docs[0];
  if (!row) throw new APIError("That transcript is not available.", 404);
  const fileFound = await payload.find({ collection: "reporting-files", where: { id: { equals: num(row.file) } }, limit: 1, ...as(ctx) });
  const file = fileFound.docs[0];
  if (!file) throw new APIError("That transcript is not available.", 404);
  const [source, appointment, selections] = await Promise.all([
    num(row.source) ? payload.find({ collection: "sources", where: { id: { equals: num(row.source) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null) : null,
    num(row.appointment) ? payload.find({ collection: "appointments", where: { id: { equals: num(row.appointment) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null) : null,
    payload.find({ collection: "transcript-selections", where: { transcript: { equals: id } }, pagination: false, sort: "startMs", ...as(ctx) })
  ]);
  const segments = normalizeSegments(row.segments);
  return {
    id: row.id,
    storyId: num(row.story),
    state: row.state,
    origin: row.origin,
    provider: row.provider ?? null,
    model: row.model ?? null,
    language: row.language ?? null,
    durationMs: row.durationMs ?? file.durationMs ?? null,
    updatedAt: row.updatedAt,
    editedAt: row.editedAt ?? null,
    segments,
    speakers: speakersOf(segments),
    file: { id: file.id, filename: file.originalFilename || file.filename || "Recording", mimeType: file.mimeType ?? "", url: file.kind === "audio" ? file.url ?? null : null, kind: file.kind, confidential: file.confidential === true },
    source: source ? { id: source.id, label: source.label, role: source.role ?? "", organization: source.organization ?? "", currentGroundRules: groundRuleLabel(source.groundRules) } : num(row.source) ? { id: num(row.source), label: "A source", role: "", organization: "", currentGroundRules: "" } : null,
    appointment: appointment ? { id: appointment.id, title: appointment.title } : null,
    groundRules: normalizeGroundRules(row.groundRules),
    selections: await selectionViews(ctx, audience, selections.docs as unknown as SelectionRow[], new Map([[file.id, { url: file.kind === "audio" ? file.url ?? null : null }]])),
    canEdit: canChangeMaterial(audience, row, row.createdBy),
    canOverrideOffRecord: atLeast(ctx.user, "editor")
  };
}

export type TranscriptEdit =
  | { segmentId: string; text?: string; speaker?: string | null; expectedUpdatedAt?: string }
  | { renameSpeaker: { from: string; to: string; key?: string | null }; expectedUpdatedAt?: string }
  | { language: string; expectedUpdatedAt?: string };

/**
 * Edits words or speakers. Timing and segment ids never change; a stale edit is
 * a 409, never an overwrite.
 *
 * Only a finished transcript is editable. The check and the write happen under
 * the transcript's row lock, the same lock a machine run takes to claim or
 * write the row, so a speaker rename can never interleave with machine partial
 * writes or a regenerate that is replacing the segments.
 */
export async function editTranscript(ctx: ScreenContext, id: number, input: TranscriptEdit): Promise<{ updatedAt: string; segments: TranscriptSegment[] }> {
  const { payload } = ctx.req;
  return inTransaction(ctx.req, async () => {
    await lockRow(ctx.req, "reporting_transcripts", id);
    const found = await payload.find({ collection: "reporting-transcripts", where: { id: { equals: id } }, limit: 1, ...as(ctx) });
    const row = found.docs[0];
    if (!row) throw new APIError("That transcript is not available.", 404);
    if (row.state !== "ready") throw new APIError("The transcript is not ready to edit yet.", 409);
    if (typeof input.expectedUpdatedAt === "string" && input.expectedUpdatedAt && Date.parse(input.expectedUpdatedAt) !== Date.parse(row.updatedAt)) {
      throw new APIError("Someone else changed this transcript. Reload to see their edit.", 409);
    }
    let segments = normalizeSegments(row.segments);
    const data: Record<string, unknown> = {};
    if ("segmentId" in input) {
      if (!segments.some((segment) => segment.id === input.segmentId)) throw new APIError("That passage is no longer in the transcript.", 404);
      segments = editSegment(segments, input.segmentId, { text: input.text, speaker: input.speaker });
      data.segments = segments;
    } else if ("renameSpeaker" in input) {
      const { from, to, key } = input.renameSpeaker;
      segments = renameSpeaker(segments, String(from ?? ""), String(to ?? ""), typeof key === "string" && key ? key : null);
      data.segments = segments;
    } else if ("language" in input) {
      data.language = /^[a-z]{2,3}$/.test(String(input.language)) ? input.language : null;
    }
    const updated = await payload.update({ collection: "reporting-transcripts", id, data, ...as(ctx) });
    return { updatedAt: updated.updatedAt, segments: normalizeSegments(updated.segments) };
  });
}

/**
 * Imports a reporter-provided transcript (.txt, .srt, .vtt). Attached to a recording when one is
 * named; otherwise the transcript file itself is kept as the private reporting
 * document the transcript belongs to. Either way it is an uploaded transcript.
 */
export async function importTranscript(ctx: ScreenContext, storyId: number, input: { fileId?: unknown; sourceId?: unknown; appointmentId?: unknown; confidential?: unknown; replace?: unknown; clientKey?: unknown }) {
  const upload = ctx.req.file;
  if (!upload) throw new APIError("Choose a .txt, .srt or .vtt transcript.", 400);
  const format = transcriptFormat(String(upload.name ?? ""), String(upload.mimetype ?? ""));
  if (!format) throw new APIError("Byline imports .txt, .srt and .vtt transcripts.", 400);
  let parsed;
  try {
    parsed = parseTranscriptFile(Buffer.from(upload.data).toString("utf8"), format);
  } catch (error) {
    throw new APIError(error instanceof TranscriptImportError ? error.message : "Byline could not read that transcript.", 400);
  }
  const { payload } = ctx.req;
  let fileId = Number(relationId(input.fileId)) || 0;
  let file: Record<string, unknown> | null = null;
  if (fileId) {
    const found = await payload.find({ collection: "reporting-files", where: { id: { equals: fileId } }, limit: 1, ...as(ctx) });
    file = (found.docs[0] ?? null) as unknown as Record<string, unknown> | null;
    if (!file || num(file.story) !== storyId) throw new APIError("That recording is not on this story.", 404);
  } else {
    // A transcript without its recording: the imported file is the reporting document it belongs to.
    const context = await resolveCaptureContext(ctx.req, { storyId, sourceId: input.sourceId, appointmentId: input.appointmentId });
    const existing = await existingCapture(ctx.req, "reporting-files", input.clientKey, "createdBy");
    if (existing) file = existing;
    else {
      file = (await payload.create({
        collection: "reporting-files",
        data: { story: storyId, source: context.source?.id ?? null, appointment: context.appointment?.id ?? null, confidential: input.confidential === true, groundRules: context.groundRules, ...(typeof input.clientKey === "string" ? { clientKey: input.clientKey } : {}) } as never,
        file: { ...upload, mimetype: format === "vtt" ? "text/vtt" : format === "srt" ? "application/x-subrip" : "text/plain" },
        ...as(ctx), context: { ...ctx.req.context, bylineSystem: true }
      })) as unknown as Record<string, unknown>;
    }
    fileId = Number(file.id);
  }
  const existingTranscript = (await payload.find({ collection: "reporting-transcripts", where: { file: { equals: fileId } }, limit: 1, ...as(ctx) })).docs[0];
  if (existingTranscript && existingTranscript.state === "ready" && input.replace !== true) throw new APIError("This recording already has a transcript. Choose Replace to import over it.", 409);
  const system = { ...as(ctx), context: { ...ctx.req.context, bylineSystem: true } };
  const completedAt = new Date().toISOString();
  const data = {
    state: "ready" as const,
    origin: "manual" as const,
    provider: null,
    model: null,
    language: parsed.language,
    durationMs: parsed.durationMs ?? (file?.durationMs as number | null) ?? null,
    segments: parsed.segments,
    completedAt,
    failure: null,
    // Replacing a legacy machine transcript clears obsolete automatic-run metadata while
    // preserving the transcript row and quote snapshots that point at it.
    transcriptionRunToken: null,
    transcriptionStartedAt: null,
    progressPercent: null,
    progressMessage: null,
    lastProgressAt: null
  };
  const saved = existingTranscript
    ? await payload.update({ collection: "reporting-transcripts", id: existingTranscript.id, data, ...system })
    : await payload.create({
      collection: "reporting-transcripts",
      data: { ...data, story: storyId, file: fileId, source: num(file?.source) || null, appointment: num(file?.appointment) || null, confidential: file?.confidential === true, groundRules: (file?.groundRules ?? null) as never },
      ...system
    });
  await recordStoryActivity(ctx.req, storyId, "transcript-imported", saved.id);
  return { transcriptId: saved.id, fileId, segments: parsed.segments.length };
}

/* ---------------------------------------------------------------- selections */

export type SelectionInput = { segmentIds?: unknown; text?: unknown; kind?: unknown; note?: unknown; attribution?: unknown };

/**
 * Saves a highlight or quote. The selection inherits Story, transcript,
 * recording, Source, ground rules, confidentiality and timing from the
 * transcript; attribution is the Source's name and role only when the
 * material is on the record (Byline never writes attribution for background).
 * Every saved quote starts unverified, regardless of where the transcript came from.
 */
export async function createSelection(ctx: ScreenContext, transcriptId: number, input: SelectionInput): Promise<SelectionView> {
  const audience = await audienceOf(ctx);
  const { payload } = ctx.req;
  const found = await payload.find({ collection: "reporting-transcripts", where: { id: { equals: transcriptId } }, limit: 1, ...as(ctx) });
  const transcript = found.docs[0];
  if (!transcript) throw new APIError("That transcript is not available.", 404);
  if (transcript.state !== "ready") throw new APIError("This transcript is not ready for quotes or highlights. Upload a replacement transcript first.", 409);
  const ids = Array.isArray(input.segmentIds) ? (input.segmentIds as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  const picked = selectionFromSegments(normalizeSegments(transcript.segments), ids, typeof input.text === "string" ? input.text : undefined);
  if (!picked) throw new APIError("Select the words to save.", 400);
  const groundRules = normalizeGroundRules(transcript.groundRules);
  let attribution = clean(input.attribution, 300);
  if (!attribution && groundRules.rule === "on-record" && num(transcript.source)) {
    const source = (await payload.find({ collection: "sources", where: { id: { equals: num(transcript.source) } }, limit: 1, depth: 0, overrideAccess: true, req: ctx.req })).docs[0];
    if (source) attribution = [source.label, source.role].filter(Boolean).join(", ").slice(0, 300);
  }
  const created = await payload.create({
    collection: "transcript-selections",
    data: {
      story: num(transcript.story), transcript: transcriptId, file: num(transcript.file), source: num(transcript.source) || null, kind: input.kind === "highlight" ? "highlight" : "quote",
      text: picked.text, attribution, speaker: picked.speaker ?? "", startMs: picked.startMs, endMs: picked.endMs, segmentIds: picked.segmentIds, note: clean(input.note, 2000),
      groundRules, confidential: transcript.confidential === true, state: "saved"
    } as never,
    ...as(ctx),
    context: { ...ctx.req.context, bylineSystem: true }
  });
  const file = (await payload.find({ collection: "reporting-files", where: { id: { equals: num(transcript.file) } }, limit: 1, ...as(ctx) })).docs[0];
  return (await selectionViews(ctx, audience, [created as unknown as SelectionRow], new Map(file ? [[file.id, { url: file.kind === "audio" ? file.url ?? null : null }]] : [])))[0];
}

export async function updateSelection(ctx: ScreenContext, id: number, input: SelectionInput) {
  const changesSnapshot = input.text !== undefined || input.attribution !== undefined || input.kind === "quote" || input.kind === "highlight";
  if (changesSnapshot) {
    const found = await ctx.req.payload.find({ collection: "transcript-selections", where: { id: { equals: id } }, limit: 1, select: { usedIn: true }, ...as(ctx) });
    const selection = found.docs[0];
    if (!selection) throw new APIError("That saved quote is not available.", 404);
    if (Array.isArray(selection.usedIn) && selection.usedIn.length > 0) {
      throw new APIError("This saved quote is used in an article. Remove it from the article before changing its words or attribution.", 409);
    }
  }

  const data: Record<string, unknown> = {};
  if (input.text !== undefined) {
    const text = clean(input.text, 4000);
    if (!text) throw new APIError("A quote needs words.", 400);
    data.text = text;
  }
  if (input.attribution !== undefined) data.attribution = clean(input.attribution, 300);
  if (input.note !== undefined) data.note = clean(input.note, 2000);
  if (input.kind === "quote" || input.kind === "highlight") data.kind = input.kind;
  const updated = await ctx.req.payload.update({ collection: "transcript-selections", id, data, ...as(ctx) });
  return { id: updated.id, state: updated.state };
}

export async function deleteSelection(ctx: ScreenContext, id: number) {
  const found = await ctx.req.payload.find({ collection: "transcript-selections", where: { id: { equals: id } }, limit: 1, select: { usedIn: true }, ...as(ctx) });
  const selection = found.docs[0];
  if (!selection) throw new APIError("That saved quote is not available.", 404);
  if (Array.isArray(selection.usedIn) && selection.usedIn.length > 0) {
    throw new APIError("This saved quote is used in an article. Remove it from the article before deleting it.", 409);
  }
  await ctx.req.payload.delete({ collection: "transcript-selections", id, ...as(ctx) });
  return { id };
}

/**
 * Verification is deliberate: the reporter listened to the source audio and
 * says these are the words. Uploading or editing a transcript never verifies
 * a quote; changing the saved words afterwards un-verifies them.
 */
export async function verifySelection(ctx: ScreenContext, id: number, verified: boolean) {
  const { payload } = ctx.req;
  const found = await payload.find({ collection: "transcript-selections", where: { id: { equals: id } }, limit: 1, ...as(ctx) });
  const row = found.docs[0];
  if (!row) throw new APIError("That quote is not available.", 404);
  // Update access is the check (creator, assigned editor, administrators, managers for normal material).
  const updated = await payload.update({
    collection: "transcript-selections", id,
    data: verified ? { state: "verified", verifiedBy: ctx.user.id as number, verifiedAt: new Date().toISOString(), kind: "quote" } : { state: "saved", verifiedBy: null, verifiedAt: null },
    ...as(ctx), context: { ...ctx.req.context, bylineVerification: true }
  });
  if (verified) await recordStoryActivity(ctx.req, row.story, "quote-verified", id);
  return { id, state: updated.state, verifiedAt: updated.verifiedAt ?? null };
}

/** The exceptional, audited override that lets off-the-record words be inserted: editors only, with a reason. */
export async function overrideOffRecord(ctx: ScreenContext, id: number, input: { reason?: unknown }) {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only an editor can approve public use of off-the-record material.", 403);
  const reason = clean(input.reason, 600);
  if (reason.length < 8) throw new APIError("Say why this off-the-record material may be used.", 400);
  const { payload } = ctx.req;
  const found = await payload.find({ collection: "transcript-selections", where: { id: { equals: id } }, limit: 1, ...as(ctx) });
  const row = found.docs[0];
  if (!row) throw new APIError("That quote is not available.", 404);
  if (normalizeGroundRules(row.groundRules).rule !== "off-record") throw new APIError("This material is not off the record.", 400);
  await payload.update({ collection: "transcript-selections", id, data: { offRecordOverride: { by: ctx.user.id as number, at: new Date().toISOString(), reason } }, overrideAccess: true, depth: 0, req: ctx.req, context: { ...ctx.req.context, bylineSystem: true } });
  await recordStoryActivity(ctx.req, row.story, "off-record-override", id);
  return { id };
}

/** Saved quotes for a Story, for the article editor's Reporting sheet: quotes only, verified first. */
export async function storyQuotes(ctx: ScreenContext, storyId: number): Promise<{ quotes: SelectionView[] }> {
  const audience = await audienceOf(ctx);
  const { payload } = ctx.req;
  const where: Where = { and: [{ story: { equals: storyId } }, { kind: { equals: "quote" } }] };
  const rows = await payload.find({ collection: "transcript-selections", where, limit: 200, sort: "-updatedAt", ...as(ctx) });
  const fileIds = [...new Set(rows.docs.map((row) => num(row.file)).filter(Boolean))];
  const files = fileIds.length ? (await payload.find({ collection: "reporting-files", where: { id: { in: fileIds } }, pagination: false, select: { url: true, kind: true, filename: true }, ...as(ctx) })).docs : [];
  const views = await selectionViews(ctx, audience, rows.docs as unknown as SelectionRow[], new Map(files.map((file) => [file.id, { url: file.kind === "audio" ? file.url ?? null : null }])));
  return { quotes: views.sort((a, b) => (a.state === b.state ? 0 : a.state === "verified" ? -1 : 1)) };
}

/**
 * Where a quote came from and where it is used: the private provenance an
 * editor reviews. Bounded: one selection and its indexed relationships; no
 * rich-text documents are scanned.
 */
export async function quoteProvenance(ctx: ScreenContext, id: number) {
  const audience = await audienceOf(ctx);
  const { payload } = ctx.req;
  const row = (await payload.find({ collection: "transcript-selections", where: { id: { equals: id } }, limit: 1, ...as(ctx) })).docs[0];
  if (!row) throw new APIError("That quote is not available.", 404);
  const [transcript, file] = await Promise.all([
    payload.find({ collection: "reporting-transcripts", where: { id: { equals: num(row.transcript) } }, limit: 1, select: { origin: true, provider: true, model: true, completedAt: true, appointment: true, source: true }, ...as(ctx) }).then((result) => result.docs[0] ?? null),
    payload.find({ collection: "reporting-files", where: { id: { equals: num(row.file) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null)
  ]);
  const [source, appointment] = await Promise.all([
    num(row.source) ? payload.find({ collection: "sources", where: { id: { equals: num(row.source) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null) : null,
    num(transcript?.appointment) ? payload.find({ collection: "appointments", where: { id: { equals: num(transcript?.appointment) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null) : null
  ]);
  const [view] = await selectionViews(ctx, audience, [row as unknown as SelectionRow], new Map(file ? [[file.id, { url: file.kind === "audio" ? file.url ?? null : null }]] : []));
  const names = await namesFor(ctx, [num(file?.createdBy)]);
  return {
    quote: view,
    source: source ? { id: source.id, label: source.label, role: source.role ?? "" } : null,
    appointment: appointment ? { id: appointment.id, title: appointment.title, startAt: appointment.startAt ?? null } : null,
    recording: file ? { id: file.id, filename: file.originalFilename || file.filename, capturedAt: file.capturedAt ?? file.createdAt, capturedBy: names.get(num(file.createdBy)) ?? null, url: file.kind === "audio" ? file.url ?? null : null } : null,
    transcript: transcript ? { id: transcript.id, origin: transcript.origin, provider: transcript.provider ?? null, model: transcript.model ?? null, completedAt: transcript.completedAt ?? null } : null
  };
}

export const SELECTION_TEXT_MAX = 4000;
export const NOTE_MAX = REPORTING_LIMITS.noteText;
