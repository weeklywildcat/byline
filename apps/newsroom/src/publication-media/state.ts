import { sql } from "@payloadcms/db-postgres";
import type { PublicationMediaManifest } from "@byline/content";
import type { Payload, PayloadRequest } from "payload";

/**
 * System transitions of a Media asset's prepared generation
 * (`media.publication_assets_*`). Each is ONE conditional SQL statement keyed
 * on the asset's current `publication_revision`, so a worker holding an old
 * revision can never overwrite a newer state: the compare and the write are
 * the same statement. None of them touches `updated_at`: preparation is not an
 * edit, and the Media inspector's compare-and-swap must not see one.
 *
 * People never reach these: the fields are system-only in `collections/Media.ts`.
 */
type Drizzle = { execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> };

/** The current transaction's connection when `req` has one, else the pool. */
export async function drizzleFor(payload: Payload, req?: Partial<PayloadRequest>): Promise<Drizzle> {
  const adapter = payload.db as unknown as { drizzle: Drizzle; sessions?: Record<string, { db?: Drizzle }> };
  if (req?.transactionID) {
    const id = await req.transactionID;
    return adapter.sessions?.[String(id)]?.db ?? adapter.drizzle;
  }
  return adapter.drizzle;
}

const affected = (result: { rows: unknown[]; rowCount?: number | null }) => (result.rowCount ?? result.rows.length) > 0;

/** A job begins: still the current revision? Then mark it preparing and count the attempt. */
export async function markPreparationStarted(payload: Payload, id: number, revision: number): Promise<boolean> {
  const db = await drizzleFor(payload);
  const result = await db.execute(sql`
    update media set
      publication_assets_status = 'preparing',
      publication_assets_started_at = now(),
      publication_assets_attempts = coalesce(publication_assets_attempts, 0) + 1
    where id = ${id} and publication_revision = ${revision}
    returning id`);
  return affected(result);
}

/** Promotes a finished generation, only if the asset is still at the revision it was prepared from. */
export async function promotePreparedGeneration(payload: Payload, input: { id: number; revision: number; recipeVersion: number; sourceHash: string; manifest: PublicationMediaManifest }): Promise<boolean> {
  const db = await drizzleFor(payload);
  const result = await db.execute(sql`
    update media set
      publication_assets_status = 'ready',
      publication_assets_prepared_revision = ${input.revision},
      publication_assets_recipe_version = ${input.recipeVersion},
      publication_assets_source_hash = ${input.sourceHash},
      publication_assets_manifest = ${JSON.stringify(input.manifest)}::jsonb,
      publication_assets_prepared_at = now(),
      publication_assets_failure_code = null,
      publication_assets_failure_message = null
    where id = ${input.id} and publication_revision = ${input.revision}
    returning id`);
  return affected(result);
}

/** Records a failure for the revision that failed; a newer revision's state is left alone. */
export async function markPreparationFailed(payload: Payload, input: { id: number; revision: number; code: string; message: string }, req?: Partial<PayloadRequest>): Promise<boolean> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`
    update media set
      publication_assets_status = 'failed',
      publication_assets_failure_code = ${input.code.slice(0, 80)},
      publication_assets_failure_message = ${input.message.slice(0, 500)}
    where id = ${input.id} and publication_revision = ${input.revision}
    returning id`);
  return affected(result);
}

/** A retry was queued for the current revision. */
export async function markPreparationQueued(payload: Payload, id: number, revision: number, req?: Partial<PayloadRequest>): Promise<boolean> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`
    update media set
      publication_assets_status = 'preparing',
      publication_assets_queued_at = now(),
      publication_assets_started_at = null,
      publication_assets_failure_code = null,
      publication_assets_failure_message = null
    where id = ${id} and publication_revision = ${revision}
    returning id`);
  return affected(result);
}

/** Locks one Media row for the rest of the current transaction (compare-and-swap writes). */
export async function lockMediaRow(req: PayloadRequest, id: number): Promise<void> {
  if (!req.transactionID) throw new Error("Media art-direction writes need a database transaction.");
  const db = await drizzleFor(req.payload, req);
  await db.execute(sql`select id from media where id = ${id} for update`);
}
