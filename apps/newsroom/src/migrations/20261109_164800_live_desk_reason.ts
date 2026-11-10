import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_live_updates_desk_reason" AS ENUM('story-not-public', 'not-live-mode', 'coverage-not-started', 'coverage-ended', 'permission-revoked');
  ALTER TABLE "live_updates" ADD COLUMN "desk_reason" "enum_live_updates_desk_reason";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_updates" DROP COLUMN "desk_reason";
  DROP TYPE "public"."enum_live_updates_desk_reason";`)
}
