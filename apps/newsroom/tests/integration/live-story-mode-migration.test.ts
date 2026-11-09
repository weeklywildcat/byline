import { sql } from "@payloadcms/db-postgres";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "../../src/migrations";

/**
 * The live Story mode migration against committed migrations (no push): live coverage moves off the versioned
 * Story onto its unversioned plan. Running or ended coverage becomes Live mode in the same state with its original
 * times, never-started coverage stays Standard, a Story that was not published cannot be "Live now", and live
 * updates are untouched. `down` puts it back.
 */
let payload: Payload;
type Db = { execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
const db = () => (payload.db as unknown as { drizzle: Db }).drizzle;
const started = "2026-11-06 23:00:00+00";
const ended = "2026-11-07 04:30:00+00";

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_live_migration`;
  process.env.DATABASE_URL = url.toString();
  process.env.BYLINE_DB_PUSH = "0";
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  const target = migrations.findIndex((migration) => migration.name.endsWith("_live_story_mode"));
  expect(target).toBeGreaterThan(0);
  await payload.db.migrate({ migrations: migrations.slice(0, target) } as never);
  await db().execute(sql`
    insert into stories (id, headline, _status, live_coverage_state, live_coverage_started_at, live_coverage_ended_at, updated_at, created_at) values
      (1, 'Running game', 'published', 'live', ${started}, null, now(), now()),
      (2, 'Ended game', 'published', 'ended', ${started}, ${ended}, now(), now()),
      (3, 'Unpublished, marked live', 'draft', 'live', ${started}, null, now(), now()),
      (4, 'No coverage', 'published', 'off', null, null, now(), now())`);
  await db().execute(sql`
    insert into story_plans (story_id, workflow, updated_at, created_at) values (1, 'pitch', now(), now()), (2, 'pitch', now(), now()), (3, 'pitch', now(), now()), (4, 'pitch', now(), now())`);
  await db().execute(sql`insert into live_updates (id, story_id, body, state, updated_at, created_at) values (1, 1, '{}'::jsonb, 'published', now(), now()), (2, 2, '{}'::jsonb, 'draft', now(), now())`);
  await payload.db.migrate({ migrations: migrations.slice(0, target + 1) } as never);
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

const plan = async (story: number) => (await db().execute(sql`select live_coverage_mode m, live_coverage_state s, to_char(live_coverage_started_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') a, to_char(live_coverage_ended_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') b from story_plans where story_id = ${story}`)).rows[0];

describe("live Story mode migration", () => {
  it("moves running and ended coverage to Live mode with its times, and leaves the rest Standard", async () => {
    expect(await plan(1)).toMatchObject({ m: "live", s: "live" });
    expect((await plan(1)).a).toBe("2026-11-06 23:00");
    expect(await plan(2)).toMatchObject({ m: "live", s: "ended" });
    expect((await plan(2)).b).toBe("2026-11-07 04:30");
    expect(await plan(4)).toMatchObject({ m: "standard", s: "off", a: null, b: null });
  });

  it("never leaves an unpublished Story 'Live now'", async () => {
    expect(await plan(3)).toMatchObject({ m: "live", s: "off", a: null, b: null });
  });

  it("drops the versioned columns and keeps every live update", async () => {
    const columns = (await db().execute(sql`select table_name, column_name from information_schema.columns where column_name like '%live_coverage%'`)).rows.map((row) => `${row.table_name}.${row.column_name}`);
    expect(columns.filter((name) => name.startsWith("stories.") || name.startsWith("_stories_v."))).toEqual([]);
    expect(columns).toEqual(expect.arrayContaining(["story_plans.live_coverage_mode", "story_plans.live_coverage_state"]));
    expect((await db().execute(sql`select count(*)::int n from live_updates`)).rows[0].n).toBe(2);
  });

  it("goes back down without losing coverage", async () => {
    const last = migrations[migrations.findIndex((migration) => migration.name.endsWith("_live_story_mode"))];
    await last.down({ db: (payload.db as unknown as { drizzle: never }).drizzle, payload, req: {} as never } as never);
    const rows = (await db().execute(sql`select id, live_coverage_state s from stories order by id`)).rows;
    expect(rows.map((row) => row.s)).toEqual(["live", "ended", "off", "off"]);
    expect((await db().execute(sql`select count(*)::int n from live_updates`)).rows[0].n).toBe(2);
  });
});
