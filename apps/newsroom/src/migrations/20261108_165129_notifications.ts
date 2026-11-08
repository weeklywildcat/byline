import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notifications_kind" AS ENUM('storyAssignments', 'readyForReview', 'storyReturned', 'mediaAssignments', 'highPriorityTasks', 'appointments', 'publishingFailures', 'dueDigest');
  CREATE TYPE "public"."enum_notifications_email_state" AS ENUM('none', 'pending', 'sent', 'failed', 'skipped');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'deliver-notification' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'send-due-digest' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'deliver-notification' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'send-due-digest' BEFORE 'schedulePublish';
  CREATE TABLE "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"recipient_id" integer NOT NULL,
  	"kind" "enum_notifications_kind" NOT NULL,
  	"story_id" integer,
  	"actor_id" integer,
  	"detail" varchar,
  	"data" jsonb,
  	"dedupe_key" varchar,
  	"inbox" boolean DEFAULT true,
  	"read_at" timestamp(3) with time zone,
  	"email_state" "enum_notifications_email_state" DEFAULT 'none',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");
  CREATE INDEX "notifications_story_idx" ON "notifications" USING btree ("story_id");
  CREATE INDEX "notifications_actor_idx" ON "notifications" USING btree ("actor_id");
  CREATE UNIQUE INDEX "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key");
  CREATE INDEX "notifications_read_at_idx" ON "notifications" USING btree ("read_at");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "notifications" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload_jobs" DROP COLUMN "meta";
  DROP TYPE "public"."enum_notifications_kind";
  DROP TYPE "public"."enum_notifications_email_state";`)
}
