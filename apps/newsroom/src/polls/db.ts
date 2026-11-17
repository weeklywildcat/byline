import type { PostgresAdapterArgs } from "@payloadcms/db-postgres";
import { bigserial, index, integer, jsonb, pgTable, smallint, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * Wildcat Polls' fieldwork and answers (docs/wildcat-polls.md#data-model).
 *
 * Plain tables in Payload's Drizzle schema, so committed migrations create
 * them, but never collections: no admin screen, REST or GraphQL route can list
 * them. Every read and write goes through src/polls/server.ts, which checks
 * the account or kiosk credential first. Duplicate protection is always a
 * unique key, never a read-then-write.
 */

/** One interviewer's stint at one place, and the kiosk credential for the device running it. */
export const pollSessions = pgTable("byline_poll_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  surveyId: integer("survey_id").notNull(),
  versionId: integer("version_id").notNull(),
  interviewerId: integer("interviewer_id").notNull(),
  locationId: integer("location_id"),
  locationName: varchar("location_name", { length: 120 }).notNull(),
  period: varchar("period", { length: 120 }).notNull().default(""),
  method: varchar("method", { length: 200 }).notNull().default(""),
  status: varchar("status", { length: 8 }).$type<"active" | "paused" | "ended">().notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  // The kiosk: a hashed bearer credential (an httpOnly cookie on one device), its PIN and its state.
  kioskTokenHash: varchar("kiosk_token_hash", { length: 64 }),
  kioskExpiresAt: timestamp("kiosk_expires_at", { withTimezone: true, mode: "date" }),
  kioskPinHash: varchar("kiosk_pin_hash", { length: 200 }),
  kioskMode: varchar("kiosk_mode", { length: 12 }).$type<"locked" | "interviewer" | "respondent">().notNull().default("locked"),
  kioskUnlockedUntil: timestamp("kiosk_unlocked_until", { withTimezone: true, mode: "date" }),
  kioskTicket: varchar("kiosk_ticket", { length: 36 }),
  pinFailures: smallint("pin_failures").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => [
  index("byline_poll_sessions_survey").on(table.surveyId, table.startedAt),
  index("byline_poll_sessions_interviewer").on(table.interviewerId, table.status),
  uniqueIndex("byline_poll_sessions_kiosk_token").on(table.kioskTokenHash)
]);

/**
 * Fieldwork events: approaches that became a survey (`started`), refusals
 * (`declined`), and how each started survey ended (`completed`, `abandoned`).
 * Nothing about the person is recorded. `event_key` is the client's
 * idempotency key; one ending per ticket.
 */
export const pollSessionEvents = pgTable("byline_poll_session_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  surveyId: integer("survey_id").notNull(),
  kind: varchar("kind", { length: 10 }).$type<"started" | "declined" | "completed" | "abandoned">().notNull(),
  eventKey: varchar("event_key", { length: 64 }).notNull(),
  ticket: varchar("ticket", { length: 36 }),
  locationName: varchar("location_name", { length: 120 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("byline_poll_session_events_key").on(table.eventKey),
  uniqueIndex("byline_poll_session_events_ticket_kind").on(table.ticket, table.kind),
  index("byline_poll_session_events_session").on(table.sessionId, table.kind),
  index("byline_poll_session_events_survey").on(table.surveyId, table.occurredAt)
]);

/**
 * Submitted answers, validated against `version_id` and stored for every
 * question of that version (answered, skipped, unanswered or not applicable).
 * `submission_id` makes a retried upload a no-op; `ticket` ties a kiosk
 * response to exactly one started survey.
 */
export const pollResponses = pgTable("byline_poll_responses", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  submissionId: varchar("submission_id", { length: 64 }).notNull(),
  surveyId: integer("survey_id").notNull(),
  versionId: integer("version_id").notNull(),
  sessionId: varchar("session_id", { length: 36 }),
  ticket: varchar("ticket", { length: 36 }),
  mode: varchar("mode", { length: 8 }).$type<"kiosk" | "public">().notNull(),
  locationName: varchar("location_name", { length: 120 }).notNull().default(""),
  answers: jsonb("answers").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  durationMs: integer("duration_ms"),
  submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("byline_poll_responses_submission").on(table.submissionId),
  uniqueIndex("byline_poll_responses_ticket").on(table.ticket),
  index("byline_poll_responses_survey").on(table.surveyId, table.submittedAt),
  index("byline_poll_responses_session").on(table.sessionId)
]);

/**
 * Public-link start tokens: issued when a respondent opens a public poll,
 * spent by exactly one submission. Only a hash is kept; no IP address,
 * fingerprint or cookie identity is recorded. Old rows are pruned.
 */
export const pollPublicStarts = pgTable("byline_poll_public_starts", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  surveyId: integer("survey_id").notNull(),
  versionId: integer("version_id").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" })
}, (table) => [index("byline_poll_public_starts_survey").on(table.surveyId, table.issuedAt)]);

type SchemaHook = NonNullable<PostgresAdapterArgs["beforeSchemaInit"]>[number];

export const addPollTables: SchemaHook = ({ schema }) => ({
  ...schema,
  tables: {
    ...schema.tables,
    byline_poll_sessions: pollSessions,
    byline_poll_session_events: pollSessionEvents,
    byline_poll_responses: pollResponses,
    byline_poll_public_starts: pollPublicStarts
  }
});
