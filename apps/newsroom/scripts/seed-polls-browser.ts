/**
 * Throwaway local fixture for the Wildcat Polls browser test
 * (playwright.polls.config.ts). Resets only a database named
 * byline_newsroom_test_polls_browser*, then creates three test accounts and
 * two polling locations. The passwords are test values for this fixture only.
 */
import pg from "pg";
import { getPayload } from "payload";

export const POLLS_BROWSER_ACCOUNTS = {
  admin: { email: "admin@polls.test", password: "polls-browser-admin-2026", name: "Avery Admin", role: "administrator" },
  editor: { email: "editor@polls.test", password: "polls-browser-editor-2026", name: "Eden Editor", role: "editor" },
  staff: { email: "staff@polls.test", password: "polls-browser-staff-2026", name: "Sam Staff", role: "staff" }
} as const;

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_polls_browser");
if (!/^byline_newsroom_test_polls_browser[a-z0-9_]*$/.test(database.pathname.slice(1))) throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET ??= "polls-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
delete process.env.BYLINE_GOOGLE_CLIENT_ID;
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });
try {
  for (const account of Object.values(POLLS_BROWSER_ACCOUNTS)) {
    await payload.create({ collection: "users", data: { ...account, enabled: true }, overrideAccess: true });
  }
  for (const name of ["Cafeteria", "Library entrance"]) await payload.create({ collection: "poll-locations", data: { name, active: true }, overrideAccess: true });
} finally {
  await payload.destroy();
}
process.exit(0);
