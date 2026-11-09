import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_distribution_items_destination" AS ENUM('instagram', 'facebook', 'newsletter', 'school-tvs', 'discord', 'youtube', 'other');
  CREATE TYPE "public"."enum_distribution_items_expectation" AS ENUM('prepare', 'eligible', 'optional');
  CREATE TYPE "public"."enum_distribution_items_state" AS ENUM('planned', 'draft', 'ready', 'scheduled', 'posted', 'skipped', 'failed');
  CREATE TYPE "public"."enum_distribution_items_headline_mode" AS ENUM('story', 'custom');
  CREATE TYPE "public"."enum_distribution_items_text_mode" AS ENUM('story', 'custom');
  CREATE TYPE "public"."enum_distribution_items_media_mode" AS ENUM('story', 'custom', 'none');
  CREATE TYPE "public"."enum_distribution_settings_destinations_kind" AS ENUM('instagram', 'facebook', 'newsletter', 'school-tvs', 'discord', 'youtube', 'other');
  CREATE TYPE "public"."enum_distribution_settings_rules_presets" AS ENUM('news', 'sports-recap', 'opinion', 'photo-story', 'video-story', 'investigation', 'breaking');
  CREATE TYPE "public"."enum_distribution_settings_rules_destination" AS ENUM('instagram', 'facebook', 'newsletter', 'school-tvs', 'discord', 'youtube', 'other');
  CREATE TYPE "public"."enum_distribution_settings_rules_level" AS ENUM('prepare', 'eligible', 'optional');
  CREATE TABLE "distribution_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"destination" "enum_distribution_items_destination" NOT NULL,
  	"expectation" "enum_distribution_items_expectation" DEFAULT 'prepare' NOT NULL,
  	"state" "enum_distribution_items_state" DEFAULT 'planned' NOT NULL,
  	"owner_id" integer,
  	"headline_mode" "enum_distribution_items_headline_mode" DEFAULT 'story' NOT NULL,
  	"headline" varchar,
  	"text_mode" "enum_distribution_items_text_mode" DEFAULT 'story' NOT NULL,
  	"text" varchar,
  	"media_mode" "enum_distribution_items_media_mode" DEFAULT 'story' NOT NULL,
  	"media_id" integer,
  	"planned_for" timestamp(3) with time zone,
  	"scheduled_for" timestamp(3) with time zone,
  	"note" varchar,
  	"permalink" varchar,
  	"posted_at" timestamp(3) with time zone,
  	"posted_by_id" integer,
  	"approved_at" timestamp(3) with time zone,
  	"approved_by_id" integer,
  	"sent" jsonb,
  	"failure" varchar,
  	"failed_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "distribution_settings_destinations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_distribution_settings_destinations_kind" NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"requires_approval" boolean DEFAULT false,
  	"label" varchar,
  	"account_url" varchar
  );
  
  CREATE TABLE "distribution_settings_rules_presets" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_distribution_settings_rules_presets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "distribution_settings_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"destination" "enum_distribution_settings_rules_destination" NOT NULL,
  	"level" "enum_distribution_settings_rules_level" DEFAULT 'prepare' NOT NULL
  );
  
  CREATE TABLE "distribution_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customized" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "distribution_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" integer
  );
  
  ALTER TABLE "story_plans" ADD COLUMN "preset" varchar;
  ALTER TABLE "story_plans" ADD COLUMN "distribution_seeded_at" timestamp(3) with time zone;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_posted_by_id_users_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "distribution_settings_destinations" ADD CONSTRAINT "distribution_settings_destinations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."distribution_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "distribution_settings_rules_presets" ADD CONSTRAINT "distribution_settings_rules_presets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."distribution_settings_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "distribution_settings_rules" ADD CONSTRAINT "distribution_settings_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."distribution_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "distribution_settings_rels" ADD CONSTRAINT "distribution_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."distribution_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "distribution_settings_rels" ADD CONSTRAINT "distribution_settings_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "distribution_items_story_idx" ON "distribution_items" USING btree ("story_id");
  CREATE INDEX "distribution_items_destination_idx" ON "distribution_items" USING btree ("destination");
  CREATE INDEX "distribution_items_state_idx" ON "distribution_items" USING btree ("state");
  CREATE INDEX "distribution_items_owner_idx" ON "distribution_items" USING btree ("owner_id");
  CREATE INDEX "distribution_items_media_idx" ON "distribution_items" USING btree ("media_id");
  CREATE INDEX "distribution_items_planned_for_idx" ON "distribution_items" USING btree ("planned_for");
  CREATE INDEX "distribution_items_scheduled_for_idx" ON "distribution_items" USING btree ("scheduled_for");
  CREATE INDEX "distribution_items_posted_at_idx" ON "distribution_items" USING btree ("posted_at");
  CREATE INDEX "distribution_items_posted_by_idx" ON "distribution_items" USING btree ("posted_by_id");
  CREATE INDEX "distribution_items_approved_by_idx" ON "distribution_items" USING btree ("approved_by_id");
  CREATE INDEX "distribution_items_created_by_idx" ON "distribution_items" USING btree ("created_by_id");
  CREATE INDEX "distribution_items_updated_at_idx" ON "distribution_items" USING btree ("updated_at");
  CREATE INDEX "distribution_items_created_at_idx" ON "distribution_items" USING btree ("created_at");
  CREATE UNIQUE INDEX "story_destination_idx" ON "distribution_items" USING btree ("story_id","destination");
  CREATE INDEX "distribution_settings_destinations_order_idx" ON "distribution_settings_destinations" USING btree ("_order");
  CREATE INDEX "distribution_settings_destinations_parent_id_idx" ON "distribution_settings_destinations" USING btree ("_parent_id");
  CREATE INDEX "distribution_settings_rules_presets_order_idx" ON "distribution_settings_rules_presets" USING btree ("order");
  CREATE INDEX "distribution_settings_rules_presets_parent_idx" ON "distribution_settings_rules_presets" USING btree ("parent_id");
  CREATE INDEX "distribution_settings_rules_order_idx" ON "distribution_settings_rules" USING btree ("_order");
  CREATE INDEX "distribution_settings_rules_parent_id_idx" ON "distribution_settings_rules" USING btree ("_parent_id");
  CREATE INDEX "distribution_settings_rels_order_idx" ON "distribution_settings_rels" USING btree ("order");
  CREATE INDEX "distribution_settings_rels_parent_idx" ON "distribution_settings_rels" USING btree ("parent_id");
  CREATE INDEX "distribution_settings_rels_path_idx" ON "distribution_settings_rels" USING btree ("path");
  CREATE INDEX "distribution_settings_rels_sections_id_idx" ON "distribution_settings_rels" USING btree ("sections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "distribution_items" CASCADE;
  DROP TABLE "distribution_settings_destinations" CASCADE;
  DROP TABLE "distribution_settings_rules_presets" CASCADE;
  DROP TABLE "distribution_settings_rules" CASCADE;
  DROP TABLE "distribution_settings" CASCADE;
  DROP TABLE "distribution_settings_rels" CASCADE;
  ALTER TABLE "story_plans" DROP COLUMN "preset";
  ALTER TABLE "story_plans" DROP COLUMN "distribution_seeded_at";
  DROP TYPE "public"."enum_distribution_items_destination";
  DROP TYPE "public"."enum_distribution_items_expectation";
  DROP TYPE "public"."enum_distribution_items_state";
  DROP TYPE "public"."enum_distribution_items_headline_mode";
  DROP TYPE "public"."enum_distribution_items_text_mode";
  DROP TYPE "public"."enum_distribution_items_media_mode";
  DROP TYPE "public"."enum_distribution_settings_destinations_kind";
  DROP TYPE "public"."enum_distribution_settings_rules_presets";
  DROP TYPE "public"."enum_distribution_settings_rules_destination";
  DROP TYPE "public"."enum_distribution_settings_rules_level";`)
}
