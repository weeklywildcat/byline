import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { newsroomTimeZone } from '../domain/dates'

/**
 * Coverages become Collections (docs/collections-workspace.md).
 *
 * A Payload `coverages` record was only the public face of a reporting
 * project. Each one becomes a Collection with the same ID: its title is the
 * Collection's name and its public title, its stories the Collection's
 * membership and the initial public story order, and its slug, format,
 * description, overview and artwork the Collection's public presentation
 * (enabled: these records were public coverage). The coverage status maps
 * to the newsroom vocabulary (upcoming → planning, active → active,
 * past → wrapping up, archived → archived); a series becomes a Series
 * Collection and ongoing coverage an Ongoing coverage Collection. Instants
 * become the newsroom's calendar days. Then `coverages` is dropped: there is
 * no second authority. `down` restores a coverage for each Collection with a
 * public presentation.
 */
type Db = MigrateUpArgs['db']

async function copyCoveragesIntoCollections(db: Db) {
  const timeZone = newsroomTimeZone()
  await db.execute(sql`
    INSERT INTO "collections" ("id", "name", "type", "status", "start_date", "end_date",
      "public_presentation_enabled", "public_presentation_format", "public_presentation_title", "public_presentation_slug",
      "public_presentation_description", "public_presentation_overview", "public_presentation_artwork_id",
      "legacy_word_press_id", "updated_at", "created_at")
    SELECT c."id", left(c."title", 240),
      (CASE c."format" WHEN 'series' THEN 'series' ELSE 'ongoing' END)::"enum_collections_type",
      (CASE c."status" WHEN 'upcoming' THEN 'planning' WHEN 'active' THEN 'active' WHEN 'past' THEN 'wrapping-up' ELSE 'archived' END)::"enum_collections_status",
      to_char(c."start_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD'),
      to_char(c."end_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD'),
      true, c."format"::text::"enum_collections_public_presentation_format", left(c."title", 240), c."slug",
      left(c."description", 320), c."overview", c."artwork_id",
      c."legacy_word_press_id", c."updated_at", c."created_at"
    FROM "coverages" c`)
  for (const path of ['stories', 'publicPresentation.storyOrder']) {
    await db.execute(sql`
      INSERT INTO "collections_rels" ("order", "parent_id", "path", "stories_id")
      SELECT r."order", r."parent_id", ${path}, r."stories_id" FROM "coverages_rels" r
      WHERE r."path" = 'stories' AND r."stories_id" IS NOT NULL`)
  }
  // IDs were kept; new Collections number after them.
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('"collections"', 'id'), (SELECT MAX("id") FROM "collections")) WHERE EXISTS (SELECT 1 FROM "collections")`)
}

async function copyPublicCollectionsIntoCoverages(db: Db) {
  const timeZone = newsroomTimeZone()
  // Before Collections, every task had a story.
  await db.execute(sql`DELETE FROM "tasks" WHERE "story_id" IS NULL`)
  await db.execute(sql`
    INSERT INTO "coverages" ("id", "title", "slug", "format", "status", "description", "overview", "artwork_id", "start_at", "end_at", "legacy_word_press_id", "updated_at", "created_at")
    SELECT c."id", left(coalesce(nullif(c."public_presentation_title", ''), c."name"), 200),
      coalesce(c."public_presentation_slug", 'collection-' || c."id"),
      coalesce(c."public_presentation_format"::text, 'coverage')::"enum_coverages_format",
      (CASE c."status" WHEN 'planning' THEN 'upcoming' WHEN 'active' THEN 'active' WHEN 'wrapping-up' THEN 'past' ELSE 'archived' END)::"enum_coverages_status",
      c."public_presentation_description", left(c."public_presentation_overview", 6000), c."public_presentation_artwork_id",
      (c."start_date" || ' 00:00')::timestamp AT TIME ZONE ${timeZone},
      (c."end_date" || ' 00:00')::timestamp AT TIME ZONE ${timeZone},
      c."legacy_word_press_id", c."updated_at", c."created_at"
    FROM "collections" c WHERE c."public_presentation_enabled" = true OR c."public_presentation_slug" IS NOT NULL`)
  await db.execute(sql`
    INSERT INTO "coverages_rels" ("order", "parent_id", "path", "stories_id")
    SELECT r."order", r."parent_id", 'stories', r."stories_id" FROM "collections_rels" r
    WHERE r."path" = 'stories' AND r."stories_id" IS NOT NULL AND r."parent_id" IN (SELECT "id" FROM "coverages")`)
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('"coverages"', 'id'), (SELECT MAX("id") FROM "coverages")) WHERE EXISTS (SELECT 1 FROM "coverages")`)
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_collections_type" AS ENUM('event', 'ongoing', 'series', 'project', 'other');
  CREATE TYPE "public"."enum_collections_status" AS ENUM('planning', 'active', 'wrapping-up', 'archived');
  CREATE TYPE "public"."enum_collections_public_presentation_format" AS ENUM('coverage', 'series');
  CREATE TYPE "public"."enum_collection_interviews_status" AS ENUM('planned', 'scheduled', 'completed', 'follow-up', 'cancelled');
  CREATE TYPE "public"."enum_collection_interviews_schedule_mode" AS ENUM('unscheduled', 'window', 'exact');
  CREATE TYPE "public"."enum_collection_resources_kind" AS ENUM('link', 'document', 'recording', 'schedule', 'reference');
  CREATE TABLE "collections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_collections_type" DEFAULT 'other' NOT NULL,
  	"status" "enum_collections_status" DEFAULT 'planning' NOT NULL,
  	"brief" varchar,
  	"lead_id" integer,
  	"start_date" varchar,
  	"end_date" varchar,
  	"public_presentation_enabled" boolean DEFAULT false,
  	"public_presentation_format" "enum_collections_public_presentation_format" DEFAULT 'coverage',
  	"public_presentation_title" varchar,
  	"public_presentation_slug" varchar,
  	"public_presentation_description" varchar,
  	"public_presentation_overview" varchar,
  	"public_presentation_artwork_id" integer,
  	"public_presentation_featured_story_id" integer,
  	"created_by_id" integer,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "collections_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"stories_id" integer
  );
  
  CREATE TABLE "collection_interviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"collection_id" integer NOT NULL,
  	"interviewee" varchar NOT NULL,
  	"status" "enum_collection_interviews_status" DEFAULT 'planned' NOT NULL,
  	"schedule_mode" "enum_collection_interviews_schedule_mode" DEFAULT 'unscheduled' NOT NULL,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"window_start" varchar,
  	"window_end" varchar,
  	"location" varchar,
  	"notes" varchar,
  	"follow_ups" varchar,
  	"private_contact" varchar,
  	"completed_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "collection_interviews_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"stories_id" integer,
  	"collection_resources_id" integer
  );
  
  CREATE TABLE "collection_resources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"kind" "enum_collection_resources_kind" DEFAULT 'link' NOT NULL,
  	"url" varchar,
  	"media_id" integer,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "collection_resources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"collections_id" integer,
  	"stories_id" integer
  );
  
  `)
  await copyCoveragesIntoCollections(db)
  await db.execute(sql`
  ALTER TABLE "coverages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "coverages_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "coverages" CASCADE;
  DROP TABLE "coverages_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_coverages_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_coverages_id_idx";
  ALTER TABLE "tasks" ALTER COLUMN "story_id" DROP NOT NULL;
  ALTER TABLE "tasks" ADD COLUMN "collection_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "collections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "collection_interviews_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "collection_resources_id" integer;
  ALTER TABLE "collections" ADD CONSTRAINT "collections_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collections" ADD CONSTRAINT "collections_public_presentation_artwork_id_media_id_fk" FOREIGN KEY ("public_presentation_artwork_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collections" ADD CONSTRAINT "collections_public_presentation_featured_story_id_stories_id_fk" FOREIGN KEY ("public_presentation_featured_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collections" ADD CONSTRAINT "collections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collections_rels" ADD CONSTRAINT "collections_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collections_rels" ADD CONSTRAINT "collections_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collections_rels" ADD CONSTRAINT "collections_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_interviews" ADD CONSTRAINT "collection_interviews_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collection_interviews" ADD CONSTRAINT "collection_interviews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collection_interviews_rels" ADD CONSTRAINT "collection_interviews_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."collection_interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_interviews_rels" ADD CONSTRAINT "collection_interviews_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_interviews_rels" ADD CONSTRAINT "collection_interviews_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_interviews_rels" ADD CONSTRAINT "collection_interviews_rels_collection_resources_fk" FOREIGN KEY ("collection_resources_id") REFERENCES "public"."collection_resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_resources" ADD CONSTRAINT "collection_resources_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collection_resources" ADD CONSTRAINT "collection_resources_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "collection_resources_rels" ADD CONSTRAINT "collection_resources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."collection_resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_resources_rels" ADD CONSTRAINT "collection_resources_rels_collections_fk" FOREIGN KEY ("collections_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "collection_resources_rels" ADD CONSTRAINT "collection_resources_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "collections_name_idx" ON "collections" USING btree ("name");
  CREATE INDEX "collections_status_idx" ON "collections" USING btree ("status");
  CREATE INDEX "collections_lead_idx" ON "collections" USING btree ("lead_id");
  CREATE INDEX "collections_start_date_idx" ON "collections" USING btree ("start_date");
  CREATE INDEX "collections_public_presentation_public_presentation_enab_idx" ON "collections" USING btree ("public_presentation_enabled");
  CREATE UNIQUE INDEX "collections_public_presentation_public_presentation_slug_idx" ON "collections" USING btree ("public_presentation_slug");
  CREATE INDEX "collections_public_presentation_public_presentation_artw_idx" ON "collections" USING btree ("public_presentation_artwork_id");
  CREATE INDEX "collections_public_presentation_public_presentation_feat_idx" ON "collections" USING btree ("public_presentation_featured_story_id");
  CREATE INDEX "collections_created_by_idx" ON "collections" USING btree ("created_by_id");
  CREATE INDEX "collections_legacy_word_press_id_idx" ON "collections" USING btree ("legacy_word_press_id");
  CREATE INDEX "collections_updated_at_idx" ON "collections" USING btree ("updated_at");
  CREATE INDEX "collections_created_at_idx" ON "collections" USING btree ("created_at");
  CREATE INDEX "collections_rels_order_idx" ON "collections_rels" USING btree ("order");
  CREATE INDEX "collections_rels_parent_idx" ON "collections_rels" USING btree ("parent_id");
  CREATE INDEX "collections_rels_path_idx" ON "collections_rels" USING btree ("path");
  CREATE INDEX "collections_rels_users_id_idx" ON "collections_rels" USING btree ("users_id");
  CREATE INDEX "collections_rels_stories_id_idx" ON "collections_rels" USING btree ("stories_id");
  CREATE INDEX "collection_interviews_collection_idx" ON "collection_interviews" USING btree ("collection_id");
  CREATE INDEX "collection_interviews_status_idx" ON "collection_interviews" USING btree ("status");
  CREATE INDEX "collection_interviews_schedule_mode_idx" ON "collection_interviews" USING btree ("schedule_mode");
  CREATE INDEX "collection_interviews_start_at_idx" ON "collection_interviews" USING btree ("start_at");
  CREATE INDEX "collection_interviews_window_start_idx" ON "collection_interviews" USING btree ("window_start");
  CREATE INDEX "collection_interviews_created_by_idx" ON "collection_interviews" USING btree ("created_by_id");
  CREATE INDEX "collection_interviews_updated_at_idx" ON "collection_interviews" USING btree ("updated_at");
  CREATE INDEX "collection_interviews_created_at_idx" ON "collection_interviews" USING btree ("created_at");
  CREATE INDEX "collection_interviews_rels_order_idx" ON "collection_interviews_rels" USING btree ("order");
  CREATE INDEX "collection_interviews_rels_parent_idx" ON "collection_interviews_rels" USING btree ("parent_id");
  CREATE INDEX "collection_interviews_rels_path_idx" ON "collection_interviews_rels" USING btree ("path");
  CREATE INDEX "collection_interviews_rels_users_id_idx" ON "collection_interviews_rels" USING btree ("users_id");
  CREATE INDEX "collection_interviews_rels_stories_id_idx" ON "collection_interviews_rels" USING btree ("stories_id");
  CREATE INDEX "collection_interviews_rels_collection_resources_id_idx" ON "collection_interviews_rels" USING btree ("collection_resources_id");
  CREATE INDEX "collection_resources_label_idx" ON "collection_resources" USING btree ("label");
  CREATE INDEX "collection_resources_media_idx" ON "collection_resources" USING btree ("media_id");
  CREATE INDEX "collection_resources_created_by_idx" ON "collection_resources" USING btree ("created_by_id");
  CREATE INDEX "collection_resources_updated_at_idx" ON "collection_resources" USING btree ("updated_at");
  CREATE INDEX "collection_resources_created_at_idx" ON "collection_resources" USING btree ("created_at");
  CREATE INDEX "collection_resources_rels_order_idx" ON "collection_resources_rels" USING btree ("order");
  CREATE INDEX "collection_resources_rels_parent_idx" ON "collection_resources_rels" USING btree ("parent_id");
  CREATE INDEX "collection_resources_rels_path_idx" ON "collection_resources_rels" USING btree ("path");
  CREATE INDEX "collection_resources_rels_collections_id_idx" ON "collection_resources_rels" USING btree ("collections_id");
  CREATE INDEX "collection_resources_rels_stories_id_idx" ON "collection_resources_rels" USING btree ("stories_id");
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_collections_fk" FOREIGN KEY ("collections_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_collection_interviews_fk" FOREIGN KEY ("collection_interviews_id") REFERENCES "public"."collection_interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_collection_resources_fk" FOREIGN KEY ("collection_resources_id") REFERENCES "public"."collection_resources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tasks_collection_idx" ON "tasks" USING btree ("collection_id");
  CREATE INDEX "payload_locked_documents_rels_collections_id_idx" ON "payload_locked_documents_rels" USING btree ("collections_id");
  CREATE INDEX "payload_locked_documents_rels_collection_interviews_id_idx" ON "payload_locked_documents_rels" USING btree ("collection_interviews_id");
  CREATE INDEX "payload_locked_documents_rels_collection_resources_id_idx" ON "payload_locked_documents_rels" USING btree ("collection_resources_id");
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "coverages_id";
  DROP TYPE "public"."enum_coverages_format";
  DROP TYPE "public"."enum_coverages_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_coverages_format" AS ENUM('coverage', 'series');
  CREATE TYPE "public"."enum_coverages_status" AS ENUM('upcoming', 'active', 'past', 'archived');
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
  
  `)
  await copyPublicCollectionsIntoCoverages(db)
  await db.execute(sql`
  ALTER TABLE "collections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "collections_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "collection_interviews" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "collection_interviews_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "collection_resources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "collection_resources_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "collections" CASCADE;
  DROP TABLE "collections_rels" CASCADE;
  DROP TABLE "collection_interviews" CASCADE;
  DROP TABLE "collection_interviews_rels" CASCADE;
  DROP TABLE "collection_resources" CASCADE;
  DROP TABLE "collection_resources_rels" CASCADE;
  ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_collection_id_collections_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_collections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_collection_interviews_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_collection_resources_fk";
  
  DROP INDEX IF EXISTS "tasks_collection_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_collections_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_collection_interviews_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_collection_resources_id_idx";
  ALTER TABLE "tasks" ALTER COLUMN "story_id" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "coverages_id" integer;
  ALTER TABLE "coverages" ADD CONSTRAINT "coverages_artwork_id_media_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coverages_rels" ADD CONSTRAINT "coverages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."coverages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "coverages_rels" ADD CONSTRAINT "coverages_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coverages_fk" FOREIGN KEY ("coverages_id") REFERENCES "public"."coverages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_coverages_id_idx" ON "payload_locked_documents_rels" USING btree ("coverages_id");
  ALTER TABLE "tasks" DROP COLUMN "collection_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "collections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "collection_interviews_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "collection_resources_id";
  DROP TYPE "public"."enum_collections_type";
  DROP TYPE "public"."enum_collections_status";
  DROP TYPE "public"."enum_collections_public_presentation_format";
  DROP TYPE "public"."enum_collection_interviews_status";
  DROP TYPE "public"."enum_collection_interviews_schedule_mode";
  DROP TYPE "public"."enum_collection_resources_kind";`)
}
