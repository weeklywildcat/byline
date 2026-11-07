import { createLocalReq, getPayload, type Payload } from "payload";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prunePresenceSessions } from "../../src/db/presence-sessions";
import { PRESENCE_TIMING, type Heartbeat, type PresenceSnapshot } from "../../src/domain/presence";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

let payload: Payload;
let db: pg.Client;
const accounts: Record<string, User> = {};
let storyId: number;
let collectionId: number;
const one = "a".repeat(32);
const two = "b".repeat(32);
const beat = (overrides: Partial<Heartbeat> = {}): Heartbeat => ({
  sessionId: one, revision: 1, state: "active", location: { kind: "media" }, ...overrides
});

async function call(method: "get" | "post", who: string | null, input?: unknown, extra: HeadersInit = {}) {
  const endpoint = newsroomEndpoints.find((entry) => entry.path === "/byline/presence" && entry.method === method)!;
  const headers = new Headers(extra);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const request = new Request("http://localhost:3010/api/byline/presence", { method: method.toUpperCase(), headers, body: input === undefined ? undefined : JSON.stringify(input) });
  const req = await createLocalReq({ user: who ? accounts[who] : undefined, req: { headers, body: request.body } }, payload);
  const response = await endpoint.handler(req);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  return { status: response.status, body: await response.json() as PresenceSnapshot };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname += "_presence";
  process.env.DATABASE_URL = url.toString();
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  for (const [name, role, enabled] of [
    ["Admin", "administrator", true], ["Writer", "staff", true], ["Reader", "staff", true], ["Disabled", "staff", false]
  ] as const) {
    const user = await payload.create({ collection: "users", data: { name, role, enabled, email: `${name.toLowerCase()}@example.test`, password: "local-fixture-password" } });
    accounts[name] = { ...user, collection: "users" } as User;
  }
  storyId = (await payload.create({
    collection: "stories", draft: true, data: { headline: "Private draft headline" }, user: accounts.Writer, overrideAccess: false
  })).id;
  collectionId = (await payload.create({
    collection: "collections", data: { name: "Reporting project", type: "other", status: "planning" }, user: accounts.Admin, overrideAccess: false
  })).id;
});

afterAll(async () => {
  await db?.end();
  await payload?.db?.destroy?.();
});

describe("private Presence API and session table", () => {
  it("rejects anonymous and disabled requests, and exposes only enabled accounts", async () => {
    for (const who of [null, "Disabled"]) {
      expect((await call("get", who)).status).toBe(401);
      expect((await call("post", who, beat())).status).toBe(401);
    }
    const { status, body } = await call("get", "Reader");
    expect(status).toBe(200);
    expect(body.people.map(({ name }) => name).sort()).toEqual(["Admin", "Writer"]);
    expect(body.people.every((person) => person.state === "offline" && person.lastSeen === null)).toBe(true);
    expect(Object.keys(body.people[0]!).sort()).toEqual(["avatarUrl", "key", "lastActive", "lastSeen", "location", "name", "state"]);
  });

  it("rejects forged account IDs, unstructured data, bad record IDs and cross-origin writes", async () => {
    for (const input of [
      { ...beat(), userId: accounts.Writer!.id },
      { ...beat(), sessionId: "../bad" },
      { ...beat(), revision: 0 },
      { ...beat(), location: { kind: "settings" } },
      { ...beat(), location: { kind: "media", label: "Private label" } },
      ...[0, -1, "2", 2.5, 2_147_483_648].map((targetId) => ({ ...beat(), location: { kind: "story", targetId } }))
    ]) expect((await call("post", "Reader", input)).status).toBe(400);
    expect((await call("post", "Reader", beat(), { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await call("post", "Reader", beat(), { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await call("post", "Reader", "x".repeat(2048))).status).toBe(413);
    expect((await db.query("SELECT * FROM byline_presence_sessions")).rowCount).toBe(0);
  });

  it("upserts only the caller's tab, preserves separate tabs and ignores reordered heartbeats", async () => {
    expect((await call("post", "Writer", beat())).status).toBe(200);
    await call("post", "Writer", beat({ revision: 3, location: { kind: "calendar" } }));
    await call("post", "Writer", beat({ revision: 2, state: "away" }));
    await call("post", "Writer", beat({ sessionId: two, state: "away" }));
    await call("post", "Reader", beat({ revision: 100 }));
    const { rows } = await db.query("SELECT user_id, session_id, revision FROM byline_presence_sessions ORDER BY user_id, session_id");
    expect(rows).toEqual([
      { user_id: accounts.Writer!.id, session_id: one, revision: "3" },
      { user_id: accounts.Writer!.id, session_id: two, revision: "1" },
      { user_id: accounts.Reader!.id, session_id: one, revision: "100" }
    ]);
    const writer = (await call("get", "Reader")).body.people.find(({ name }) => name === "Writer");
    expect(writer).toMatchObject({ state: "active", location: { label: "Calendar", href: "/admin/calendar" } });
  });

  it("resolves canonical titles as the viewer and never leaks a private Story title, ID or link", async () => {
    const location = { kind: "story", targetId: storyId } as const;
    expect((await call("post", "Writer", beat({ revision: 4, location }))).body.self.location).toMatchObject({ label: "Private draft headline" });
    const writerFor = async (who: string) => (await call("get", who)).body.people.find(({ name }) => name === "Writer");
    expect((await writerFor("Admin"))?.location).toEqual({
      label: "Private draft headline", detail: "Story workspace", href: `/admin/collections/stories/${storyId}`, location
    });
    expect((await writerFor("Reader"))?.location).toEqual({ label: "Working in Byline" });
    await payload.update({ collection: "stories", id: storyId, draft: true, data: { headline: "Renamed private draft" } });
    expect((await writerFor("Admin"))?.location?.label).toBe("Renamed private draft");
    expect((await call("post", "Reader", beat({ revision: 101, location }))).body.self.location).toEqual({ label: "Working in Byline" });
    const { rows } = await db.query("SELECT location_kind, target_id FROM byline_presence_sessions WHERE user_id = $1", [accounts.Reader!.id]);
    expect(rows).toEqual([{ location_kind: "other", target_id: null }]);
    await call("post", "Writer", beat({ revision: 5, location: { kind: "collection", targetId: collectionId } }));
    expect((await writerFor("Reader"))?.location).toMatchObject({ label: "Reporting project", href: `/admin/collections?collection=${collectionId}` });
  });

  it("keeps last activity for offline accounts and prunes only rows beyond retention", async () => {
    const now = Date.now();
    const stale = new Date(now - PRESENCE_TIMING.recent - 10_000);
    const expired = new Date(now - PRESENCE_TIMING.retention - 10_000);
    await db.query("UPDATE byline_presence_sessions SET last_seen = $1, last_active = $1 WHERE user_id = $2", [stale, accounts.Writer!.id]);
    await db.query("UPDATE byline_presence_sessions SET last_seen = $1, last_active = $1 WHERE session_id = $2", [expired, two]);
    const writer = (await call("get", "Reader")).body.people.find(({ name }) => name === "Writer");
    expect(writer).toMatchObject({ state: "offline", location: null, lastActive: stale.getTime() });
    await prunePresenceSessions(payload, now);
    const { rows } = await db.query("SELECT session_id FROM byline_presence_sessions");
    expect(rows).toEqual([{ session_id: one }, { session_id: one }]);
    expect((await call("get", "Reader")).body.self.state).toBe("active");
  });
});
