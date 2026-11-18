import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { APIError, logoutOperation, type Payload, type PayloadHandler, type PayloadRequest } from "payload";
import { generateExpiredPayloadCookie } from "payload/shared";
import { relationId } from "../access/user";
import { body } from "../newsroom/http";
import type { ScreenContext } from "../newsroom/screen-models";
import { canInterview, canRunSession } from "./access";
import { POLL_LOCATIONS, POLL_SURVEYS } from "./collections";
import { pollPairingLimits, pollPublicStarts, pollResponses, pollSessionEvents, pollSessions } from "./db";
import { checkSubmission } from "./engine/logic";
import {
  expiredKioskCookie, hashPin, hashToken, kioskCookie, kioskTokenFrom, KIOSK_LIFETIME_MS, KIOSK_UNLOCK_MS, newToken, normalizeAccessCode, outboxKey,
  PIN_ATTEMPTS, PIN_LOCK_MS, PIN_PATTERN, PIN_REVOKE_AFTER, publicStartToken, verifyPin, verifySecret
} from "./kiosk";
import { formatPairingCode, hashPairingCode, newPairingCode, normalizePairingCode, PAIRING_FAILURES_PER_WINDOW, PAIRING_WINDOW_MS, pairingExpiry, pairingWindow } from "./pairing";
import { projectRespondent } from "./media";
import { abandonTicket, endSession, eventCounts, loadSession, loadSurvey, loadVersion, pollDb, versionDefinition, type SurveyDoc } from "./server";

/**
 * Fieldwork (docs/wildcat-polls.md#kiosk): handing a device to students.
 *
 * There are two bridges from a signed-in account to a kiosk, and both issue a
 * credential for one session only:
 *
 * - Pairing (recommended): the interviewer prepares a short, single-use code
 *   on their own signed-in device (`preparePairing`); the iPad types it at
 *   `/poll` (`claimPairing`) without ever signing in, and starts locked.
 * - Use this device: `startKiosk` turns the signed-in device itself into the
 *   kiosk and, in the same response, ends its Byline session (Payload removes
 *   the session server-side and the cookie is expired).
 *
 * Either way nothing on the iPad can reach the newsroom. The kiosk endpoints
 * accept only that credential and only act on its session. Respondents can submit; only the interviewer, after a
 * server-checked PIN, can record a refusal, start a survey, pause, move or end.
 */

type Session = Awaited<ReturnType<typeof loadSession>>;
type KioskMode = "locked" | "interviewer" | "respondent";

const json = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
};

async function bodyOf<T>(req: PayloadRequest): Promise<T> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new APIError("Send JSON.", 415);
  return body<T>(req);
}

/** Errors as the newsroom API reports them, without requiring a signed-in account. */
function respond(run: (req: PayloadRequest) => Promise<unknown>): PayloadHandler {
  return async (req) => {
    try {
      const result = await run(req);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      const status = error instanceof APIError ? error.status : 500;
      if (status >= 500) req.payload.logger.error({ err: error, msg: "Poll fieldwork request failed" });
      const data = error instanceof APIError && error.data && typeof error.data === "object" ? error.data : {};
      return json({ message: status >= 500 ? "Byline couldn't save that. Try again." : (error as Error).message, code: `byline_${status}`, data: { ...data, status } }, status);
    }
  };
}

/* ------------------------------------------------------------------ handoff */

/** The interviewer's PIN, chosen for one session: digits only, and not a trivial run. */
function newPin(value: unknown): string {
  const pin = String(value ?? "");
  if (!PIN_PATTERN.test(pin)) throw new APIError("Choose a PIN of 4 to 8 digits.", 400);
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) throw new APIError("Choose a PIN that isn't a repeated or straight run of digits.", 400);
  return pin;
}

/** A session a signed-in account may put on a device: theirs (or any, for an editor), still running, for an open poll. */
async function sessionForDevice(ctx: ScreenContext, req: PayloadRequest, sessionId: string) {
  const session = await loadSession(req.payload, sessionId);
  if (!canRunSession(ctx.user, session)) throw new APIError("Only this session's interviewer can put it on a device.", 403);
  if (session.status === "ended") throw new APIError("This session has ended. Start a new one.", 409);
  const survey = await loadSurvey(req.payload, session.surveyId, req);
  if (!canInterview(ctx.user, survey) || survey.status !== "open" || survey.kioskEnabled === false) throw new APIError("This poll is not open for fieldwork.", 409);
  return session;
}

const deviceRunning = (session: Session, now: Date) => Boolean(session.kioskTokenHash && session.kioskExpiresAt && session.kioskExpiresAt > now);
const noPairing = { pairingCodeHash: null, pairingExpiresAt: null, pairingPinHash: null, pairingReplaces: false } as const;

/**
 * Signed in → kiosk. The PIN is the interviewer's, chosen now; it is never
 * their Byline password. Re-running this for a session (a reload lost the
 * cookie, or a new device) revokes the previous kiosk credential.
 */
export async function startKiosk(ctx: ScreenContext, req: PayloadRequest, sessionId: string, input: { pin?: unknown }) {
  await sessionForDevice(ctx, req, sessionId);
  const pin = newPin(input.pin);
  const token = newToken();
  const now = new Date();
  const expires = new Date(now.getTime() + KIOSK_LIFETIME_MS);
  const db = await pollDb(req.payload);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(pollSessions).where(eq(pollSessions.id, sessionId)).for("update");
    if (locked?.kioskTicket) await abandonTicket(tx as never, locked, locked.kioskTicket, now);
    await tx.update(pollSessions).set({
      kioskTokenHash: hashToken(token), kioskExpiresAt: expires, kioskPinHash: await hashPin(pin), kioskMode: "interviewer",
      kioskUnlockedUntil: new Date(now.getTime() + KIOSK_UNLOCK_MS), kioskTicket: null, pinFailures: 0, pinLockedUntil: null, ...noPairing, updatedAt: now
    }).where(eq(pollSessions.id, sessionId));
  });
  // End this device's Byline session on the server, then expire its cookie.
  const users = req.payload.collections.users;
  await logoutOperation({ collection: users, req, allSessions: false });
  const signedOut = generateExpiredPayloadCookie({ collectionAuthConfig: users.config.auth, cookiePrefix: req.payload.config.cookiePrefix }) as string;
  req.payload.logger.info({ msg: "Poll kiosk started", sessionId, userId: ctx.user.id });
  return json({ kiosk: "/polls/kiosk" }, 200, [signedOut, kioskCookie(token, expires)]);
}

/* ------------------------------------------------------------------ pairing */

/**
 * Prepares a pairing code for a session (docs/wildcat-polls.md#pairing-a-device).
 * The interviewer chooses the PIN now; it takes effect on the device that
 * claims the code (a replacement code for one not yet used may keep it). The
 * interviewer also chooses how long the code lasts, up to two days. A new code replaces any earlier one for the session. When a
 * device is already running the session, pairing another one stops it, so that
 * has to be asked for (`replaceDevice`).
 */
export async function preparePairing(ctx: ScreenContext, req: PayloadRequest, sessionId: string, input: { pin?: unknown; replaceDevice?: unknown; expiresInMinutes?: unknown }) {
  const session = await sessionForDevice(ctx, req, sessionId);
  const now = new Date();
  const replaces = deviceRunning(session, now);
  if (replaces && input.replaceDevice !== true) throw new APIError("This session is already running on a device. Pairing another device stops that one.", 409, { deviceRunning: true });
  // A fresh code for a pairing that hasn't been used yet may keep the PIN already chosen for it.
  const keepPin = (input.pin === undefined || input.pin === "") && session.pairingPinHash;
  const pinHash = keepPin ? session.pairingPinHash! : await hashPin(newPin(input.pin));
  const expiresAt = pairingExpiry(now, input.expiresInMinutes);
  const db = await pollDb(req.payload);
  for (let attempt = 0; ; attempt++) {
    const code = newPairingCode();
    try {
      await db.update(pollSessions).set({ pairingCodeHash: hashPairingCode(req.payload.secret, code), pairingExpiresAt: expiresAt, pairingPinHash: pinHash, pairingReplaces: replaces, updatedAt: now }).where(eq(pollSessions.id, session.id));
      req.payload.logger.info({ msg: "Poll pairing code prepared", sessionId: session.id, userId: ctx.user.id, replaces });
      return { code: formatPairingCode(code), expiresAt: expiresAt.toISOString(), replaces };
    } catch (error) {
      // Another live code has the same hash (vanishingly rare): draw again.
      if (attempt >= 3 || !/unique|duplicate/i.test(String((error as Error).message))) throw error;
    }
  }
}

/** Withdraws a session's pairing code before anyone uses it. */
export async function cancelPairing(ctx: ScreenContext, req: PayloadRequest, sessionId: string) {
  const session = await loadSession(req.payload, sessionId);
  if (!canRunSession(ctx.user, session)) throw new APIError("Only this session's interviewer can do that.", 403);
  const db = await pollDb(req.payload);
  await db.update(pollSessions).set({ ...noPairing, updatedAt: new Date() }).where(eq(pollSessions.id, session.id));
  return { cancelled: true };
}

async function pairingThrottled(db: Awaited<ReturnType<typeof pollDb>>, now: Date): Promise<boolean> {
  const [row] = await db.select({ failures: pollPairingLimits.failures }).from(pollPairingLimits).where(eq(pollPairingLimits.windowStart, pairingWindow(now))).limit(1);
  return (row?.failures ?? 0) >= PAIRING_FAILURES_PER_WINDOW;
}

async function recordPairingFailure(db: Awaited<ReturnType<typeof pollDb>>, now: Date) {
  await db.insert(pollPairingLimits).values({ windowStart: pairingWindow(now), failures: 1 })
    .onConflictDoUpdate({ target: pollPairingLimits.windowStart, set: { failures: sql`${pollPairingLimits.failures} + 1` } });
  await db.delete(pollPairingLimits).where(lt(pollPairingLimits.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}

const PAIRING_REFUSED = "That code didn't work. Check it, or ask the interviewer for a new one.";

/**
 * `/poll`: an anonymous device types a pairing code. A good code is spent at
 * once and the device receives the session's kiosk credential, starting
 * locked behind the interviewer's PIN. Nothing about the poll, its responses
 * or anyone's account is returned, and a refused code says only that it
 * didn't work. Failed tries are throttled across the newsroom.
 */
export async function claimPairing(req: PayloadRequest) {
  const input = await bodyOf<{ code?: unknown }>(req);
  const now = new Date();
  const db = await pollDb(req.payload);
  if (await pairingThrottled(db, now)) {
    const retryAfter = Math.ceil((pairingWindow(now).getTime() + PAIRING_WINDOW_MS - now.getTime()) / 1000);
    throw new APIError("Too many wrong codes have been tried. Wait a few minutes, then enter the code again.", 429, { retryAfter });
  }
  const code = normalizePairingCode(input.code);
  if (!code) {
    await recordPairingFailure(db, now);
    throw new APIError(PAIRING_REFUSED, 400);
  }
  const hash = hashPairingCode(req.payload.secret, code);
  const token = newToken();
  const expires = new Date(now.getTime() + KIOSK_LIFETIME_MS);
  let outcome: "paired" | "unknown" | "refused" = "unknown";
  let refusal = PAIRING_REFUSED;
  let sessionId = "";
  await db.transaction(async (tx) => {
    const [session] = await tx.select().from(pollSessions).where(eq(pollSessions.pairingCodeHash, hash)).for("update");
    if (!session) return;
    // A code is spent by the first try that finds it, whatever happens next.
    await tx.update(pollSessions).set({ ...noPairing, updatedAt: now }).where(eq(pollSessions.id, session.id));
    if (!session.pairingExpiresAt || session.pairingExpiresAt <= now || session.status === "ended" || !session.pairingPinHash) return;
    const survey = await loadSurvey(req.payload, session.surveyId);
    if (survey.status !== "open" || survey.kioskEnabled === false) { outcome = "refused"; refusal = "This poll isn't open for fieldwork any more."; return; }
    if (deviceRunning(session, now) && !session.pairingReplaces) { outcome = "refused"; refusal = "This session started on another device after the code was made. Ask the interviewer for a new code."; return; }
    if (session.kioskTicket) await abandonTicket(tx as never, session, session.kioskTicket, now);
    await tx.update(pollSessions).set({
      kioskTokenHash: hashToken(token), kioskExpiresAt: expires, kioskPinHash: session.pairingPinHash, kioskMode: "locked",
      kioskUnlockedUntil: null, kioskTicket: null, pinFailures: 0, pinLockedUntil: null, updatedAt: now
    }).where(eq(pollSessions.id, session.id));
    outcome = "paired";
    sessionId = session.id;
  });
  if (outcome === "unknown") {
    await recordPairingFailure(db, now);
    throw new APIError(PAIRING_REFUSED, 400);
  }
  if (outcome === "refused") throw new APIError(refusal, 409);
  // A kiosk never shares a browser with a Byline sign-in: end one if this device had it.
  const users = req.payload.collections.users;
  if (req.user) await logoutOperation({ collection: users, req, allSessions: false }).catch(() => undefined);
  const signedOut = generateExpiredPayloadCookie({ collectionAuthConfig: users.config.auth, cookiePrefix: req.payload.config.cookiePrefix }) as string;
  req.payload.logger.info({ msg: "Poll kiosk paired", sessionId });
  return json({ kiosk: "/polls/kiosk" }, 200, [signedOut, kioskCookie(token, expires)]);
}

/* ------------------------------------------------------------------ kiosk context */

async function kioskSession(req: PayloadRequest): Promise<Session> {
  const token = kioskTokenFrom(req);
  if (!token) throw new APIError("This device isn't running a poll. Pair it with a code from Poll Studio to start one.", 401);
  const db = await pollDb(req.payload);
  const [session] = await db.select().from(pollSessions).where(and(eq(pollSessions.kioskTokenHash, hashToken(token)), gt(pollSessions.kioskExpiresAt, new Date()))).limit(1);
  if (!session || session.status === "ended") throw new APIError("This polling session has ended on this device. Pair it again with a new code to keep polling.", 401);
  return session;
}

function modeOf(session: Session, now: Date): KioskMode {
  if (session.kioskMode === "interviewer" && (!session.kioskUnlockedUntil || session.kioskUnlockedUntil <= now)) return "locked";
  return session.kioskMode;
}

function requireInterviewer(session: Session, now: Date) {
  if (modeOf(session, now) !== "interviewer") throw new APIError("Enter the interviewer PIN first.", 423);
}

async function touch(payload: Payload, session: Session, now: Date, set: Partial<typeof pollSessions.$inferInsert> = {}) {
  const db = await pollDb(payload);
  await db.update(pollSessions).set({ kioskUnlockedUntil: new Date(now.getTime() + KIOSK_UNLOCK_MS), updatedAt: now, ...set }).where(eq(pollSessions.id, session.id));
}

const EVENT_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const TICKET = /^[0-9a-f-]{36}$/;

function eventKey(value: unknown): string {
  const key = String(value ?? "");
  if (!EVENT_KEY.test(key)) throw new APIError("Missing request key.", 400);
  return key;
}

export async function kioskState(req: PayloadRequest) {
  const session = await kioskSession(req);
  const now = new Date();
  const survey = await loadSurvey(req.payload, session.surveyId, req);
  const version = await loadVersion(req.payload, session.versionId, req);
  const counts = (await eventCounts(req.payload, [session.id])).get(session.id) ?? { started: 0, declined: 0, completed: 0, abandoned: 0 };
  const mode = modeOf(session, now);
  let ticket: { id: string; submitted: boolean } | null = null;
  if (mode === "respondent" && session.kioskTicket) {
    const db = await pollDb(req.payload);
    const [response] = await db.select({ id: pollResponses.id }).from(pollResponses).where(eq(pollResponses.ticket, session.kioskTicket)).limit(1);
    ticket = { id: session.kioskTicket, submitted: Boolean(response) };
  }
  const { docs: locations } = await req.payload.find({ collection: POLL_LOCATIONS, where: { active: { equals: true } }, pagination: false, sort: "name", overrideAccess: true, depth: 0 });
  return {
    session: { id: session.id, status: session.status, locationId: session.locationId, locationName: session.locationName, period: session.period, method: session.method, startedAt: session.startedAt.toISOString() },
    survey: { id: survey.id, title: survey.title, open: survey.status === "open" },
    version: { id: version.id, number: version.number },
    ...projectRespondent(req, version),
    counts,
    mode,
    ticket,
    unlockedUntil: mode === "interviewer" ? session.kioskUnlockedUntil?.toISOString() ?? null : null,
    pinLockedUntil: session.pinLockedUntil && session.pinLockedUntil > now ? session.pinLockedUntil.toISOString() : null,
    outboxKey: outboxKey(req.payload.secret, session.id),
    locations: locations.map((location) => ({ id: location.id, name: String((location as { name: string }).name) })),
    now: now.toISOString()
  };
}

/**
 * The PIN returns the device to the interviewer. A survey in progress is
 * closed first: `pending` when its answers are waiting to upload on the device,
 * `abandon` when the respondent stopped.
 */
export async function kioskUnlock(req: PayloadRequest) {
  const session = await kioskSession(req);
  const input = await bodyOf<{ pin?: unknown; ticketOutcome?: unknown }>(req);
  const now = new Date();
  if (session.pinLockedUntil && session.pinLockedUntil > now) throw new APIError("Too many wrong PINs. Wait a moment and try again.", 429, { lockedUntil: session.pinLockedUntil.toISOString() });
  const db = await pollDb(req.payload);
  if (!(await verifyPin(String(input.pin ?? ""), session.kioskPinHash))) {
    const failures = session.pinFailures + 1;
    if (failures >= PIN_REVOKE_AFTER) {
      await endSessionKiosk(req.payload, session, now);
      throw new APIError("Too many wrong PINs: this device has been signed out of the session. The interviewer can pair it again from Poll Studio.", 401);
    }
    const lockedUntil = failures % PIN_ATTEMPTS === 0 ? new Date(now.getTime() + PIN_LOCK_MS * 2 ** (failures / PIN_ATTEMPTS - 1)) : null;
    await db.update(pollSessions).set({ pinFailures: failures, pinLockedUntil: lockedUntil, updatedAt: now }).where(eq(pollSessions.id, session.id));
    throw new APIError(lockedUntil ? "Too many wrong PINs. Wait a moment and try again." : "That PIN isn't right.", lockedUntil ? 429 : 403, { lockedUntil: lockedUntil?.toISOString() ?? null, attemptsLeft: PIN_ATTEMPTS - (failures % PIN_ATTEMPTS) });
  }
  await db.transaction(async (tx) => {
    if (session.kioskTicket && input.ticketOutcome !== "pending") await abandonTicket(tx as never, session, session.kioskTicket, now);
    await tx.update(pollSessions).set({ kioskMode: "interviewer", kioskTicket: null, kioskUnlockedUntil: new Date(now.getTime() + KIOSK_UNLOCK_MS), pinFailures: 0, pinLockedUntil: null, updatedAt: now }).where(eq(pollSessions.id, session.id));
  });
  return kioskState(req);
}

/** Puts the interviewer controls behind the PIN again (the Lock button, or idle). */
export async function kioskLock(req: PayloadRequest) {
  const session = await kioskSession(req);
  const db = await pollDb(req.payload);
  if (session.kioskMode === "interviewer") await db.update(pollSessions).set({ kioskMode: "locked", kioskUnlockedUntil: null, updatedAt: new Date() }).where(eq(pollSessions.id, session.id));
  return kioskState(req);
}

/** A refusal: nothing about the person, only that one happened, here, now. */
export async function kioskDecline(req: PayloadRequest) {
  const session = await kioskSession(req);
  const now = new Date();
  requireInterviewer(session, now);
  if (session.status !== "active") throw new APIError("Resume the session first.", 409);
  const { eventKey: key } = await bodyOf<{ eventKey?: unknown }>(req);
  const db = await pollDb(req.payload);
  await db.insert(pollSessionEvents).values({ sessionId: session.id, surveyId: session.surveyId, kind: "declined", eventKey: eventKey(key), locationName: session.locationName, occurredAt: now }).onConflictDoNothing();
  await touch(req.payload, session, now);
  return kioskState(req);
}

/** "Student agreed": a new ticket, and the device becomes the respondent's. */
export async function kioskBegin(req: PayloadRequest) {
  const session = await kioskSession(req);
  const now = new Date();
  const { eventKey: raw } = await bodyOf<{ eventKey?: unknown }>(req);
  const key = eventKey(raw);
  const db = await pollDb(req.payload);
  // A retried request returns the ticket it already created.
  const [existing] = await db.select({ ticket: pollSessionEvents.ticket }).from(pollSessionEvents).where(and(eq(pollSessionEvents.eventKey, key), eq(pollSessionEvents.sessionId, session.id))).limit(1);
  if (existing) return kioskState(req);
  requireInterviewer(session, now);
  if (session.status !== "active") throw new APIError("Resume the session first.", 409);
  const survey = await loadSurvey(req.payload, session.surveyId, req);
  if (survey.status !== "open") throw new APIError("This poll has been closed.", 409);
  const ticket = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(pollSessionEvents).values({ sessionId: session.id, surveyId: session.surveyId, kind: "started", eventKey: key, ticket, locationName: session.locationName, occurredAt: now });
    await tx.update(pollSessions).set({ kioskMode: "respondent", kioskTicket: ticket, kioskUnlockedUntil: null, updatedAt: now }).where(eq(pollSessions.id, session.id));
  });
  return kioskState(req);
}

type SubmitInput = { ticket?: unknown; submissionId?: unknown; answers?: unknown; startedAt?: unknown; durationMs?: unknown };

/**
 * A respondent's answers. Accepted for a ticket this session started and that
 * has not ended as abandoned, in any kiosk mode, so a queued upload still lands
 * after the interviewer has moved on. Idempotent on `submissionId`.
 */
export async function kioskSubmit(req: PayloadRequest) {
  const session = await kioskSession(req);
  const input = await bodyOf<SubmitInput>(req);
  const submissionId = String(input.submissionId ?? "");
  const ticket = String(input.ticket ?? "");
  if (!EVENT_KEY.test(submissionId) || !TICKET.test(ticket)) throw new APIError("Missing submission keys.", 400);
  const db = await pollDb(req.payload);
  const [already] = await db.select({ id: pollResponses.id, ticket: pollResponses.ticket }).from(pollResponses).where(eq(pollResponses.submissionId, submissionId)).limit(1);
  if (already) {
    if (already.ticket !== ticket) throw new APIError("This submission key was already used.", 409);
    return { status: "saved", id: already.id };
  }
  const events = await db.select({ kind: pollSessionEvents.kind }).from(pollSessionEvents).where(and(eq(pollSessionEvents.sessionId, session.id), eq(pollSessionEvents.ticket, ticket)));
  if (!events.some((event) => event.kind === "started")) throw new APIError("This survey wasn't started on this device.", 409);
  if (events.some((event) => event.kind === "abandoned")) throw new APIError("This survey was ended as incomplete, so its answers weren't saved.", 409, { discard: true });
  const version = await loadVersion(req.payload, session.versionId, req);
  const check = checkSubmission(versionDefinition(version), input.answers);
  if (!check.ok) throw new APIError("Some answers don't match this poll.", 422, { errors: check.errors.slice(0, 20), discard: true });
  const now = new Date();
  const startedAt = typeof input.startedAt === "string" && !Number.isNaN(Date.parse(input.startedAt)) ? new Date(input.startedAt) : null;
  const durationMs = Number.isInteger(input.durationMs) && Number(input.durationMs) >= 0 ? Math.min(Number(input.durationMs), 86_400_000) : null;
  let id: number | null = null;
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(pollResponses).values({
      submissionId, surveyId: session.surveyId, versionId: session.versionId, sessionId: session.id, ticket, mode: "kiosk",
      locationName: session.locationName, answers: check.stored, startedAt: startedAt && startedAt <= now ? startedAt : null, durationMs, submittedAt: now
    }).onConflictDoNothing().returning({ id: pollResponses.id });
    if (!inserted) return;
    id = inserted.id;
    await tx.insert(pollSessionEvents).values({ sessionId: session.id, surveyId: session.surveyId, kind: "completed", eventKey: `completed:${ticket}`, ticket, locationName: session.locationName, occurredAt: now }).onConflictDoNothing();
  });
  if (id === null) {
    const [raced] = await db.select({ id: pollResponses.id, submissionId: pollResponses.submissionId }).from(pollResponses).where(eq(pollResponses.ticket, ticket)).limit(1);
    if (raced?.submissionId === submissionId) return { status: "saved", id: raced.id };
    throw new APIError("This survey already has answers.", 409, { discard: true });
  }
  return { status: "saved", id };
}

export async function kioskPause(req: PayloadRequest, paused: boolean) {
  const session = await kioskSession(req);
  const now = new Date();
  requireInterviewer(session, now);
  await touch(req.payload, session, now, { status: paused ? "paused" : "active" });
  return kioskState(req);
}

export async function kioskMove(req: PayloadRequest) {
  const session = await kioskSession(req);
  const now = new Date();
  requireInterviewer(session, now);
  const { locationId } = await bodyOf<{ locationId?: unknown }>(req);
  const location = await req.payload.findByID({ collection: POLL_LOCATIONS, id: Number(locationId), overrideAccess: true, depth: 0, disableErrors: true }) as { id: number; name: string; active?: boolean } | null;
  if (!location || location.active === false) throw new APIError("Choose an active location.", 400);
  await touch(req.payload, session, now, { locationId: location.id, locationName: location.name });
  return kioskState(req);
}

async function endSessionKiosk(payload: Payload, session: Session, now: Date) {
  await endSession(payload, session.id, now);
  payload.logger.info({ msg: "Poll kiosk ended", sessionId: session.id });
}

export async function kioskEnd(req: PayloadRequest) {
  const session = await kioskSession(req);
  const now = new Date();
  requireInterviewer(session, now);
  await endSessionKiosk(req.payload, session, now);
  const counts = (await eventCounts(req.payload, [session.id])).get(session.id);
  return json({ ended: true, counts }, 200, [expiredKioskCookie()]);
}

/* ------------------------------------------------------------------ public links */

const PUBLIC_MIN_SECONDS = 3;
const PUBLIC_TOKEN_HOURS = 6;

async function publicSurvey(payload: Payload, key: string): Promise<SurveyDoc> {
  if (!/^[A-Za-z0-9]{8,40}$/.test(key)) throw new APIError("This poll isn't available.", 404);
  const { docs } = await payload.find({ collection: POLL_SURVEYS, where: { "publicLink.key": { equals: key } }, limit: 1, overrideAccess: true, depth: 0 });
  const survey = docs[0] as unknown as SurveyDoc | undefined;
  const now = Date.now();
  const link = survey?.publicLink;
  if (!survey || !link?.enabled || survey.status !== "open" || !relationId(survey.currentVersion)) throw new APIError("This poll isn't available.", 404);
  if (link.opensAt && Date.parse(link.opensAt) > now) throw new APIError("This poll hasn't opened yet.", 404, { opensAt: link.opensAt });
  if (link.closesAt && Date.parse(link.closesAt) <= now) throw new APIError("This poll has closed. Thank you for your interest.", 410);
  return survey;
}

export async function publicPoll(req: PayloadRequest, key: string) {
  const survey = await publicSurvey(req.payload, key);
  const version = await loadVersion(req.payload, Number(relationId(survey.currentVersion)), req);
  const needsCode = Boolean(survey.publicLink?.accessCodeHash);
  const projection = projectRespondent(req, version);
  return { title: survey.title, ...projection, ...(needsCode ? { images: {} } : {}), needsCode, closesAt: survey.publicLink?.closesAt ?? null };
}

/**
 * Opening a public poll issues a one-use start token. A busy poll stops
 * issuing tokens at its hourly limit (no IP addresses involved), and an
 * optional access code limits who can start at all.
 */
export async function publicStart(req: PayloadRequest, key: string) {
  const survey = await publicSurvey(req.payload, key);
  const { code } = await bodyOf<{ code?: unknown }>(req);
  if (survey.publicLink?.accessCodeHash && !(await verifySecret(normalizeAccessCode(String(code ?? "")), survey.publicLink.accessCodeHash))) throw new APIError("That access code isn't right.", 403);
  const db = await pollDb(req.payload);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(pollPublicStarts).where(and(eq(pollPublicStarts.surveyId, survey.id), gte(pollPublicStarts.issuedAt, hourAgo)));
  if (Number(count) >= (survey.publicLink?.hourlyLimit ?? 300)) throw new APIError("This poll is very busy right now. Try again in a little while.", 429);
  // Spent and expired tokens are not kept.
  await db.delete(pollPublicStarts).where(lt(pollPublicStarts.issuedAt, new Date(now.getTime() - PUBLIC_TOKEN_HOURS * 3_600_000 * 4)));
  const { token, hash } = publicStartToken();
  const version = await loadVersion(req.payload, Number(relationId(survey.currentVersion)), req);
  await db.insert(pollPublicStarts).values({ tokenHash: hash, surveyId: survey.id, versionId: version.id, issuedAt: now });
  return { startToken: token, ...projectRespondent(req, version) };
}

export async function publicSubmit(req: PayloadRequest, key: string) {
  const survey = await publicSurvey(req.payload, key);
  const input = await bodyOf<SubmitInput & { startToken?: unknown; website?: unknown }>(req);
  const submissionId = String(input.submissionId ?? "");
  if (!EVENT_KEY.test(submissionId)) throw new APIError("Missing submission key.", 400);
  const db = await pollDb(req.payload);
  const [already] = await db.select({ id: pollResponses.id, surveyId: pollResponses.surveyId }).from(pollResponses).where(eq(pollResponses.submissionId, submissionId)).limit(1);
  if (already) {
    if (already.surveyId !== survey.id) throw new APIError("This submission key was already used.", 409);
    return { status: "saved" };
  }
  // A filled-in hidden field is a bot. It is told the answers were saved, and nothing is stored.
  if (typeof input.website === "string" && input.website.trim()) return { status: "saved" };
  const token = String(input.startToken ?? "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new APIError("Open the poll again to take part.", 403);
  const now = new Date();
  const [start] = await db.select().from(pollPublicStarts).where(and(eq(pollPublicStarts.tokenHash, hashToken(token)), eq(pollPublicStarts.surveyId, survey.id))).limit(1);
  if (!start || start.issuedAt < new Date(now.getTime() - PUBLIC_TOKEN_HOURS * 3_600_000)) throw new APIError("This poll page has expired. Open the poll again to take part.", 403);
  if (start.usedAt) throw new APIError("These answers were already submitted.", 409);
  if (now.getTime() - start.issuedAt.getTime() < PUBLIC_MIN_SECONDS * 1000) throw new APIError("That was very fast. Please read each question and try again.", 429);
  const version = await loadVersion(req.payload, start.versionId, req);
  const check = checkSubmission(versionDefinition(version), input.answers);
  if (!check.ok) throw new APIError("Some answers don't match this poll.", 422, { errors: check.errors.slice(0, 20) });
  await db.transaction(async (tx) => {
    const spent = await tx.update(pollPublicStarts).set({ usedAt: now }).where(and(eq(pollPublicStarts.tokenHash, start.tokenHash), isNull(pollPublicStarts.usedAt))).returning({ hash: pollPublicStarts.tokenHash });
    if (!spent.length) throw new APIError("These answers were already submitted.", 409);
    await tx.insert(pollResponses).values({ submissionId, surveyId: survey.id, versionId: start.versionId, mode: "public", locationName: "", answers: check.stored, startedAt: start.issuedAt, durationMs: now.getTime() - start.issuedAt.getTime(), submittedAt: now });
  });
  return { status: "saved" };
}

/* ------------------------------------------------------------------ endpoint glue */

export const fieldworkHandlers = {
  state: respond((req) => kioskState(req)),
  unlock: respond((req) => kioskUnlock(req)),
  lock: respond((req) => kioskLock(req)),
  decline: respond((req) => kioskDecline(req)),
  begin: respond((req) => kioskBegin(req)),
  submit: respond((req) => kioskSubmit(req)),
  pause: respond((req) => kioskPause(req, true)),
  resume: respond((req) => kioskPause(req, false)),
  move: respond((req) => kioskMove(req)),
  end: respond((req) => kioskEnd(req)),
  publicPoll: respond((req) => publicPoll(req, String(req.routeParams?.key ?? ""))),
  publicStart: respond((req) => publicStart(req, String(req.routeParams?.key ?? ""))),
  publicSubmit: respond((req) => publicSubmit(req, String(req.routeParams?.key ?? ""))),
  pair: respond((req) => claimPairing(req))
};
