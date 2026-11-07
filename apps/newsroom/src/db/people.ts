import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

/**
 * Serialize profile revisions and deletion checks in Payload's transaction.
 * FOR UPDATE also excludes the FK's KEY SHARE lock: a concurrent Story
 * contributor insert must commit before deletion checks, or fail after the
 * unused Person is removed. Payload's cascading FKs cannot erase a byline
 * between the integrity check and the delete.
 */
export async function lockPersonRow(
  req: PayloadRequest,
  id: number | string,
): Promise<void> {
  const transactionID = await req.transactionID;
  if (!transactionID)
    throw new Error("People mutations require a database transaction.");
  const session = (req.payload.db as unknown as PostgresAdapter).sessions[
    String(transactionID)
  ];
  if (!session) throw new Error("People transaction unavailable.");
  await session.db.execute(
    sql`select id from people where id = ${id} for update`,
  );
}
