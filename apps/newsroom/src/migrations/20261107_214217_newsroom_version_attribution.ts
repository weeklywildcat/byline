import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ADD COLUMN "version_actor" numeric;
  ALTER TABLE "stories" ADD COLUMN "version_restored" boolean;
  ALTER TABLE "_stories_v" ADD COLUMN "version_version_actor" numeric;
  ALTER TABLE "_stories_v" ADD COLUMN "version_version_restored" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" DROP COLUMN "version_actor";
  ALTER TABLE "stories" DROP COLUMN "version_restored";
  ALTER TABLE "_stories_v" DROP COLUMN "version_version_actor";
  ALTER TABLE "_stories_v" DROP COLUMN "version_version_restored";`)
}
