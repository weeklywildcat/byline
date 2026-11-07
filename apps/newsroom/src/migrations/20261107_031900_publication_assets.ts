import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The original Media schema called static-publication readiness
 * `publicDelivery`, with private/queued/public states inherited from the
 * abandoned R2 public-bucket plan. Byline now prepares files for the Astro
 * static publisher instead: ready means web files exist for a future build,
 * not that an object is already public.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_media_public_delivery_status" RENAME TO "enum_media_publication_assets_status";
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'private' TO 'not-prepared';
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'queued' TO 'preparing';
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'public' TO 'ready';

    ALTER TABLE "media" RENAME COLUMN "public_delivery_status" TO "publication_assets_status";
    ALTER TABLE "media" RENAME COLUMN "public_delivery_content_hash" TO "publication_assets_source_hash";
    ALTER TABLE "media" RENAME COLUMN "public_delivery_renditions" TO "publication_assets_renditions";
    ALTER TABLE "media" RENAME COLUMN "public_delivery_materialized_at" TO "publication_assets_prepared_at";
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" RENAME COLUMN "publication_assets_status" TO "public_delivery_status";
    ALTER TABLE "media" RENAME COLUMN "publication_assets_source_hash" TO "public_delivery_content_hash";
    ALTER TABLE "media" RENAME COLUMN "publication_assets_renditions" TO "public_delivery_renditions";
    ALTER TABLE "media" RENAME COLUMN "publication_assets_prepared_at" TO "public_delivery_materialized_at";

    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'not-prepared' TO 'private';
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'preparing' TO 'queued';
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME VALUE 'ready' TO 'public';
    ALTER TYPE "public"."enum_media_publication_assets_status" RENAME TO "enum_media_public_delivery_status";
  `)
}
