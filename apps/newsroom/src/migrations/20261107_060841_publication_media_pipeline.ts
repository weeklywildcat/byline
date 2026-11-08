import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { normalizeArtDirectionIntent } from '@byline/core'

/**
 * Phase 5 publication media (docs/publication-media.md).
 *
 * - `artDirection` becomes Byline's canonical editorial intent
 *   (`ImageArtDirectionIntent`). Payload's native focal point is retired as a
 *   source of truth (Media `focalPoint: false`); its `focal_x`/`focal_y`
 *   columns remain only because Payload keeps them whenever an upload
 *   collection has image sizes, and Byline neither reads nor writes them. A
 *   native focal point with no Byline equivalent is preserved in the intent;
 *   existing intent is normalized and any generated rendition data stripped.
 * - `publicationRevision` starts at 1 for every existing asset.
 * - The placeholder `publicationAssets` never pointed at a real prepared
 *   store, so every old state (including `ready`) is invalidated to
 *   `not-prepared`; `npm run publication-media:requeue` queues them.
 * - Payload Jobs gets its concurrency key (per-asset exclusive preparation).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'prepare-publication-media' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'prepare-publication-media' BEFORE 'schedulePublish';
  ALTER TABLE "media" ADD COLUMN "publication_revision" numeric;
  ALTER TABLE "media" ADD COLUMN "publication_assets_prepared_revision" numeric;
  ALTER TABLE "media" ADD COLUMN "publication_assets_recipe_version" numeric;
  ALTER TABLE "media" ADD COLUMN "publication_assets_manifest" jsonb;
  ALTER TABLE "media" ADD COLUMN "publication_assets_queued_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "publication_assets_started_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "publication_assets_attempts" numeric;
  ALTER TABLE "media" ADD COLUMN "publication_assets_failure_code" varchar;
  ALTER TABLE "media" ADD COLUMN "publication_assets_failure_message" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "concurrency_key" varchar;
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  ALTER TABLE "media" DROP COLUMN "publication_assets_renditions";`)

  const rows = await db.execute(sql`select id, art_direction, focal_x, focal_y, width, height from media`)
  for (const row of rows.rows as Array<{ id: number; art_direction: unknown; focal_x: string | number | null; focal_y: string | number | null; width: string | number | null; height: string | number | null }>) {
    const stored = row.art_direction && typeof row.art_direction === 'object' ? (row.art_direction as Record<string, unknown>) : null
    const hasBylineFocal = Boolean(stored?.focalPoint)
    const nativeX = row.focal_x === null ? null : Number(row.focal_x)
    const nativeY = row.focal_y === null ? null : Number(row.focal_y)
    const source = {
      focalPoint: hasBylineFocal ? stored!.focalPoint : nativeX !== null && nativeY !== null && Number.isFinite(nativeX) && Number.isFinite(nativeY) ? { x: nativeX, y: nativeY } : undefined,
      crops: stored?.crops,
    }
    const width = Number(row.width)
    const height = Number(row.height)
    const intent = normalizeArtDirectionIntent(source, width > 0 && height > 0 ? { width, height } : null)
    await db.execute(sql`update media set art_direction = ${JSON.stringify(intent)}::jsonb where id = ${row.id}`)
  }

  await db.execute(sql`
  UPDATE "media" SET
    "publication_revision" = 1,
    "publication_assets_status" = 'not-prepared',
    "publication_assets_prepared_revision" = NULL,
    "publication_assets_recipe_version" = NULL,
    "publication_assets_source_hash" = NULL,
    "publication_assets_manifest" = NULL,
    "publication_assets_prepared_at" = NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_jobs_concurrency_key_idx";
  ALTER TABLE "media" ADD COLUMN "publication_assets_renditions" jsonb;
  ALTER TABLE "media" DROP COLUMN "publication_revision";
  ALTER TABLE "media" DROP COLUMN "publication_assets_prepared_revision";
  ALTER TABLE "media" DROP COLUMN "publication_assets_recipe_version";
  ALTER TABLE "media" DROP COLUMN "publication_assets_manifest";
  ALTER TABLE "media" DROP COLUMN "publication_assets_queued_at";
  ALTER TABLE "media" DROP COLUMN "publication_assets_started_at";
  ALTER TABLE "media" DROP COLUMN "publication_assets_attempts";
  ALTER TABLE "media" DROP COLUMN "publication_assets_failure_code";
  ALTER TABLE "media" DROP COLUMN "publication_assets_failure_message";
  ALTER TABLE "payload_jobs" DROP COLUMN "concurrency_key";`)
}
