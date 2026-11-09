/** Throwaway local fixture for browser-testing Reporting. Refuses any database not named byline_newsroom_test_reporting_browser*. */
import pg from "pg";
import { mkdir, rm } from "node:fs/promises";
import { getPayload } from "payload";

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_reporting_browser");
if (!/^byline_newsroom_test_reporting_browser[a-z0-9_]*$/.test(database.pathname.slice(1))) throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET = "reporting-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
delete process.env.BYLINE_GOOGLE_CLIENT_ID;
process.env.BYLINE_NEWSROOM_URL = process.env.BYLINE_NEWSROOM_URL ?? "http://localhost:3047";
for (const [key, dir] of [["BYLINE_MEDIA_LOCAL_DIR", "/private/tmp/byline-reporting-browser-media"], ["BYLINE_REPORTING_LOCAL_DIR", "/private/tmp/byline-reporting-browser-files"], ["BYLINE_PUBLICATION_MEDIA_DIR", "/private/tmp/byline-reporting-browser-publication"]] as const) {
  process.env[key] = dir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });

function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + samples * 2, 4); data.write("WAVE", 8); data.write("fmt ", 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 330) * 1500), 44 + i * 2);
  return data;
}

try {
  const password = "reporting-browser-123456";
  const account = async (key: string, role: "administrator" | "editor" | "staff", person = true) => {
    const linked = person ? (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `rb-${key}`, status: "active" } })).id : null;
    return payload.create({ collection: "users", data: { name: `${key[0].toUpperCase()}${key.slice(1)} Reporter`, email: `${key}@example.test`, password, role, enabled: true, linkedPerson: linked } });
  };
  await account("admin", "administrator", false);
  const editor = await account("editor", "editor");
  const alice = await account("alice", "staff");
  await account("bob", "staff");
  const section = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  const story = (await payload.create({
    collection: "stories", draft: true, overrideAccess: true, context: { bylineSystem: true },
    data: { headline: "Football beats Saluda in the second half", section, contributors: [alice.linkedPerson] } as never
  })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: story } }, limit: 1 })).docs[0];
  await payload.update({ collection: "story-plans", id: plan.id, data: { editor: editor.id }, overrideAccess: true, context: { bylineSystem: true } });
  const system = { overrideAccess: true as const, context: { bylineSystem: true } };
  const coach = (await payload.create({ collection: "sources", data: { story, label: "Coach Smith", role: "Head coach", groundRules: "on-record", recordingPermission: true }, ...system } as never)).id;
  const tipster = (await payload.create({ collection: "sources", data: { story, label: "Booster club parent", groundRules: "off-record" }, ...system } as never)).id;
  const interview = (await payload.create({ collection: "appointments", data: { story, title: "Interview Coach Smith", kind: "interview", source: coach, scheduleMode: "exact", startAt: new Date(Date.now() + 2 * 3600_000).toISOString() }, ...system } as never)).id;
  await payload.create({ collection: "appointments", data: { story, title: "Records request follow-up", kind: "reporting", scheduleMode: "window", windowStart: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) }, ...system } as never);
  await payload.create({ collection: "reporting-notes", data: { story, text: "Ask the superintendent about the funding source for the new turf.", source: null, createdBy: alice.id, capturedAt: new Date().toISOString() } as never, ...system });
  const file = await payload.create({
    collection: "reporting-files", ...system,
    data: { story, source: coach, appointment: interview, createdBy: alice.id, capturedAt: new Date(Date.now() - 3600_000).toISOString(), durationMs: 60_000, groundRules: { rule: "on-record", recordingPermission: true, note: "", sourceId: coach, capturedAt: new Date().toISOString() } } as never,
    file: { data: wav(60), mimetype: "audio/wav", name: "coach-smith.wav", size: 44 + 8000 * 2 * 60 }
  });
  const segments = [
    { id: "s0", startMs: 0, endMs: 9000, speaker: "SPEAKER_00", text: "We knew going into the second half we had to tackle better, and the kids responded." },
    { id: "s1", startMs: 9000, endMs: 15000, speaker: "SPEAKER_01", text: "What changed defensively after the break?" },
    { id: "s2", startMs: 15000, endMs: 28000, speaker: "SPEAKER_00", text: "We switched to man coverage and trusted our corners to win their matchups." },
    { id: "s3", startMs: 28000, endMs: 41000, speaker: "SPEAKER_01", text: "Was the weather a factor in your play calling?" },
    { id: "s4", startMs: 41000, endMs: 58000, speaker: "SPEAKER_00", text: "Not really. We practiced in worse. It came down to execution and the kids' effort." }
  ];
  const transcript = await payload.create({
    collection: "reporting-transcripts", ...system,
    data: { story, file: file.id, source: coach, appointment: interview, createdBy: alice.id, state: "ready", origin: "machine", provider: "faster-whisper", model: "small.en", language: "en", durationMs: 60_000, segments, searchText: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"), groundRules: file.groundRules, completedAt: new Date().toISOString(), capturedAt: new Date().toISOString() } as never
  });
  await payload.create({
    collection: "transcript-selections", ...system,
    data: { story, transcript: transcript.id, file: file.id, source: coach, kind: "quote", text: "We switched to man coverage and trusted our corners.", attribution: "Coach Smith, Head coach", speaker: "SPEAKER_00", startMs: 15000, endMs: 28000, segmentIds: ["s2"], groundRules: file.groundRules, state: "verified", verifiedBy: alice.id, verifiedAt: new Date().toISOString(), createdBy: alice.id } as never
  });
  await payload.create({
    collection: "transcript-selections", ...system,
    data: { story, transcript: transcript.id, file: file.id, source: coach, kind: "quote", text: "It came down to execution and the kids' effort.", attribution: "Coach Smith, Head coach", speaker: "SPEAKER_00", startMs: 41000, endMs: 58000, segmentIds: ["s4"], groundRules: file.groundRules, state: "saved", createdBy: alice.id } as never
  });
  void tipster;
  console.log(JSON.stringify({ story, transcript: transcript.id, accounts: ["editor@example.test", "alice@example.test", "admin@example.test", "bob@example.test"] }));
} finally {
  await payload.db.destroy?.();
}
