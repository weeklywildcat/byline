import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Wildcat Polls device pairing (docs/wildcat-polls.md#pairing-a-device): a
 * session's pending pairing code (its keyed hash only), the PIN the paired
 * device will use, whether claiming may replace a running device, and the
 * newsroom-wide throttle on failed claims.
 *
 * (The generator also proposed `donation_waitlist`, which the earlier
 * `donation_waitlist` migration already creates; its snapshot was missing from
 * the previous migration's JSON. This file leaves it alone; this migration's
 * JSON snapshot includes it, so the next diff is clean.)
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "byline_poll_pairing_limits" (
  	"window_start" timestamp with time zone PRIMARY KEY NOT NULL,
  	"failures" integer DEFAULT 0 NOT NULL
  );
  ALTER TABLE "byline_poll_sessions" ADD COLUMN "pairing_code_hash" varchar(64);
  ALTER TABLE "byline_poll_sessions" ADD COLUMN "pairing_expires_at" timestamp with time zone;
  ALTER TABLE "byline_poll_sessions" ADD COLUMN "pairing_pin_hash" varchar(200);
  ALTER TABLE "byline_poll_sessions" ADD COLUMN "pairing_replaces" boolean DEFAULT false NOT NULL;
  CREATE UNIQUE INDEX "byline_poll_sessions_pairing_code" ON "byline_poll_sessions" USING btree ("pairing_code_hash");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "byline_poll_pairing_limits" CASCADE;
  DROP INDEX "byline_poll_sessions_pairing_code";
  ALTER TABLE "byline_poll_sessions" DROP COLUMN "pairing_code_hash";
  ALTER TABLE "byline_poll_sessions" DROP COLUMN "pairing_expires_at";
  ALTER TABLE "byline_poll_sessions" DROP COLUMN "pairing_pin_hash";
  ALTER TABLE "byline_poll_sessions" DROP COLUMN "pairing_replaces";`)
}
