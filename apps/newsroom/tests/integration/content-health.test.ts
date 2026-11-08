import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, expect, it } from "vitest";
import { contentHealth, healthDisposition, startHealthScan } from "../../src/newsroom/health/content-health";
import { screenContext } from "../../src/newsroom/screen-models";
import type { User } from "../../src/payload-types";
import { runPublicSnapshotPreparation } from "../../src/public/snapshot/prepare";

let payload: Payload;
let admin: User;
let staff: User;
let story: number;
const timeZone = "America/New_York";
const ctx = async (user: User) => screenContext(await createLocalReq({ user: { ...user, collection: "users" } }, payload), timeZone);

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname += "_health";
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  admin = await payload.create({ collection: "users", data: { email: "health-admin@example.test", name: "Health admin", password: "fixture-health-admin", role: "administrator" } });
  staff = await payload.create({ collection: "users", data: { email: "health-staff@example.test", name: "Health staff", password: "fixture-health-staff", role: "staff" } });
  const section = await payload.create({ collection: "sections", data: { name: "News", slug: "news" } });
  const published = await payload.create({
    collection: "stories",
    data: { headline: "Health fixture", slug: "health-fixture", section: section.id, _status: "published", format: "standard", presentation: "standard", contentFormat: "legacy-html",
      legacyHtml: '<p><a href="/2024/04/02/news/missing/">Earlier reporting</a></p>' },
    context: { bylineImport: true }
  });
  story = published.id;
  await payload.update({ collection: "stories", id: story, data: { deck: "Health fixture deck." } });
  expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("ready");
});
afterAll(async () => { await payload?.destroy(); });

it("only scans published snapshots in the worker and keeps durable triage state", async () => {
  const a = await ctx(admin);
  const s = await ctx(staff);
  await expect(contentHealth(s)).rejects.toMatchObject({ status: 403 });
  await expect(startHealthScan(s)).rejects.toMatchObject({ status: 403 });
  expect(await contentHealth(a)).toMatchObject({ issues: [], scanned: 0, stale: true });

  await startHealthScan(a);
  expect(await contentHealth(a)).toMatchObject({ issues: [], scan: { running: true, checked: 0 } });
  await payload.jobs.run({ queue: "maintenance", limit: 5 });
  let report = await contentHealth(a);
  expect(report).toMatchObject({ eligible: 1, scanned: 1, stale: false, scan: { running: false, checked: 1, total: 1 } });
  expect(report.issues).toEqual([expect.objectContaining({ checkId: "broken-link", state: "new", story: expect.objectContaining({ id: story }) })]);

  await healthDisposition(a, { storyId: story, checkId: "broken-link", scope: "story", reason: "Preserve the original citation." });
  report = await contentHealth(a);
  expect(report.issues).toEqual([]);
  expect(report.ignored?.[0]).toMatchObject({ ignored: { scope: "story", by: admin.id } });
  await healthDisposition(a, { storyId: story, checkId: "broken-link", restore: true });
  await healthDisposition(a, { checkId: "broken-link", scope: "global" });
  expect((await contentHealth(a)).ignored?.[0]).toMatchObject({ ignored: { scope: "global" } });
  await healthDisposition(a, { checkId: "broken-link", scope: "global", restore: true });

  await startHealthScan(a, story);
  await payload.jobs.run({ queue: "maintenance", limit: 5 });
  expect((await contentHealth(a)).issues[0].state).toBe("existing");
  await payload.update({ collection: "stories", id: story, data: { deck: "A new published change." } });
  expect((await contentHealth(a)).stale).toBe(true);
  await expect(startHealthScan(a)).rejects.toMatchObject({ status: 409 });
});
