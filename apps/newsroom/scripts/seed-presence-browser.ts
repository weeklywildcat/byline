import { getPayload } from "payload";
import pg from "pg";
import sharp from "sharp";

const url = new URL(process.env.DATABASE_URL!);
const name = url.pathname.slice(1);
if (!/^byline_newsroom_test_presence_browser[a-z0-9_]*$/.test(name)) throw new Error("Refusing to reset a non-browser-test database.");
url.pathname = "/postgres";
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  await db.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await db.query(`CREATE DATABASE "${name}"`);
} finally {
  await db.end();
}

const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });
try {
  await payload.db.migrate();
  const photo = await sharp(Buffer.from(
    '<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="800" fill="#ddd5e4"/><circle cx="400" cy="310" r="150" fill="#644367"/><ellipse cx="400" cy="740" rx="280" ry="250" fill="#644367"/></svg>'
  )).jpeg().toBuffer();
  const media = await payload.create({
    collection: "media", data: { alt: "Fixture portrait", credit: "Byline fixture" },
    file: { name: "presence-portrait.jpg", data: photo, size: photo.length, mimetype: "image/jpeg" }
  });
  const person = await payload.create({
    collection: "people", data: { name: "Maya Torres", slug: "maya-torres", status: "active", portrait: media.id }
  });
  for (const [handle, name, role, linkedPerson] of [
    ["alex", "Alex Morgan", "administrator", null],
    ["maya", "Maya Torres", "editor", person.id],
    ["jordan", "Jordan Lee", "staff", null]
  ] as const) {
    await payload.create({ collection: "users", data: {
      email: `${handle}@example.test`, password: "presence-fixture-password", name, role, linkedPerson, enabled: true
    } });
  }
  await payload.create({ collection: "stories", draft: true, data: { headline: "Greenwood expands its library" } });
  await payload.create({ collection: "collections", data: { name: "City Hall reporting", type: "other", status: "planning" } });
} finally {
  await payload.destroy();
}

process.exit(0);
