import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from "payload";

/**
 * Row locks for newsroom mutations that must not interleave (a double-click,
 * a network retry, two reviewers deciding at once). Each runs inside
 * Payload's request transaction, so the lock and the writes commit together.
 */
const LOCKABLE = new Set(["story_plans", "review_runs", "review_workflows", "newsroom_roles", "school_years", "users"]);

export async function lockRow(req: PayloadRequest, table: string, id: number | string): Promise<void> {
  if (!LOCKABLE.has(table)) throw new Error(`Refusing to lock ${table}.`);
  const transactionID = await req.transactionID;
  if (!transactionID) throw new Error("Locked newsroom mutations require a database transaction.");
  const session = (req.payload.db as unknown as PostgresAdapter).sessions[String(transactionID)];
  if (!session) throw new Error("Newsroom transaction unavailable.");
  await session.db.execute(sql`select id from ${sql.identifier(table)} where id = ${id} for update`);
}

/** Run `work` in the request's transaction (starting one if needed), committing or rolling back with it. */
export async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const started = await initTransaction(req);
  try {
    const result = await work();
    if (started) await commitTransaction(req);
    return result;
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
