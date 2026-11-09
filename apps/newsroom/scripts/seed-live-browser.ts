/** Throwaway local fixture for browser-testing the live reporting workflow (Story mode, Field Mode). Refuses any database not named byline_newsroom_test_live_browser*. */
import pg from "pg";
import { mkdir, rm } from "node:fs/promises";
import { getPayload } from "payload";

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_live_browser");
if (!/^byline_newsroom_test_live_browser[a-z0-9_]*$/.test(database.pathname.slice(1))) throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET = "live-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
delete process.env.BYLINE_GOOGLE_CLIENT_ID;
process.env.BYLINE_NEWSROOM_URL = process.env.BYLINE_NEWSROOM_URL ?? "http://localhost:3049";
for (const [key, dir] of [["BYLINE_MEDIA_LOCAL_DIR", "/private/tmp/byline-live-browser-media"], ["BYLINE_REPORTING_LOCAL_DIR", "/private/tmp/byline-live-browser-files"], ["BYLINE_PUBLICATION_MEDIA_DIR", "/private/tmp/byline-live-browser-publication"]] as const) {
  process.env[key] = dir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });


try {
  const password = "live-browser-123456";
  const account = async (key: string, role: "administrator" | "editor" | "staff", person = true) => {
    const linked = person ? (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `lb-${key}`, status: "active" } })).id : null;
    return payload.create({ collection: "users", data: { name: `${key[0].toUpperCase()}${key.slice(1)} Reporter`, email: `${key}@example.test`, password, role, enabled: true, linkedPerson: linked } });
  };
  await account("admin", "administrator", false);
  await account("editor", "editor");
  const alice = await account("alice", "staff");
  const bob = await account("bob", "staff");
  await account("carol", "staff");
  const section = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  const system = { overrideAccess: true as const, context: { bylineSystem: true } };
  const paragraph = (text: string) => ({ root: { type: "root", format: "", indent: 0, version: 1, direction: "ltr", children: [{ type: "paragraph", format: "", indent: 0, version: 1, direction: "ltr", textFormat: 0, textStyle: "", children: [{ type: "text", detail: 0, format: 0, mode: "normal", style: "", text, version: 1 }] }] } });
  // 1. A published game story with an UNPUBLISHED newer draft: Go live must not publish those edits.
  const game = (await payload.create({ collection: "stories", data: { headline: "Ninety Six vs. Abbeville", section, contributors: [alice.linkedPerson], body: paragraph("Published body: the Wildcats host Abbeville Friday night."), _status: "published" } as never, ...system })).id;
  await payload.update({ collection: "stories", id: game, draft: true, data: { headline: "Ninety Six vs. Abbeville (DRAFT EDIT)", body: paragraph("UNPUBLISHED draft body: this must not go public when coverage starts.") } as never, ...system });
  await payload.create({ collection: "production-assignments", data: { story: game, title: "Game photos", type: "photo", assignees: [bob.id], status: "assigned" }, ...system } as never);
  // 2. A never-published story, for Publish & go live.
  await payload.create({ collection: "stories", draft: true, data: { headline: "Playoff preview", section, contributors: [alice.linkedPerson], body: paragraph("Preview copy, ready for the readiness checks.") } as never, ...system });
  console.log(JSON.stringify({ game, password }));
} finally {
  await payload.db.destroy?.();
}
