import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reporting_transcripts" ADD COLUMN "transcription_run_token" varchar;
    ALTER TABLE "reporting_transcripts" ADD COLUMN "progress_percent" numeric;
    ALTER TABLE "reporting_transcripts" ADD COLUMN "progress_message" varchar;
    ALTER TABLE "reporting_transcripts" ADD COLUMN "transcription_started_at" timestamp(3) with time zone;
    ALTER TABLE "reporting_transcripts" ADD COLUMN "last_progress_at" timestamp(3) with time zone;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reporting_transcripts" DROP COLUMN "transcription_run_token";
    ALTER TABLE "reporting_transcripts" DROP COLUMN "progress_percent";
    ALTER TABLE "reporting_transcripts" DROP COLUMN "progress_message";
    ALTER TABLE "reporting_transcripts" DROP COLUMN "transcription_started_at";
    ALTER TABLE "reporting_transcripts" DROP COLUMN "last_progress_at";
  `)
}
