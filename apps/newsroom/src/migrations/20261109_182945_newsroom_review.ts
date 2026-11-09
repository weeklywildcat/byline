import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { newsroomTimeZone } from '../domain/dates'
import { DEFAULT_NEWSROOM_ROLES, DEFAULT_WORKFLOW_STEPS, schoolYearFor } from '../domain/newsroom-roles'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_story_plans_sidelined_from" AS ENUM('pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped');
  CREATE TYPE "public"."enum_school_years_status" AS ENUM('planned', 'active', 'archived');
  CREATE TYPE "public"."enum_staff_memberships_status" AS ENUM('active', 'departed');
  CREATE TYPE "public"."enum_newsroom_roles_scope_kind" AS ENUM('none', 'section', 'media');
  CREATE TYPE "public"."enum_role_assignments_media_types" AS ENUM('photo', 'gallery', 'graphic', 'video', 'audio', 'other');
  CREATE TYPE "public"."enum_role_assignments_scope_mode" AS ENUM('global', 'scoped');
  CREATE TYPE "public"."enum_review_workflows_applies_to_formats" AS ENUM('standard', 'video', 'audio');
  CREATE TYPE "public"."enum_review_runs_status" AS ENUM('active', 'changes-requested', 'routing-failed', 'approved', 'cancelled');
  CREATE TYPE "public"."enum_review_comments_state" AS ENUM('pending', 'published', 'resolved');
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-submitted' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-resubmitted' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-claimed' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-changes-requested' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-step-approved' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-approved' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-stale' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-reassigned' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-override' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-routing-failed' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_story_activity_action" ADD VALUE 'review-cancelled' BEFORE 'distribution-assigned';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'reviewComplete';
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'reviewRouting';
  CREATE TABLE "school_years" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"starts_on" varchar NOT NULL,
  	"ends_on" varchar NOT NULL,
  	"status" "enum_school_years_status" DEFAULT 'planned' NOT NULL,
  	"activated_at" timestamp(3) with time zone,
  	"activated_by_id" integer,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "staff_memberships" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"school_year_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"title" varchar,
  	"status" "enum_staff_memberships_status" DEFAULT 'active' NOT NULL,
  	"departed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "newsroom_roles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"scope_kind" "enum_newsroom_roles_scope_kind" DEFAULT 'none' NOT NULL,
  	"waiting_label" varchar,
  	"archived" boolean DEFAULT false,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "role_assignments_media_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_role_assignments_media_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "role_assignments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"school_year_id" integer NOT NULL,
  	"scope_mode" "enum_role_assignments_scope_mode" DEFAULT 'global' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "role_assignments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" integer
  );
  
  CREATE TABLE "review_workflows_applies_to_formats" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_review_workflows_applies_to_formats",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "review_workflows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"is_default" boolean DEFAULT false,
  	"archived" boolean DEFAULT false,
  	"steps" jsonb NOT NULL,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "review_workflows_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" integer
  );
  
  CREATE TABLE "review_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"story_id" integer NOT NULL,
  	"workflow_id" integer,
  	"snapshot" jsonb NOT NULL,
  	"status" "enum_review_runs_status" DEFAULT 'active' NOT NULL,
  	"round" numeric DEFAULT 1 NOT NULL,
  	"steps" jsonb NOT NULL,
  	"submitted_version" varchar NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"submitted_by_id" integer,
  	"decisions" jsonb,
  	"failure" varchar,
  	"status_since" timestamp(3) with time zone,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "review_runs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "review_comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"run_id" integer NOT NULL,
  	"story_id" integer NOT NULL,
  	"round" numeric NOT NULL,
  	"step_id" varchar NOT NULL,
  	"version" varchar NOT NULL,
  	"quote" varchar,
  	"anchor" jsonb,
  	"body" varchar NOT NULL,
  	"author_id" integer NOT NULL,
  	"state" "enum_review_comments_state" DEFAULT 'pending' NOT NULL,
  	"parent_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"resolved_at" timestamp(3) with time zone,
  	"resolved_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "story_plans" ADD COLUMN "sidelined_from" "enum_story_plans_sidelined_from";
  ALTER TABLE "school_years" ADD CONSTRAINT "school_years_activated_by_id_users_id_fk" FOREIGN KEY ("activated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "role_assignments_media_types" ADD CONSTRAINT "role_assignments_media_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."role_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_newsroom_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."newsroom_roles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "role_assignments_rels" ADD CONSTRAINT "role_assignments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."role_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "role_assignments_rels" ADD CONSTRAINT "role_assignments_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_workflows_applies_to_formats" ADD CONSTRAINT "review_workflows_applies_to_formats_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."review_workflows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_workflows_rels" ADD CONSTRAINT "review_workflows_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."review_workflows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_workflows_rels" ADD CONSTRAINT "review_workflows_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_workflow_id_review_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."review_workflows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_runs_rels" ADD CONSTRAINT "review_runs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."review_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_runs_rels" ADD CONSTRAINT "review_runs_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_run_id_review_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."review_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_parent_id_review_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."review_comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "school_years_name_idx" ON "school_years" USING btree ("name");
  CREATE INDEX "school_years_status_idx" ON "school_years" USING btree ("status");
  CREATE INDEX "school_years_activated_by_idx" ON "school_years" USING btree ("activated_by_id");
  CREATE INDEX "school_years_updated_at_idx" ON "school_years" USING btree ("updated_at");
  CREATE INDEX "school_years_created_at_idx" ON "school_years" USING btree ("created_at");
  CREATE INDEX "staff_memberships_school_year_idx" ON "staff_memberships" USING btree ("school_year_id");
  CREATE INDEX "staff_memberships_user_idx" ON "staff_memberships" USING btree ("user_id");
  CREATE INDEX "staff_memberships_status_idx" ON "staff_memberships" USING btree ("status");
  CREATE INDEX "staff_memberships_updated_at_idx" ON "staff_memberships" USING btree ("updated_at");
  CREATE INDEX "staff_memberships_created_at_idx" ON "staff_memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "schoolYear_user_idx" ON "staff_memberships" USING btree ("school_year_id","user_id");
  CREATE UNIQUE INDEX "newsroom_roles_key_idx" ON "newsroom_roles" USING btree ("key");
  CREATE INDEX "newsroom_roles_archived_idx" ON "newsroom_roles" USING btree ("archived");
  CREATE INDEX "newsroom_roles_updated_at_idx" ON "newsroom_roles" USING btree ("updated_at");
  CREATE INDEX "newsroom_roles_created_at_idx" ON "newsroom_roles" USING btree ("created_at");
  CREATE INDEX "role_assignments_media_types_order_idx" ON "role_assignments_media_types" USING btree ("order");
  CREATE INDEX "role_assignments_media_types_parent_idx" ON "role_assignments_media_types" USING btree ("parent_id");
  CREATE INDEX "role_assignments_role_idx" ON "role_assignments" USING btree ("role_id");
  CREATE INDEX "role_assignments_user_idx" ON "role_assignments" USING btree ("user_id");
  CREATE INDEX "role_assignments_school_year_idx" ON "role_assignments" USING btree ("school_year_id");
  CREATE INDEX "role_assignments_updated_at_idx" ON "role_assignments" USING btree ("updated_at");
  CREATE INDEX "role_assignments_created_at_idx" ON "role_assignments" USING btree ("created_at");
  CREATE INDEX "role_assignments_rels_order_idx" ON "role_assignments_rels" USING btree ("order");
  CREATE INDEX "role_assignments_rels_parent_idx" ON "role_assignments_rels" USING btree ("parent_id");
  CREATE INDEX "role_assignments_rels_path_idx" ON "role_assignments_rels" USING btree ("path");
  CREATE INDEX "role_assignments_rels_sections_id_idx" ON "role_assignments_rels" USING btree ("sections_id");
  CREATE INDEX "review_workflows_applies_to_formats_order_idx" ON "review_workflows_applies_to_formats" USING btree ("order");
  CREATE INDEX "review_workflows_applies_to_formats_parent_idx" ON "review_workflows_applies_to_formats" USING btree ("parent_id");
  CREATE INDEX "review_workflows_is_default_idx" ON "review_workflows" USING btree ("is_default");
  CREATE INDEX "review_workflows_archived_idx" ON "review_workflows" USING btree ("archived");
  CREATE INDEX "review_workflows_updated_at_idx" ON "review_workflows" USING btree ("updated_at");
  CREATE INDEX "review_workflows_created_at_idx" ON "review_workflows" USING btree ("created_at");
  CREATE INDEX "review_workflows_rels_order_idx" ON "review_workflows_rels" USING btree ("order");
  CREATE INDEX "review_workflows_rels_parent_idx" ON "review_workflows_rels" USING btree ("parent_id");
  CREATE INDEX "review_workflows_rels_path_idx" ON "review_workflows_rels" USING btree ("path");
  CREATE INDEX "review_workflows_rels_sections_id_idx" ON "review_workflows_rels" USING btree ("sections_id");
  CREATE INDEX "review_runs_story_idx" ON "review_runs" USING btree ("story_id");
  CREATE INDEX "review_runs_workflow_idx" ON "review_runs" USING btree ("workflow_id");
  CREATE INDEX "review_runs_status_idx" ON "review_runs" USING btree ("status");
  CREATE INDEX "review_runs_submitted_version_idx" ON "review_runs" USING btree ("submitted_version");
  CREATE INDEX "review_runs_submitted_by_idx" ON "review_runs" USING btree ("submitted_by_id");
  CREATE INDEX "review_runs_updated_at_idx" ON "review_runs" USING btree ("updated_at");
  CREATE INDEX "review_runs_created_at_idx" ON "review_runs" USING btree ("created_at");
  CREATE INDEX "review_runs_rels_order_idx" ON "review_runs_rels" USING btree ("order");
  CREATE INDEX "review_runs_rels_parent_idx" ON "review_runs_rels" USING btree ("parent_id");
  CREATE INDEX "review_runs_rels_path_idx" ON "review_runs_rels" USING btree ("path");
  CREATE INDEX "review_runs_rels_users_id_idx" ON "review_runs_rels" USING btree ("users_id");
  CREATE INDEX "review_comments_run_idx" ON "review_comments" USING btree ("run_id");
  CREATE INDEX "review_comments_story_idx" ON "review_comments" USING btree ("story_id");
  CREATE INDEX "review_comments_author_idx" ON "review_comments" USING btree ("author_id");
  CREATE INDEX "review_comments_state_idx" ON "review_comments" USING btree ("state");
  CREATE INDEX "review_comments_parent_idx" ON "review_comments" USING btree ("parent_id");
  CREATE INDEX "review_comments_resolved_by_idx" ON "review_comments" USING btree ("resolved_by_id");
  CREATE INDEX "review_comments_updated_at_idx" ON "review_comments" USING btree ("updated_at");
  CREATE INDEX "review_comments_created_at_idx" ON "review_comments" USING btree ("created_at");`)
  // Invariants the collections cannot express: one active school year, one open review per Story.
  await db.execute(sql`
  CREATE UNIQUE INDEX "school_years_one_active" ON "school_years" ("status") WHERE "status" = 'active';
  CREATE UNIQUE INDEX "review_runs_one_open" ON "review_runs" ("story_id") WHERE "status" IN ('active', 'changes-requested', 'routing-failed');
  CREATE UNIQUE INDEX "role_assignments_unique" ON "role_assignments" ("role_id", "user_id", "school_year_id");`)

  // An existing newsroom starts in the current school year, with every enabled account on its roster.
  // Stories and bylines are untouched; nothing here is public.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: newsroomTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const year = schoolYearFor(today)
  await db.execute(sql`INSERT INTO "school_years" ("name", "starts_on", "ends_on", "status", "activated_at", "revision")
    VALUES (${year.name}, ${year.startsOn}, ${year.endsOn}, 'active', now(), 1)`)
  await db.execute(sql`
  INSERT INTO "staff_memberships" ("school_year_id", "user_id", "status")
    SELECT (SELECT "id" FROM "school_years" WHERE "status" = 'active'), "id", 'active' FROM "users" WHERE "enabled" IS NOT FALSE;`)
  for (const role of DEFAULT_NEWSROOM_ROLES) {
    await db.execute(sql`INSERT INTO "newsroom_roles" ("key", "name", "description", "scope_kind", "waiting_label", "archived", "revision")
      VALUES (${role.key}, ${role.name}, ${role.description}, ${role.scopeKind}, ${role.waitingLabel}, false, 1)`)
  }
  // The default workflow keeps today's behaviour: the Story's editor reviews it, or any editor when it has none.
  await db.execute(sql`INSERT INTO "review_workflows" ("name", "description", "is_default", "archived", "steps", "revision")
    VALUES ('Standard', 'One edit by the story''s editor. Add steps for section, visual, copy and final review.', true, false, ${JSON.stringify(DEFAULT_WORKFLOW_STEPS)}::jsonb, 1)`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "school_years" CASCADE;
  DROP TABLE "staff_memberships" CASCADE;
  DROP TABLE "newsroom_roles" CASCADE;
  DROP TABLE "role_assignments_media_types" CASCADE;
  DROP TABLE "role_assignments" CASCADE;
  DROP TABLE "role_assignments_rels" CASCADE;
  DROP TABLE "review_workflows_applies_to_formats" CASCADE;
  DROP TABLE "review_workflows" CASCADE;
  DROP TABLE "review_workflows_rels" CASCADE;
  DROP TABLE "review_runs" CASCADE;
  DROP TABLE "review_runs_rels" CASCADE;
  DROP TABLE "review_comments" CASCADE;
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_story_activity_action";
  CREATE TYPE "public"."enum_story_activity_action" AS ENUM('story-created', 'story-published', 'story-unpublished', 'workflow-changed', 'editor-changed', 'contributors-changed', 'task-created', 'task-completed', 'task-reopened', 'source-added', 'source-updated', 'appointment-added', 'appointment-updated', 'appointment-completed', 'production-added', 'production-changed', 'publication-scheduled', 'publication-rescheduled', 'publication-cancelled', 'version-restored', 'url-changed', 'correction-added', 'correction-updated', 'correction-removed', 'recording-captured', 'file-captured', 'transcript-completed', 'transcript-imported', 'quote-verified', 'off-record-override', 'material-made-confidential', 'material-made-normal', 'live-submitted', 'live-published-from-field', 'live-queued-sent', 'live-publishers-changed', 'live-published', 'live-mode-changed', 'live-coverage-started', 'live-coverage-resumed', 'live-coverage-ended', 'homepage-featured', 'distribution-assigned', 'distribution-ready', 'distribution-posted', 'distribution-failed', 'distribution-skipped');
  ALTER TABLE "story_activity" ALTER COLUMN "action" SET DATA TYPE "public"."enum_story_activity_action" USING "action"::"public"."enum_story_activity_action";
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_notifications_kind";
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('storyAssignments', 'readyForReview', 'storyReturned', 'mediaAssignments', 'highPriorityTasks', 'appointments', 'publishingFailures', 'dueDigest', 'transcriptReady', 'distributionAssignments', 'distributionApproval', 'distributionFailures', 'frontPageFailures');
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_notifications_kind" USING "kind"::"public"."enum_notifications_kind";
  ALTER TABLE "story_plans" DROP COLUMN "sidelined_from";
  DROP TYPE "public"."enum_story_plans_sidelined_from";
  DROP TYPE "public"."enum_school_years_status";
  DROP TYPE "public"."enum_staff_memberships_status";
  DROP TYPE "public"."enum_newsroom_roles_scope_kind";
  DROP TYPE "public"."enum_role_assignments_media_types";
  DROP TYPE "public"."enum_role_assignments_scope_mode";
  DROP TYPE "public"."enum_review_workflows_applies_to_formats";
  DROP TYPE "public"."enum_review_runs_status";
  DROP TYPE "public"."enum_review_comments_state";`)
}
