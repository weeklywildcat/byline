import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_poll_surveys_status" AS ENUM('draft', 'open', 'closed', 'archived');
  CREATE TABLE "byline_poll_sessions" (
  	"id" varchar(36) PRIMARY KEY NOT NULL,
  	"survey_id" integer NOT NULL,
  	"version_id" integer NOT NULL,
  	"interviewer_id" integer NOT NULL,
  	"location_id" integer,
  	"location_name" varchar(120) NOT NULL,
  	"period" varchar(120) DEFAULT '' NOT NULL,
  	"method" varchar(200) DEFAULT '' NOT NULL,
  	"status" varchar(8) DEFAULT 'active' NOT NULL,
  	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"ended_at" timestamp with time zone,
  	"kiosk_token_hash" varchar(64),
  	"kiosk_expires_at" timestamp with time zone,
  	"kiosk_pin_hash" varchar(200),
  	"kiosk_mode" varchar(12) DEFAULT 'locked' NOT NULL,
  	"kiosk_unlocked_until" timestamp with time zone,
  	"kiosk_ticket" varchar(36),
  	"pin_failures" smallint DEFAULT 0 NOT NULL,
  	"pin_locked_until" timestamp with time zone,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "byline_poll_session_events" (
  	"id" bigserial PRIMARY KEY NOT NULL,
  	"session_id" varchar(36) NOT NULL,
  	"survey_id" integer NOT NULL,
  	"kind" varchar(10) NOT NULL,
  	"event_key" varchar(64) NOT NULL,
  	"ticket" varchar(36),
  	"location_name" varchar(120) NOT NULL,
  	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "byline_poll_responses" (
  	"id" bigserial PRIMARY KEY NOT NULL,
  	"submission_id" varchar(64) NOT NULL,
  	"survey_id" integer NOT NULL,
  	"version_id" integer NOT NULL,
  	"session_id" varchar(36),
  	"ticket" varchar(36),
  	"mode" varchar(8) NOT NULL,
  	"location_name" varchar(120) DEFAULT '' NOT NULL,
  	"answers" jsonb NOT NULL,
  	"started_at" timestamp with time zone,
  	"duration_ms" integer,
  	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "byline_poll_public_starts" (
  	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
  	"survey_id" integer NOT NULL,
  	"version_id" integer NOT NULL,
  	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"used_at" timestamp with time zone
  );
  
  CREATE TABLE "poll_surveys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"status" "enum_poll_surveys_status" DEFAULT 'draft' NOT NULL,
  	"owner_id" integer,
  	"current_version_id" integer,
  	"draft" jsonb,
  	"draft_revision" numeric DEFAULT 0,
  	"draft_source" varchar,
  	"open_to_all_staff" boolean DEFAULT false,
  	"kiosk_enabled" boolean DEFAULT true,
  	"public_link_enabled" boolean DEFAULT false,
  	"public_link_key" varchar,
  	"public_link_opens_at" timestamp(3) with time zone,
  	"public_link_closes_at" timestamp(3) with time zone,
  	"public_link_access_code_hash" varchar,
  	"public_link_hourly_limit" numeric DEFAULT 300,
  	"linked_story_id" integer,
  	"linked_collection_id" integer,
  	"methodology" varchar,
  	"minimum_group" numeric DEFAULT 5 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poll_surveys_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "poll_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"survey_id" integer NOT NULL,
  	"number" numeric NOT NULL,
  	"label" varchar,
  	"definition" jsonb NOT NULL,
  	"source_filename" varchar,
  	"source_sha256" varchar,
  	"note" varchar,
  	"published_by_id" integer,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"question_count" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poll_locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"notes" varchar,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "poll_surveys" ADD CONSTRAINT "poll_surveys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_surveys" ADD CONSTRAINT "poll_surveys_current_version_id_poll_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."poll_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_surveys" ADD CONSTRAINT "poll_surveys_linked_story_id_stories_id_fk" FOREIGN KEY ("linked_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_surveys" ADD CONSTRAINT "poll_surveys_linked_collection_id_collections_id_fk" FOREIGN KEY ("linked_collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_surveys_rels" ADD CONSTRAINT "poll_surveys_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."poll_surveys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_surveys_rels" ADD CONSTRAINT "poll_surveys_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_versions" ADD CONSTRAINT "poll_versions_survey_id_poll_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."poll_surveys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_versions" ADD CONSTRAINT "poll_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "byline_poll_sessions_survey" ON "byline_poll_sessions" USING btree ("survey_id","started_at");
  CREATE INDEX "byline_poll_sessions_interviewer" ON "byline_poll_sessions" USING btree ("interviewer_id","status");
  CREATE UNIQUE INDEX "byline_poll_sessions_kiosk_token" ON "byline_poll_sessions" USING btree ("kiosk_token_hash");
  CREATE UNIQUE INDEX "byline_poll_session_events_key" ON "byline_poll_session_events" USING btree ("event_key");
  CREATE UNIQUE INDEX "byline_poll_session_events_ticket_kind" ON "byline_poll_session_events" USING btree ("ticket","kind");
  CREATE INDEX "byline_poll_session_events_session" ON "byline_poll_session_events" USING btree ("session_id","kind");
  CREATE INDEX "byline_poll_session_events_survey" ON "byline_poll_session_events" USING btree ("survey_id","occurred_at");
  CREATE UNIQUE INDEX "byline_poll_responses_submission" ON "byline_poll_responses" USING btree ("submission_id");
  CREATE UNIQUE INDEX "byline_poll_responses_ticket" ON "byline_poll_responses" USING btree ("ticket");
  CREATE INDEX "byline_poll_responses_survey" ON "byline_poll_responses" USING btree ("survey_id","submitted_at");
  CREATE INDEX "byline_poll_responses_session" ON "byline_poll_responses" USING btree ("session_id");
  CREATE INDEX "byline_poll_public_starts_survey" ON "byline_poll_public_starts" USING btree ("survey_id","issued_at");
  CREATE INDEX "poll_surveys_status_idx" ON "poll_surveys" USING btree ("status");
  CREATE INDEX "poll_surveys_owner_idx" ON "poll_surveys" USING btree ("owner_id");
  CREATE INDEX "poll_surveys_current_version_idx" ON "poll_surveys" USING btree ("current_version_id");
  CREATE UNIQUE INDEX "poll_surveys_public_link_public_link_key_idx" ON "poll_surveys" USING btree ("public_link_key");
  CREATE INDEX "poll_surveys_linked_story_idx" ON "poll_surveys" USING btree ("linked_story_id");
  CREATE INDEX "poll_surveys_linked_collection_idx" ON "poll_surveys" USING btree ("linked_collection_id");
  CREATE INDEX "poll_surveys_updated_at_idx" ON "poll_surveys" USING btree ("updated_at");
  CREATE INDEX "poll_surveys_created_at_idx" ON "poll_surveys" USING btree ("created_at");
  CREATE INDEX "poll_surveys_rels_order_idx" ON "poll_surveys_rels" USING btree ("order");
  CREATE INDEX "poll_surveys_rels_parent_idx" ON "poll_surveys_rels" USING btree ("parent_id");
  CREATE INDEX "poll_surveys_rels_path_idx" ON "poll_surveys_rels" USING btree ("path");
  CREATE INDEX "poll_surveys_rels_users_id_idx" ON "poll_surveys_rels" USING btree ("users_id");
  CREATE INDEX "poll_versions_survey_idx" ON "poll_versions" USING btree ("survey_id");
  CREATE INDEX "poll_versions_published_by_idx" ON "poll_versions" USING btree ("published_by_id");
  CREATE INDEX "poll_versions_updated_at_idx" ON "poll_versions" USING btree ("updated_at");
  CREATE INDEX "poll_versions_created_at_idx" ON "poll_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "survey_number_idx" ON "poll_versions" USING btree ("survey_id","number");
  CREATE UNIQUE INDEX "poll_locations_name_idx" ON "poll_locations" USING btree ("name");
  CREATE INDEX "poll_locations_active_idx" ON "poll_locations" USING btree ("active");
  CREATE INDEX "poll_locations_updated_at_idx" ON "poll_locations" USING btree ("updated_at");
  CREATE INDEX "poll_locations_created_at_idx" ON "poll_locations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "byline_poll_sessions" CASCADE;
  DROP TABLE "byline_poll_session_events" CASCADE;
  DROP TABLE "byline_poll_responses" CASCADE;
  DROP TABLE "byline_poll_public_starts" CASCADE;
  DROP TABLE "poll_surveys" CASCADE;
  DROP TABLE "poll_surveys_rels" CASCADE;
  DROP TABLE "poll_versions" CASCADE;
  DROP TABLE "poll_locations" CASCADE;
  DROP TYPE "public"."enum_poll_surveys_status";`)
}
