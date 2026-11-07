import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_content_health_kind" AS ENUM('scan', 'story', 'disposition');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'scan-content-health' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'scan-content-health' BEFORE 'schedulePublish';
  CREATE TABLE "story_notes_replies" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "author_id" integer,
    "text" varchar NOT NULL,
    "at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "story_notes" (
    "id" serial PRIMARY KEY NOT NULL,
    "story_id" integer NOT NULL,
    "author_id" integer,
    "text" varchar NOT NULL,
    "resolved" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "content_health" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "kind" "enum_content_health_kind" NOT NULL,
    "data" jsonb NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "story_notes_replies" ADD CONSTRAINT "story_notes_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_notes_replies" ADD CONSTRAINT "story_notes_replies_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."story_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "story_notes" ADD CONSTRAINT "story_notes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_notes" ADD CONSTRAINT "story_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "story_notes_replies_order_idx" ON "story_notes_replies" USING btree ("_order");
  CREATE INDEX "story_notes_replies_parent_id_idx" ON "story_notes_replies" USING btree ("_parent_id");
  CREATE INDEX "story_notes_replies_author_idx" ON "story_notes_replies" USING btree ("author_id");
  CREATE INDEX "story_notes_story_idx" ON "story_notes" USING btree ("story_id");
  CREATE INDEX "story_notes_author_idx" ON "story_notes" USING btree ("author_id");
  CREATE INDEX "story_notes_resolved_idx" ON "story_notes" USING btree ("resolved");
  CREATE INDEX "story_notes_updated_at_idx" ON "story_notes" USING btree ("updated_at");
  CREATE INDEX "story_notes_created_at_idx" ON "story_notes" USING btree ("created_at");
  CREATE UNIQUE INDEX "content_health_key_idx" ON "content_health" USING btree ("key");
  CREATE INDEX "content_health_kind_idx" ON "content_health" USING btree ("kind");
  CREATE INDEX "content_health_updated_at_idx" ON "content_health" USING btree ("updated_at");
  CREATE INDEX "content_health_created_at_idx" ON "content_health" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'scan-content-health';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'scan-content-health';
  DROP TABLE "story_notes_replies" CASCADE;
  DROP TABLE "story_notes" CASCADE;
  DROP TABLE "content_health" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'prepare-publication-media', 'prepare-public-snapshot', 'advance-public-revision', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_content_health_kind";`)
}
