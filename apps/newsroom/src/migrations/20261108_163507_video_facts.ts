import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_video_facts_status" AS ENUM('found', 'unavailable');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'refresh-video-facts' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'refresh-video-facts' BEFORE 'schedulePublish';
  CREATE TABLE "video_facts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" varchar NOT NULL,
  	"status" "enum_video_facts_status" DEFAULT 'found' NOT NULL,
  	"data" jsonb,
  	"fetched_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE UNIQUE INDEX "video_facts_video_id_idx" ON "video_facts" USING btree ("video_id");
  CREATE INDEX "video_facts_updated_at_idx" ON "video_facts" USING btree ("updated_at");
  CREATE INDEX "video_facts_created_at_idx" ON "video_facts" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "video_facts" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'scan-content-health', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'scan-content-health', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_video_facts_status";`)
}
