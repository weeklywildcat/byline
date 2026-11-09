import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_story_plans_live_coverage_mode" AS ENUM('standard', 'live');
  CREATE TYPE "public"."enum_story_plans_live_coverage_state" AS ENUM('off', 'live', 'ended');
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-published' BEFORE 'homepage-featured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-mode-changed' BEFORE 'homepage-featured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-coverage-started' BEFORE 'homepage-featured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-coverage-resumed' BEFORE 'homepage-featured';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'live-coverage-ended' BEFORE 'homepage-featured';
  ALTER TABLE "story_plans" ADD COLUMN "live_coverage_mode" "enum_story_plans_live_coverage_mode" DEFAULT 'standard';
  ALTER TABLE "story_plans" ADD COLUMN "live_coverage_state" "enum_story_plans_live_coverage_state" DEFAULT 'off';
  ALTER TABLE "story_plans" ADD COLUMN "live_coverage_started_at" timestamp(3) with time zone;
  ALTER TABLE "story_plans" ADD COLUMN "live_coverage_ended_at" timestamp(3) with time zone;
  -- Carry every Story's live coverage to its unversioned plan before the versioned columns go. Coverage that was
  -- running or ended becomes Live mode in the same state with its original times; coverage that was never started
  -- stays Standard. A Story that was not published cannot be live now, so it migrates as Live mode, Not started.
  UPDATE "story_plans" AS p SET
    "live_coverage_mode" = 'live',
    "live_coverage_state" = (CASE WHEN s."live_coverage_state"::text = 'live' AND s."_status"::text IS DISTINCT FROM 'published' THEN 'off' ELSE s."live_coverage_state"::text END)::"enum_story_plans_live_coverage_state",
    "live_coverage_started_at" = CASE WHEN s."live_coverage_state"::text = 'live' AND s."_status"::text IS DISTINCT FROM 'published' THEN NULL ELSE s."live_coverage_started_at" END,
    "live_coverage_ended_at" = CASE WHEN s."live_coverage_state"::text = 'live' AND s."_status"::text IS DISTINCT FROM 'published' THEN NULL ELSE s."live_coverage_ended_at" END
  FROM "stories" AS s
  WHERE p."story_id" = s."id" AND s."live_coverage_state"::text IN ('live', 'ended');
  ALTER TABLE "stories" DROP COLUMN "live_coverage_state";
  ALTER TABLE "stories" DROP COLUMN "live_coverage_started_at";
  ALTER TABLE "stories" DROP COLUMN "live_coverage_ended_at";
  ALTER TABLE "_stories_v" DROP COLUMN "version_live_coverage_state";
  ALTER TABLE "_stories_v" DROP COLUMN "version_live_coverage_started_at";
  ALTER TABLE "_stories_v" DROP COLUMN "version_live_coverage_ended_at";
  DROP TYPE "public"."enum_stories_live_coverage_state";
  DROP TYPE "public"."enum__stories_v_version_live_coverage_state";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_live_coverage_state" AS ENUM('off', 'live', 'ended');
  CREATE TYPE "public"."enum__stories_v_version_live_coverage_state" AS ENUM('off', 'live', 'ended');
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE text;
  -- The older enum cannot hold the new activity kinds. A published update maps to its closest older kind; the
  -- coverage and mode entries have no older equivalent, so they go (the live updates and coverage state stay).
  UPDATE "story_activity" SET "action" = 'live-published-from-field' WHERE "action" = 'live-published';
  DELETE FROM "story_activity" WHERE "action" IN ('live-mode-changed', 'live-coverage-started', 'live-coverage-resumed', 'live-coverage-ended');
  DROP TYPE "public"."enum_story_activity_action";
  CREATE TYPE "public"."enum_story_activity_action" AS ENUM('story-created', 'story-published', 'story-unpublished', 'workflow-changed', 'editor-changed', 'contributors-changed', 'task-created', 'task-completed', 'task-reopened', 'source-added', 'source-updated', 'appointment-added', 'appointment-updated', 'appointment-completed', 'production-added', 'production-changed', 'publication-scheduled', 'publication-rescheduled', 'publication-cancelled', 'version-restored', 'url-changed', 'correction-added', 'correction-updated', 'correction-removed', 'recording-captured', 'file-captured', 'transcript-completed', 'transcript-imported', 'quote-verified', 'off-record-override', 'material-made-confidential', 'material-made-normal', 'live-submitted', 'live-published-from-field', 'live-queued-sent', 'live-publishers-changed', 'homepage-featured', 'distribution-assigned', 'distribution-ready', 'distribution-posted', 'distribution-failed', 'distribution-skipped');
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE "public"."enum_story_activity_action" USING "action"::"public"."enum_story_activity_action";
  ALTER TABLE "stories" ADD COLUMN "live_coverage_state" "enum_stories_live_coverage_state" DEFAULT 'off';
  ALTER TABLE "stories" ADD COLUMN "live_coverage_started_at" timestamp(3) with time zone;
  ALTER TABLE "stories" ADD COLUMN "live_coverage_ended_at" timestamp(3) with time zone;
  ALTER TABLE "_stories_v" ADD COLUMN "version_live_coverage_state" "enum__stories_v_version_live_coverage_state" DEFAULT 'off';
  ALTER TABLE "_stories_v" ADD COLUMN "version_live_coverage_started_at" timestamp(3) with time zone;
  ALTER TABLE "_stories_v" ADD COLUMN "version_live_coverage_ended_at" timestamp(3) with time zone;
  UPDATE "stories" AS s SET
    "live_coverage_state" = p."live_coverage_state"::text::"enum_stories_live_coverage_state",
    "live_coverage_started_at" = p."live_coverage_started_at",
    "live_coverage_ended_at" = p."live_coverage_ended_at"
  FROM "story_plans" AS p
  WHERE p."story_id" = s."id" AND p."live_coverage_mode"::text = 'live' AND p."live_coverage_state"::text <> 'off';
  ALTER TABLE "story_plans" DROP COLUMN "live_coverage_mode";
  ALTER TABLE "story_plans" DROP COLUMN "live_coverage_state";
  ALTER TABLE "story_plans" DROP COLUMN "live_coverage_started_at";
  ALTER TABLE "story_plans" DROP COLUMN "live_coverage_ended_at";
  DROP TYPE "public"."enum_story_plans_live_coverage_mode";
  DROP TYPE "public"."enum_story_plans_live_coverage_state";`)
}
