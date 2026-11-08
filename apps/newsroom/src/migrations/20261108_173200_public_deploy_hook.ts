import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'deploy-public-site' BEFORE 'schedulePublish';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'deploy-public-site' BEFORE 'schedulePublish';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'deploy-public-site';
    DELETE FROM "payload_jobs" WHERE "task_slug" = 'deploy-public-site';

    ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
    DROP TYPE "public"."enum_payload_jobs_log_task_slug";
    CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM(
      'inline',
      'prepare-publication-media',
      'prepare-public-snapshot',
      'advance-public-revision',
      'scan-content-health',
      'refresh-video-facts',
      'deliver-notification',
      'send-due-digest',
      'schedulePublish'
    );
    ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug"
      SET DATA TYPE "public"."enum_payload_jobs_log_task_slug"
      USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";

    ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
    DROP TYPE "public"."enum_payload_jobs_task_slug";
    CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM(
      'inline',
      'prepare-publication-media',
      'prepare-public-snapshot',
      'advance-public-revision',
      'scan-content-health',
      'refresh-video-facts',
      'deliver-notification',
      'send-due-digest',
      'schedulePublish'
    );
    ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug"
      SET DATA TYPE "public"."enum_payload_jobs_task_slug"
      USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  `)
}
