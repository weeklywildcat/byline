import { getPayload } from "payload";

/**
 * Creates the administrator, editor and staff accounts that the browser suites sign in as
 * (BYLINE_DEV_{ADMIN,EDITOR,STAFF}_EMAIL / _PASSWORD in apps/newsroom/.env) in a throwaway local
 * database. Refuses anything that is not a dedicated database.
 *
 *   node --import tsx tests/fixtures/seed-browser-accounts.ts
 */
const db = new URL(process.env.DATABASE_URL ?? "");
if (!/^\/byline_newsroom_[a-z0-9_]+$/.test(db.pathname)) throw new Error("Use a dedicated byline_newsroom_* database.");

const { default: config } = await import("../../src/payload.config");
const payload = await getPayload({ config });
try {
  for (const [key, role] of [["ADMIN", "administrator"], ["EDITOR", "editor"], ["STAFF", "staff"]] as const) {
    const email = process.env[`BYLINE_DEV_${key}_EMAIL`];
    const password = process.env[`BYLINE_DEV_${key}_PASSWORD`];
    if (!email || !password) throw new Error(`Set BYLINE_DEV_${key}_EMAIL and _PASSWORD.`);
    const existing = await payload.find({ collection: "users", where: { email: { equals: email } }, limit: 1 });
    const data = { name: `${key.toLowerCase()} account`, email, role, enabled: true, password };
    if (existing.docs[0]) await payload.update({ collection: "users", id: existing.docs[0].id, data });
    else await payload.create({ collection: "users", data });
  }
} finally {
  await payload.destroy();
}
process.exit(0);
