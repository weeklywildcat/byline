import type { PostgresAdapterArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import { bigint, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";
import type { Payload, PayloadRequest } from "payload";
import { drizzleFor } from "../publication-media/state";

/**
 * The publication's public state: ONE row (`id = 1`) holding the monotonic
 * public content revision and the completed snapshot pointer
 * (docs/payload-build-snapshots.md).
 *
 * Infrastructure, not a Payload collection: no admin screen, REST or GraphQL
 * route can read or write it. It joins Payload's Drizzle schema through
 * `beforeSchemaInit` so committed migrations own it (like `byline_poll_votes`).
 *
 * Every write is ONE SQL statement:
 * - advancing the revision is an atomic upsert-increment inside the caller's
 *   transaction (the public mutation commits with it or not at all);
 * - promoting a completed snapshot is a conditional update
 *   `WHERE current_revision = R`, so the compare and the promotion can never
 *   be separated by another writer.
 *
 * The snapshot JSON never lives here, only its pointer.
 */
export const publicationState = pgTable(
  "byline_publication_state",
  {
    id: integer("id").primaryKey(),
    currentRevision: bigint("current_revision", { mode: "bigint" }).notNull().default(drizzleSql`0`),
    completedRevision: bigint("completed_revision", { mode: "bigint" }),
    completedSchemaVersion: integer("completed_schema_version"),
    completedSha256: text("completed_sha256"),
    completedBytes: bigint("completed_bytes", { mode: "bigint" }),
    completedGeneratedAt: timestamp("completed_generated_at", { withTimezone: true, mode: "string" }),
    completedFilename: text("completed_filename"),
    completedProducerVersion: integer("completed_producer_version"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
  },
  (table) => [
    check("byline_publication_state_singleton", drizzleSql`${table.id} = 1`),
    check("byline_publication_state_revision_nonnegative", drizzleSql`${table.currentRevision} >= 0`)
  ]
);

type SchemaHook = NonNullable<PostgresAdapterArgs["beforeSchemaInit"]>[number];

export const addPublicationStateTable: SchemaHook = ({ schema }) => ({
  ...schema,
  tables: { ...schema.tables, byline_publication_state: publicationState }
});

/** A completed, immutable snapshot artifact as the database records it. */
export type CompletedSnapshotPointer = {
  revision: number;
  schemaVersion: number;
  sha256: string;
  bytes: number;
  generatedAt: string;
  filename: string;
  producerVersion: number;
};

export type PublicationStateRow = {
  currentRevision: number;
  /** Null when no snapshot has been promoted, or when a recorded pointer is incomplete (see `pointerCorrupt`). */
  completed: CompletedSnapshotPointer | null;
  /** A pointer row exists but is structurally unusable: never treated as ordinary absence. */
  pointerCorrupt: string | null;
  updatedAt: string | null;
};

export class PublicRevisionRangeError extends Error {}

/** A Postgres bigint as a JavaScript number, refusing anything beyond the safe-integer range snapshot v1 can carry. */
export function safeRevision(value: unknown, label = "public revision"): number {
  if (value === null || value === undefined) throw new PublicRevisionRangeError(`${label} is missing.`);
  const big = typeof value === "bigint" ? value : BigInt(String(value));
  if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) throw new PublicRevisionRangeError(`${label} ${big} is outside the safe-integer range.`);
  return Number(big);
}

const SHA256 = /^[0-9a-f]{64}$/;
const FILENAME = /^snapshot-v1-r(\d+)-([0-9a-f]{64})\.json$/;

function readPointer(row: Record<string, unknown>): { pointer: CompletedSnapshotPointer | null; corrupt: string | null } {
  const fields = ["completed_revision", "completed_schema_version", "completed_sha256", "completed_bytes", "completed_generated_at", "completed_filename", "completed_producer_version"];
  const present = fields.filter((field) => row[field] !== null && row[field] !== undefined);
  if (present.length === 0) return { pointer: null, corrupt: null };
  if (present.length !== fields.length) return { pointer: null, corrupt: `incomplete pointer (${fields.filter((field) => !present.includes(field)).join(", ")} missing)` };
  try {
    const pointer: CompletedSnapshotPointer = {
      revision: safeRevision(row.completed_revision, "completed revision"),
      schemaVersion: Number(row.completed_schema_version),
      sha256: String(row.completed_sha256),
      bytes: safeRevision(row.completed_bytes, "completed byte count"),
      generatedAt: new Date(String(row.completed_generated_at)).toISOString(),
      filename: String(row.completed_filename),
      producerVersion: Number(row.completed_producer_version)
    };
    const name = FILENAME.exec(pointer.filename);
    if (!SHA256.test(pointer.sha256)) return { pointer: null, corrupt: "the recorded SHA-256 is malformed" };
    if (!name || Number(name[1]) !== pointer.revision || name[2] !== pointer.sha256) return { pointer: null, corrupt: "the recorded filename does not match its revision and digest" };
    if (pointer.bytes <= 0 || !Number.isSafeInteger(pointer.schemaVersion) || !Number.isSafeInteger(pointer.producerVersion)) return { pointer: null, corrupt: "the recorded size or versions are invalid" };
    return { pointer, corrupt: null };
  } catch (error) {
    return { pointer: null, corrupt: (error as Error).message };
  }
}

/** The singleton, read in the caller's transaction when `req` has one. A missing row is revision 0 with no snapshot. */
export async function readPublicationState(payload: Payload, req?: Partial<PayloadRequest>): Promise<PublicationStateRow> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`select * from byline_publication_state where id = 1`);
  const row = result.rows[0];
  if (!row) return { currentRevision: 0, completed: null, pointerCorrupt: null, updatedAt: null };
  const { pointer, corrupt } = readPointer(row);
  return { currentRevision: safeRevision(row.current_revision), completed: pointer, pointerCorrupt: corrupt, updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null };
}

/** The current public revision only (one indexed read). */
export async function readCurrentRevision(payload: Payload, req?: Partial<PayloadRequest>): Promise<number> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`select current_revision from byline_publication_state where id = 1`);
  return result.rows[0] ? safeRevision(result.rows[0].current_revision) : 0;
}

/**
 * Advances the public revision by one in ONE statement, inside the caller's
 * transaction when `req` has one (the row stays locked until it commits, so
 * concurrent public writes get distinct, ordered revisions).
 */
export async function advancePublicRevision(payload: Payload, req?: Partial<PayloadRequest>): Promise<number> {
  const db = await drizzleFor(payload, req);
  const result = await db.execute(sql`
    insert into byline_publication_state (id, current_revision, updated_at) values (1, 1, now())
    on conflict (id) do update set current_revision = byline_publication_state.current_revision + 1, updated_at = now()
    returning current_revision`);
  return safeRevision(result.rows[0]?.current_revision);
}

/**
 * Promotes a completed snapshot ONLY if the public revision is still the one
 * it was generated for. The comparison and the write are one statement; a
 * newer public mutation makes it return false and leaves the pointer alone.
 */
export async function promoteCompletedSnapshot(payload: Payload, pointer: CompletedSnapshotPointer): Promise<boolean> {
  const db = await drizzleFor(payload);
  // The singleton exists before any comparison (idempotent; it never changes a revision).
  await db.execute(sql`insert into byline_publication_state (id, current_revision) values (1, 0) on conflict (id) do nothing`);
  const result = await db.execute(sql`
    update byline_publication_state set
      completed_revision = ${pointer.revision},
      completed_schema_version = ${pointer.schemaVersion},
      completed_sha256 = ${pointer.sha256},
      completed_bytes = ${pointer.bytes},
      completed_generated_at = ${pointer.generatedAt},
      completed_filename = ${pointer.filename},
      completed_producer_version = ${pointer.producerVersion},
      updated_at = now()
    where id = 1 and current_revision = ${pointer.revision}
    returning id`);
  return (result.rowCount ?? result.rows.length) > 0;
}
