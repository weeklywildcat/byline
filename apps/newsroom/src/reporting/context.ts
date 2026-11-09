import { APIError, type CollectionSlug, type PayloadRequest } from "payload";
import { scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { relationId, requestUser, sameId, type NewsroomUser } from "../access/user";
import { normalizeGroundRules, validClientKey, type GroundRulesSnapshot } from "../domain/reporting";

/**
 * Context inheritance (docs/reporting.md#context-inheritance).
 *
 * > Never ask twice. If Byline already knows the Story, source, appointment,
 * > assignment or reporter, it carries that forward.
 *
 * Every capture path (the Reporting workspace, Field Mode, transcript import,
 * quote selection) resolves its context here, once, on the server. React
 * components pass what the screen was opened from (an appointment, a source);
 * they never re-derive relationships themselves.
 */

export type CaptureContextInput = {
  storyId: number;
  sourceId?: unknown;
  appointmentId?: unknown;
  assignmentId?: unknown;
  /** Photos: link the person's one open production assignment on the Story when that is unambiguous. */
  inferAssignment?: boolean;
};

export type CaptureContext = {
  storyId: number;
  user: NewsroomUser;
  manager: boolean;
  source: { id: number; label: string } | null;
  appointment: { id: number; title: string } | null;
  assignment: { id: number; title: string } | null;
  /** Ground rules in force now, from the Source: copied onto what is captured, never re-read later. */
  groundRules: GroundRulesSnapshot;
  capturedAt: string;
};

const positive = (value: unknown): number | null => {
  const number = Number(relationId(value));
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

async function one(req: PayloadRequest, collection: CollectionSlug, id: number) {
  const found = await req.payload.find({ collection, where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, req });
  return (found.docs[0] ?? null) as unknown as Record<string, unknown> | null;
}

export async function resolveCaptureContext(req: PayloadRequest, input: CaptureContextInput): Promise<CaptureContext> {
  const user = requestUser(req);
  const scope = await storyScope(req);
  if (!user || !scope) throw new APIError("Sign in to capture reporting.", 401);
  const manager = scopeManages(scope, input.storyId);
  if (!manager && !scopeParticipates(scope, input.storyId)) throw new APIError("You are not part of this story.", 403);

  let appointment: Record<string, unknown> | null = null;
  const appointmentId = positive(input.appointmentId);
  if (appointmentId !== null) {
    appointment = await one(req, "appointments", appointmentId);
    if (!appointment || !sameId(appointment.story, input.storyId)) throw new APIError("That appointment is not on this story.", 400);
  }

  // An appointment with a source carries it; an explicit, different source is a mistake, not a choice.
  const askedSource = positive(input.sourceId);
  const appointmentSource = appointment ? positive(appointment.source) : null;
  if (askedSource !== null && appointmentSource !== null && askedSource !== appointmentSource) throw new APIError("That appointment is with another source.", 400);
  const sourceId = askedSource ?? appointmentSource;
  let source: Record<string, unknown> | null = null;
  if (sourceId !== null) {
    source = await one(req, "sources", sourceId);
    if (!source || !sameId(source.story, input.storyId)) throw new APIError("That source is not on this story.", 400);
  }

  let assignment: Record<string, unknown> | null = null;
  const assignmentId = positive(input.assignmentId);
  if (assignmentId !== null) {
    assignment = await one(req, "production-assignments", assignmentId);
    if (!assignment || !sameId(assignment.story, input.storyId)) throw new APIError("That assignment is not on this story.", 400);
  } else if (input.inferAssignment) {
    const mine = await req.payload.find({
      collection: "production-assignments",
      where: { and: [{ story: { equals: input.storyId } }, { assignees: { in: [user.id] } }, { status: { not_in: ["done", "selected"] } }] },
      depth: 0, limit: 2, overrideAccess: true, req
    });
    // Only when unambiguous: one open assignment held by this person.
    if (mine.docs.length === 1) assignment = mine.docs[0] as unknown as Record<string, unknown>;
  }

  const capturedAt = new Date().toISOString();
  const groundRules = source
    ? normalizeGroundRules({ rule: source.groundRules, recordingPermission: source.recordingPermission, note: source.groundRulesNote, sourceId: source.id, capturedAt })
    : normalizeGroundRules({ capturedAt });

  return {
    storyId: input.storyId,
    user,
    manager,
    source: source ? { id: Number(source.id), label: String(source.label ?? "Source") } : null,
    appointment: appointment ? { id: Number(appointment.id), title: String(appointment.title ?? "Appointment") } : null,
    assignment: assignment ? { id: Number(assignment.id), title: String(assignment.title ?? "Assignment") } : null,
    groundRules,
    capturedAt
  };
}

/**
 * Idempotent capture (Field outbox retries): a record created with this
 * client key by this person, if any. Keys are unique per collection; a retry
 * after a lost response finds the record instead of making a second one.
 */
export async function existingCapture(req: PayloadRequest, collection: CollectionSlug, clientKey: unknown, creatorField: string): Promise<Record<string, unknown> | null> {
  const key = validClientKey(clientKey);
  const user = requestUser(req);
  if (!key || !user) return null;
  const found = await req.payload.find({ collection, where: { clientKey: { equals: key } }, depth: 0, limit: 1, overrideAccess: true, req });
  const row = (found.docs[0] ?? null) as unknown as Record<string, unknown> | null;
  if (!row) return null;
  // A key belongs to whoever first used it; anyone else reusing it is refused, never shown the record.
  if (!sameId(row[creatorField], user.id)) throw new APIError("That capture key is already in use.", 409);
  return row;
}

/** Whether an error is PostgreSQL's unique violation on a client key (a concurrent duplicate submission). */
export function isDuplicateKey(error: unknown): boolean {
  const text = `${(error as { message?: unknown })?.message ?? ""} ${(error as { cause?: { code?: unknown } })?.cause?.code ?? ""} ${(error as { code?: unknown })?.code ?? ""}`;
  return /23505|unique|duplicate/i.test(text) && /client_key|clientKey|unique/i.test(text);
}
