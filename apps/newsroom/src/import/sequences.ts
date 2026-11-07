import { sql } from "drizzle-orm";
import type { Payload } from "payload";

/**
 * After an import inserts rows with explicit (WordPress) IDs, move every serial
 * `id` sequence in the schema past the largest ID in its table, so the next
 * record created normally can never collide with an imported one. Idempotent.
 */
export async function advanceIdSequences(payload: Payload): Promise<Array<{ table: string; next: number }>> {
  const db = (payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Array<Record<string, unknown>> }> } }).drizzle;
  const { rows } = await db.execute(sql`
    SELECT c.relname AS table_name, pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped
    WHERE c.relkind = 'r' AND n.nspname = current_schema()
    ORDER BY c.relname
  `);
  const advanced: Array<{ table: string; next: number }> = [];
  for (const row of rows) {
    if (row.sequence_name === null) continue;
    const table = String(row.table_name);
    const sequence = String(row.sequence_name);
    const { rows: maxRows } = await db.execute(sql`SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM ${sql.identifier(table)}`);
    const { rows: seqRows } = await db.execute(sql`SELECT last_value::bigint AS last_value, is_called FROM ${sql.raw(sequence)}`);
    const maxId = Number(maxRows[0]?.max_id ?? 0);
    const seqNext = Number(seqRows[0]?.last_value ?? 1) + (seqRows[0]?.is_called ? 1 : 0);
    // Never move a sequence backwards: a deleted story's ID must not be reused,
    // because repository presentations are keyed by story ID.
    const next = Math.max(maxId + 1, seqNext);
    await db.execute(sql`SELECT setval(${sequence}::regclass, ${next}, false)`);
    advanced.push({ table, next });
  }
  return advanced;
}
