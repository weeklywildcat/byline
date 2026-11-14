import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Catch-up for two config changes that shipped without a migration: the retired
 * automatic transcription task (b3bcb43d) and the manual-first transcript
 * defaults. Jobs for the retired task can never run, so they are removed before
 * the job enums are rebuilt without it (the cast would otherwise fail).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug"::text = 'transcribe-reporting-file';
   DELETE FROM "payload_jobs" WHERE "task_slug"::text = 'transcribe-reporting-file';
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'activate-front-page', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'activate-front-page', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "reporting_transcripts" ALTER COLUMN "state" SET DEFAULT 'ready';
  ALTER TABLE "reporting_transcripts" ALTER COLUMN "origin" SET DEFAULT 'manual';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'transcribe-reporting-file' BEFORE 'activate-front-page';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'transcribe-reporting-file' BEFORE 'activate-front-page';
  ALTER TABLE "reporting_transcripts" ALTER COLUMN "state" SET DEFAULT 'queued';
  ALTER TABLE "reporting_transcripts" ALTER COLUMN "origin" SET DEFAULT 'machine';`)
}
