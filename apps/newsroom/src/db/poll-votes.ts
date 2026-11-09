import type { PostgresAdapterArgs } from "@payloadcms/db-postgres";
import { bigserial, index, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * Poll votes: transactional rows, not Payload documents. Same shape and
 * constraint on poll and voter identity:
 * duplicate protection is the unique key, never a read-then-write. The table
 * joins Payload's Drizzle schema so migrations create it, but it is not a
 * collection: no admin screen, REST or GraphQL route can list vote rows.
 */
export const pollVotes = pgTable(
  "byline_poll_votes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pollId: varchar("poll_id", { length: 64 }).notNull(),
    optionId: varchar("option_id", { length: 64 }).notNull(),
    voterKey: varchar("voter_key", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("byline_poll_votes_poll_voter").on(table.pollId, table.voterKey),
    index("byline_poll_votes_poll").on(table.pollId),
    index("byline_poll_votes_poll_option").on(table.pollId, table.optionId)
  ]
);

type SchemaHook = NonNullable<PostgresAdapterArgs["beforeSchemaInit"]>[number];

export const addPollVotesTable: SchemaHook = ({ schema }) => ({
  ...schema,
  tables: { ...schema.tables, byline_poll_votes: pollVotes }
});
