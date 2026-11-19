/**
 * Throwaway local fixture for the Google Analytics browser tests (playwright.analytics.config.ts). Resets only a
 * database named byline_newsroom_test_analytics_browser*, then creates three test accounts, a section and three
 * Stories (two published, one draft). The passwords are test values for this fixture only. Google is faked by
 * tests/support/google-preload.mjs.
 */
import pg from "pg";
import { getPayload } from "payload";

export const ANALYTICS_BROWSER_ACCOUNTS = {
  admin: { email: "admin@analytics.test", password: "analytics-browser-admin-2026", name: "Avery Admin", role: "administrator" },
  editor: { email: "editor@analytics.test", password: "analytics-browser-editor-2026", name: "Eden Editor", role: "editor" },
  staff: { email: "staff@analytics.test", password: "analytics-browser-staff-2026", name: "Sam Staff", role: "staff" }
} as const;

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_analytics_browser");
if (!/^byline_newsroom_test_analytics_browser[a-z0-9_]*$/.test(database.pathname.slice(1))) throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET ??= "analytics-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });
try {
  const person = (await payload.create({ collection: "people", data: { name: "Sam Staff", slug: "sam-staff", status: "active" }, overrideAccess: true })).id;
  await payload.create({ collection: "users", data: { ...ANALYTICS_BROWSER_ACCOUNTS.admin, enabled: true }, overrideAccess: true });
  await payload.create({ collection: "users", data: { ...ANALYTICS_BROWSER_ACCOUNTS.editor, enabled: true }, overrideAccess: true });
  await payload.create({ collection: "users", data: { ...ANALYTICS_BROWSER_ACCOUNTS.staff, enabled: true, linkedPerson: person }, overrideAccess: true });
  const news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" }, overrideAccess: true })).id;
  const published = (headline: string, slug: string) => payload.create({ collection: "stories", data: { headline, slug, section: news, contributors: [person], _status: "published", publishedAt: "2026-11-10T15:00:00.000Z" } as never, overrideAccess: true });
  await published("Where the sidewalk stands", "where-the-sidewalk-stands");
  await published("How the bands ranked", "how-the-bands-ranked");
  await payload.create({ collection: "stories", draft: true, data: { headline: "Unfinished draft", section: news, contributors: [person] } as never, overrideAccess: true });
} finally {
  await payload.destroy();
}
process.exit(0);
