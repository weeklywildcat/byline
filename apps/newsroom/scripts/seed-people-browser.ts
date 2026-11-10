/** Throwaway local fixture only. Never imports or changes WordPress/production. */
import pg from "pg";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { getPayload } from "payload";
import sharp from "sharp";
const database = new URL(
  process.env.DATABASE_URL ??
    "postgres://localhost:5432/byline_newsroom_test_people_browser",
);
if (
  !/^byline_newsroom_test_people_browser[a-z0-9_]*$/.test(
    database.pathname.slice(1),
  )
)
  throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(
  `DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`,
);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET = "people-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
delete process.env.BYLINE_GOOGLE_CLIENT_ID;
process.env.BYLINE_NEWSROOM_URL = "http://localhost:3012";
process.env.BYLINE_MEDIA_LOCAL_DIR = "/private/tmp/byline-people-browser-media";
await rm(process.env.BYLINE_MEDIA_LOCAL_DIR, { recursive: true, force: true });
await mkdir(process.env.BYLINE_MEDIA_LOCAL_DIR, { recursive: true });
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });
try {
  await payload.create({
    collection: "users",
    data: {
      name: "System administrator",
      email: "admin@example.test",
      password: "people-browser-123456",
      role: "administrator",
      enabled: true,
    },
  });
  const photo = await sharp(
    Buffer.from(
      '<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="800" fill="#ddc5b9"/><circle cx="400" cy="300" r="155" fill="#7b2336"/><ellipse cx="400" cy="760" rx="300" ry="260" fill="#7b2336"/></svg>',
    ),
  )
    .jpeg()
    .toBuffer();
  const image = await payload.create({
    collection: "media",
    data: { alt: "Editor portrait", credit: "Byline fixture" },
    file: {
      data: photo,
      mimetype: "image/jpeg",
      name: "editor-portrait.jpg",
      size: photo.length,
    },
  });
  const entries = [
    {
      name: "Gibson Bell",
      slug: "gibson-bell",
      status: "active" as const,
      newsroomRole: "Editor-in-chief",
      pronouns: "he/him",
      portrait: image.id,
      shortBio:
        "Gibson leads the student newsroom and reports on school leadership.",
      bio: "Gibson is a student journalist serving the Ninety Six community.\nHe works with writers and photographers to tell stories that matter.",
      publicEmail: "gibson-public@example.test",
      socials: [
        { label: "Website", url: "https://example.test/gibson" },
        { label: "Instagram", url: "https://www.instagram.com/gibson" },
        { label: "Bluesky", url: "https://bsky.app/profile/gibson.test" },
      ],
      directoryVisible: true,
      hasProfilePage: true,
    },
    {
      name: "Alex Morgan",
      slug: "alex-morgan",
      status: "active" as const,
      newsroomRole: "Staff writer",
      directoryVisible: true,
      hasProfilePage: true,
    },
    {
      name: "Jordan Park",
      slug: "jordan-park",
      status: "guest" as const,
      newsroomRole: "Photographer",
      directoryVisible: false,
      hasProfilePage: false,
    },
    {
      name: "Sam Rivera",
      slug: "sam-rivera",
      status: "guest" as const,
      newsroomRole: "Guest columnist",
      shortBio: "Sam writes about community arts and the people behind them.",
      bio: "A community contributor with a public author profile.",
      directoryVisible: true,
      hasProfilePage: true,
    },
    {
      name: "Taylor Lee",
      slug: "taylor-lee",
      status: "alumni" as const,
      newsroomRole: "Former staff writer",
      shortBio: "Taylor reported on student life from 2024 to 2026.",
      directoryVisible: false,
      hasProfilePage: true,
    },
  ];
  const people: Record<string, number> = {};
  for (const entry of entries)
    people[entry.slug] = (
      await payload.create({ collection: "people", data: entry })
    ).id;
  for (const [email, name, role, linkedPerson] of [
    ["editor@example.test", "Gibson Bell", "editor", people["gibson-bell"]],
    ["writer@example.test", "Alex Morgan", "staff", people["alex-morgan"]],
    ["unlinked@example.test", "New staff account", "staff", null],
  ] as const) {
    await payload.create({
      collection: "users",
      data: {
        email,
        name,
        password: "people-browser-123456",
        role,
        linkedPerson,
        enabled: true,
      },
    });
  }
  const section = (
    await payload.create({
      collection: "sections",
      data: { name: "Features", slug: "features" },
    })
  ).id;
  await payload.create({
    collection: "stories",
    data: {
      headline: "The newsroom behind the photographs",
      section,
      contributors: [people["gibson-bell"], people["jordan-park"]],
      _status: "published",
    } as never,
  });
  await payload.create({
    collection: "stories",
    data: {
      headline: "A year of student voices",
      section,
      contributors: [people["alex-morgan"], people["taylor-lee"]],
      _status: "published",
    } as never,
  });
  await writeFile(
    "/private/tmp/byline-people-browser.json",
    JSON.stringify({ people, portrait: image.id }),
  );
  console.log(
    "Seeded five People, three account roles, an unlinked staff account, a portrait and historical stories.",
  );
} finally {
  await payload.destroy();
}

process.exit(0);
