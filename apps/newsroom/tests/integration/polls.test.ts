import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import type { User } from "../../src/payload-types";
import { pollEndpoints } from "../../src/polls/endpoints";
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

describe("results", () => {
  it("counts the response with each question's own base and exports safe CSV", async () => {
    const results = (await call("get", "/byline/polls/surveys/:id/results", "analyst", { params: { id: ids.survey } })).body;
    expect(results.results.responses).toBe(1);
    const gender = results.results.questions.find((question: { name: string }) => question.name === "gender");
    expect(gender.base).toMatchObject({ answered: 0, unanswered: 1, notApplicable: 0 });
    const purpose = results.results.questions.find((question: { name: string }) => question.name === "ai_purpose");
    expect(purpose.base.answered).toBe(1);
    expect(results.fieldwork.total).toMatchObject({ declined: 1, completed: 1, abandoned: 1, reliable: false, declineRate: null });
    // One grade group of one student is withheld.
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
