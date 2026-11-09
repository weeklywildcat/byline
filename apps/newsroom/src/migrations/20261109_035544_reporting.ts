import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sources_ground_rules" AS ENUM('unspecified', 'on-record', 'background', 'off-record');
  CREATE TYPE "public"."enum_reporting_files_kind" AS ENUM('audio', 'document', 'image', 'other');
  CREATE TYPE "public"."enum_reporting_transcripts_state" AS ENUM('queued', 'processing', 'ready', 'failed');
  CREATE TYPE "public"."enum_reporting_transcripts_origin" AS ENUM('machine', 'manual');
  CREATE TYPE "public"."enum_transcript_selections_kind" AS ENUM('highlight', 'quote');
  CREATE TYPE "public"."enum_transcript_selections_state" AS ENUM('saved', 'verified');
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'recording-captured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'file-captured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'transcript-completed';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'transcript-imported';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'quote-verified';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'off-record-override';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'material-made-confidential';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'material-made-normal';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-submitted';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-published-from-field';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-queued-sent';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-publishers-changed';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'homepage-featured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'distribution-ready';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'distribution-posted';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'distribution-failed';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'distribution-skipped';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'transcriptReady';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'distributionAssignments';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'distributionApproval';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'distributionFailures';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'frontPageFailures';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'transcribe-reporting-file' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'transcribe-reporting-file' BEFORE 'schedulePublish';
  CREATE TABLE "reporting_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"text" varchar NOT NULL,
  	"source_id" integer,
  	"appointment_id" integer,
  	"confidential" boolean DEFAULT false NOT NULL,
  	"created_by_id" integer,
  	"captured_at" timestamp(3) with time zone,
  	"client_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reporting_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"kind" "enum_reporting_files_kind" DEFAULT 'other' NOT NULL,
  	"original_filename" varchar,
  	"source_id" integer,
  	"appointment_id" integer,
  	"confidential" boolean DEFAULT false NOT NULL,
  	"ground_rules" jsonb,
  	"created_by_id" integer,
  	"captured_at" timestamp(3) with time zone,
  	"duration_ms" numeric,
  	"sha256" varchar,
  	"client_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "reporting_transcripts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"file_id" integer NOT NULL,
  	"source_id" integer,
  	"appointment_id" integer,
  	"confidential" boolean DEFAULT false NOT NULL,
  	"ground_rules" jsonb,
  	"state" "enum_reporting_transcripts_state" DEFAULT 'queued' NOT NULL,
  	"origin" "enum_reporting_transcripts_origin" DEFAULT 'machine' NOT NULL,
  	"provider" varchar,
  	"model" varchar,
  	"language" varchar,
  	"duration_ms" numeric,
  	"segments" jsonb,
  	"search_text" varchar,
  	"failure" varchar,
  	"attempts" numeric DEFAULT 0,
  	"completed_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"captured_at" timestamp(3) with time zone,
  	"edited_by_id" integer,
  	"edited_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transcript_selections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"transcript_id" integer NOT NULL,
  	"file_id" integer,
  	"source_id" integer,
  	"kind" "enum_transcript_selections_kind" DEFAULT 'quote' NOT NULL,
  	"text" varchar NOT NULL,
  	"attribution" varchar,
  	"speaker" varchar,
  	"start_ms" numeric,
  	"end_ms" numeric,
  	"segment_ids" jsonb,
  	"note" varchar,
  	"ground_rules" jsonb,
  	"confidential" boolean DEFAULT false NOT NULL,
  	"state" "enum_transcript_selections_state" DEFAULT 'saved' NOT NULL,
  	"verified_by_id" integer,
  	"verified_at" timestamp(3) with time zone,
  	"off_record_override_by_id" integer,
  	"off_record_override_at" timestamp(3) with time zone,
  	"off_record_override_reason" varchar,
  	"created_by_id" integer,
  	"captured_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transcript_selections_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer
  );
  
  ALTER TABLE "story_plans_rels" ADD COLUMN "users_id" integer;
  ALTER TABLE "media" ADD COLUMN "capture_story_id" integer;
  ALTER TABLE "media" ADD COLUMN "capture_assignment_id" integer;
  ALTER TABLE "media" ADD COLUMN "capture_original_hash" varchar;
  ALTER TABLE "media" ADD COLUMN "capture_client_key" varchar;
  ALTER TABLE "live_updates" ADD COLUMN "client_key" varchar;
  ALTER TABLE "sources" ADD COLUMN "ground_rules" "enum_sources_ground_rules" DEFAULT 'unspecified';
  ALTER TABLE "sources" ADD COLUMN "recording_permission" boolean DEFAULT false;
  ALTER TABLE "sources" ADD COLUMN "ground_rules_note" varchar;
  ALTER TABLE "reporting_notes" ADD CONSTRAINT "reporting_notes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_notes" ADD CONSTRAINT "reporting_notes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_notes" ADD CONSTRAINT "reporting_notes_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_notes" ADD CONSTRAINT "reporting_notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_files" ADD CONSTRAINT "reporting_files_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_files" ADD CONSTRAINT "reporting_files_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_files" ADD CONSTRAINT "reporting_files_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_files" ADD CONSTRAINT "reporting_files_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_file_id_reporting_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."reporting_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reporting_transcripts" ADD CONSTRAINT "reporting_transcripts_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_transcript_id_reporting_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."reporting_transcripts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_file_id_reporting_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."reporting_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_off_record_override_by_id_users_id_fk" FOREIGN KEY ("off_record_override_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections" ADD CONSTRAINT "transcript_selections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_selections_rels" ADD CONSTRAINT "transcript_selections_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transcript_selections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transcript_selections_rels" ADD CONSTRAINT "transcript_selections_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "reporting_notes_story_idx" ON "reporting_notes" USING btree ("story_id");
  CREATE INDEX "reporting_notes_source_idx" ON "reporting_notes" USING btree ("source_id");
  CREATE INDEX "reporting_notes_appointment_idx" ON "reporting_notes" USING btree ("appointment_id");
  CREATE INDEX "reporting_notes_confidential_idx" ON "reporting_notes" USING btree ("confidential");
  CREATE INDEX "reporting_notes_created_by_idx" ON "reporting_notes" USING btree ("created_by_id");
  CREATE INDEX "reporting_notes_captured_at_idx" ON "reporting_notes" USING btree ("captured_at");
  CREATE UNIQUE INDEX "reporting_notes_client_key_idx" ON "reporting_notes" USING btree ("client_key");
  CREATE INDEX "reporting_notes_updated_at_idx" ON "reporting_notes" USING btree ("updated_at");
  CREATE INDEX "reporting_notes_created_at_idx" ON "reporting_notes" USING btree ("created_at");
  CREATE INDEX "reporting_files_story_idx" ON "reporting_files" USING btree ("story_id");
  CREATE INDEX "reporting_files_source_idx" ON "reporting_files" USING btree ("source_id");
  CREATE INDEX "reporting_files_appointment_idx" ON "reporting_files" USING btree ("appointment_id");
  CREATE INDEX "reporting_files_confidential_idx" ON "reporting_files" USING btree ("confidential");
  CREATE INDEX "reporting_files_created_by_idx" ON "reporting_files" USING btree ("created_by_id");
  CREATE INDEX "reporting_files_captured_at_idx" ON "reporting_files" USING btree ("captured_at");
  CREATE INDEX "reporting_files_sha256_idx" ON "reporting_files" USING btree ("sha256");
  CREATE UNIQUE INDEX "reporting_files_client_key_idx" ON "reporting_files" USING btree ("client_key");
  CREATE INDEX "reporting_files_updated_at_idx" ON "reporting_files" USING btree ("updated_at");
  CREATE INDEX "reporting_files_created_at_idx" ON "reporting_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "reporting_files_filename_idx" ON "reporting_files" USING btree ("filename");
  CREATE INDEX "reporting_transcripts_story_idx" ON "reporting_transcripts" USING btree ("story_id");
  CREATE UNIQUE INDEX "reporting_transcripts_file_idx" ON "reporting_transcripts" USING btree ("file_id");
  CREATE INDEX "reporting_transcripts_source_idx" ON "reporting_transcripts" USING btree ("source_id");
  CREATE INDEX "reporting_transcripts_appointment_idx" ON "reporting_transcripts" USING btree ("appointment_id");
  CREATE INDEX "reporting_transcripts_confidential_idx" ON "reporting_transcripts" USING btree ("confidential");
  CREATE INDEX "reporting_transcripts_state_idx" ON "reporting_transcripts" USING btree ("state");
  CREATE INDEX "reporting_transcripts_created_by_idx" ON "reporting_transcripts" USING btree ("created_by_id");
  CREATE INDEX "reporting_transcripts_edited_by_idx" ON "reporting_transcripts" USING btree ("edited_by_id");
  CREATE INDEX "reporting_transcripts_updated_at_idx" ON "reporting_transcripts" USING btree ("updated_at");
  CREATE INDEX "reporting_transcripts_created_at_idx" ON "reporting_transcripts" USING btree ("created_at");
  CREATE INDEX "transcript_selections_story_idx" ON "transcript_selections" USING btree ("story_id");
  CREATE INDEX "transcript_selections_transcript_idx" ON "transcript_selections" USING btree ("transcript_id");
  CREATE INDEX "transcript_selections_file_idx" ON "transcript_selections" USING btree ("file_id");
  CREATE INDEX "transcript_selections_source_idx" ON "transcript_selections" USING btree ("source_id");
  CREATE INDEX "transcript_selections_confidential_idx" ON "transcript_selections" USING btree ("confidential");
  CREATE INDEX "transcript_selections_state_idx" ON "transcript_selections" USING btree ("state");
  CREATE INDEX "transcript_selections_verified_by_idx" ON "transcript_selections" USING btree ("verified_by_id");
  CREATE INDEX "transcript_selections_off_record_override_off_record_ove_idx" ON "transcript_selections" USING btree ("off_record_override_by_id");
  CREATE INDEX "transcript_selections_created_by_idx" ON "transcript_selections" USING btree ("created_by_id");
  CREATE INDEX "transcript_selections_updated_at_idx" ON "transcript_selections" USING btree ("updated_at");
  CREATE INDEX "transcript_selections_created_at_idx" ON "transcript_selections" USING btree ("created_at");
  CREATE INDEX "transcript_selections_rels_order_idx" ON "transcript_selections_rels" USING btree ("order");
  CREATE INDEX "transcript_selections_rels_parent_idx" ON "transcript_selections_rels" USING btree ("parent_id");
  CREATE INDEX "transcript_selections_rels_path_idx" ON "transcript_selections_rels" USING btree ("path");
  CREATE INDEX "transcript_selections_rels_stories_id_idx" ON "transcript_selections_rels" USING btree ("stories_id");
  ALTER TABLE "story_plans_rels" ADD CONSTRAINT "story_plans_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_capture_story_id_stories_id_fk" FOREIGN KEY ("capture_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_capture_assignment_id_production_assignments_id_fk" FOREIGN KEY ("capture_assignment_id") REFERENCES "public"."production_assignments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "story_plans_rels_users_id_idx" ON "story_plans_rels" USING btree ("users_id");
  CREATE INDEX "media_capture_capture_story_idx" ON "media" USING btree ("capture_story_id");
  CREATE INDEX "media_capture_capture_assignment_idx" ON "media" USING btree ("capture_assignment_id");
  CREATE INDEX "media_capture_capture_original_hash_idx" ON "media" USING btree ("capture_original_hash");
  CREATE UNIQUE INDEX "media_capture_capture_client_key_idx" ON "media" USING btree ("capture_client_key");
  CREATE UNIQUE INDEX "live_updates_client_key_idx" ON "live_updates" USING btree ("client_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reporting_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reporting_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reporting_transcripts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "transcript_selections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "transcript_selections_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reporting_notes" CASCADE;
  DROP TABLE "reporting_files" CASCADE;
  DROP TABLE "reporting_transcripts" CASCADE;
  DROP TABLE "transcript_selections" CASCADE;
  DROP TABLE "transcript_selections_rels" CASCADE;
  ALTER TABLE "story_plans_rels" DROP CONSTRAINT IF EXISTS "story_plans_rels_users_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_capture_story_id_stories_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_capture_assignment_id_production_assignments_id_fk";
  
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_story_activity_action";
  CREATE TYPE "public"."enum_story_activity_action" AS ENUM('story-created', 'story-published', 'story-unpublished', 'workflow-changed', 'editor-changed', 'contributors-changed', 'task-created', 'task-completed', 'task-reopened', 'source-added', 'source-updated', 'appointment-added', 'appointment-updated', 'appointment-completed', 'production-added', 'production-changed', 'publication-scheduled', 'publication-rescheduled', 'publication-cancelled', 'version-restored', 'url-changed', 'correction-added', 'correction-updated', 'correction-removed');
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE "public"."enum_story_activity_action" USING "action"::"public"."enum_story_activity_action";
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_notifications_kind";
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('storyAssignments', 'readyForReview', 'storyReturned', 'mediaAssignments', 'highPriorityTasks', 'appointments', 'publishingFailures', 'dueDigest');
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_notifications_kind" USING "kind"::"public"."enum_notifications_kind";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'deploy-public-site', 'advance-public-revision', 'scan-content-health', 'refresh-video-facts', 'deliver-notification', 'send-due-digest', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "story_plans_rels_users_id_idx";
  DROP INDEX "media_capture_capture_story_idx";
  DROP INDEX "media_capture_capture_assignment_idx";
  DROP INDEX "media_capture_capture_original_hash_idx";
  DROP INDEX "media_capture_capture_client_key_idx";
  DROP INDEX "live_updates_client_key_idx";
  ALTER TABLE "story_plans_rels" DROP COLUMN "users_id";
  ALTER TABLE "media" DROP COLUMN "capture_story_id";
  ALTER TABLE "media" DROP COLUMN "capture_assignment_id";
  ALTER TABLE "media" DROP COLUMN "capture_original_hash";
  ALTER TABLE "media" DROP COLUMN "capture_client_key";
  ALTER TABLE "live_updates" DROP COLUMN "client_key";
  ALTER TABLE "sources" DROP COLUMN "ground_rules";
  ALTER TABLE "sources" DROP COLUMN "recording_permission";
  ALTER TABLE "sources" DROP COLUMN "ground_rules_note";
  DROP TYPE "public"."enum_sources_ground_rules";
  DROP TYPE "public"."enum_reporting_files_kind";
  DROP TYPE "public"."enum_reporting_transcripts_state";
  DROP TYPE "public"."enum_reporting_transcripts_origin";
  DROP TYPE "public"."enum_transcript_selections_kind";
  DROP TYPE "public"."enum_transcript_selections_state";`)
}
