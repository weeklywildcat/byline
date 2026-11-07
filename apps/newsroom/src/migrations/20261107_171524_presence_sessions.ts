import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "byline_presence_sessions" (
      "user_id" integer NOT NULL,
      "session_id" varchar(32) NOT NULL,
      "revision" bigint NOT NULL,
      "state" varchar(6) NOT NULL,
      "last_seen" timestamp with time zone NOT NULL,
      "last_active" timestamp with time zone,
      "location_kind" varchar(16) NOT NULL,
      "target_id" integer,
      CONSTRAINT "byline_presence_sessions_user_id_session_id_pk" PRIMARY KEY("user_id","session_id")
    );

    CREATE INDEX "byline_presence_sessions_last_seen" ON "byline_presence_sessions" USING btree ("last_seen");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "byline_presence_sessions" CASCADE;`)
}
