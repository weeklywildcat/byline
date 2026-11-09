import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import { PUBLIC_COLLECTIONS } from "../../src/public/tracking";
import { reportingEndpoints } from "../../src/reporting/endpoints";
import { PermanentTranscriptionError, TemporaryTranscriptionError, type TranscriptionProvider } from "../../src/reporting/transcription/provider";
import { setTranscriptionProviderForTests } from "../../src/reporting/transcription/queue";
import type { User } from "../../src/payload-types";

/**
 * Reporting against real PostgreSQL (docs/reporting.md): capture routing and
 * context inheritance, confidentiality, ground-rule snapshots, idempotent
 * capture, transcription jobs (provider stubbed at the boundary), manual
 * import, selections and verification, the off-the-record guard, provenance,
 * and that none of it is public.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `rep-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `rep-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string | null) => createLocalReq(key ? { user: accounts[key] } : {}, payload);

type Call = { status: number; body: Record<string, any> };
async function call(method: string, path: string, key: string | null, options: { data?: unknown; params?: Record<string, string | number>; file?: PayloadRequest["file"] } = {}): Promise<Call> {
  const endpoint = reportingEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await reqAs(key);
  Object.assign(req, { routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)])), data: options.data ?? {}, searchParams: new URLSearchParams(), file: options.file });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}

/** A real (silent) PCM WAV, so Payload's upload sniffing accepts it. */
function wav(name: string, seconds = 1): NonNullable<PayloadRequest["file"]> {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + samples * 2, 4); data.write("WAVE", 8); data.write("fmt ", 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  return { data, mimetype: "audio/wav", name, size: data.length };
}
const text = (name: string, body: string, mimetype = "text/plain"): NonNullable<PayloadRequest["file"]> => {
  const data = Buffer.from(body, "utf8");
  return { data, mimetype, name, size: data.length };
};

const stubSegments = [
  { id: "s0", startMs: 0, endMs: 4000, speaker: "SPEAKER_00", text: "We knew going into the second half we had to tackle better." },
  { id: "s1", startMs: 4000, endMs: 7000, speaker: "SPEAKER_01", text: "What changed defensively?" },
  { id: "s2", startMs: 7000, endMs: 12000, speaker: "SPEAKER_00", text: "We switched to man coverage and trusted our corners." }
];
let providerMode: "ok" | "permanent" | "temporary" = "ok";
const stub: TranscriptionProvider = {
  id: "stub-whisper", model: "test-model", private: true,
  async transcribe() {
    if (providerMode === "permanent") throw new PermanentTranscriptionError("Unsupported audio codec.");
    if (providerMode === "temporary") throw new TemporaryTranscriptionError("The transcription service is unavailable (HTTP 503).");
    return { language: "en", durationMs: 12000, segments: stubSegments };
  }
};
const runReporting = () => payload.jobs.run({ queue: "reporting", limit: 10 });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_reporting`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("admin", "administrator");
  await account("editor", "editor"); // an editor who is NOT this story's assigned editor
  await account("assigned", "editor"); // the story's assigned editor
  await account("alice", "staff"); // contributor: manages the story
  await account("bob", "staff"); // photographer: holds a production assignment only
  await account("stranger", "staff");
  const section = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  ids.story = (await payload.create({ collection: "stories", data: { headline: "Football vs. Saluda", section, contributors: [people.alice] } as never, draft: true, overrideAccess: true })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: ids.story } }, limit: 1 })).docs[0];
  await payload.update({ collection: "story-plans", id: plan.id, data: { editor: accounts.assigned.id }, overrideAccess: true });
  const asEditor = { req: await reqAs("assigned"), overrideAccess: false as const };
  ids.coach = (await payload.create({ collection: "sources", data: { story: ids.story, label: "Coach Smith", role: "Head coach", groundRules: "on-record", recordingPermission: true }, ...asEditor })).id;
  ids.tipster = (await payload.create({ collection: "sources", data: { story: ids.story, label: "Booster club parent", groundRules: "off-record" }, ...asEditor })).id;
  ids.interview = (await payload.create({ collection: "appointments", data: { story: ids.story, title: "Interview Coach Smith", kind: "interview", source: ids.coach, scheduleMode: "exact", startAt: new Date(Date.now() + 3600_000).toISOString() }, ...asEditor })).id;
  ids.assignment = (await payload.create({ collection: "production-assignments", data: { story: ids.story, title: "Game photos", type: "photo", assignees: [accounts.bob.id] }, ...asEditor })).id;
  setTranscriptionProviderForTests(stub);
}, 300_000);

afterAll(async () => {
  setTranscriptionProviderForTests(undefined);
  await payload?.db?.destroy?.();
});

describe("notes: capture, inheritance and idempotency", () => {
  it("routes a note from an appointment to the Story, inheriting its source without being asked", async () => {
    const result = await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "Ask about the second-half adjustments", appointmentId: ids.interview, clientKey: "note-key-0001" } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ kind: "note", duplicate: false, status: "saved" });
    const note = await payload.findByID({ collection: "reporting-notes", id: result.body.id, depth: 0 });
    expect(note).toMatchObject({ story: ids.story, source: ids.coach, appointment: ids.interview, createdBy: accounts.alice.id, confidential: false });
    ids.note = result.body.id;
  });

  it("returns the first note for a retried submission (same client key) instead of saving twice", async () => {
    const again = await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "Ask about the second-half adjustments", clientKey: "note-key-0001" } });
    expect(again.body).toMatchObject({ id: ids.note, duplicate: true });
    expect((await payload.count({ collection: "reporting-notes", where: { clientKey: { equals: "note-key-0001" } } })).totalDocs).toBe(1);
    // Someone else reusing a key is refused, never shown the record.
    expect((await call("post", "/byline/stories/:id/reporting/notes", "bob", { params: { id: ids.story }, data: { text: "x", clientKey: "note-key-0001" } })).status).toBe(409);
  });

  it("refuses an appointment or source from another story, an empty note and a stranger", async () => {
    const other = (await payload.create({ collection: "stories", data: { headline: "Other", contributors: [people.alice] } as never, draft: true, overrideAccess: true })).id;
    const otherSource = (await payload.create({ collection: "sources", data: { story: other, label: "Elsewhere" }, overrideAccess: true, context: { bylineSystem: true } })).id;
    expect((await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "x", sourceId: otherSource } })).status).toBe(400);
    expect((await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "   " } })).status).toBe(400);
    expect((await call("post", "/byline/stories/:id/reporting/notes", "stranger", { params: { id: ids.story }, data: { text: "hi" } })).status).toBe(403);
  });
});

describe("confidential material", () => {
  it("shows confidential notes only to the creator, the assigned editor and administrators", async () => {
    const created = await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "SENTINEL-CONFIDENTIAL tip about the booster club", confidential: true } });
    ids.secret = created.body.id;
    const sees = async (key: string) => (await call("get", "/byline/stories/:id/reporting", key, { params: { id: ids.story } })).body.materials?.some((item: { key: string }) => item.key === `note:${ids.secret}`) ?? false;
    expect(await sees("alice")).toBe(true);
    expect(await sees("assigned")).toBe(true);
    expect(await sees("admin")).toBe(true);
    // An editor who manages every story but is not the assigned editor, and a participant, do not.
    expect(await sees("editor")).toBe(false);
    expect(await sees("bob")).toBe(false);
    // Enforced by collection access, not the read model: a direct REST-style read finds nothing.
    for (const key of ["editor", "bob", "stranger"]) {
      const found = await payload.find({ collection: "reporting-notes", where: { id: { equals: ids.secret } }, req: await reqAs(key), overrideAccess: false });
      expect(found.totalDocs, key).toBe(0);
    }
    // Nor can they change it.
    expect((await call("patch", "/byline/reporting/notes/:id", "editor", { params: { id: ids.secret }, data: { text: "edited" } })).status).toBeGreaterThanOrEqual(403);
  });

  it("shows normal material to the participant who can see the Story's work", async () => {
    const view = await call("get", "/byline/stories/:id/reporting", "bob", { params: { id: ids.story } });
    expect(view.status).toBe(200);
    expect(view.body.materials.some((item: { key: string }) => item.key === `note:${ids.note}`)).toBe(true);
    expect((await call("get", "/byline/stories/:id/reporting", "stranger", { params: { id: ids.story } })).status).toBe(403);
  });
});

describe("recordings, ground rules and transcription", () => {
  it("records from an appointment: the file inherits Story, source, appointment, uploader and a ground-rules snapshot", async () => {
    const result = await call("post", "/byline/stories/:id/reporting/files", "alice", { params: { id: ids.story }, data: { appointmentId: ids.interview, clientKey: "rec-key-00001" }, file: wav("coach-smith.wav") });
    expect(result.status).toBe(200);
    ids.recording = result.body.id;
    const file = await payload.findByID({ collection: "reporting-files", id: ids.recording, depth: 0 });
    expect(file).toMatchObject({ story: ids.story, source: ids.coach, appointment: ids.interview, createdBy: accounts.alice.id, kind: "audio", originalFilename: "coach-smith.wav" });
    expect(file.groundRules).toMatchObject({ rule: "on-record", recordingPermission: true, sourceId: ids.coach });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    // A private provider queues transcription automatically.
    const transcript = (await payload.find({ collection: "reporting-transcripts", where: { file: { equals: ids.recording } } })).docs[0];
    expect(transcript).toMatchObject({ state: "queued", source: ids.coach, appointment: ids.interview, origin: "machine" });
    ids.transcript = transcript.id;
  });

  it("does not let a later Source edit rewrite the captured snapshot", async () => {
    await payload.update({ collection: "sources", id: ids.coach, data: { groundRules: "background" }, overrideAccess: true });
    const file = await payload.findByID({ collection: "reporting-files", id: ids.recording, depth: 0 });
    expect((file.groundRules as { rule: string }).rule).toBe("on-record");
    await payload.update({ collection: "sources", id: ids.coach, data: { groundRules: "on-record" }, overrideAccess: true });
  });

  it("transcribes on the reporting queue, stores provider-neutral segments and tells the uploader", async () => {
    await runReporting();
    const transcript = await payload.findByID({ collection: "reporting-transcripts", id: ids.transcript, depth: 0 });
    expect(transcript).toMatchObject({ state: "ready", provider: "stub-whisper", model: "test-model", language: "en", durationMs: 12000 });
    expect((transcript.segments as unknown[]).length).toBe(3);
    expect(transcript.searchText).toContain("man coverage");
    const notices = await payload.find({ collection: "notifications", where: { and: [{ recipient: { equals: accounts.alice.id } }, { kind: { equals: "transcriptReady" } }] } });
    expect(notices.totalDocs).toBe(1);
    // The feed carries a summary, never the body.
    const feed = await call("get", "/byline/stories/:id/reporting", "alice", { params: { id: ids.story } });
    const item = feed.body.materials.find((entry: { key: string }) => entry.key === `file:${ids.recording}`);
    expect(item.transcript).toMatchObject({ id: ids.transcript, state: "ready", origin: "machine" });
    expect(JSON.stringify(feed.body)).not.toContain("man coverage");
  });

  it("fails malformed audio once and retries temporary outages", async () => {
    providerMode = "permanent";
    const bad = await call("post", "/byline/stories/:id/reporting/files", "alice", { params: { id: ids.story }, data: {}, file: wav("broken.wav") });
    await runReporting();
    const failed = (await payload.find({ collection: "reporting-transcripts", where: { file: { equals: bad.body.id } } })).docs[0];
    expect(failed).toMatchObject({ state: "failed", failure: "Unsupported audio codec." });

    providerMode = "temporary";
    const flaky = await call("post", "/byline/stories/:id/reporting/files", "alice", { params: { id: ids.story }, data: {}, file: wav("flaky.wav") });
    await runReporting();
    const queued = (await payload.find({ collection: "reporting-transcripts", where: { file: { equals: flaky.body.id } } })).docs[0];
    expect(queued.state).toBe("queued");
    expect(queued.attempts).toBe(1);
    expect(queued.failure).toContain("503");
    providerMode = "ok";
  });

  it("keeps uploads and manual import working without a provider", async () => {
    setTranscriptionProviderForTests(null);
    const plain = await call("post", "/byline/stories/:id/reporting/files", "alice", { params: { id: ids.story }, data: {}, file: wav("no-provider.wav") });
    expect(plain.status).toBe(200);
    expect((await payload.count({ collection: "reporting-transcripts", where: { file: { equals: plain.body.id } } })).totalDocs).toBe(0);
    expect((await call("post", "/byline/reporting/files/:id/transcribe", "alice", { params: { id: plain.body.id } })).status).toBe(409);
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<v Coach Smith>We played hard.\n\n00:00:04.000 --> 00:00:06.000\nThanks, coach.\n";
    const imported = await call("post", "/byline/stories/:id/reporting/transcripts", "alice", { params: { id: ids.story }, data: { fileId: plain.body.id }, file: text("interview.vtt", vtt, "text/vtt") });
    expect(imported.status).toBe(200);
    const transcript = await payload.findByID({ collection: "reporting-transcripts", id: imported.body.transcriptId, depth: 0 });
    expect(transcript).toMatchObject({ origin: "manual", state: "ready", provider: "manual" });
    expect((transcript.segments as Array<{ speaker?: string; startMs: number }>)[0]).toMatchObject({ speaker: "Coach Smith", startMs: 1000 });
    // A standalone plain-text transcript keeps its file as the private document it belongs to.
    const standalone = await call("post", "/byline/stories/:id/reporting/transcripts", "alice", { params: { id: ids.story }, data: { appointmentId: ids.interview }, file: text("notes.txt", "Coach Smith: First paragraph.\n\nSecond paragraph.") });
    expect(standalone.status).toBe(200);
    const doc = await payload.findByID({ collection: "reporting-files", id: standalone.body.fileId, depth: 0 });
    expect(doc).toMatchObject({ kind: "document", source: ids.coach, appointment: ids.interview });
    setTranscriptionProviderForTests(stub);
  });
});

describe("quotes, verification and provenance", () => {
  it("saves a quote that inherits source, ground rules, timing and on-record attribution", async () => {
    const created = await call("post", "/byline/reporting/transcripts/:id/selections", "alice", { params: { id: ids.transcript }, data: { segmentIds: ["s2"], kind: "quote" } });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ text: "We switched to man coverage and trusted our corners.", attribution: "Coach Smith, Head coach", startMs: 7000, endMs: 12000, state: "saved", use: { action: "insert" } });
    expect(created.body.groundRules.rule).toBe("on-record");
    ids.quote = created.body.id;
  });

  it("verifies deliberately, and editing the words un-verifies them", async () => {
    expect((await call("post", "/byline/reporting/selections/:id/verify", "alice", { params: { id: ids.quote }, data: { verified: true } })).body.state).toBe("verified");
    const row = await payload.findByID({ collection: "transcript-selections", id: ids.quote, depth: 0 });
    expect(row.verifiedBy).toBe(accounts.alice.id);
    // A form cannot set verification directly.
    await payload.update({ collection: "transcript-selections", id: ids.quote, data: { state: "saved" } as never, req: await reqAs("alice"), overrideAccess: false });
    expect((await payload.findByID({ collection: "transcript-selections", id: ids.quote, depth: 0 })).state).toBe("verified");
    await call("patch", "/byline/reporting/selections/:id", "alice", { params: { id: ids.quote }, data: { text: "We switched to man coverage." } });
    expect((await payload.findByID({ collection: "transcript-selections", id: ids.quote, depth: 0 })).state).toBe("saved");
    await call("post", "/byline/reporting/selections/:id/verify", "alice", { params: { id: ids.quote }, data: { verified: true } });
  });

  it("never offers off-the-record words for insertion, and refuses to publish them by reference without an editor's audited override", async () => {
    const recording = await call("post", "/byline/stories/:id/reporting/files", "alice", { params: { id: ids.story }, data: { sourceId: ids.tipster }, file: wav("tipster.wav") });
    await runReporting();
    const transcript = (await payload.find({ collection: "reporting-transcripts", where: { file: { equals: recording.body.id } } })).docs[0];
    const quote = await call("post", "/byline/reporting/transcripts/:id/selections", "alice", { params: { id: transcript.id }, data: { segmentIds: ["s0"] } });
    expect(quote.body.use.action).toBe("blocked");
    expect(quote.body.attribution).toBe("");
    const body = (selection: number) => ({ root: { type: "root", version: 1, children: [{ type: "block", version: 2, format: "", fields: { id: "q1", blockName: "", blockType: "reportedQuote", text: "x", attribution: "y", reportingSelection: selection } }], direction: null, format: "", indent: 0 } });
    await expect(payload.update({ collection: "stories", id: ids.story, draft: true, data: { body: body(quote.body.id) } as never, req: await reqAs("alice"), overrideAccess: false })).rejects.toThrow(/off the record/);
    expect((await call("post", "/byline/reporting/selections/:id/off-record-override", "alice", { params: { id: quote.body.id }, data: { reason: "Source later agreed to be named." } })).status).toBe(403);
    expect((await call("post", "/byline/reporting/selections/:id/off-record-override", "assigned", { params: { id: quote.body.id }, data: { reason: "x" } })).status).toBe(400);
    expect((await call("post", "/byline/reporting/selections/:id/off-record-override", "assigned", { params: { id: quote.body.id }, data: { reason: "Source later agreed to be named on the record." } })).status).toBe(200);
    await payload.update({ collection: "stories", id: ids.story, draft: true, data: { body: body(quote.body.id) } as never, req: await reqAs("alice"), overrideAccess: false });
  });

  it("traces a quote used in the article back to its recording, timestamp and verifier", async () => {
    const body = { root: { type: "root", version: 1, children: [{ type: "block", version: 2, format: "", fields: { id: "q2", blockName: "", blockType: "reportedQuote", text: "We switched to man coverage.", attribution: "Coach Smith, Head coach", reportingSelection: ids.quote } }], direction: null, format: "", indent: 0 } };
    await payload.update({ collection: "stories", id: ids.story, draft: true, data: { body } as never, req: await reqAs("alice"), overrideAccess: false });
    const provenance = await call("get", "/byline/reporting/selections/:id/provenance", "assigned", { params: { id: ids.quote } });
    expect(provenance.status).toBe(200);
    expect(provenance.body.quote).toMatchObject({ state: "verified", startMs: 7000, verifiedBy: { name: "alice Account" }, usedIn: [{ id: ids.story, headline: "Football vs. Saluda" }] });
    expect(provenance.body.source).toMatchObject({ label: "Coach Smith" });
    expect(provenance.body.appointment).toMatchObject({ title: "Interview Coach Smith" });
    expect(provenance.body.recording).toMatchObject({ filename: "coach-smith.wav", capturedBy: "alice Account" });
    expect(provenance.body.transcript).toMatchObject({ origin: "machine", provider: "stub-whisper" });
    // Removing the block removes the use.
    await payload.update({ collection: "stories", id: ids.story, draft: true, data: { body: { root: { ...body.root, children: [] } } } as never, req: await reqAs("alice"), overrideAccess: false });
    expect((await payload.findByID({ collection: "transcript-selections", id: ids.quote, depth: 0 })).usedIn).toEqual([]);
  });

  it("lists the Story's saved quotes for the article editor, verified first", async () => {
    const quotes = (await call("get", "/byline/stories/:id/reporting/quotes", "alice", { params: { id: ids.story } })).body.quotes;
    expect(quotes[0]).toMatchObject({ id: ids.quote, state: "verified" });
    expect(quotes.every((quote: { kind: string }) => quote.kind === "quote")).toBe(true);
  });

  it("edits transcript words and speakers without moving timing or ids, refusing stale edits", async () => {
    const detail = (await call("get", "/byline/reporting/transcripts/:id", "alice", { params: { id: ids.transcript } })).body;
    expect(detail.speakers).toEqual(["SPEAKER_00", "SPEAKER_01"]);
    const renamed = await call("patch", "/byline/reporting/transcripts/:id", "alice", { params: { id: ids.transcript }, data: { renameSpeaker: { from: "SPEAKER_00", to: "Coach Smith" }, expectedUpdatedAt: detail.updatedAt } });
    expect(renamed.status).toBe(200);
    const edited = await call("patch", "/byline/reporting/transcripts/:id", "alice", { params: { id: ids.transcript }, data: { segmentId: "s1", text: "What changed on defense?", expectedUpdatedAt: renamed.body.updatedAt } });
    expect(edited.body.segments.find((segment: { id: string }) => segment.id === "s1")).toMatchObject({ text: "What changed on defense?", startMs: 4000, endMs: 7000 });
    expect(edited.body.segments.filter((segment: { speaker?: string }) => segment.speaker === "Coach Smith")).toHaveLength(2);
    expect((await call("patch", "/byline/reporting/transcripts/:id", "alice", { params: { id: ids.transcript }, data: { segmentId: "s1", text: "Stale", expectedUpdatedAt: detail.updatedAt } })).status).toBe(409);
  });
});

describe("privacy", () => {
  it("is never public: no reporting collection is tracked for the public site, and reporting writes never advance the public revision", async () => {
    for (const slug of ["reporting-notes", "reporting-files", "reporting-transcripts", "transcript-selections"]) expect(PUBLIC_COLLECTIONS[slug]).toBeUndefined();
    const before = await readCurrentRevision(payload);
    await call("post", "/byline/stories/:id/reporting/notes", "alice", { params: { id: ids.story }, data: { text: "Private" } });
    expect(await readCurrentRevision(payload)).toBe(before);
  });

  it("propagates a recording's confidentiality to its transcript and selections", async () => {
    await call("patch", "/byline/reporting/files/:id", "alice", { params: { id: ids.recording }, data: { confidential: true } });
    const transcript = await payload.findByID({ collection: "reporting-transcripts", id: ids.transcript, depth: 0 });
    expect(transcript.confidential).toBe(true);
    const quote = await payload.findByID({ collection: "transcript-selections", id: ids.quote, depth: 0 });
    expect(quote.confidential).toBe(true);
    expect((await payload.find({ collection: "transcript-selections", where: { id: { equals: ids.quote } }, req: await reqAs("bob"), overrideAccess: false })).totalDocs).toBe(0);
    const activity = await payload.find({ collection: "story-activity", where: { and: [{ story: { equals: ids.story } }, { action: { equals: "material-made-confidential" } }] } });
    expect(activity.totalDocs).toBe(1);
  });
});
