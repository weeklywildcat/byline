import { sql } from "@payloadcms/db-postgres";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "../../src/migrations";

/**
 * The Phase 5 migration against committed migrations (no push): native focal
 * points are preserved as Byline intent, existing intent is normalized and
 * stripped of generated renditions, and old placeholder publication state is
 * invalidated without losing Media rows or metadata.
 */
let payload: Payload;
type Db = { execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
const db = () => (payload.db as unknown as { drizzle: Db }).drizzle;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_migration`;
  process.env.DATABASE_URL = url.toString();
  process.env.BYLINE_DB_PUSH = "0";
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  const phase5 = migrations.findIndex((migration) => migration.name.endsWith("_publication_media_pipeline"));
  expect(phase5).toBeGreaterThan(0);
  await payload.db.migrate({ migrations: migrations.slice(0, phase5) } as never);
  await db().execute(sql`
    insert into media (id, filename, mime_type, width, height, alt, credit, focal_x, focal_y, art_direction, publication_assets_status, publication_assets_renditions, updated_at, created_at) values
      (101, 'native.jpg', 'image/jpeg', 4000, 3000, 'Native focal', 'Credit A', 30, 70, null, 'ready', '{"wide":[{"url":"https://old.example/a.jpg"}]}', now(), now()),
      (102, 'byline.jpg', 'image/jpeg', 4000, 3000, 'Byline focal', 'Credit B', 80, 80, '{"focalPoint":{"x":10,"y":20},"crops":{"square":{"x":0,"y":0,"w":0.75,"h":1},"banner":{"x":0,"y":0,"w":1,"h":1}},"renditions":{"square":[{"url":"https://wp.example/s.jpg","width":640,"height":640}]}}', 'not-prepared', null, now(), now()),
      (103, 'plain.pdf', 'application/pdf', null, null, null, 'Credit C', null, null, null, 'ready', null, now(), now())`);
  await payload.db.migrate({ migrations } as never);
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("publication media migration", () => {
  it("preserves native focal points, normalizes existing intent and invalidates old publication state", async () => {
    const rows = (await db().execute(sql`select id, filename, alt, credit, art_direction, publication_revision, publication_assets_status, publication_assets_manifest, publication_assets_prepared_revision from media order by id`)).rows;
    expect(rows.map((row) => [row.id, row.filename, row.alt, row.credit])).toEqual([[101, "native.jpg", "Native focal", "Credit A"], [102, "byline.jpg", "Byline focal", "Credit B"], [103, "plain.pdf", null, "Credit C"]]);
    expect(rows[0].art_direction).toEqual({ version: 1, focalPoint: { x: 30, y: 70 }, crops: {} });
    // Byline's own focal point wins over Payload's; renditions and unknown shapes are gone.
    expect(rows[1].art_direction).toEqual({ version: 1, focalPoint: { x: 10, y: 20 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } } });
    expect(rows[2].art_direction).toEqual({ version: 1, focalPoint: { x: 50, y: 50 }, crops: {} });
    for (const row of rows) {
      expect(Number(row.publication_revision)).toBe(1);
      expect(row.publication_assets_status).toBe("not-prepared");
      expect(row.publication_assets_manifest).toBeNull();
      expect(row.publication_assets_prepared_revision).toBeNull();
    }
    const columns = (await db().execute(sql`select column_name from information_schema.columns where table_name = 'media'`)).rows.map((row) => row.column_name);
    expect(columns).not.toContain("publication_assets_renditions");
    expect((await db().execute(sql`select column_name from information_schema.columns where table_name = 'payload_jobs' and column_name = 'concurrency_key'`)).rows).toHaveLength(1);
  });
});
