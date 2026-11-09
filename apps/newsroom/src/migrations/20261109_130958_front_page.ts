import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_front_page_revisions_state" AS ENUM('draft', 'scheduled', 'active', 'archived');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'activate-front-page' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'activate-front-page' BEFORE 'schedulePublish';
  CREATE TABLE "front_page_revisions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"state" "enum_front_page_revisions_state" DEFAULT 'draft' NOT NULL,
  	"placements" jsonb NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"activated_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"published_by_id" integer,
  	"summary" varchar,
  	"based_on_id" integer,
  	"failure" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "front_page_revisions" ADD CONSTRAINT "front_page_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "front_page_revisions" ADD CONSTRAINT "front_page_revisions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "front_page_revisions" ADD CONSTRAINT "front_page_revisions_based_on_id_front_page_revisions_id_fk" FOREIGN KEY ("based_on_id") REFERENCES "public"."front_page_revisions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "front_page_revisions_state_idx" ON "front_page_revisions" USING btree ("state");
  CREATE INDEX "front_page_revisions_scheduled_at_idx" ON "front_page_revisions" USING btree ("scheduled_at");
  CREATE INDEX "front_page_revisions_activated_at_idx" ON "front_page_revisions" USING btree ("activated_at");
  CREATE INDEX "front_page_revisions_created_by_idx" ON "front_page_revisions" USING btree ("created_by_id");
  CREATE INDEX "front_page_revisions_published_by_idx" ON "front_page_revisions" USING btree ("published_by_id");
  CREATE INDEX "front_page_revisions_based_on_idx" ON "front_page_revisions" USING btree ("based_on_id");
  CREATE INDEX "front_page_revisions_updated_at_idx" ON "front_page_revisions" USING btree ("updated_at");
  CREATE INDEX "front_page_revisions_created_at_idx" ON "front_page_revisions" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "front_page_revisions" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'transcribe-reporting-file', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'transcribe-reporting-file', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_front_page_revisions_state";`)
}
