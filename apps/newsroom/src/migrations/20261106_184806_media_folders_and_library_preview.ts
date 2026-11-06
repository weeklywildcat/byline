import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload_folders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"folder_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "folder_id" integer;
  ALTER TABLE "media" ADD COLUMN "sizes_library_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_library_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_library_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_library_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_library_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_library_filename" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payload_folders_id" integer;
  ALTER TABLE "payload_folders" ADD CONSTRAINT "payload_folders_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_folders_name_idx" ON "payload_folders" USING btree ("name");
  CREATE INDEX "payload_folders_folder_idx" ON "payload_folders" USING btree ("folder_id");
  CREATE INDEX "payload_folders_updated_at_idx" ON "payload_folders" USING btree ("updated_at");
  CREATE INDEX "payload_folders_created_at_idx" ON "payload_folders" USING btree ("created_at");
  ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_folders_fk" FOREIGN KEY ("payload_folders_id") REFERENCES "public"."payload_folders"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder_id");
  CREATE INDEX "media_sizes_library_sizes_library_filename_idx" ON "media" USING btree ("sizes_library_filename");
  CREATE INDEX "payload_locked_documents_rels_payload_folders_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_folders_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_folders" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload_folders" CASCADE;
  ALTER TABLE "media" DROP CONSTRAINT "media_folder_id_payload_folders_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payload_folders_fk";
  
  DROP INDEX "media_folder_idx";
  DROP INDEX "media_sizes_library_sizes_library_filename_idx";
  DROP INDEX "payload_locked_documents_rels_payload_folders_id_idx";
  ALTER TABLE "media" DROP COLUMN "folder_id";
  ALTER TABLE "media" DROP COLUMN "sizes_library_url";
  ALTER TABLE "media" DROP COLUMN "sizes_library_width";
  ALTER TABLE "media" DROP COLUMN "sizes_library_height";
  ALTER TABLE "media" DROP COLUMN "sizes_library_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_library_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_library_filename";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payload_folders_id";`)
}
