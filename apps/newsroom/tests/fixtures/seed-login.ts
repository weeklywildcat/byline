import { getPayload } from "payload";

const db = new URL(process.env.DATABASE_URL ?? "");
if (!/^\/byline_newsroom_test[a-z0-9_]*$/.test(db.pathname)) throw new Error("Use a dedicated test database.");

const { default: config } = await import("../../src/payload.config");
const payload = await getPayload({ config });
try {
  for (const [name, role, enabled] of [
    ["admin", "administrator", true], ["staff", "staff", true],
    ["disabled", "staff", false], ["other", "staff", true],
  ] as const) {
    const email = `${name}@weeklywildcat.com`;
    const existing = await payload.find({ collection: "users", where: { email: { equals: email } }, limit: 1 });
    const data = { name, email, role, enabled, password: "byline-browser-password", googleSubject: null };
    let user;
    if (existing.docs[0]) {
      const id = existing.docs[0].id;
      user = await payload.update({ collection: "users", id, data });
      await payload.db.updateOne({ collection: "users", id, data: { loginAttempts: 0, lockUntil: null } });
    } else {
      user = await payload.create({ collection: "users", data });
    }
    // These accounts test sign-in, not the first-run welcome (src/ui/onboarding): they have seen it.
    await payload.delete({ collection: "payload-preferences", where: { and: [{ key: { equals: "byline:onboarding:welcome:v1" } }, { "user.value": { equals: user.id } }] } });
    await payload.create({ collection: "payload-preferences", user: { ...user, collection: "users" }, data: { key: "byline:onboarding:welcome:v1", user: { relationTo: "users", value: user.id }, value: { schema: 1, status: "completed", finishedAt: new Date().toISOString(), acknowledgedRequestAt: null } } });
  }
} finally {
  await payload.destroy();
}

process.exit(0);
