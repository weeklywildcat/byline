import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_data_projects_presentation_kind" AS ENUM('template', 'custom');
  CREATE TYPE "public"."enum_data_projects_indexing" AS ENUM('public', 'noindex');
  CREATE TYPE "public"."enum_data_projects_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__data_projects_v_version_presentation_kind" AS ENUM('template', 'custom');
  CREATE TYPE "public"."enum__data_projects_v_version_indexing" AS ENUM('public', 'noindex');
  CREATE TYPE "public"."enum__data_projects_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "data_datasets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"description" varchar,
  	"schema" jsonb NOT NULL,
  	"working_revision" numeric DEFAULT 0,
  	"working_changed_at" timestamp(3) with time zone,
  	"release" jsonb,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_records" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer NOT NULL,
  	"record_id" varchar NOT NULL,
  	"values" jsonb NOT NULL,
  	"position" numeric DEFAULT 0,
  	"included" boolean DEFAULT true,
  	"created_by_id" integer,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_projects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"deck" varchar,
  	"presentation_kind" "enum_data_projects_presentation_kind" DEFAULT 'template',
  	"presentation" varchar,
  	"bindings" jsonb DEFAULT '[]'::jsonb,
  	"settings" jsonb DEFAULT '{}'::jsonb,
  	"source" varchar,
  	"methodology" varchar,
  	"indexing" "enum_data_projects_indexing" DEFAULT 'public',
  	"published_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_data_projects_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "data_projects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer
  );
  
  CREATE TABLE "_data_projects_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_deck" varchar,
  	"version_presentation_kind" "enum__data_projects_v_version_presentation_kind" DEFAULT 'template',
  	"version_presentation" varchar,
  	"version_bindings" jsonb DEFAULT '[]'::jsonb,
  	"version_settings" jsonb DEFAULT '{}'::jsonb,
  	"version_source" varchar,
  	"version_methodology" varchar,
  	"version_indexing" "enum__data_projects_v_version_indexing" DEFAULT 'public',
  	"version_published_at" timestamp(3) with time zone,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__data_projects_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_data_projects_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"stories_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_projects_id" integer;
  ALTER TABLE "data_datasets" ADD CONSTRAINT "data_datasets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_records" ADD CONSTRAINT "data_records_dataset_id_data_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."data_datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_records" ADD CONSTRAINT "data_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_records" ADD CONSTRAINT "data_records_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_projects" ADD CONSTRAINT "data_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_projects_rels" ADD CONSTRAINT "data_projects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."data_projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "data_projects_rels" ADD CONSTRAINT "data_projects_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_data_projects_v" ADD CONSTRAINT "_data_projects_v_parent_id_data_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."data_projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_data_projects_v" ADD CONSTRAINT "_data_projects_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_data_projects_v_rels" ADD CONSTRAINT "_data_projects_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_data_projects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_data_projects_v_rels" ADD CONSTRAINT "_data_projects_v_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "data_datasets_key_idx" ON "data_datasets" USING btree ("key");
  CREATE INDEX "data_datasets_created_by_idx" ON "data_datasets" USING btree ("created_by_id");
  CREATE INDEX "data_datasets_updated_at_idx" ON "data_datasets" USING btree ("updated_at");
  CREATE INDEX "data_datasets_created_at_idx" ON "data_datasets" USING btree ("created_at");
  CREATE INDEX "data_records_dataset_idx" ON "data_records" USING btree ("dataset_id");
  CREATE INDEX "data_records_record_id_idx" ON "data_records" USING btree ("record_id");
  CREATE INDEX "data_records_position_idx" ON "data_records" USING btree ("position");
  CREATE INDEX "data_records_created_by_idx" ON "data_records" USING btree ("created_by_id");
  CREATE INDEX "data_records_updated_by_idx" ON "data_records" USING btree ("updated_by_id");
  CREATE INDEX "data_records_updated_at_idx" ON "data_records" USING btree ("updated_at");
  CREATE INDEX "data_records_created_at_idx" ON "data_records" USING btree ("created_at");
  CREATE UNIQUE INDEX "dataset_recordId_idx" ON "data_records" USING btree ("dataset_id","record_id");
  CREATE UNIQUE INDEX "data_projects_slug_idx" ON "data_projects" USING btree ("slug");
  CREATE INDEX "data_projects_created_by_idx" ON "data_projects" USING btree ("created_by_id");
  CREATE INDEX "data_projects_updated_at_idx" ON "data_projects" USING btree ("updated_at");
  CREATE INDEX "data_projects_created_at_idx" ON "data_projects" USING btree ("created_at");
  CREATE INDEX "data_projects__status_idx" ON "data_projects" USING btree ("_status");
  CREATE INDEX "data_projects_rels_order_idx" ON "data_projects_rels" USING btree ("order");
  CREATE INDEX "data_projects_rels_parent_idx" ON "data_projects_rels" USING btree ("parent_id");
  CREATE INDEX "data_projects_rels_path_idx" ON "data_projects_rels" USING btree ("path");
  CREATE INDEX "data_projects_rels_stories_id_idx" ON "data_projects_rels" USING btree ("stories_id");
  CREATE INDEX "_data_projects_v_parent_idx" ON "_data_projects_v" USING btree ("parent_id");
  CREATE INDEX "_data_projects_v_version_version_slug_idx" ON "_data_projects_v" USING btree ("version_slug");
  CREATE INDEX "_data_projects_v_version_version_created_by_idx" ON "_data_projects_v" USING btree ("version_created_by_id");
  CREATE INDEX "_data_projects_v_version_version_updated_at_idx" ON "_data_projects_v" USING btree ("version_updated_at");
  CREATE INDEX "_data_projects_v_version_version_created_at_idx" ON "_data_projects_v" USING btree ("version_created_at");
  CREATE INDEX "_data_projects_v_version_version__status_idx" ON "_data_projects_v" USING btree ("version__status");
  CREATE INDEX "_data_projects_v_created_at_idx" ON "_data_projects_v" USING btree ("created_at");
  CREATE INDEX "_data_projects_v_updated_at_idx" ON "_data_projects_v" USING btree ("updated_at");
  CREATE INDEX "_data_projects_v_latest_idx" ON "_data_projects_v" USING btree ("latest");
  CREATE INDEX "_data_projects_v_rels_order_idx" ON "_data_projects_v_rels" USING btree ("order");
  CREATE INDEX "_data_projects_v_rels_parent_idx" ON "_data_projects_v_rels" USING btree ("parent_id");
  CREATE INDEX "_data_projects_v_rels_path_idx" ON "_data_projects_v_rels" USING btree ("path");
  CREATE INDEX "_data_projects_v_rels_stories_id_idx" ON "_data_projects_v_rels" USING btree ("stories_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_projects_fk" FOREIGN KEY ("data_projects_id") REFERENCES "public"."data_projects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_data_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("data_projects_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "data_datasets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "data_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "data_projects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "data_projects_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_data_projects_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_data_projects_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "data_datasets" CASCADE;
  DROP TABLE "data_records" CASCADE;
  DROP TABLE "data_projects" CASCADE;
  DROP TABLE "data_projects_rels" CASCADE;
  DROP TABLE "_data_projects_v" CASCADE;
  DROP TABLE "_data_projects_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_projects_fk";
  
  DROP INDEX "payload_locked_documents_rels_data_projects_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_projects_id";
  DROP TYPE "public"."enum_data_projects_presentation_kind";
  DROP TYPE "public"."enum_data_projects_indexing";
  DROP TYPE "public"."enum_data_projects_status";
  DROP TYPE "public"."enum__data_projects_v_version_presentation_kind";
  DROP TYPE "public"."enum__data_projects_v_version_indexing";
  DROP TYPE "public"."enum__data_projects_v_version_status";`)
}
