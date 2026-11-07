import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_story_activity_action" AS ENUM('story-created', 'story-published', 'story-unpublished', 'workflow-changed', 'editor-changed', 'contributors-changed', 'task-created', 'task-completed', 'task-reopened', 'source-added', 'source-updated', 'appointment-added', 'appointment-updated', 'appointment-completed', 'production-added', 'production-changed', 'publication-scheduled', 'publication-rescheduled', 'publication-cancelled', 'version-restored', 'url-changed', 'correction-added', 'correction-updated', 'correction-removed');
  CREATE TABLE "story_activity" (
    "id" serial PRIMARY KEY NOT NULL,
    "story_id" integer NOT NULL,
    "action" "enum_story_activity_action" NOT NULL,
    "actor_id" integer,
    "record_id" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "story_activity" ADD CONSTRAINT "story_activity_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_activity" ADD CONSTRAINT "story_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "story_activity_story_idx" ON "story_activity" USING btree ("story_id");
  CREATE INDEX "story_activity_actor_idx" ON "story_activity" USING btree ("actor_id");
  CREATE INDEX "story_activity_updated_at_idx" ON "story_activity" USING btree ("updated_at");
  CREATE INDEX "story_activity_created_at_idx" ON "story_activity" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "story_activity" CASCADE;
  DROP TYPE "public"."enum_story_activity_action";`)
}
