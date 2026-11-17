import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "donation_waitlist" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE UNIQUE INDEX "donation_waitlist_email_idx" ON "donation_waitlist" USING btree ("email");
  CREATE INDEX "donation_waitlist_updated_at_idx" ON "donation_waitlist" USING btree ("updated_at");
  CREATE INDEX "donation_waitlist_created_at_idx" ON "donation_waitlist" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "donation_waitlist" CASCADE;`)
}
