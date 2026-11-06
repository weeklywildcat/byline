import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_content_format" AS ENUM('byline-v1', 'legacy-html');
  CREATE TYPE "public"."enum_stories_format" AS ENUM('standard', 'video', 'audio');
  CREATE TYPE "public"."enum_stories_presentation" AS ENUM('standard', 'immersive');
  CREATE TYPE "public"."enum_stories_immersive_alignment" AS ENUM('bottom-left', 'center');
  CREATE TYPE "public"."enum_stories_live_coverage_state" AS ENUM('off', 'live', 'ended');
  CREATE TYPE "public"."enum_stories_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__stories_v_version_content_format" AS ENUM('byline-v1', 'legacy-html');
  CREATE TYPE "public"."enum__stories_v_version_format" AS ENUM('standard', 'video', 'audio');
  CREATE TYPE "public"."enum__stories_v_version_presentation" AS ENUM('standard', 'immersive');
  CREATE TYPE "public"."enum__stories_v_version_immersive_alignment" AS ENUM('bottom-left', 'center');
  CREATE TYPE "public"."enum__stories_v_version_live_coverage_state" AS ENUM('off', 'live', 'ended');
  CREATE TYPE "public"."enum__stories_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_story_plans_resources_purpose" AS ENUM('draft', 'interview-notes', 'transcript', 'research', 'data', 'folder', 'other');
  CREATE TYPE "public"."enum_story_plans_workflow" AS ENUM('pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped');
  CREATE TYPE "public"."enum_people_status" AS ENUM('active', 'alumni', 'guest');
  CREATE TYPE "public"."enum_media_public_delivery_status" AS ENUM('private', 'queued', 'public', 'failed');
  CREATE TYPE "public"."enum_coverages_format" AS ENUM('coverage', 'series');
  CREATE TYPE "public"."enum_coverages_status" AS ENUM('upcoming', 'active', 'past', 'archived');
  CREATE TYPE "public"."enum_corrections_type" AS ENUM('correction', 'clarification', 'editor-note', 'substantive-update');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_live_updates_state" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_tasks_priority" AS ENUM('low', 'normal', 'high', 'urgent');
  CREATE TYPE "public"."enum_tasks_state" AS ENUM('open', 'completed');
  CREATE TYPE "public"."enum_sources_status" AS ENUM('planned', 'contacted', 'waiting', 'needs-scheduling', 'scheduled', 'interviewed', 'declined', 'unavailable');
  CREATE TYPE "public"."enum_appointments_kind" AS ENUM('interview', 'meeting', 'event', 'photo', 'press-conference', 'game', 'performance', 'reporting', 'other');
  CREATE TYPE "public"."enum_appointments_status" AS ENUM('planned', 'tentative', 'confirmed', 'completed', 'cancelled');
  CREATE TYPE "public"."enum_appointments_schedule_mode" AS ENUM('unscheduled', 'window', 'exact');
  CREATE TYPE "public"."enum_production_assignments_type" AS ENUM('photo', 'gallery', 'graphic', 'video', 'audio', 'other');
  CREATE TYPE "public"."enum_production_assignments_status" AS ENUM('needed', 'assigned', 'in-progress', 'uploaded', 'selected', 'done');
  CREATE TYPE "public"."enum_polls_status" AS ENUM('draft', 'open', 'closed');
  CREATE TYPE "public"."enum_users_role" AS ENUM('staff', 'editor', 'administrator');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "byline_poll_votes" (
  	"id" bigserial PRIMARY KEY NOT NULL,
  	"poll_id" varchar(64) NOT NULL,
  	"option_id" varchar(64) NOT NULL,
  	"voter_key" varchar(64) NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar,
  	"deck" varchar,
  	"kicker" varchar,
  	"section_id" integer,
  	"featured_media_id" integer,
  	"featured_caption" varchar,
  	"content_format" "enum_stories_content_format" DEFAULT 'byline-v1',
  	"body" jsonb,
  	"legacy_html" varchar,
  	"legacy_source" varchar,
  	"format" "enum_stories_format" DEFAULT 'standard',
  	"video_url" varchar,
  	"video_metadata" jsonb,
  	"presentation" "enum_stories_presentation" DEFAULT 'standard',
  	"immersive_alignment" "enum_stories_immersive_alignment" DEFAULT 'bottom-left',
  	"reporting_note" varchar,
  	"live_coverage_state" "enum_stories_live_coverage_state" DEFAULT 'off',
  	"live_coverage_started_at" timestamp(3) with time zone,
  	"live_coverage_ended_at" timestamp(3) with time zone,
  	"slug" varchar,
  	"published_at" timestamp(3) with time zone,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_stories_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "stories_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"topics_id" integer,
  	"people_id" integer
  );
  
  CREATE TABLE "_stories_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_headline" varchar,
  	"version_deck" varchar,
  	"version_kicker" varchar,
  	"version_section_id" integer,
  	"version_featured_media_id" integer,
  	"version_featured_caption" varchar,
  	"version_content_format" "enum__stories_v_version_content_format" DEFAULT 'byline-v1',
  	"version_body" jsonb,
  	"version_legacy_html" varchar,
  	"version_legacy_source" varchar,
  	"version_format" "enum__stories_v_version_format" DEFAULT 'standard',
  	"version_video_url" varchar,
  	"version_video_metadata" jsonb,
  	"version_presentation" "enum__stories_v_version_presentation" DEFAULT 'standard',
  	"version_immersive_alignment" "enum__stories_v_version_immersive_alignment" DEFAULT 'bottom-left',
  	"version_reporting_note" varchar,
  	"version_live_coverage_state" "enum__stories_v_version_live_coverage_state" DEFAULT 'off',
  	"version_live_coverage_started_at" timestamp(3) with time zone,
  	"version_live_coverage_ended_at" timestamp(3) with time zone,
  	"version_slug" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_legacy_word_press_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__stories_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_stories_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"topics_id" integer,
  	"people_id" integer
  );
  
  CREATE TABLE "story_plans_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"purpose" "enum_story_plans_resources_purpose" DEFAULT 'other'
  );
  
  CREATE TABLE "story_plans" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"workflow" "enum_story_plans_workflow" DEFAULT 'pitch' NOT NULL,
  	"editor_id" integer,
  	"deadline" varchar,
  	"planned_publication" timestamp(3) with time zone,
  	"brief" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "story_plans_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"people_id" integer
  );
  
  CREATE TABLE "people_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "people" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"pronouns" varchar,
  	"newsroom_role" varchar,
  	"short_bio" varchar,
  	"bio" varchar,
  	"portrait_id" integer,
  	"status" "enum_people_status" DEFAULT 'active' NOT NULL,
  	"directory_visible" boolean DEFAULT true,
  	"has_profile_page" boolean DEFAULT true,
  	"public_email" varchar,
  	"legacy_word_press_id" numeric,
  	"legacy_guest_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"creator" varchar,
  	"credit" varchar,
  	"copyright" varchar,
  	"license" varchar,
  	"source_url" varchar,
  	"captured_at" timestamp(3) with time zone,
  	"art_direction" jsonb,
  	"public_delivery_status" "enum_media_public_delivery_status" DEFAULT 'private',
  	"public_delivery_content_hash" varchar,
  	"public_delivery_renditions" jsonb,
  	"public_delivery_materialized_at" timestamp(3) with time zone,
  	"uploaded_by_id" integer,
  	"legacy_word_press_id" numeric,
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
  
  CREATE TABLE "sections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"hidden" boolean DEFAULT false,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coverages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"format" "enum_coverages_format" DEFAULT 'coverage' NOT NULL,
  	"status" "enum_coverages_status" DEFAULT 'active' NOT NULL,
  	"description" varchar,
  	"overview" varchar,
  	"artwork_id" integer,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coverages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer
  );
  
  CREATE TABLE "corrections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"type" "enum_corrections_type" DEFAULT 'correction' NOT NULL,
  	"text" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"parent_id" integer,
  	"summary" varchar,
  	"body" jsonb,
  	"noindex" boolean DEFAULT false,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_parent_id" integer,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"version_noindex" boolean DEFAULT false,
  	"version_legacy_word_press_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "live_updates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"headline" varchar,
  	"body" jsonb NOT NULL,
  	"photo_id" integer,
  	"author_id" integer,
  	"state" "enum_live_updates_state" DEFAULT 'published',
  	"published_at" timestamp(3) with time zone,
  	"pinned" boolean DEFAULT false,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"due" timestamp(3) with time zone,
  	"priority" "enum_tasks_priority" DEFAULT 'normal',
  	"state" "enum_tasks_state" DEFAULT 'open',
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tasks_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"label" varchar NOT NULL,
  	"role" varchar,
  	"organization" varchar,
  	"status" "enum_sources_status" DEFAULT 'planned',
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "appointments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"source_id" integer,
  	"kind" "enum_appointments_kind" DEFAULT 'other' NOT NULL,
  	"status" "enum_appointments_status" DEFAULT 'planned' NOT NULL,
  	"schedule_mode" "enum_appointments_schedule_mode" DEFAULT 'unscheduled' NOT NULL,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"window_start" varchar,
  	"window_end" varchar,
  	"location" varchar,
  	"notes" varchar,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "appointments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "production_assignments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"type" "enum_production_assignments_type" DEFAULT 'photo' NOT NULL,
  	"title" varchar NOT NULL,
  	"deadline" timestamp(3) with time zone,
  	"status" "enum_production_assignments_status" DEFAULT 'needed' NOT NULL,
  	"notes" varchar,
  	"legacy_assignment_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "production_assignments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer
  );
  
  CREATE TABLE "polls_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"option_id" varchar NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "polls" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"poll_key" varchar NOT NULL,
  	"status" "enum_polls_status" DEFAULT 'draft' NOT NULL,
  	"opens_at" timestamp(3) with time zone,
  	"closes_at" timestamp(3) with time zone,
  	"story_id" integer,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'staff' NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"linked_person_id" integer,
  	"break_glass" boolean DEFAULT false,
  	"google_subject" varchar,
  	"discord_user_id" varchar,
  	"preferences_notify_assignments" boolean DEFAULT true,
  	"preferences_notify_appointments" boolean DEFAULT true,
  	"preferences_notify_digest" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer,
  	"story_plans_id" integer,
  	"people_id" integer,
  	"media_id" integer,
  	"sections_id" integer,
  	"topics_id" integer,
  	"coverages_id" integer,
  	"corrections_id" integer,
  	"pages_id" integer,
  	"live_updates_id" integer,
  	"tasks_id" integer,
  	"sources_id" integer,
  	"appointments_id" integer,
  	"production_assignments_id" integer,
  	"polls_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "stories" ADD CONSTRAINT "stories_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories_rels" ADD CONSTRAINT "stories_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_rels" ADD CONSTRAINT "stories_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_rels" ADD CONSTRAINT "stories_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_parent_id_stories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_section_id_sections_id_fk" FOREIGN KEY ("version_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_featured_media_id_media_id_fk" FOREIGN KEY ("version_featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v_rels" ADD CONSTRAINT "_stories_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stories_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v_rels" ADD CONSTRAINT "_stories_v_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v_rels" ADD CONSTRAINT "_stories_v_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "story_plans_resources" ADD CONSTRAINT "story_plans_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."story_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "story_plans" ADD CONSTRAINT "story_plans_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_plans" ADD CONSTRAINT "story_plans_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_plans" ADD CONSTRAINT "story_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_plans_rels" ADD CONSTRAINT "story_plans_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."story_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "story_plans_rels" ADD CONSTRAINT "story_plans_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_socials" ADD CONSTRAINT "people_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_portrait_id_media_id_fk" FOREIGN KEY ("portrait_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coverages" ADD CONSTRAINT "coverages_artwork_id_media_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coverages_rels" ADD CONSTRAINT "coverages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."coverages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "coverages_rels" ADD CONSTRAINT "coverages_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "corrections" ADD CONSTRAINT "corrections_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "corrections" ADD CONSTRAINT "corrections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_updates" ADD CONSTRAINT "live_updates_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_updates" ADD CONSTRAINT "live_updates_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_updates" ADD CONSTRAINT "live_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks_rels" ADD CONSTRAINT "tasks_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tasks_rels" ADD CONSTRAINT "tasks_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "appointments_rels" ADD CONSTRAINT "appointments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "appointments_rels" ADD CONSTRAINT "appointments_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "production_assignments" ADD CONSTRAINT "production_assignments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_assignments_rels" ADD CONSTRAINT "production_assignments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."production_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "production_assignments_rels" ADD CONSTRAINT "production_assignments_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "production_assignments_rels" ADD CONSTRAINT "production_assignments_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "polls_options" ADD CONSTRAINT "polls_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "polls" ADD CONSTRAINT "polls_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_linked_person_id_people_id_fk" FOREIGN KEY ("linked_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_story_plans_fk" FOREIGN KEY ("story_plans_id") REFERENCES "public"."story_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coverages_fk" FOREIGN KEY ("coverages_id") REFERENCES "public"."coverages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_corrections_fk" FOREIGN KEY ("corrections_id") REFERENCES "public"."corrections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_updates_fk" FOREIGN KEY ("live_updates_id") REFERENCES "public"."live_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_appointments_fk" FOREIGN KEY ("appointments_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_production_assignments_fk" FOREIGN KEY ("production_assignments_id") REFERENCES "public"."production_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_polls_fk" FOREIGN KEY ("polls_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "byline_poll_votes_poll_voter" ON "byline_poll_votes" USING btree ("poll_id","voter_key");
  CREATE INDEX "byline_poll_votes_poll" ON "byline_poll_votes" USING btree ("poll_id");
  CREATE INDEX "byline_poll_votes_poll_option" ON "byline_poll_votes" USING btree ("poll_id","option_id");
  CREATE INDEX "stories_section_idx" ON "stories" USING btree ("section_id");
  CREATE INDEX "stories_featured_media_idx" ON "stories" USING btree ("featured_media_id");
  CREATE UNIQUE INDEX "stories_slug_idx" ON "stories" USING btree ("slug");
  CREATE INDEX "stories_published_at_idx" ON "stories" USING btree ("published_at");
  CREATE INDEX "stories_legacy_word_press_id_idx" ON "stories" USING btree ("legacy_word_press_id");
  CREATE INDEX "stories_updated_at_idx" ON "stories" USING btree ("updated_at");
  CREATE INDEX "stories_created_at_idx" ON "stories" USING btree ("created_at");
  CREATE INDEX "stories_deleted_at_idx" ON "stories" USING btree ("deleted_at");
  CREATE INDEX "stories__status_idx" ON "stories" USING btree ("_status");
  CREATE INDEX "stories_rels_order_idx" ON "stories_rels" USING btree ("order");
  CREATE INDEX "stories_rels_parent_idx" ON "stories_rels" USING btree ("parent_id");
  CREATE INDEX "stories_rels_path_idx" ON "stories_rels" USING btree ("path");
  CREATE INDEX "stories_rels_topics_id_idx" ON "stories_rels" USING btree ("topics_id");
  CREATE INDEX "stories_rels_people_id_idx" ON "stories_rels" USING btree ("people_id");
  CREATE INDEX "_stories_v_parent_idx" ON "_stories_v" USING btree ("parent_id");
  CREATE INDEX "_stories_v_version_version_section_idx" ON "_stories_v" USING btree ("version_section_id");
  CREATE INDEX "_stories_v_version_version_featured_media_idx" ON "_stories_v" USING btree ("version_featured_media_id");
  CREATE INDEX "_stories_v_version_version_slug_idx" ON "_stories_v" USING btree ("version_slug");
  CREATE INDEX "_stories_v_version_version_published_at_idx" ON "_stories_v" USING btree ("version_published_at");
  CREATE INDEX "_stories_v_version_version_legacy_word_press_id_idx" ON "_stories_v" USING btree ("version_legacy_word_press_id");
  CREATE INDEX "_stories_v_version_version_updated_at_idx" ON "_stories_v" USING btree ("version_updated_at");
  CREATE INDEX "_stories_v_version_version_created_at_idx" ON "_stories_v" USING btree ("version_created_at");
  CREATE INDEX "_stories_v_version_version_deleted_at_idx" ON "_stories_v" USING btree ("version_deleted_at");
  CREATE INDEX "_stories_v_version_version__status_idx" ON "_stories_v" USING btree ("version__status");
  CREATE INDEX "_stories_v_created_at_idx" ON "_stories_v" USING btree ("created_at");
  CREATE INDEX "_stories_v_updated_at_idx" ON "_stories_v" USING btree ("updated_at");
  CREATE INDEX "_stories_v_latest_idx" ON "_stories_v" USING btree ("latest");
  CREATE INDEX "_stories_v_autosave_idx" ON "_stories_v" USING btree ("autosave");
  CREATE INDEX "_stories_v_rels_order_idx" ON "_stories_v_rels" USING btree ("order");
  CREATE INDEX "_stories_v_rels_parent_idx" ON "_stories_v_rels" USING btree ("parent_id");
  CREATE INDEX "_stories_v_rels_path_idx" ON "_stories_v_rels" USING btree ("path");
  CREATE INDEX "_stories_v_rels_topics_id_idx" ON "_stories_v_rels" USING btree ("topics_id");
  CREATE INDEX "_stories_v_rels_people_id_idx" ON "_stories_v_rels" USING btree ("people_id");
  CREATE INDEX "story_plans_resources_order_idx" ON "story_plans_resources" USING btree ("_order");
  CREATE INDEX "story_plans_resources_parent_id_idx" ON "story_plans_resources" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "story_plans_story_idx" ON "story_plans" USING btree ("story_id");
  CREATE INDEX "story_plans_workflow_idx" ON "story_plans" USING btree ("workflow");
  CREATE INDEX "story_plans_editor_idx" ON "story_plans" USING btree ("editor_id");
  CREATE INDEX "story_plans_deadline_idx" ON "story_plans" USING btree ("deadline");
  CREATE INDEX "story_plans_created_by_idx" ON "story_plans" USING btree ("created_by_id");
  CREATE INDEX "story_plans_updated_at_idx" ON "story_plans" USING btree ("updated_at");
  CREATE INDEX "story_plans_created_at_idx" ON "story_plans" USING btree ("created_at");
  CREATE INDEX "story_plans_rels_order_idx" ON "story_plans_rels" USING btree ("order");
  CREATE INDEX "story_plans_rels_parent_idx" ON "story_plans_rels" USING btree ("parent_id");
  CREATE INDEX "story_plans_rels_path_idx" ON "story_plans_rels" USING btree ("path");
  CREATE INDEX "story_plans_rels_people_id_idx" ON "story_plans_rels" USING btree ("people_id");
  CREATE INDEX "people_socials_order_idx" ON "people_socials" USING btree ("_order");
  CREATE INDEX "people_socials_parent_id_idx" ON "people_socials" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "people_slug_idx" ON "people" USING btree ("slug");
  CREATE INDEX "people_portrait_idx" ON "people" USING btree ("portrait_id");
  CREATE INDEX "people_status_idx" ON "people" USING btree ("status");
  CREATE INDEX "people_legacy_word_press_id_idx" ON "people" USING btree ("legacy_word_press_id");
  CREATE INDEX "people_legacy_guest_id_idx" ON "people" USING btree ("legacy_guest_id");
  CREATE INDEX "people_updated_at_idx" ON "people" USING btree ("updated_at");
  CREATE INDEX "people_created_at_idx" ON "people" USING btree ("created_at");
  CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by_id");
  CREATE INDEX "media_legacy_word_press_id_idx" ON "media" USING btree ("legacy_word_press_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "sections_slug_idx" ON "sections" USING btree ("slug");
  CREATE INDEX "sections_legacy_word_press_id_idx" ON "sections" USING btree ("legacy_word_press_id");
  CREATE INDEX "sections_updated_at_idx" ON "sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "sections" USING btree ("created_at");
  CREATE UNIQUE INDEX "topics_slug_idx" ON "topics" USING btree ("slug");
  CREATE INDEX "topics_legacy_word_press_id_idx" ON "topics" USING btree ("legacy_word_press_id");
  CREATE INDEX "topics_updated_at_idx" ON "topics" USING btree ("updated_at");
  CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");
  CREATE UNIQUE INDEX "coverages_slug_idx" ON "coverages" USING btree ("slug");
  CREATE INDEX "coverages_status_idx" ON "coverages" USING btree ("status");
  CREATE INDEX "coverages_artwork_idx" ON "coverages" USING btree ("artwork_id");
  CREATE INDEX "coverages_legacy_word_press_id_idx" ON "coverages" USING btree ("legacy_word_press_id");
  CREATE INDEX "coverages_updated_at_idx" ON "coverages" USING btree ("updated_at");
  CREATE INDEX "coverages_created_at_idx" ON "coverages" USING btree ("created_at");
  CREATE INDEX "coverages_rels_order_idx" ON "coverages_rels" USING btree ("order");
  CREATE INDEX "coverages_rels_parent_idx" ON "coverages_rels" USING btree ("parent_id");
  CREATE INDEX "coverages_rels_path_idx" ON "coverages_rels" USING btree ("path");
  CREATE INDEX "coverages_rels_stories_id_idx" ON "coverages_rels" USING btree ("stories_id");
  CREATE INDEX "corrections_story_idx" ON "corrections" USING btree ("story_id");
  CREATE INDEX "corrections_date_idx" ON "corrections" USING btree ("date");
  CREATE INDEX "corrections_created_by_idx" ON "corrections" USING btree ("created_by_id");
  CREATE INDEX "corrections_legacy_word_press_id_idx" ON "corrections" USING btree ("legacy_word_press_id");
  CREATE INDEX "corrections_updated_at_idx" ON "corrections" USING btree ("updated_at");
  CREATE INDEX "corrections_created_at_idx" ON "corrections" USING btree ("created_at");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE INDEX "pages_legacy_word_press_id_idx" ON "pages" USING btree ("legacy_word_press_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "_pages_v_version_version_legacy_word_press_id_idx" ON "_pages_v" USING btree ("version_legacy_word_press_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "live_updates_story_idx" ON "live_updates" USING btree ("story_id");
  CREATE INDEX "live_updates_photo_idx" ON "live_updates" USING btree ("photo_id");
  CREATE INDEX "live_updates_author_idx" ON "live_updates" USING btree ("author_id");
  CREATE INDEX "live_updates_state_idx" ON "live_updates" USING btree ("state");
  CREATE INDEX "live_updates_published_at_idx" ON "live_updates" USING btree ("published_at");
  CREATE INDEX "live_updates_legacy_word_press_id_idx" ON "live_updates" USING btree ("legacy_word_press_id");
  CREATE INDEX "live_updates_updated_at_idx" ON "live_updates" USING btree ("updated_at");
  CREATE INDEX "live_updates_created_at_idx" ON "live_updates" USING btree ("created_at");
  CREATE INDEX "tasks_story_idx" ON "tasks" USING btree ("story_id");
  CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due");
  CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state");
  CREATE INDEX "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
  CREATE INDEX "tasks_rels_order_idx" ON "tasks_rels" USING btree ("order");
  CREATE INDEX "tasks_rels_parent_idx" ON "tasks_rels" USING btree ("parent_id");
  CREATE INDEX "tasks_rels_path_idx" ON "tasks_rels" USING btree ("path");
  CREATE INDEX "tasks_rels_users_id_idx" ON "tasks_rels" USING btree ("users_id");
  CREATE INDEX "sources_story_idx" ON "sources" USING btree ("story_id");
  CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "sources_rels_order_idx" ON "sources_rels" USING btree ("order");
  CREATE INDEX "sources_rels_parent_idx" ON "sources_rels" USING btree ("parent_id");
  CREATE INDEX "sources_rels_path_idx" ON "sources_rels" USING btree ("path");
  CREATE INDEX "sources_rels_users_id_idx" ON "sources_rels" USING btree ("users_id");
  CREATE INDEX "appointments_story_idx" ON "appointments" USING btree ("story_id");
  CREATE INDEX "appointments_source_idx" ON "appointments" USING btree ("source_id");
  CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");
  CREATE INDEX "appointments_start_at_idx" ON "appointments" USING btree ("start_at");
  CREATE INDEX "appointments_window_start_idx" ON "appointments" USING btree ("window_start");
  CREATE INDEX "appointments_updated_at_idx" ON "appointments" USING btree ("updated_at");
  CREATE INDEX "appointments_created_at_idx" ON "appointments" USING btree ("created_at");
  CREATE INDEX "appointments_rels_order_idx" ON "appointments_rels" USING btree ("order");
  CREATE INDEX "appointments_rels_parent_idx" ON "appointments_rels" USING btree ("parent_id");
  CREATE INDEX "appointments_rels_path_idx" ON "appointments_rels" USING btree ("path");
  CREATE INDEX "appointments_rels_users_id_idx" ON "appointments_rels" USING btree ("users_id");
  CREATE INDEX "production_assignments_story_idx" ON "production_assignments" USING btree ("story_id");
  CREATE INDEX "production_assignments_deadline_idx" ON "production_assignments" USING btree ("deadline");
  CREATE INDEX "production_assignments_status_idx" ON "production_assignments" USING btree ("status");
  CREATE INDEX "production_assignments_legacy_assignment_id_idx" ON "production_assignments" USING btree ("legacy_assignment_id");
  CREATE INDEX "production_assignments_updated_at_idx" ON "production_assignments" USING btree ("updated_at");
  CREATE INDEX "production_assignments_created_at_idx" ON "production_assignments" USING btree ("created_at");
  CREATE INDEX "production_assignments_rels_order_idx" ON "production_assignments_rels" USING btree ("order");
  CREATE INDEX "production_assignments_rels_parent_idx" ON "production_assignments_rels" USING btree ("parent_id");
  CREATE INDEX "production_assignments_rels_path_idx" ON "production_assignments_rels" USING btree ("path");
  CREATE INDEX "production_assignments_rels_users_id_idx" ON "production_assignments_rels" USING btree ("users_id");
  CREATE INDEX "production_assignments_rels_media_id_idx" ON "production_assignments_rels" USING btree ("media_id");
  CREATE INDEX "polls_options_order_idx" ON "polls_options" USING btree ("_order");
  CREATE INDEX "polls_options_parent_id_idx" ON "polls_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "polls_poll_key_idx" ON "polls" USING btree ("poll_key");
  CREATE INDEX "polls_status_idx" ON "polls" USING btree ("status");
  CREATE INDEX "polls_story_idx" ON "polls" USING btree ("story_id");
  CREATE INDEX "polls_legacy_word_press_id_idx" ON "polls" USING btree ("legacy_word_press_id");
  CREATE INDEX "polls_updated_at_idx" ON "polls" USING btree ("updated_at");
  CREATE INDEX "polls_created_at_idx" ON "polls" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_enabled_idx" ON "users" USING btree ("enabled");
  CREATE INDEX "users_linked_person_idx" ON "users" USING btree ("linked_person_id");
  CREATE UNIQUE INDEX "users_google_subject_idx" ON "users" USING btree ("google_subject");
  CREATE INDEX "users_discord_user_id_idx" ON "users" USING btree ("discord_user_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_stories_id_idx" ON "payload_locked_documents_rels" USING btree ("stories_id");
  CREATE INDEX "payload_locked_documents_rels_story_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("story_plans_id");
  CREATE INDEX "payload_locked_documents_rels_people_id_idx" ON "payload_locked_documents_rels" USING btree ("people_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("sections_id");
  CREATE INDEX "payload_locked_documents_rels_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("topics_id");
  CREATE INDEX "payload_locked_documents_rels_coverages_id_idx" ON "payload_locked_documents_rels" USING btree ("coverages_id");
  CREATE INDEX "payload_locked_documents_rels_corrections_id_idx" ON "payload_locked_documents_rels" USING btree ("corrections_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_live_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("live_updates_id");
  CREATE INDEX "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_appointments_id_idx" ON "payload_locked_documents_rels" USING btree ("appointments_id");
  CREATE INDEX "payload_locked_documents_rels_production_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("production_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_polls_id_idx" ON "payload_locked_documents_rels" USING btree ("polls_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "byline_poll_votes" CASCADE;
  DROP TABLE "stories" CASCADE;
  DROP TABLE "stories_rels" CASCADE;
  DROP TABLE "_stories_v" CASCADE;
  DROP TABLE "_stories_v_rels" CASCADE;
  DROP TABLE "story_plans_resources" CASCADE;
  DROP TABLE "story_plans" CASCADE;
  DROP TABLE "story_plans_rels" CASCADE;
  DROP TABLE "people_socials" CASCADE;
  DROP TABLE "people" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "sections" CASCADE;
  DROP TABLE "topics" CASCADE;
  DROP TABLE "coverages" CASCADE;
  DROP TABLE "coverages_rels" CASCADE;
  DROP TABLE "corrections" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "live_updates" CASCADE;
  DROP TABLE "tasks" CASCADE;
  DROP TABLE "tasks_rels" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "sources_rels" CASCADE;
  DROP TABLE "appointments" CASCADE;
  DROP TABLE "appointments_rels" CASCADE;
  DROP TABLE "production_assignments" CASCADE;
  DROP TABLE "production_assignments_rels" CASCADE;
  DROP TABLE "polls_options" CASCADE;
  DROP TABLE "polls" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_stories_content_format";
  DROP TYPE "public"."enum_stories_format";
  DROP TYPE "public"."enum_stories_presentation";
  DROP TYPE "public"."enum_stories_immersive_alignment";
  DROP TYPE "public"."enum_stories_live_coverage_state";
  DROP TYPE "public"."enum_stories_status";
  DROP TYPE "public"."enum__stories_v_version_content_format";
  DROP TYPE "public"."enum__stories_v_version_format";
  DROP TYPE "public"."enum__stories_v_version_presentation";
  DROP TYPE "public"."enum__stories_v_version_immersive_alignment";
  DROP TYPE "public"."enum__stories_v_version_live_coverage_state";
  DROP TYPE "public"."enum__stories_v_version_status";
  DROP TYPE "public"."enum_story_plans_resources_purpose";
  DROP TYPE "public"."enum_story_plans_workflow";
  DROP TYPE "public"."enum_people_status";
  DROP TYPE "public"."enum_media_public_delivery_status";
  DROP TYPE "public"."enum_coverages_format";
  DROP TYPE "public"."enum_coverages_status";
  DROP TYPE "public"."enum_corrections_type";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_live_updates_state";
  DROP TYPE "public"."enum_tasks_priority";
  DROP TYPE "public"."enum_tasks_state";
  DROP TYPE "public"."enum_sources_status";
  DROP TYPE "public"."enum_appointments_kind";
  DROP TYPE "public"."enum_appointments_status";
  DROP TYPE "public"."enum_appointments_schedule_mode";
  DROP TYPE "public"."enum_production_assignments_type";
  DROP TYPE "public"."enum_production_assignments_status";
  DROP TYPE "public"."enum_polls_status";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
