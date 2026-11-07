import type { PostgresAdapter, PostgresAdapterArgs } from "@payloadcms/db-postgres";
import { and, asc, eq, gte, inArray, lt, max, sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import type { Payload } from "payload";
import { parsePresenceLocation, PRESENCE_TIMING, type Heartbeat, type PresenceSession } from "../domain/presence";

export const presenceSessions = pgTable("byline_presence_sessions", {
  userId: integer("user_id").notNull(),
  sessionId: varchar("session_id", { length: 32 }).notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  state: varchar("state", { length: 6 }).$type<Heartbeat["state"]>().notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" }).notNull(),
  lastActive: timestamp("last_active", { withTimezone: true, mode: "date" }),
  locationKind: varchar("location_kind", { length: 16 }).notNull(),
  targetId: integer("target_id")
}, (table) => [
  primaryKey({ columns: [table.userId, table.sessionId] }),
  index("byline_presence_sessions_last_seen").on(table.lastSeen)
]);

type SchemaHook = NonNullable<PostgresAdapterArgs["beforeSchemaInit"]>[number];
export const addPresenceSessionsTable: SchemaHook = ({ schema }) => ({
  ...schema, tables: { ...schema.tables, byline_presence_sessions: presenceSessions }
});

const db = (payload: Payload) => (payload.db as unknown as Pick<PostgresAdapter, "drizzle">).drizzle;

export async function touchPresence(payload: Payload, userId: number, { sessionId, state, location, revision }: Heartbeat, now: Date) {
  const values = {
    userId, sessionId, revision, state, lastSeen: now, lastActive: state === "active" ? now : null,
    locationKind: location.kind, targetId: "targetId" in location ? location.targetId : null
  };
  await db(payload).insert(presenceSessions).values(values).onConflictDoUpdate({
    target: [presenceSessions.userId, presenceSessions.sessionId],
    // A hide request can arrive after a newer foreground heartbeat. Revision
    // orders writes only; all freshness timestamps are assigned by the server.
    setWhere: lt(presenceSessions.revision, revision),
    set: {
      revision, state, lastSeen: sql`greatest(${presenceSessions.lastSeen}, ${now.toISOString()}::timestamptz)`,
      lastActive: state === "active" ? sql`greatest(${presenceSessions.lastActive}, ${now.toISOString()}::timestamptz)` : presenceSessions.lastActive,
      locationKind: values.locationKind, targetId: values.targetId
    }
  });
}

/** Only current tab rows leave PostgreSQL. Older rows contribute timestamps, never locations. */
export async function readPresenceSessions(payload: Payload, userIds: number[], now: number): Promise<Map<number, PresenceSession[]>> {
  const sessions = new Map<number, PresenceSession[]>();
  if (!userIds.length) return sessions;
  const users = inArray(presenceSessions.userId, userIds);
  const cutoff = new Date(now - PRESENCE_TIMING.recent);
  const retained = new Date(now - PRESENCE_TIMING.retention);
  const [recent, past] = await Promise.all([
    db(payload).select().from(presenceSessions).where(and(users, gte(presenceSessions.lastSeen, cutoff))).orderBy(asc(presenceSessions.sessionId)),
    db(payload).select({ userId: presenceSessions.userId, lastSeen: max(presenceSessions.lastSeen), lastActive: max(presenceSessions.lastActive) })
      .from(presenceSessions).where(and(users, gte(presenceSessions.lastSeen, retained), lt(presenceSessions.lastSeen, cutoff)))
      .groupBy(presenceSessions.userId)
  ]);
  const add = (id: number, session: PresenceSession) => {
    const rows = sessions.get(id);
    if (rows) rows.push(session);
    else sessions.set(id, [session]);
  };
  for (const row of recent) add(row.userId, {
    state: row.state,
    location: parsePresenceLocation({ kind: row.locationKind, ...(row.targetId === null ? {} : { targetId: row.targetId }) }) ?? { kind: "other" },
    lastSeen: row.lastSeen.getTime(), lastActive: row.lastActive?.getTime() ?? null
  });
  for (const row of past) if (row.lastSeen) add(row.userId, {
    state: "away", location: { kind: "other" }, lastSeen: row.lastSeen.getTime(), lastActive: row.lastActive?.getTime() ?? null
  });
  return sessions;
}

export async function prunePresenceSessions(payload: Payload, now: number) {
  await db(payload).delete(presenceSessions).where(lt(presenceSessions.lastSeen, new Date(now - PRESENCE_TIMING.retention)));
}

const lastSweep = new WeakMap<Payload, number>();
export async function maybePrunePresenceSessions(payload: Payload, now: number) {
  if (now - (lastSweep.get(payload) ?? -Infinity) < PRESENCE_TIMING.housekeeping) return;
  lastSweep.set(payload, now);
  try {
    await prunePresenceSessions(payload, now);
  } catch (err) {
    payload.logger.warn({ err, msg: "Presence housekeeping failed" });
  }
}
