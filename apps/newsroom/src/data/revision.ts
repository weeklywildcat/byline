import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { drizzleFor } from "../publication-media/state";

/**
 * A dataset's working revision: a counter on the dataset row that every
 * change to its working facts (a record written or deleted, the schema,
 * title or description edited) advances, in ONE statement inside the write's
 * own transaction. A release records the revision it was collected at and
 * is promoted only `WHERE working_revision = R`, so a concurrent edit can
 * never be half-published (the same fence as the public snapshot).
 */
export async function advanceWorkingRevision(req: Partial<PayloadRequest> & { payload: Payload }, datasetId: number): Promise<number> {
  const db = await drizzleFor(req.payload, req);
  const result = await db.execute(sql`update data_datasets set working_revision = coalesce(working_revision, 0) + 1, working_changed_at = clock_timestamp() where id = ${datasetId} returning working_revision`);
  return Number(result.rows[0]?.working_revision ?? 0);
}

export async function readWorkingRevision(payload: Payload, datasetId: number, req?: Partial<PayloadRequest>): Promise<number | null> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`select working_revision from data_datasets where id = ${datasetId}`);
  return result.rows[0] ? Number(result.rows[0].working_revision ?? 0) : null;
}

/** Locks a record row for a compare-and-write in the caller's transaction. */
export async function lockRecordRows(req: PayloadRequest, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await drizzleFor(req.payload, req);
  await db.execute(sql`select id from data_records where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) for update`);
}
