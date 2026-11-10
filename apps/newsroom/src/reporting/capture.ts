import { createHash } from "node:crypto";
import { APIError } from "payload";
import sharp from "sharp";
import { localToInstant } from "../domain/dates";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { assertNotRawPhoto, isHeifUpload } from "../media/heic";
import { exifCapturedAt } from "./exif";
import { REPORTING_LIMITS, validClientKey } from "../domain/reporting";
import { recordStoryActivity } from "../newsroom/story-activity";
import type { ScreenContext } from "../newsroom/screen-models";
import { existingCapture, isDuplicateKey, resolveCaptureContext } from "./context";

/**
 * Reporting captures on the server: notes and private files. Each resolves
 * its context once (`resolveCaptureContext`), writes as the signed-in person
 * so collection access applies, and is idempotent on the client key the Field
 * outbox sends (a retried request returns the first record, `duplicate: true`).
 */

const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });

const cleanText = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");

export type CaptureResult = { kind: "note" | "file" | "media" | "live"; id: number; duplicate: boolean; status: "saved" | "posted" | "sent-to-desk" };

export type NoteInput = { text?: unknown; sourceId?: unknown; appointmentId?: unknown; confidential?: unknown; clientKey?: unknown };

export async function createReportingNote(ctx: ScreenContext, storyId: number, input: NoteInput): Promise<CaptureResult> {
  const text = cleanText(input.text, REPORTING_LIMITS.noteText);
  if (!text) throw new APIError("Write the note first.", 400);
  const context = await resolveCaptureContext(ctx.req, { storyId, sourceId: input.sourceId, appointmentId: input.appointmentId });
  const clientKey = validClientKey(input.clientKey);
  const existing = await existingCapture(ctx.req, "reporting-notes", clientKey, "createdBy");
  if (existing) return { kind: "note", id: Number(existing.id), duplicate: true, status: "saved" };
  try {
    const created = await ctx.req.payload.create({
      collection: "reporting-notes",
      data: { story: storyId, text, source: context.source?.id ?? null, appointment: context.appointment?.id ?? null, confidential: input.confidential === true, ...(clientKey ? { clientKey } : {}) },
      ...as(ctx)
    });
    return { kind: "note", id: created.id, duplicate: false, status: "saved" };
  } catch (error) {
    if (clientKey && isDuplicateKey(error)) {
      const again = await existingCapture(ctx.req, "reporting-notes", clientKey, "createdBy");
      if (again) return { kind: "note", id: Number(again.id), duplicate: true, status: "saved" };
    }
    throw error;
  }
}

export async function updateReportingNote(ctx: ScreenContext, id: number, input: { text?: unknown; confidential?: unknown }) {
  const data: Record<string, unknown> = {};
  if (input.text !== undefined) {
    const text = cleanText(input.text, REPORTING_LIMITS.noteText);
    if (!text) throw new APIError("A note needs some text.", 400);
    data.text = text;
  }
  if (input.confidential !== undefined) data.confidential = input.confidential === true;
  const updated = await ctx.req.payload.update({ collection: "reporting-notes", id, data, ...as(ctx) });
  return { id: updated.id };
}

export async function deleteReportingMaterial(ctx: ScreenContext, collection: "reporting-notes" | "reporting-files", id: number) {
  await ctx.req.payload.delete({ collection, id, ...as(ctx) });
  return { id };
}

export type FileInput = { sourceId?: unknown; appointmentId?: unknown; confidential?: unknown; clientKey?: unknown; durationMs?: unknown; recording?: unknown };

/**
 * A private reporting file (an interview recording, a PDF, a document). The
 * file inherits Story, source, appointment, uploader, capture time and the
 * ground rules in force; a recording made from an appointment is attached to
 * it without anyone filing it.
 */
export async function uploadReportingFile(ctx: ScreenContext, storyId: number, input: FileInput): Promise<CaptureResult> {
  const file = ctx.req.file;
  if (!file) throw new APIError("Choose a file to add.", 400);
  if (typeof file.size === "number" && file.size > REPORTING_LIMITS.fileBytes) throw new APIError("That file is too large.", 413);
  const context = await resolveCaptureContext(ctx.req, { storyId, sourceId: input.sourceId, appointmentId: input.appointmentId });
  const clientKey = validClientKey(input.clientKey);
  const existing = await existingCapture(ctx.req, "reporting-files", clientKey, "createdBy");
  if (existing) return { kind: "file", id: Number(existing.id), duplicate: true, status: "saved" };
  const durationMs = Number(input.durationMs);
  const sha256 = file.data && file.data.length ? createHash("sha256").update(file.data).digest("hex") : null;
  try {
    const created = await ctx.req.payload.create({
      collection: "reporting-files",
      data: {
        story: storyId, source: context.source?.id ?? null, appointment: context.appointment?.id ?? null, confidential: input.confidential === true,
        ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs: Math.round(durationMs) } : {}),
        ...(clientKey ? { clientKey } : {}),
        // Facts the system records (field access lets only the system write them), in the same write as the file.
        groundRules: context.groundRules, ...(sha256 ? { sha256 } : {})
      } as never,
      file,
      ...as(ctx),
      context: { ...ctx.req.context, bylineSystem: true }
    });
    await recordStoryActivity(ctx.req, storyId, created.kind === "audio" ? "recording-captured" : "file-captured", created.id);
    return { kind: "file", id: created.id, duplicate: false, status: "saved" };
  } catch (error) {
    if (clientKey && isDuplicateKey(error)) {
      const again = await existingCapture(ctx.req, "reporting-files", clientKey, "createdBy");
      if (again) return { kind: "file", id: Number(again.id), duplicate: true, status: "saved" };
    }
    throw error;
  }
}

export async function updateReportingFile(ctx: ScreenContext, id: number, input: { confidential?: unknown }) {
  if (input.confidential === undefined) return { id };
  const updated = await ctx.req.payload.update({ collection: "reporting-files", id, data: { confidential: input.confidential === true }, ...as(ctx) });
  return { id: updated.id };
}

/** Ground rules are recorded on the Source by the people who manage the Story (the Source's own access). */
export async function setSourceGroundRules(ctx: ScreenContext, sourceId: number, input: { groundRules?: unknown; recordingPermission?: unknown; note?: unknown }) {
  const data: Record<string, unknown> = {};
  if (input.groundRules !== undefined) {
    if (!["unspecified", "on-record", "background", "off-record"].includes(String(input.groundRules))) throw new APIError("Choose the ground rules.", 400);
    data.groundRules = input.groundRules;
  }
  if (input.recordingPermission !== undefined) data.recordingPermission = input.recordingPermission === true;
  if (input.note !== undefined) data.groundRulesNote = cleanText(input.note, REPORTING_LIMITS.groundRulesNote);
  const updated = await ctx.req.payload.update({ collection: "sources", id: sourceId, data, ...as(ctx) });
  return { id: updated.id, groundRules: updated.groundRules, recordingPermission: updated.recordingPermission === true, groundRulesNote: updated.groundRulesNote ?? "" };
}

/* ------------------------------------------------------------------ photos */

export type PhotoInput = { assignmentId?: unknown; clientKey?: unknown; capturedAt?: unknown };

/**
 * A photograph for the Story. Photos go to Media, the one asset system
 * (never a private reporting file), carrying what Byline already knows: the
 * uploader, the Story, the person's one open production assignment on it when
 * that is unambiguous, the original file's hash, the capture time from EXIF
 * (else the device's file time), and, for staff photography, the
 * photographer's Person name as creator and credit. Rights and alt text stay
 * deliberate: an outside photo is never marked cleared because it uploaded.
 */
export async function uploadCapturePhoto(ctx: ScreenContext, storyId: number, input: PhotoInput): Promise<CaptureResult & { assignment: { id: number; title: string } | null }> {
  const file = ctx.req.file;
  if (!file) throw new APIError("Choose a photo.", 400);
  assertNotRawPhoto(file);
  // iPhone cameras (and some browsers' file pickers) send HEIC with no type or a generic one; Media decodes it to JPEG.
  if (!String(file.mimetype ?? "").toLowerCase().startsWith("image/") && !isHeifUpload(file)) throw new APIError("That file is not a photo. Attach it as a file instead.", 400);
  const context = await resolveCaptureContext(ctx.req, { storyId, assignmentId: input.assignmentId, inferAssignment: true });
  const { payload } = ctx.req;
  const clientKey = validClientKey(input.clientKey);
  if (clientKey) {
    const found = await payload.find({ collection: "media", where: { "capture.clientKey": { equals: clientKey } }, depth: 0, limit: 1, overrideAccess: true, req: ctx.req });
    const existing = found.docs[0];
    if (existing) {
      if (String(existing.uploadedBy) !== String(ctx.user.id)) throw new APIError("That capture key is already in use.", 409);
      return { kind: "media", id: existing.id, duplicate: true, status: "saved", assignment: context.assignment };
    }
  }
  const originalHash = createHash("sha256").update(file.data).digest("hex");
  let capturedAt: string | null = null;
  try {
    const metadata = await sharp(file.data).metadata();
    const local = exifCapturedAt(metadata.exif);
    if (local) capturedAt = localToInstant(local, ctx.timeZone);
  } catch {
    capturedAt = null;
  }
  if (!capturedAt && typeof input.capturedAt === "string" && !Number.isNaN(Date.parse(input.capturedAt))) capturedAt = new Date(input.capturedAt).toISOString();
  const person = ctx.user.linkedPerson === null ? null : await payload.findByID({ collection: "people", id: ctx.user.linkedPerson, depth: 0, overrideAccess: true, req: ctx.req, disableErrors: true, select: { name: true } });
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload, ctx.req), 0);
  const name = typeof person?.name === "string" ? person.name : "";
  const created = await payload.create({
    collection: "media",
    data: {
      ...(name ? { creator: name.slice(0, 160), credit: `${name} / ${publication.identity.name}`.slice(0, 200) } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      capture: { story: storyId, assignment: context.assignment?.id ?? null, originalHash, ...(clientKey ? { clientKey } : {}) }
    } as never,
    file,
    ...as(ctx),
    context: { ...ctx.req.context, bylineSystem: true }
  });
  if (context.assignment) {
    const assignment = await payload.findByID({ collection: "production-assignments", id: context.assignment.id, depth: 0, overrideAccess: true, req: ctx.req });
    const media = [...new Set([...(assignment.media ?? []).map((entry) => Number(typeof entry === "object" && entry ? entry.id : entry)), created.id])];
    await payload.update({ collection: "production-assignments", id: context.assignment.id, data: { media, ...(assignment.status === "assigned" || assignment.status === "needed" ? { status: "uploaded" } : {}) }, overrideAccess: true, depth: 0, req: ctx.req, context: { ...ctx.req.context, bylineSystem: true } });
  }
  return { kind: "media", id: created.id, duplicate: false, status: "saved", assignment: context.assignment };
}
