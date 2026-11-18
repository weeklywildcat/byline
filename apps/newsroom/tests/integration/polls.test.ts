import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import type { User } from "../../src/payload-types";
import { pollEndpoints } from "../../src/polls/endpoints";
import { emptyDefinition, type SurveyDefinition } from "../../src/polls/engine/types";
import { publicationStore } from "../../src/publication-media/blob-store";
import { newsroomUser } from "../../src/access/user";
import { linkedUses } from "../../src/newsroom/media-library";
import { KIOSK_COOKIE } from "../../src/polls/kiosk";

/**
 * Wildcat Polls against real PostgreSQL (docs/wildcat-polls.md): who sees and
 * changes what, immutable versions, the kiosk credential and what it can't
 * reach, idempotent fieldwork, PIN lockout, abandoned surveys, results, public
 * links, and that none of it touches the public site.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const ids: Record<string, number> = {};
const example = readFileSync(new URL("../../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx", import.meta.url));
const yes = (value: unknown) => ({ status: "answered", value });

async function account(key: string, role: User["role"]) {
  const user = await payload.create({ collection: "users", data: { email: `polls-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true } });
  accounts[key] = { ...user, collection: "users" } as User;
}

type Options = { data?: unknown; params?: Record<string, string | number>; query?: Record<string, string>; file?: PayloadRequest["file"]; kiosk?: string };

/** Calls an endpoint as a signed-in account, or (with `kiosk`) as a device holding only a kiosk credential. */
async function call(method: string, path: string, who: string | null, options: Options = {}) {
  const endpoint = pollEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await createLocalReq(who ? { user: accounts[who] } : {}, payload);
  const headers = new Headers({ "content-type": "application/json" });
  if (options.kiosk) headers.set("cookie", `${KIOSK_COOKIE}=${options.kiosk}`);
  Object.assign(req, {
    headers, method: method.toUpperCase(), data: options.data ?? {}, file: options.file,
    routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)])),
    searchParams: new URLSearchParams(options.query ?? {})
  });
  if (!who) req.user = null;
  const response = (await endpoint.handler(req)) as Response;
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, headers: response.headers, body: type.includes("json") ? await response.json() : await response.text() };
}
const kiosk = (method: string, path: string, token: string, data: unknown = {}) => call(method, path, null, { kiosk: token, data });
const key = (n: number | string) => `key-${String(n).padStart(20, "0")}`;
const db = () => (payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> } }).drizzle;

async function startKioskFor(who: string, surveyId: number, pin = "4826") {
  const session = await call("post", "/byline/polls/sessions", who, { data: { surveyId, locationId: ids.cafeteria, period: "Lunch A", method: "Every third student" } });
  expect(session.status).toBe(200);
  const started = await call("post", "/byline/polls/sessions/:session/kiosk", who, { params: { session: session.body.id }, data: { pin } });
  expect(started.status).toBe(200);
  const cookies = started.headers.getSetCookie();
  const token = cookies.map((cookie) => new RegExp(`^${KIOSK_COOKIE}=([^;]+)`).exec(cookie)?.[1]).find(Boolean)!;
  return { sessionId: session.body.id as string, token, cookies };
}

const completeAnswers = { grade: yes("10"), ai_posters_seen: yes("yes"), ai_posters_clear: yes("agree"), protest_posters_seen: yes("no"), book_report: yes("yes"), used_ai: yes("yes"), ai_purpose: yes(["brainstorm", "grammar"]), ai_permitted: yes("unclear"), anything_else: yes("=cmd|' /C calc'!A0") };

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_polls`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("admin", "administrator");
  await account("editor", "editor");
  await account("interviewer", "staff");
  await account("analyst", "staff");
  await account("stranger", "staff");
  ids.cafeteria = (await payload.create({ collection: "poll-locations", data: { name: "Cafeteria", active: true } })).id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("Poll Studio", () => {
  it("imports the example workbook without saving, then creates and publishes it as an editor only", async () => {
    const file = { data: example, mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "ai.xlsx", size: example.length };
    expect((await call("post", "/byline/polls/import", "interviewer", { file })).status).toBe(403);
    const preview = await call("post", "/byline/polls/import", "editor", { file });
    expect(preview.status).toBe(200);
    expect(preview.body.issues.filter((issue: { severity: string }) => issue.severity === "error")).toEqual([]);
    expect((await payload.count({ collection: "poll-surveys", overrideAccess: true })).totalDocs).toBe(0);

    expect((await call("post", "/byline/polls/surveys", "interviewer", { data: { definition: preview.body.definition } })).status).toBe(403);
    const created = await call("post", "/byline/polls/surveys", "editor", { data: { definition: preview.body.definition, sourceFilename: "ai.xlsx" } });
    ids.survey = created.body.id;
    const detail = await call("get", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey } });
    const published = await call("post", "/byline/polls/surveys/:id/publish", "editor", { params: { id: ids.survey }, data: { draftRevision: detail.body.survey.draftRevision } });
    expect(published.status).toBe(200);
    expect(published.body.survey.status).toBe("open");
    expect(published.body.current.number).toBe(1);
    expect(published.body.draftChanged).toBe(false);
    ids.version = published.body.current.id;
  });

  it("refuses a file that isn't a workbook, a stale draft, and publishing a draft with errors", async () => {
    const text = Buffer.from("type,name\ntext,q");
    expect((await call("post", "/byline/polls/import", "editor", { file: { data: text, mimetype: "text/csv", name: "poll.xlsx", size: text.length } })).status).toBe(400);
    const detail = (await call("get", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey } })).body;
    const broken = structuredClone(detail.draft);
    broken.questions[3].relevant = "${not_a_question} = 'yes'";
    expect((await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { draft: broken, draftRevision: detail.survey.draftRevision - 1 } })).status).toBe(409);
    const saved = await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { draft: broken, draftRevision: detail.survey.draftRevision } });
    expect(saved.status).toBe(200);
    const refused = await call("post", "/byline/polls/surveys/:id/publish", "editor", { params: { id: ids.survey }, data: { draftRevision: saved.body.survey.draftRevision } });
    expect(refused.status).toBe(422);
    // Put the published definition back as the draft.
    const restore = await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { draft: detail.current.definition, draftRevision: saved.body.survey.draftRevision } });
    expect(restore.body.draftChanged).toBe(false);
  });

  it("never changes a published version, even with access overridden", async () => {
    await expect(payload.update({ collection: "poll-versions", id: ids.version, data: { note: "edited" }, overrideAccess: true })).rejects.toThrow(/cannot be changed/);
    await expect(payload.update({ collection: "poll-versions", id: ids.version, data: { note: "edited" }, overrideAccess: false, user: accounts.editor })).rejects.toThrow();
  });

  it("shows staff only polls granted to them, and results only to analysts", async () => {
    expect((await call("get", "/byline/polls", "stranger")).body.surveys).toEqual([]);
    expect((await call("get", "/byline/polls/surveys/:id", "stranger", { params: { id: ids.survey } })).status).toBe(404);
    expect((await call("patch", "/byline/polls/surveys/:id", "interviewer", { params: { id: ids.survey }, data: { title: "Mine now" } })).status).toBe(403);
    const granted = await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { interviewers: [accounts.interviewer.id], analysts: [accounts.analyst.id] } });
    expect(granted.status).toBe(200);
    const mine = (await call("get", "/byline/polls", "interviewer")).body.surveys;
    expect(mine).toEqual([expect.objectContaining({ id: ids.survey, canInterview: true, canViewResults: false })]);
    expect((await call("get", "/byline/polls/surveys/:id", "interviewer", { params: { id: ids.survey } })).body.draft).toBeNull();
    expect((await call("get", "/byline/polls/surveys/:id/results", "interviewer", { params: { id: ids.survey } })).status).toBe(403);
    expect((await call("get", "/byline/polls/surveys/:id/results", "analyst", { params: { id: ids.survey } })).status).toBe(200);
    // A grant is not editing: REST refuses staff writes too.
    await expect(payload.update({ collection: "poll-surveys", id: ids.survey, data: { title: "x" }, overrideAccess: false, user: accounts.interviewer })).rejects.toThrow();
  });
});

describe("the kiosk", () => {
  let token = "";
  let sessionId = "";

  it("trades the interviewer's Byline session for a credential scoped to one session", async () => {
    expect((await call("post", "/byline/polls/sessions", "stranger", { data: { surveyId: ids.survey, locationId: ids.cafeteria } })).status).toBe(403);
    const session = await call("post", "/byline/polls/sessions", "interviewer", { data: { surveyId: ids.survey, locationId: ids.cafeteria } });
    expect((await call("post", "/byline/polls/sessions/:session/kiosk", "interviewer", { params: { session: session.body.id }, data: { pin: "1234" } })).status).toBe(400);
    expect((await call("post", "/byline/polls/sessions/:session/kiosk", "stranger", { params: { session: session.body.id }, data: { pin: "4826" } })).status).toBe(403);
    ({ token, sessionId } = await startKioskFor("interviewer", ids.survey));
    const state = await kiosk("get", "/byline/polls/kiosk", token);
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ mode: "interviewer", session: { locationName: "Cafeteria", period: "Lunch A" }, survey: { id: ids.survey } });
    expect(state.body.outboxKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The credential is stored hashed, never as given.
    const { rows } = await db().execute(sql`select kiosk_token_hash, kiosk_pin_hash from byline_poll_sessions where id = ${sessionId}`);
    expect(rows[0].kiosk_token_hash).not.toBe(token);
    expect(String(rows[0].kiosk_pin_hash)).toMatch(/^scrypt\$/);
  });

  it("expires the Byline cookie in the same response and reaches nothing in the newsroom", async () => {
    const { cookies } = await startKioskFor("interviewer", ids.survey);
    expect(cookies.some((cookie) => /^payload-token=;/.test(cookie) && /Expires=Thu, 01 Jan 1970|Expires=/.test(cookie))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith(`${KIOSK_COOKIE}=`) && /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie))).toBe(true);
    for (const [method, path, params] of [["get", "/byline/polls", {}], ["get", "/byline/polls/surveys/:id", { id: ids.survey }], ["get", "/byline/polls/surveys/:id/results", { id: ids.survey }], ["get", "/byline/polls/surveys/:id/export/responses", { id: ids.survey }]] as const) {
      expect((await call(method, path, null, { kiosk: token, params })).status, path).toBe(401);
    }
    expect((await kiosk("get", "/byline/polls/kiosk", "x".repeat(43))).status).toBe(401);
    expect((await call("get", "/byline/polls/kiosk", null)).status).toBe(401);
  });

  it("records a decline once however often it is retried", async () => {
    await kiosk("post", "/byline/polls/kiosk/decline", token, { eventKey: key("d1") });
    const again = await kiosk("post", "/byline/polls/kiosk/decline", token, { eventKey: key("d1") });
    expect(again.body.counts.declined).toBe(1);
  });

  it("gives the respondent nothing but their own survey", async () => {
    const begun = await kiosk("post", "/byline/polls/kiosk/begin", token, { eventKey: key("b1") });
    expect(begun.body.mode).toBe("respondent");
    const ticket = begun.body.ticket.id;
    // A retried "Student agreed" does not start a second survey.
    expect((await kiosk("post", "/byline/polls/kiosk/begin", token, { eventKey: key("b1") })).body.ticket.id).toBe(ticket);
    for (const path of ["/byline/polls/kiosk/decline", "/byline/polls/kiosk/begin", "/byline/polls/kiosk/pause", "/byline/polls/kiosk/end", "/byline/polls/kiosk/location"]) {
      expect((await kiosk("post", path, token, { eventKey: key("x2"), locationId: ids.cafeteria })).status, path).toBe(423);
    }
    // The server re-validates: a hidden answer, a wrong value or an unknown question is refused for good.
    const { book_report: _skip, ...withoutReport } = completeAnswers;
    expect((await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s0"), answers: { ...withoutReport, book_report: yes("no") } })).body.data.discard).toBe(true);
    expect((await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s0"), answers: { ...completeAnswers, grade: yes("13") } })).status).toBe(422);
    expect((await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s0"), answers: { ...completeAnswers, injected: yes("x") } })).status).toBe(422);
    const saved = await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s1"), answers: completeAnswers, startedAt: new Date(Date.now() - 60_000).toISOString(), durationMs: 60_000 });
    expect(saved.body).toMatchObject({ status: "saved" });
    // A retried upload is a no-op; a second submission for the same survey is refused.
    expect((await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s1"), answers: completeAnswers })).body).toEqual(saved.body);
    expect((await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s2"), answers: completeAnswers })).status).toBe(409);
    const { rows } = await db().execute(sql`select count(*)::int as n from byline_poll_responses where ticket = ${ticket}`);
    expect(rows[0].n).toBe(1);
  });

  it("returns to the interviewer only with the PIN, and locks after repeated wrong ones", async () => {
    expect((await kiosk("post", "/byline/polls/kiosk/unlock", token, { pin: "0000" })).status).toBe(403);
    const unlocked = await kiosk("post", "/byline/polls/kiosk/unlock", token, { pin: "4826", ticketOutcome: "pending" });
    expect(unlocked.body).toMatchObject({ mode: "interviewer", counts: { started: 1, completed: 1, declined: 1, abandoned: 0 } });

    const other = await startKioskFor("interviewer", ids.survey, "2580");
    await kiosk("post", "/byline/polls/kiosk/lock", other.token);
    const attempts = [];
    for (let i = 0; i < 5; i++) attempts.push((await kiosk("post", "/byline/polls/kiosk/unlock", other.token, { pin: "1111" })).status);
    expect(attempts).toEqual([403, 403, 403, 403, 429]);
    // Even the right PIN waits out the lock.
    expect((await kiosk("post", "/byline/polls/kiosk/unlock", other.token, { pin: "2580" })).status).toBe(429);
  });

  it("counts a stopped survey as incomplete and never accepts its answers later", async () => {
    const begun = await kiosk("post", "/byline/polls/kiosk/begin", token, { eventKey: key("b2") });
    const ticket = begun.body.ticket.id;
    const unlocked = await kiosk("post", "/byline/polls/kiosk/unlock", token, { pin: "4826", ticketOutcome: "abandon" });
    expect(unlocked.body.counts.abandoned).toBe(1);
    const late = await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s3"), answers: completeAnswers });
    expect(late.status).toBe(409);
  });

  it("ends the session, revokes the credential, and lets a Studio editor end a forgotten one", async () => {
    const ended = await kiosk("post", "/byline/polls/kiosk/end", token);
    expect(ended.status).toBe(200);
    expect(ended.headers.getSetCookie().some((cookie) => cookie.startsWith(`${KIOSK_COOKIE}=;`))).toBe(true);
    expect((await kiosk("get", "/byline/polls/kiosk", token)).status).toBe(401);
    const forgotten = await startKioskFor("interviewer", ids.survey);
    expect((await call("post", "/byline/polls/sessions/:session/end", "stranger", { params: { session: forgotten.sessionId } })).status).toBe(403);
    expect((await call("post", "/byline/polls/sessions/:session/end", "editor", { params: { session: forgotten.sessionId } })).status).toBe(200);
    expect((await kiosk("get", "/byline/polls/kiosk", forgotten.token)).status).toBe(401);
  });
});

describe("device pairing", () => {
  const claim = (code: unknown) => call("post", "/byline/polls/pair", null, { data: { code } });
  const tokenFrom = (cookies: string[]) => cookies.map((cookie) => new RegExp(`^${KIOSK_COOKIE}=([^;]+)`).exec(cookie)?.[1]).find(Boolean) ?? "";
  const newSession = async (who = "interviewer") => (await call("post", "/byline/polls/sessions", who, { data: { surveyId: ids.survey, locationId: ids.cafeteria, period: "Lunch B", method: "Every fifth student" } })).body.id as string;
  const prepare = (session: string, data: Record<string, unknown> = { pin: "4826" }, who = "interviewer") => call("post", "/byline/polls/sessions/:session/pairing", who, { params: { session }, data });

  it("gives the interviewer a six-digit code that is kept only as a keyed hash", async () => {
    const session = await newSession();
    expect((await prepare(session, { pin: "4826" }, "stranger")).status).toBe(403);
    expect((await prepare(session, { pin: "1234" })).status).toBe(400);
    const prepared = await prepare(session, { pin: "4826", expiresInMinutes: 120 });
    expect(prepared.status).toBe(200);
    expect(prepared.body.code).toMatch(/^\d{3} \d{3}$/);
    expect(Date.parse(prepared.body.expiresAt) - Date.now()).toBeGreaterThan(119 * 60_000);
    const { rows } = await db().execute(sql`select pairing_code_hash, pairing_pin_hash, pairing_expires_at from byline_poll_sessions where id = ${session}`);
    const digits = prepared.body.code.replace(" ", "");
    expect(rows[0].pairing_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain(digits);
    expect(String(rows[0].pairing_pin_hash)).toMatch(/^scrypt\$/);
    // At most two days, however long was asked for.
    const long = await prepare(session, { pin: "4826", expiresInMinutes: 60 * 24 * 10 });
    expect(Date.parse(long.body.expiresAt) - Date.now()).toBeLessThanOrEqual(2 * 24 * 60 * 60_000 + 5_000);
    await call("post", "/byline/polls/sessions/:session/end", "interviewer", { params: { session } });
  });

  it("pairs an anonymous device once, locked, with nothing about the newsroom in the reply", async () => {
    const session = await newSession();
    const { code } = (await prepare(session)).body;
    const paired = await claim(code);
    expect(paired.status).toBe(200);
    expect(paired.body).toEqual({ kiosk: "/polls/kiosk" });
    const cookies = paired.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith(`${KIOSK_COOKIE}=`) && /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie))).toBe(true);
    // The device never held a Byline session; any it had is expired.
    expect(cookies.some((cookie) => /^payload-token=;/.test(cookie))).toBe(true);
    const token = tokenFrom(cookies);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = await kiosk("get", "/byline/polls/kiosk", token);
    expect(state.body).toMatchObject({ mode: "locked", session: { id: session, method: "Every fifth student" } });
    // Interviewer controls need the PIN chosen with the code.
    expect((await kiosk("post", "/byline/polls/kiosk/decline", token, { eventKey: key("pd1") })).status).toBe(423);
    expect((await kiosk("post", "/byline/polls/kiosk/unlock", token, { pin: "4826" })).body.mode).toBe("interviewer");
    // The code is spent: it is not a credential any more.
    expect((await claim(code)).status).toBe(400);
    const { rows } = await db().execute(sql`select pairing_code_hash from byline_poll_sessions where id = ${session}`);
    expect(rows[0].pairing_code_hash).toBeNull();
    // The paired device still reaches nothing in the newsroom.
    for (const [method, path, params] of [["get", "/byline/polls", {}], ["get", "/byline/polls/surveys/:id/results", { id: ids.survey }], ["get", "/byline/polls/surveys/:id/export/responses", { id: ids.survey }], ["post", "/byline/polls/sessions/:session/pairing", { session }]] as const) {
      expect((await call(method, path, null, { kiosk: token, params })).status, path).toBe(401);
    }
    await kiosk("post", "/byline/polls/kiosk/end", token);
  });

  it("refuses malformed, unknown, expired and replaced codes alike", async () => {
    for (const bad of ["", "12345", "abcdef", 123456, null]) expect((await claim(bad)).status).toBe(400);
    const session = await newSession();
    const first = (await prepare(session)).body.code;
    const second = (await prepare(session, {})).body.code; // keeps the pending PIN
    if (first !== second) expect((await claim(first)).status).toBe(400);
    await db().execute(sql`update byline_poll_sessions set pairing_expires_at = now() - interval '1 second' where id = ${session}`);
    const expired = await claim(second);
    expect(expired.status).toBe(400);
    expect(expired.body.message).toBe("That code didn't work. Check it, or ask the interviewer for a new one.");
    const fresh = (await prepare(session, { pin: "2580" })).body.code;
    await call("post", "/byline/polls/sessions/:session/end", "interviewer", { params: { session } });
    expect((await claim(fresh)).status).toBe(400);
    await db().execute(sql`delete from byline_poll_pairing_limits`);
  });

  it("replaces a running device only when the interviewer says so", async () => {
    const { token: running, sessionId } = await startKioskFor("interviewer", ids.survey);
    const refused = await prepare(sessionId);
    expect(refused.status).toBe(409);
    expect(refused.body.data.deviceRunning).toBe(true);
    const replacing = await prepare(sessionId, { pin: "4826", replaceDevice: true });
    expect(replacing.body.replaces).toBe(true);
    // Until the new device claims the code, the old one keeps working.
    expect((await kiosk("get", "/byline/polls/kiosk", running)).status).toBe(200);
    const paired = await claim(replacing.body.code);
    expect(paired.status).toBe(200);
    expect((await kiosk("get", "/byline/polls/kiosk", running)).status).toBe(401);
    await kiosk("post", "/byline/polls/kiosk/end", tokenFrom(paired.headers.getSetCookie()));
  });

  it("throttles failed claims across the newsroom, without recording who tried", async () => {
    const session = await newSession();
    const { code } = (await prepare(session)).body;
    for (let i = 0; i < 20; i++) await claim(String(100000 + i));
    const { rows } = await db().execute(sql`select * from byline_poll_pairing_limits`);
    expect(Object.keys(rows[0]).sort()).toEqual(["failures", "window_start"]);
    const throttled = await claim(code);
    expect(throttled.status).toBe(429);
    expect(throttled.body.data.retryAfter).toBeGreaterThan(0);
    await db().execute(sql`delete from byline_poll_pairing_limits`);
    // The code survived the throttle and still works once.
    expect((await claim(code)).status).toBe(200);
    await call("post", "/byline/polls/sessions/:session/end", "interviewer", { params: { session } });
  });

  it("keeps the signed-in “Use this device” path", async () => {
    const { token } = await startKioskFor("interviewer", ids.survey);
    expect((await kiosk("get", "/byline/polls/kiosk", token)).body.mode).toBe("interviewer");
    await kiosk("post", "/byline/polls/kiosk/end", token);
  });
});

describe("results", () => {
  it("counts the response with each question's own base and exports safe CSV", async () => {
    const plain = (await call("get", "/byline/polls/surveys/:id/results", "analyst", { params: { id: ids.survey } })).body;
    expect(plain.results.breakdowns).toEqual([]);
    expect(plain.compare.options.map((option: { name: string }) => option.name)).toContain("grade");
    expect(plain.timeline).toEqual([expect.objectContaining({ kiosk: 1, public: 0 })]);
    expect(plain.canCreateDataset).toBe(false);
    const results = (await call("get", "/byline/polls/surveys/:id/results", "analyst", { params: { id: ids.survey }, query: { compare: "grade" } })).body;
    expect(results.compare.selected).toBe("grade");
    expect(results.results.responses).toBe(1);
    const gender = results.results.questions.find((question: { name: string }) => question.name === "gender");
    expect(gender.base).toMatchObject({ answered: 0, unanswered: 1, notApplicable: 0 });
    const purpose = results.results.questions.find((question: { name: string }) => question.name === "ai_purpose");
    expect(purpose.base.answered).toBe(1);
    expect(results.fieldwork.total).toMatchObject({ declined: 1, completed: 1, abandoned: 1, reliable: false, declineRate: null });
    // Comparing by something the poll didn't configure gives nothing.
    expect((await call("get", "/byline/polls/surveys/:id/results", "analyst", { params: { id: ids.survey }, query: { compare: "anything_else" } })).body.results.breakdowns).toEqual([]);
    // One grade group of one student is withheld, and the chart data carries no numbers for it.
    expect(results.results.breakdowns[0].groups.find((group: { name: string }) => group.name === "10")).toMatchObject({ suppressed: true, base: 0 });
    const csv = await call("get", "/byline/polls/surveys/:id/export/responses", "analyst", { params: { id: ids.survey } });
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.body).toContain("'=cmd");
    expect(csv.body).toContain("[unanswered]");
    expect((await call("get", "/byline/polls/surveys/:id/export/responses", "interviewer", { params: { id: ids.survey } })).status).toBe(403);
  });

  it("never touches the public site: no revision, no snapshot job, no public collection", async () => {
    const before = await readCurrentRevision(payload);
    const { token } = await startKioskFor("interviewer", ids.survey);
    const ticket = (await kiosk("post", "/byline/polls/kiosk/begin", token, { eventKey: key("b9") })).body.ticket.id;
    await kiosk("post", "/byline/polls/kiosk/responses", token, { ticket, submissionId: key("s9"), answers: completeAnswers });
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { methodology: "Asked in the cafeteria at lunch." } });
    expect(await readCurrentRevision(payload)).toBe(before);
    const jobs = await payload.find({ collection: "payload-jobs", where: { taskSlug: { equals: "prepare-public-snapshot" } }, overrideAccess: true, pagination: false });
    expect(jobs.docs).toEqual([]);
    for (const collection of ["poll-surveys", "poll-versions", "poll-locations"] as const) await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow();
  });
});

describe("public links", () => {
  it("serve nothing until an editor turns the link on, then need a fresh one-use start token", async () => {
    const detail = (await call("get", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey } })).body;
    const linkKey = detail.survey.publicLinkSettings.key;
    expect((await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } })).status).toBe(404);
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { publicLink: { enabled: true, accessCode: "Wildcats 2026" } } });
    expect((await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } })).body.needsCode).toBe(true);
    expect((await call("post", "/byline/polls/public/:key/start", null, { params: { key: linkKey }, data: { code: "nope" } })).status).toBe(403);
    const { startToken } = (await call("post", "/byline/polls/public/:key/start", null, { params: { key: linkKey }, data: { code: "wildcats2026" } })).body;
    const submit = (submissionId: string, extra: Record<string, unknown> = {}) => call("post", "/byline/polls/public/:key/responses", null, { params: { key: linkKey }, data: { startToken, submissionId, answers: completeAnswers, ...extra } });
    expect((await submit(key("p1"))).status).toBe(429);
    await db().execute(sql`update byline_poll_public_starts set issued_at = now() - interval '1 minute'`);
    // A form-filling bot is told "saved" and nothing is stored.
    expect((await submit(key("p0"), { website: "https://spam.example" })).body).toEqual({ status: "saved" });
    expect((await submit(key("p1"))).body).toEqual({ status: "saved" });
    expect((await submit(key("p1"))).body).toEqual({ status: "saved" });
    expect((await submit(key("p2"))).status).toBe(409);
    const { rows } = await db().execute(sql`select mode, session_id from byline_poll_responses where submission_id in (${key("p0")}, ${key("p1")})`);
    expect(rows).toEqual([{ mode: "public", session_id: null }]);
  });

  it("keeps to the link's window and hourly limit", async () => {
    const detail = (await call("get", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey } })).body;
    const linkKey = detail.survey.publicLinkSettings.key;
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const earlier = new Date(Date.now() - 60_000).toISOString();
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { publicLink: { opensAt: later, accessCode: "" } } });
    expect((await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } })).status).toBe(404);
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { publicLink: { opensAt: null, closesAt: earlier } } });
    expect((await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } })).status).toBe(410);
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { publicLink: { closesAt: null, hourlyLimit: 10 } } });
    const opened = await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } });
    expect(opened.body.needsCode).toBe(false);
    // Nothing about the newsroom or other respondents is in the public poll.
    expect(Object.keys(opened.body).sort()).toEqual(["closesAt", "definition", "images", "needsCode", "title"]);
    await db().execute(sql`insert into byline_poll_public_starts (token_hash, survey_id, version_id, issued_at) select md5(random()::text) || md5(random()::text), ${ids.survey}, ${ids.version}, now() from generate_series(1, 10)`);
    expect((await call("post", "/byline/polls/public/:key/start", null, { params: { key: linkKey }, data: {} })).status).toBe(429);
    await db().execute(sql`delete from byline_poll_public_starts where used_at is null`);
    // A new link retires the old one.
    const renewed = await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { publicLink: { regenerateKey: true, hourlyLimit: 300 } } });
    expect(renewed.body.survey.publicLinkSettings.key).not.toBe(linkKey);
    expect((await call("get", "/byline/polls/public/:key", null, { params: { key: linkKey } })).status).toBe(404);
  });
});

describe("results elsewhere", () => {
  it("shows a poll on its linked Collection only to people who can see the poll", async () => {
    const collection = await payload.create({ collection: "collections", data: { name: "AI at school", type: "ongoing" } as never, overrideAccess: true });
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { linkedCollection: collection.id } });
    const forEditor = await call("get", "/byline/polls/linked", "editor", { query: { collection: String(collection.id) } });
    expect(forEditor.body.polls).toEqual([expect.objectContaining({ id: ids.survey, status: "open", responses: expect.any(Number) })]);
    // An interviewer sees it, but no response count; a stranger sees nothing.
    expect((await call("get", "/byline/polls/linked", "interviewer", { query: { collection: String(collection.id) } })).body.polls).toEqual([expect.objectContaining({ id: ids.survey, responses: null })]);
    expect((await call("get", "/byline/polls/linked", "stranger", { query: { collection: String(collection.id) } })).body.polls).toEqual([]);
    expect((await call("get", "/byline/polls/linked", null, { query: { collection: String(collection.id) } })).status).toBe(401);
  });

  it("copies reviewed aggregates, never responses or written answers, into a private dataset", async () => {
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { minimumGroup: 3 } });
    expect((await call("post", "/byline/polls/surveys/:id/dataset", "analyst", { params: { id: ids.survey } })).status).toBe(403);
    const made = await call("post", "/byline/polls/surveys/:id/dataset", "editor", { params: { id: ids.survey }, query: { mode: "kiosk" } });
    // Two kiosk responses are fewer than three: nothing to hand over.
    expect(made.status).toBe(409);
    const all = await call("post", "/byline/polls/surveys/:id/dataset", "editor", { params: { id: ids.survey } });
    expect(all.status).toBe(200);
    expect(all.body.rows).toBeGreaterThan(0);
    const dataset = await payload.findByID({ collection: "data-datasets", id: all.body.datasetId, overrideAccess: true, depth: 0 }) as unknown as { release?: unknown; description: string };
    expect(dataset.release ?? null).toBeNull();
    expect(dataset.description).toContain("No individual or written answers");
    const records = await payload.find({ collection: "data-records", where: { dataset: { equals: all.body.datasetId } }, overrideAccess: true, pagination: false, depth: 0 });
    const text = JSON.stringify(records.docs.map((doc) => (doc as { values: unknown }).values));
    expect(text).not.toContain("=cmd");
    expect(text).not.toContain("anything_else");
    expect(text).toContain("\"question_key\":\"grade\"");
    await call("patch", "/byline/polls/surveys/:id", "editor", { params: { id: ids.survey }, data: { minimumGroup: 5, linkedCollection: null } });
  });
});

describe("deleting a poll", () => {
  it("is for administrators, who confirm with the title, and takes every response with it", async () => {
    expect((await call("post", "/byline/polls/surveys/:id/delete", "editor", { params: { id: ids.survey }, data: { confirmTitle: "AI at Ninety Six High School" } })).status).toBe(403);
    expect((await call("post", "/byline/polls/surveys/:id/delete", "admin", { params: { id: ids.survey }, data: { confirmTitle: "Wrong" } })).status).toBe(400);
    expect((await call("post", "/byline/polls/surveys/:id/delete", "admin", { params: { id: ids.survey }, data: { confirmTitle: "AI at Ninety Six High School" } })).status).toBe(200);
    const { rows } = await db().execute(sql`select (select count(*)::int from byline_poll_responses) as responses, (select count(*)::int from byline_poll_sessions) as sessions, (select count(*)::int from poll_versions) as versions`);
    expect(rows[0]).toEqual({ responses: 0, sessions: 0, versions: 0 });
  });
});

describe("frozen Poll choice media", () => {
  async function imageFile(name: string, background: string) {
    const data = await sharp({ create: { width: 880, height: 560, channels: 3, background } }).png().toBuffer();
    return { data, name, mimetype: "image/png", size: data.length };
  }

  const metadata = { credit: "The Weekly Wildcat", copyright: "The Weekly Wildcat" };
  const makeImage = async (name: string, background: string, alt: string) => payload.create({
    collection: "media", data: { ...metadata, alt }, file: await imageFile(name, background), overrideAccess: true
  });

  const mediaEndpoint = "/byline/polls/media/:versionId/:slot/:key";
  function paramsFor(src: string) {
    const [versionId, slot, key] = src.split("/").slice(-3);
    return { versionId, slot, key };
  }
  async function bytesFor(src: string) {
    const req = await createLocalReq({}, payload);
    req.user = null;
    req.routeParams = paramsFor(src);
    const endpoint = pollEndpoints.find(({ path }) => path === mediaEndpoint)!;
    const response = (await endpoint.handler(req)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    return Buffer.from(await response.arrayBuffer());
  }
  function definitionWith(image: SurveyDefinition["lists"][number]["choices"][number]["image"], second: number): SurveyDefinition {
    return {
      ...emptyDefinition("Choose a school graphic"),
      questions: [{ kind: "select_one", name: "logo", label: "Which logo?", required: true, groups: [], list: "logos", appearance: "columns", imageCards: true }],
      lists: [{ name: "logos", choices: [{ name: "wildcats", label: "Wildcats", image }, { name: "tigers", label: "Tigers", image: { mediaId: second } }] }]
    };
  }

  it("freezes the exact rendition and alt text, and only serves signed version assets", async () => {
    const red = await makeImage("poll-wildcats.png", "#91201a", "Red Wildcat");
    const blue = await makeImage("poll-tigers.png", "#3347af", "Blue Tiger");
    const other = await makeImage("poll-unrelated.png", "#9f832d", "Unrelated graphic");
    await payload.jobs.run({ queue: "media", limit: 30 });
    const definition = definitionWith({ mediaId: red.id, sourceName: "private-upload-name.png" }, blue.id);
    const created = await call("post", "/byline/polls/surveys", "editor", { data: { definition } });
    expect(created.status).toBe(200);
    const params = { id: created.body.id };
    const publish = () => call("post", "/byline/polls/surveys/:id/publish", "editor", { params, data: { draftRevision: 1 } });
    const first = await publish();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const original = first.body.current.images.logos.wildcats;
    expect(original).toMatchObject({ alt: "Red Wildcat", width: 640 });
    const firstBytes = await bytesFor(original.src);
    const v1 = await payload.findByID({ collection: "poll-versions", id: first.body.current.id, overrideAccess: true });
    const manifest = v1.mediaManifest as Array<{ sha256: string }>;
    expect(createHash("sha256").update(firstBytes).digest("hex")).toBe(manifest[0].sha256);
    expect(await publicationStore().verify(manifest[0].sha256)).toBe(true);
    const raw = await payload.findByID({ collection: "poll-versions", id: v1.id, overrideAccess: false, user: accounts.editor });
    expect(raw).not.toHaveProperty("mediaManifest");

    const enabled = await call("patch", "/byline/polls/surveys/:id", "editor", { params, data: { publicLink: { enabled: true } } });
    const key = enabled.body.survey.publicLinkSettings.key;
    const publicPoll = () => call("get", "/byline/polls/public/:key", null, { params: { key } });
    const publicV1 = (await publicPoll()).body;
    expect(publicV1.images.logos.wildcats).toEqual(original);
    expect(publicV1.definition.lists[0].choices[0]).toEqual({ name: "wildcats", label: "Wildcats" });
    expect(JSON.stringify(publicV1)).not.toMatch(/mediaId|private-upload-name|publicationAssets|mediaManifest|sha256/);
    const start = await call("post", "/byline/polls/public/:key/start", null, { params: { key } });
    expect(start.body.images.logos.wildcats).toEqual(original);

    const { token } = await startKioskFor("editor", params.id);
    const device = (await kiosk("get", "/byline/polls/kiosk", token)).body;
    expect(device.images.logos.wildcats).toEqual(original);
    expect(device.definition.lists[0].choices[0]).toEqual({ name: "wildcats", label: "Wildcats" });

    const access = paramsFor(original.src);
    const unrelated = await payload.findByID({ collection: "media", id: other.id, overrideAccess: true });
    const unrelatedBlob = (unrelated.publicationAssets?.manifest as { natural: Array<{ sha256: string }> }).natural[0].sha256;
    for (const invalid of [{ ...access, slot: "1" }, { ...access, key: unrelatedBlob }, { ...access, versionId: String(v1.id + 1) }]) {
      expect((await call("get", mediaEndpoint, null, { params: invalid })).status).toBe(404);
    }

    await payload.update({ collection: "media", id: red.id, data: { alt: "Green Wildcat" }, file: await imageFile("poll-wildcats-v2.png", "#28814d"), overrideAccess: true });
    await payload.jobs.run({ queue: "media", limit: 30 });
    expect((await publicPoll()).body.images.logos.wildcats).toEqual(original);
    expect((await bytesFor(original.src)).equals(firstBytes)).toBe(true);
    const second = await publish();
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const replacement = second.body.current.images.logos.wildcats;
    expect(replacement.alt).toBe("Green Wildcat");
    expect(replacement.src).not.toBe(original.src);
    expect((await bytesFor(replacement.src)).equals(firstBytes)).toBe(false);
    expect((await publicPoll()).body.images.logos.wildcats).toEqual(replacement);
    expect((await kiosk("get", "/byline/polls/kiosk", token)).body.images.logos.wildcats).toEqual(original);
    expect((await bytesFor(original.src)).equals(firstBytes)).toBe(true);

    // The start token carries the exact version that was projected at start.
    await db().execute(sql`update byline_poll_public_starts set issued_at = now() - interval '5 seconds' where survey_id = ${params.id}`);
    const sent = await call("post", "/byline/polls/public/:key/responses", null, {
      params: { key }, data: { startToken: start.body.startToken, submissionId: "frozen-media-respondent-1", answers: { logo: yes("wildcats") } }
    });
    expect(sent.status).toBe(200);
    const stored = await db().execute(sql`select version_id, answers from byline_poll_responses where survey_id = ${params.id}`);
    expect(stored.rows[0]).toMatchObject({ version_id: v1.id, answers: { logo: yes("wildcats") } });
    const uses = await linkedUses({ req: await createLocalReq({ user: accounts.editor }, payload), user: newsroomUser(accounts.editor)!, now: new Date(), timeZone: "America/New_York", admin: "/admin" }, red.id);
    expect(uses.usages).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "poll-choice", recordId: params.id })]));
    await expect(payload.delete({ collection: "media", id: red.id, overrideAccess: true })).rejects.toThrow(/used by a Poll/);
  }, 60_000);

  it("blocks unresolved, missing, wrong-kind and incomplete images and protects draft-only links", async () => {
    const valid = await makeImage("poll-complete.png", "#88259d", "Purple shape");
    const noAlt = await makeImage("poll-alt-needed.png", "#bb5f26", "");
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];
    let pdfBody = "%PDF-1.4\n";
    const offsets = objects.map((object, i) => {
      const offset = pdfBody.length;
      pdfBody += `${i + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = pdfBody.length;
    pdfBody += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const text = Buffer.from(pdfBody, "latin1");
    const pdf = await payload.create({ collection: "media", data: metadata, file: { name: "poll-document.pdf", mimetype: "application/pdf", size: text.length, data: text } });
    await payload.jobs.run({ queue: "media", limit: 30 });
    for (const [image, message] of [
      [{ sourceName: "unresolved-logo.jpg" }, /matching image for unresolved-logo.jpg/],
      [{ mediaId: pdf.id }, /Choose a photo or graphic/],
      [{ mediaId: noAlt.id }, /alt text/i]
    ] as const) {
      const result = await call("post", "/byline/polls/surveys", "editor", { data: { definition: definitionWith(image, valid.id) } });
      expect(result.status).toBe(200);
      const params = { id: result.body.id };
      const detail = await call("get", "/byline/polls/surveys/:id", "editor", { params });
      expect(JSON.stringify(detail.body.draftMediaIssues)).toMatch(message);
      expect((await call("post", "/byline/polls/surveys/:id/publish", "editor", { params, data: { draftRevision: 1 } })).status).toBe(422);
    }
    await expect(payload.delete({ collection: "media", id: valid.id, overrideAccess: true })).rejects.toThrow(/Poll draft/);
    const draft = definitionWith({ mediaId: 2_000_000_000 }, valid.id);
    expect((await call("post", "/byline/polls/surveys", "editor", { data: { definition: draft } })).status).toBe(422);
    // Simulate a legacy or damaged reference that predated the write guard.
    const saved = await call("post", "/byline/polls/surveys", "editor", { data: { definition: definitionWith(undefined, valid.id) } });
    await db().execute(sql`update poll_surveys set draft = ${JSON.stringify(draft)}::jsonb where id = ${saved.body.id}`);
    const refused = await call("post", "/byline/polls/surveys/:id/publish", "editor", { params: { id: saved.body.id }, data: { draftRevision: 1 } });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toMatch(/missing from Media/);
  }, 60_000);
});
