import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_publication_analytics_consent_mode" AS ENUM('ask', 'always');
  CREATE TYPE "public"."enum__publication_v_version_analytics_consent_mode" AS ENUM('ask', 'always');
  CREATE TYPE "public"."enum_analytics_integration_status" AS ENUM('disconnected', 'pending-selection', 'connected', 'needs-reconnect');
  CREATE TYPE "public"."enum_analytics_integration_tracking_mode" AS ENUM('external', 'byline');
  CREATE TYPE "public"."enum_analytics_integration_consent_mode" AS ENUM('external', 'always', 'ask');
  CREATE TABLE "analytics_integration" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_analytics_integration_status" DEFAULT 'disconnected' NOT NULL,
  	"google_account_email" varchar,
  	"google_subject" varchar,
  	"account_resource" varchar,
  	"account_display_name" varchar,
  	"property_resource" varchar,
  	"property_display_name" varchar,
  	"property_time_zone" varchar,
  	"stream_resource" varchar,
  	"stream_display_name" varchar,
  	"stream_default_uri" varchar,
  	"measurement_id" varchar,
  	"tracking_mode" "enum_analytics_integration_tracking_mode" DEFAULT 'external' NOT NULL,
  	"consent_mode" "enum_analytics_integration_consent_mode" DEFAULT 'external' NOT NULL,
  	"encrypted_refresh_token" jsonb,
  	"granted_scopes" jsonb,
  	"connected_at" timestamp(3) with time zone,
  	"connected_by_id" integer,
  	"last_verified_at" timestamp(3) with time zone,
  	"last_successful_request_at" timestamp(3) with time zone,
  	"last_error_code" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "publication" ADD COLUMN "analytics_install_tag" boolean DEFAULT false;
  ALTER TABLE "publication" ADD COLUMN "analytics_measurement_id" varchar;
  ALTER TABLE "publication" ADD COLUMN "analytics_consent_mode" "enum_publication_analytics_consent_mode" DEFAULT 'ask';
  ALTER TABLE "_publication_v" ADD COLUMN "version_analytics_install_tag" boolean DEFAULT false;
  ALTER TABLE "_publication_v" ADD COLUMN "version_analytics_measurement_id" varchar;
  ALTER TABLE "_publication_v" ADD COLUMN "version_analytics_consent_mode" "enum__publication_v_version_analytics_consent_mode" DEFAULT 'ask';
  ALTER TABLE "analytics_integration" ADD CONSTRAINT "analytics_integration_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "analytics_integration_connected_by_idx" ON "analytics_integration" USING btree ("connected_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "analytics_integration" CASCADE;
  ALTER TABLE "publication" DROP COLUMN "analytics_install_tag";
  ALTER TABLE "publication" DROP COLUMN "analytics_measurement_id";
  ALTER TABLE "publication" DROP COLUMN "analytics_consent_mode";
  ALTER TABLE "_publication_v" DROP COLUMN "version_analytics_install_tag";
  ALTER TABLE "_publication_v" DROP COLUMN "version_analytics_measurement_id";
  ALTER TABLE "_publication_v" DROP COLUMN "version_analytics_consent_mode";
  DROP TYPE "public"."enum_publication_analytics_consent_mode";
  DROP TYPE "public"."enum__publication_v_version_analytics_consent_mode";
  DROP TYPE "public"."enum_analytics_integration_status";
  DROP TYPE "public"."enum_analytics_integration_tracking_mode";
  DROP TYPE "public"."enum_analytics_integration_consent_mode";`)
}
