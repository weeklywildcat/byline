/**
 * Throwaway local fixture for browser-testing the reporter-first Story screen,
 * review routing and newsroom roles (docs/story-screen.md, docs/review.md).
 * Refuses any database not named byline_newsroom_test_story_browser*.
 *
 *   DATABASE_URL=postgres://localhost:5432/byline_newsroom_test_story_browser npx tsx scripts/seed-story-browser.ts
 *
 * Accounts (password `story-browser-123456`): admin@, editor@ (Gibson), jeremy@
 * (Sports Editor), maycie@ (Copy Desk), caroline@ (reporter) — all @example.test.
 */
import pg from "pg";
import { mkdir, rm } from "node:fs/promises";
import { getPayload } from "payload";

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_story_browser");
if (!/^byline_newsroom_test_story_browser[a-z0-9_]*$/.test(database.pathname.slice(1))) throw new Error("Refusing to reset a non-browser-test database.");
const admin = new URL(database);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${database.pathname.slice(1)}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${database.pathname.slice(1)}"`);
await client.end();
process.env.DATABASE_URL = database.toString();
process.env.PAYLOAD_SECRET = "story-browser-fixture-secret-0123456789";
process.env.BYLINE_DB_PUSH = "1";
delete process.env.BYLINE_GOOGLE_CLIENT_ID;
process.env.BYLINE_NEWSROOM_URL = process.env.BYLINE_NEWSROOM_URL ?? "http://localhost:3051";
for (const [key, dir] of [["BYLINE_MEDIA_LOCAL_DIR", "/private/tmp/byline-story-browser-media"], ["BYLINE_REPORTING_LOCAL_DIR", "/private/tmp/byline-story-browser-files"], ["BYLINE_PUBLICATION_MEDIA_DIR", "/private/tmp/byline-story-browser-publication"]] as const) {
  process.env[key] = dir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
const { default: config } = await import("../src/payload.config");
const { DEFAULT_WORKFLOW_STEPS } = await import("../src/domain/newsroom-roles");
const payload = await getPayload({ config });
const system = { overrideAccess: true as const, context: { bylineSystem: true } };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

try {
  const password = "story-browser-123456";
  const account = async (key: string, name: string, role: "administrator" | "editor" | "staff", title = "Staff Writer") => {
    const person = (await payload.create({ collection: "people", data: { name, slug: `sb-${key}`, status: "active", newsroomRole: title } })).id;
    const user = await payload.create({ collection: "users", data: { name, email: `${key}@example.test`, password, role, enabled: true, linkedPerson: person } });
    return { ...user, person };
  };
  await account("admin", "Ada Admin", "administrator", "Adviser");
  const editor = await account("editor", "Gibson Bell", "editor", "Editor-in-Chief");
  const jeremy = await account("jeremy", "Jeremy Lauten", "staff", "Sports Editor");
  const maycie = await account("maycie", "Maycie Krajewski", "staff", "Managing Editor");
  const caroline = await account("caroline", "Caroline Elrod", "staff");
  const addyson = await account("addyson", "Addyson Reed", "staff", "Photographer");

  const news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  const sports = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  await payload.create({ collection: "sections", data: { name: "Arts & Culture", slug: "arts" } });

  const year = (await payload.create({ collection: "school-years", data: { name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31", status: "active", revision: 1 }, ...system })).id;
  for (const user of [editor, jeremy, maycie, caroline, addyson]) await payload.create({ collection: "staff-memberships", data: { schoolYear: year, user: user.id, status: "active" }, ...system });
  const role = async (key: string, name: string, scopeKind: "none" | "section" | "media", waitingLabel: string | null, description: string) =>
    (await payload.create({ collection: "newsroom-roles", data: { key, name, scopeKind, waitingLabel, description, revision: 1 }, ...system })).id;
  const sectionEditor = await role("section-editor", "Section Editor", "section", "{scope} Editor", "Edits stories in their sections first.");
  const copyDesk = await role("copy-desk", "Copy Desk", "none", null, "Checks copy: style, spelling, facts in the text.");
  await role("visual-desk", "Visual Desk", "media", null, "Reviews photos, video and graphics.");
  await role("final-review", "Final Review", "none", null, "The last read before a story is ready.");
  await payload.create({ collection: "role-assignments", data: { role: sectionEditor, user: jeremy.id, schoolYear: year, scopeMode: "scoped", sections: [sports] }, ...system });
  await payload.create({ collection: "role-assignments", data: { role: sectionEditor, user: maycie.id, schoolYear: year, scopeMode: "scoped", sections: [news] }, ...system });
  await payload.create({ collection: "role-assignments", data: { role: copyDesk, user: maycie.id, schoolYear: year, scopeMode: "global" }, ...system });
  await payload.create({ collection: "role-assignments", data: { role: copyDesk, user: editor.id, schoolYear: year, scopeMode: "global" }, ...system });
  const step = (stepId: string, label: string, roleId: number, roleMatch: string, target = "whole") => ({ stepId, label, target, resolver: "role", roleId, roleMatch, userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "editors" });
  await payload.create({ collection: "review-workflows", data: { name: "Standard", isDefault: true, steps: DEFAULT_WORKFLOW_STEPS, revision: 1 }, ...system } as never);
  await payload.create({ collection: "review-workflows", data: { name: "Standard News", description: "Section edit, then copy.", isDefault: false, appliesTo: { sections: [news, sports] }, steps: [step("section", "Section Edit", sectionEditor, "story-section"), step("copy", "Copy Review", copyDesk, "any", "copy")], revision: 1 }, ...system } as never);

  const text = (value: string) => ({ type: "text", text: value, format: 0, detail: 0, mode: "normal", style: "", version: 1 });
  const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)], direction: "ltr", format: "", indent: 0, textFormat: 0, textStyle: "", version: 1 });
  const body = (...lines: string[]) => ({ root: { type: "root", format: "", indent: 0, version: 1, direction: "ltr", children: lines.map(paragraph) } });
  const story = async (headline: string, section: number, writers: Array<{ id: number; person: number }>, workflow: string, deadline: number | null, brief: string, lines: string[]) => {
    const id = (await payload.create({ collection: "stories", draft: true, ...system, data: { headline, section, contributors: writers.map((writer) => writer.person), body: body(...lines) } as never })).id;
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: id } }, limit: 1, overrideAccess: true })).docs[0]!;
    await payload.update({ collection: "story-plans", id: plan.id, ...system, data: { workflow, brief, editor: editor.id, createdBy: writers[0]!.id, deadline: deadline === null ? null : day(deadline) } as never });
    return id;
  };

  const canteen = await story("Canteen could return next semester", news, [caroline], "reporting", 4, "Why the high-school canteen closed and whether it can return next semester.", ["The canteen closed in May after the district ended its food-service contract.", "Principal Smith said a new vendor could be chosen by December."]);
  const principal = (await payload.create({ collection: "sources", data: { story: canteen, label: "Principal Smith", role: "Principal", status: "interviewed", assignees: [caroline.id] }, ...system } as never)).id;
  await payload.create({ collection: "sources", data: { story: canteen, label: "District food services", status: "waiting", assignees: [caroline.id] }, ...system } as never);
  await payload.create({ collection: "appointments", data: { story: canteen, title: "Principal Smith follow-up", kind: "interview", status: "confirmed", source: principal, scheduleMode: "exact", startAt: at(20), endAt: at(20.5), location: "Main office", assignees: [caroline.id] }, ...system } as never);
  await payload.create({ collection: "production-assignments", data: { story: canteen, title: "Exterior photo", type: "photo", status: "needed", deadline: at(72) }, ...system } as never);
  await payload.create({ collection: "tasks", data: { story: canteen, title: "Confirm regulation number", assignees: [caroline.id], due: at(30) }, ...system } as never);
  await payload.create({ collection: "tasks", data: { story: canteen, title: "Verify Smith spelling", assignees: [caroline.id], state: "completed" }, ...system } as never);

  await story("Patriot Games", sports, [caroline], "writing", 0, "The rivalry game and what it meant for the seniors.", ["Ninety Six beat Abbeville 21–14 on Friday night.", "Senior night drew the biggest crowd of the season."]);
  await story("Sidewalk project", news, [caroline], "pitch", 9, "", ["The town wants a sidewalk from the school to Main Street."]);
  await story("Band takes state", news, [addyson], "ready", 1, "Marching band's first state title.", ["The marching band won its first state title on Saturday."]);
  console.log(JSON.stringify({ canteen, accounts: ["admin", "editor", "jeremy", "maycie", "caroline", "addyson"].map((key) => `${key}@example.test`) }));
} finally {
  await payload.db.destroy?.();
}
process.exit(0);
