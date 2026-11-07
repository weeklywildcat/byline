import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_event_status" AS ENUM('scheduled', 'canceled');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_version_event_status" AS ENUM('scheduled', 'canceled');
  CREATE TYPE "public"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_publication_navigation_locations" AS ENUM('header', 'footer');
  CREATE TYPE "public"."enum_publication_navigation_feature" AS ENUM('sports', 'events', 'polls', 'newsletter', 'discord');
  CREATE TYPE "public"."enum_publication_appearance_theme" AS ENUM('weekly-wildcat');
  CREATE TYPE "public"."enum_publication_seo_organization_type" AS ENUM('NewsMediaOrganization', 'Organization');
  CREATE TYPE "public"."enum_publication_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__publication_v_version_navigation_locations" AS ENUM('header', 'footer');
  CREATE TYPE "public"."enum__publication_v_version_navigation_feature" AS ENUM('sports', 'events', 'polls', 'newsletter', 'discord');
  CREATE TYPE "public"."enum__publication_v_version_appearance_theme" AS ENUM('weekly-wildcat');
  CREATE TYPE "public"."enum__publication_v_version_seo_organization_type" AS ENUM('NewsMediaOrganization', 'Organization');
  CREATE TYPE "public"."enum__publication_v_version_status" AS ENUM('draft', 'published');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'prepare-public-snapshot' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'advance-public-revision' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'prepare-public-snapshot' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'advance-public-revision' BEFORE 'schedulePublish';
  CREATE TABLE "byline_publication_state" (
  	"id" integer PRIMARY KEY NOT NULL,
  	"current_revision" bigint DEFAULT 0 NOT NULL,
  	"completed_revision" bigint,
  	"completed_schema_version" integer,
  	"completed_sha256" text,
  	"completed_bytes" bigint,
  	"completed_generated_at" timestamp with time zone,
  	"completed_filename" text,
  	"completed_producer_version" integer,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "byline_publication_state_singleton" CHECK ("byline_publication_state"."id" = 1),
  	CONSTRAINT "byline_publication_state_revision_nonnegative" CHECK ("byline_publication_state"."current_revision" >= 0)
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"event_type" varchar,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"all_day" boolean DEFAULT false,
  	"location" varchar,
  	"description" varchar,
  	"external_url" varchar,
  	"event_status" "enum_events_event_status" DEFAULT 'scheduled',
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_event_type" varchar,
  	"version_start_at" timestamp(3) with time zone,
  	"version_end_at" timestamp(3) with time zone,
  	"version_all_day" boolean DEFAULT false,
  	"version_location" varchar,
  	"version_description" varchar,
  	"version_external_url" varchar,
  	"version_event_status" "enum__events_v_version_event_status" DEFAULT 'scheduled',
  	"version_legacy_word_press_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "publication_branding_icons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"alt" varchar,
  	"width" numeric,
  	"height" numeric
  );
  
  CREATE TABLE "publication_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"active" boolean DEFAULT true,
  	"description" varchar
  );
  
  CREATE TABLE "publication_navigation_locations" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_publication_navigation_locations",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "publication_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"group" varchar,
  	"feature" "enum_publication_navigation_feature"
  );
  
  CREATE TABLE "publication_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"service" varchar,
  	"label" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "publication" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"identity_name" varchar DEFAULT 'Weekly Wildcat',
  	"identity_short_name" varchar DEFAULT 'Weekly Wildcat',
  	"identity_description" varchar DEFAULT 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
  	"identity_organization_name" varchar DEFAULT 'Ninety Six High School',
  	"identity_tagline" varchar DEFAULT 'Ninety Six High School''s Official Student Newspaper',
  	"location_display" varchar DEFAULT 'Ninety Six, S.C.',
  	"location_city" varchar DEFAULT 'Ninety Six',
  	"location_region" varchar DEFAULT 'South Carolina',
  	"location_country" varchar DEFAULT 'US',
  	"location_address" varchar DEFAULT '640 South Cambridge Street, Ninety Six, SC',
  	"locale" varchar DEFAULT 'en-US',
  	"timezone" varchar DEFAULT 'America/New_York',
  	"urls_public_site" varchar DEFAULT 'https://weeklywildcat.com',
  	"urls_cms" varchar DEFAULT 'https://cms.weeklywildcat.com',
  	"urls_contact" varchar DEFAULT '/contact/',
  	"branding_masthead_url" varchar DEFAULT '/brand/weekly-wildcat-wide-logo.svg',
  	"branding_masthead_alt" varchar DEFAULT 'Weekly Wildcat',
  	"branding_masthead_width" numeric,
  	"branding_masthead_height" numeric,
  	"branding_logo_url" varchar DEFAULT '/brand/weekly-wildcat-logo.svg',
  	"branding_logo_alt" varchar DEFAULT 'Weekly Wildcat',
  	"branding_logo_width" numeric,
  	"branding_logo_height" numeric,
  	"branding_organization_logo_url" varchar DEFAULT '/organization-logo.png',
  	"branding_organization_logo_alt" varchar DEFAULT 'Ninety Six High School',
  	"branding_organization_logo_width" numeric DEFAULT 1024,
  	"branding_organization_logo_height" numeric DEFAULT 1024,
  	"branding_default_social_image_url" varchar DEFAULT '/media-kit/open-graph-social.png',
  	"branding_default_social_image_alt" varchar DEFAULT 'Weekly Wildcat',
  	"branding_default_social_image_width" numeric DEFAULT 1200,
  	"branding_default_social_image_height" numeric DEFAULT 600,
  	"appearance_theme" "enum_publication_appearance_theme" DEFAULT 'weekly-wildcat',
  	"features_sports" boolean DEFAULT true,
  	"features_events" boolean DEFAULT true,
  	"features_polls" boolean DEFAULT true,
  	"features_newsletter" boolean DEFAULT true,
  	"features_discord" boolean DEFAULT true,
  	"licensing_copyright_notice" varchar DEFAULT '© Weekly Wildcat',
  	"licensing_image_license_url" varchar DEFAULT '/image-license/',
  	"licensing_acquire_license_page" varchar DEFAULT '/image-license/',
  	"seo_default_title" varchar DEFAULT 'Weekly Wildcat',
  	"seo_default_description" varchar DEFAULT 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
  	"seo_organization_type" "enum_publication_seo_organization_type" DEFAULT 'NewsMediaOrganization',
  	"_status" "enum_publication_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_publication_v_version_branding_icons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"alt" varchar,
  	"width" numeric,
  	"height" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_publication_v_version_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"active" boolean DEFAULT true,
  	"description" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_publication_v_version_navigation_locations" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__publication_v_version_navigation_locations",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_publication_v_version_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"group" varchar,
  	"feature" "enum__publication_v_version_navigation_feature",
  	"_uuid" varchar
  );
  
  CREATE TABLE "_publication_v_version_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"service" varchar,
  	"label" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_publication_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_identity_name" varchar DEFAULT 'Weekly Wildcat',
  	"version_identity_short_name" varchar DEFAULT 'Weekly Wildcat',
  	"version_identity_description" varchar DEFAULT 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
  	"version_identity_organization_name" varchar DEFAULT 'Ninety Six High School',
  	"version_identity_tagline" varchar DEFAULT 'Ninety Six High School''s Official Student Newspaper',
  	"version_location_display" varchar DEFAULT 'Ninety Six, S.C.',
  	"version_location_city" varchar DEFAULT 'Ninety Six',
  	"version_location_region" varchar DEFAULT 'South Carolina',
  	"version_location_country" varchar DEFAULT 'US',
  	"version_location_address" varchar DEFAULT '640 South Cambridge Street, Ninety Six, SC',
  	"version_locale" varchar DEFAULT 'en-US',
  	"version_timezone" varchar DEFAULT 'America/New_York',
  	"version_urls_public_site" varchar DEFAULT 'https://weeklywildcat.com',
  	"version_urls_cms" varchar DEFAULT 'https://cms.weeklywildcat.com',
  	"version_urls_contact" varchar DEFAULT '/contact/',
  	"version_branding_masthead_url" varchar DEFAULT '/brand/weekly-wildcat-wide-logo.svg',
  	"version_branding_masthead_alt" varchar DEFAULT 'Weekly Wildcat',
  	"version_branding_masthead_width" numeric,
  	"version_branding_masthead_height" numeric,
  	"version_branding_logo_url" varchar DEFAULT '/brand/weekly-wildcat-logo.svg',
  	"version_branding_logo_alt" varchar DEFAULT 'Weekly Wildcat',
  	"version_branding_logo_width" numeric,
  	"version_branding_logo_height" numeric,
  	"version_branding_organization_logo_url" varchar DEFAULT '/organization-logo.png',
  	"version_branding_organization_logo_alt" varchar DEFAULT 'Ninety Six High School',
  	"version_branding_organization_logo_width" numeric DEFAULT 1024,
  	"version_branding_organization_logo_height" numeric DEFAULT 1024,
  	"version_branding_default_social_image_url" varchar DEFAULT '/media-kit/open-graph-social.png',
  	"version_branding_default_social_image_alt" varchar DEFAULT 'Weekly Wildcat',
  	"version_branding_default_social_image_width" numeric DEFAULT 1200,
  	"version_branding_default_social_image_height" numeric DEFAULT 600,
  	"version_appearance_theme" "enum__publication_v_version_appearance_theme" DEFAULT 'weekly-wildcat',
  	"version_features_sports" boolean DEFAULT true,
  	"version_features_events" boolean DEFAULT true,
  	"version_features_polls" boolean DEFAULT true,
  	"version_features_newsletter" boolean DEFAULT true,
  	"version_features_discord" boolean DEFAULT true,
  	"version_licensing_copyright_notice" varchar DEFAULT '© Weekly Wildcat',
  	"version_licensing_image_license_url" varchar DEFAULT '/image-license/',
  	"version_licensing_acquire_license_page" varchar DEFAULT '/image-license/',
  	"version_seo_default_title" varchar DEFAULT 'Weekly Wildcat',
  	"version_seo_default_description" varchar DEFAULT 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
  	"version_seo_organization_type" "enum__publication_v_version_seo_organization_type" DEFAULT 'NewsMediaOrganization',
  	"version__status" "enum__publication_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "pages" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_published_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "events_id" integer;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publication_branding_icons" ADD CONSTRAINT "publication_branding_icons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publication_sections" ADD CONSTRAINT "publication_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publication_navigation_locations" ADD CONSTRAINT "publication_navigation_locations_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publication_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publication_navigation" ADD CONSTRAINT "publication_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publication_social" ADD CONSTRAINT "publication_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publication_v_version_branding_icons" ADD CONSTRAINT "_publication_v_version_branding_icons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publication_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publication_v_version_sections" ADD CONSTRAINT "_publication_v_version_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publication_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publication_v_version_navigation_locations" ADD CONSTRAINT "_publication_v_version_navigation_locations_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_publication_v_version_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publication_v_version_navigation" ADD CONSTRAINT "_publication_v_version_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publication_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publication_v_version_social" ADD CONSTRAINT "_publication_v_version_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publication_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "events_slug_idx" ON "events" USING btree ("slug");
  CREATE INDEX "events_start_at_idx" ON "events" USING btree ("start_at");
  CREATE INDEX "events_legacy_word_press_id_idx" ON "events" USING btree ("legacy_word_press_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "events_deleted_at_idx" ON "events" USING btree ("deleted_at");
  CREATE INDEX "events__status_idx" ON "events" USING btree ("_status");
  CREATE INDEX "_events_v_parent_idx" ON "_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_slug_idx" ON "_events_v" USING btree ("version_slug");
  CREATE INDEX "_events_v_version_version_start_at_idx" ON "_events_v" USING btree ("version_start_at");
  CREATE INDEX "_events_v_version_version_legacy_word_press_id_idx" ON "_events_v" USING btree ("version_legacy_word_press_id");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version_deleted_at_idx" ON "_events_v" USING btree ("version_deleted_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_latest_idx" ON "_events_v" USING btree ("latest");
  CREATE INDEX "publication_branding_icons_order_idx" ON "publication_branding_icons" USING btree ("_order");
  CREATE INDEX "publication_branding_icons_parent_id_idx" ON "publication_branding_icons" USING btree ("_parent_id");
  CREATE INDEX "publication_sections_order_idx" ON "publication_sections" USING btree ("_order");
  CREATE INDEX "publication_sections_parent_id_idx" ON "publication_sections" USING btree ("_parent_id");
  CREATE INDEX "publication_navigation_locations_order_idx" ON "publication_navigation_locations" USING btree ("order");
  CREATE INDEX "publication_navigation_locations_parent_idx" ON "publication_navigation_locations" USING btree ("parent_id");
  CREATE INDEX "publication_navigation_order_idx" ON "publication_navigation" USING btree ("_order");
  CREATE INDEX "publication_navigation_parent_id_idx" ON "publication_navigation" USING btree ("_parent_id");
  CREATE INDEX "publication_social_order_idx" ON "publication_social" USING btree ("_order");
  CREATE INDEX "publication_social_parent_id_idx" ON "publication_social" USING btree ("_parent_id");
  CREATE INDEX "publication__status_idx" ON "publication" USING btree ("_status");
  CREATE INDEX "_publication_v_version_branding_icons_order_idx" ON "_publication_v_version_branding_icons" USING btree ("_order");
  CREATE INDEX "_publication_v_version_branding_icons_parent_id_idx" ON "_publication_v_version_branding_icons" USING btree ("_parent_id");
  CREATE INDEX "_publication_v_version_sections_order_idx" ON "_publication_v_version_sections" USING btree ("_order");
  CREATE INDEX "_publication_v_version_sections_parent_id_idx" ON "_publication_v_version_sections" USING btree ("_parent_id");
  CREATE INDEX "_publication_v_version_navigation_locations_order_idx" ON "_publication_v_version_navigation_locations" USING btree ("order");
  CREATE INDEX "_publication_v_version_navigation_locations_parent_idx" ON "_publication_v_version_navigation_locations" USING btree ("parent_id");
  CREATE INDEX "_publication_v_version_navigation_order_idx" ON "_publication_v_version_navigation" USING btree ("_order");
  CREATE INDEX "_publication_v_version_navigation_parent_id_idx" ON "_publication_v_version_navigation" USING btree ("_parent_id");
  CREATE INDEX "_publication_v_version_social_order_idx" ON "_publication_v_version_social" USING btree ("_order");
  CREATE INDEX "_publication_v_version_social_parent_id_idx" ON "_publication_v_version_social" USING btree ("_parent_id");
  CREATE INDEX "_publication_v_version_version__status_idx" ON "_publication_v" USING btree ("version__status");
  CREATE INDEX "_publication_v_created_at_idx" ON "_publication_v" USING btree ("created_at");
  CREATE INDEX "_publication_v_updated_at_idx" ON "_publication_v" USING btree ("updated_at");
  CREATE INDEX "_publication_v_latest_idx" ON "_publication_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_published_at_idx" ON "pages" USING btree ("published_at");
  CREATE INDEX "_pages_v_version_version_published_at_idx" ON "_pages_v" USING btree ("version_published_at");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");`)
  // The public state singleton starts at revision 0 with no completed snapshot. Run
  // `npm run publication:snapshot:prepare` after deploying (docs/payload-build-snapshots.md).
  await db.execute(sql`INSERT INTO "byline_publication_state" ("id", "current_revision") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "byline_publication_state" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_branding_icons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_navigation_locations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v_version_branding_icons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v_version_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v_version_navigation_locations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v_version_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v_version_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publication_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "byline_publication_state" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "_events_v" CASCADE;
  DROP TABLE "publication_branding_icons" CASCADE;
  DROP TABLE "publication_sections" CASCADE;
  DROP TABLE "publication_navigation_locations" CASCADE;
  DROP TABLE "publication_navigation" CASCADE;
  DROP TABLE "publication_social" CASCADE;
  DROP TABLE "publication" CASCADE;
  DROP TABLE "_publication_v_version_branding_icons" CASCADE;
  DROP TABLE "_publication_v_version_sections" CASCADE;
  DROP TABLE "_publication_v_version_navigation_locations" CASCADE;
  DROP TABLE "_publication_v_version_navigation" CASCADE;
  DROP TABLE "_publication_v_version_social" CASCADE;
  DROP TABLE "_publication_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_events_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "pages_published_at_idx";
  DROP INDEX "_pages_v_version_version_published_at_idx";
  DROP INDEX "payload_locked_documents_rels_events_id_idx";
  ALTER TABLE "pages" DROP COLUMN "published_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_published_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "events_id";
  DROP TYPE "public"."enum_events_event_status";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum__events_v_version_event_status";
  DROP TYPE "public"."enum__events_v_version_status";
  DROP TYPE "public"."enum_publication_navigation_locations";
  DROP TYPE "public"."enum_publication_navigation_feature";
  DROP TYPE "public"."enum_publication_appearance_theme";
  DROP TYPE "public"."enum_publication_seo_organization_type";
  DROP TYPE "public"."enum_publication_status";
  DROP TYPE "public"."enum__publication_v_version_navigation_locations";
  DROP TYPE "public"."enum__publication_v_version_navigation_feature";
  DROP TYPE "public"."enum__publication_v_version_appearance_theme";
  DROP TYPE "public"."enum__publication_v_version_seo_organization_type";
  DROP TYPE "public"."enum__publication_v_version_status";`)
}
