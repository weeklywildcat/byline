import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Article polls are retired (docs/wildcat-polls.md): the reader poll block, the
 * `polls` collection, the `byline_poll_votes` table and the publication's
 * "polls" feature switch. Wildcat Polls is a separate, private survey system.
 *
 * Poll blocks are removed from every Story body and saved version first, so no
 * document keeps a block the editor can no longer load. Navigation entries
 * gated by the retired switch become ungated rather than failing the enum change.
 */
const POLL_BLOCK = `$.** ? (@.type == "block" && @.fields.blockType == "poll")`;

type LexicalNode = { type?: unknown; fields?: { blockType?: unknown }; children?: unknown };

function withoutPollBlocks(node: unknown): unknown {
  if (Array.isArray(node)) return node.filter((child) => !isPollBlock(child)).map(withoutPollBlocks);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withoutPollBlocks(value)]));
}

function isPollBlock(node: unknown): boolean {
  const candidate = node as LexicalNode | null;
  return Boolean(candidate && typeof candidate === "object" && candidate.type === "block" && candidate.fields?.blockType === "poll");
}

async function stripPollBlocks(db: MigrateUpArgs["db"], table: "stories" | "_stories_v", column: "body" | "version_body") {
  const { rows } = await db.execute(sql`select id, ${sql.identifier(column)} as body from ${sql.identifier(table)} where jsonb_path_exists(${sql.identifier(column)}, ${POLL_BLOCK}::jsonpath)`);
  for (const row of rows as Array<{ id: number; body: unknown }>) {
    await db.execute(sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${JSON.stringify(withoutPollBlocks(row.body))}::jsonb where id = ${row.id}`);
  }
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await stripPollBlocks(db, "stories", "body");
  await stripPollBlocks(db, "_stories_v", "version_body");
  await db.execute(sql`
  UPDATE "publication_navigation" SET "feature" = NULL WHERE "feature" = 'polls';
  UPDATE "_publication_v_version_navigation" SET "feature" = NULL WHERE "feature" = 'polls';
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_polls_fk";
  DELETE FROM "payload_locked_documents_rels" WHERE "polls_id" IS NOT NULL;
  ALTER TABLE "byline_poll_votes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "polls_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "polls" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "byline_poll_votes" CASCADE;
  DROP TABLE "polls_options" CASCADE;
  DROP TABLE "polls" CASCADE;

  ALTER TABLE "publication_navigation" ALTER COLUMN "feature" SET DATA TYPE text;
  DROP TYPE "public"."enum_publication_navigation_feature";
  CREATE TYPE "public"."enum_publication_navigation_feature" AS ENUM('sports', 'events', 'newsletter', 'discord');
  ALTER TABLE "publication_navigation" ALTER COLUMN "feature" SET DATA TYPE "public"."enum_publication_navigation_feature" USING "feature"::"public"."enum_publication_navigation_feature";
  ALTER TABLE "_publication_v_version_navigation" ALTER COLUMN "feature" SET DATA TYPE text;
  DROP TYPE "public"."enum__publication_v_version_navigation_feature";
  CREATE TYPE "public"."enum__publication_v_version_navigation_feature" AS ENUM('sports', 'events', 'newsletter', 'discord');
  ALTER TABLE "_publication_v_version_navigation" ALTER COLUMN "feature" SET DATA TYPE "public"."enum__publication_v_version_navigation_feature" USING "feature"::"public"."enum__publication_v_version_navigation_feature";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_polls_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "polls_id";
  ALTER TABLE "publication" DROP COLUMN "features_polls";
  ALTER TABLE "_publication_v" DROP COLUMN "version_features_polls";
  DROP TYPE "public"."enum_polls_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_polls_status" AS ENUM('draft', 'open', 'closed');
  ALTER TYPE "public"."enum_publication_navigation_feature" ADD VALUE 'polls' BEFORE 'newsletter';
  ALTER TYPE "public"."enum__publication_v_version_navigation_feature" ADD VALUE 'polls' BEFORE 'newsletter';
  CREATE TABLE "byline_poll_votes" (
  	"id" bigserial PRIMARY KEY NOT NULL,
  	"poll_id" varchar(64) NOT NULL,
  	"option_id" varchar(64) NOT NULL,
  	"voter_key" varchar(64) NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "polls_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"option_id" varchar NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "polls" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"poll_key" varchar NOT NULL,
  	"status" "enum_polls_status" DEFAULT 'draft' NOT NULL,
  	"opens_at" timestamp(3) with time zone,
  	"closes_at" timestamp(3) with time zone,
  	"story_id" integer,
  	"legacy_word_press_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "polls_id" integer;
  ALTER TABLE "publication" ADD COLUMN "features_polls" boolean DEFAULT true;
  ALTER TABLE "_publication_v" ADD COLUMN "version_features_polls" boolean DEFAULT true;
  ALTER TABLE "polls_options" ADD CONSTRAINT "polls_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "polls" ADD CONSTRAINT "polls_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "byline_poll_votes_poll_voter" ON "byline_poll_votes" USING btree ("poll_id","voter_key");
  CREATE INDEX "byline_poll_votes_poll" ON "byline_poll_votes" USING btree ("poll_id");
  CREATE INDEX "byline_poll_votes_poll_option" ON "byline_poll_votes" USING btree ("poll_id","option_id");
  CREATE INDEX "polls_options_order_idx" ON "polls_options" USING btree ("_order");
  CREATE INDEX "polls_options_parent_id_idx" ON "polls_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "polls_poll_key_idx" ON "polls" USING btree ("poll_key");
  CREATE INDEX "polls_status_idx" ON "polls" USING btree ("status");
  CREATE INDEX "polls_story_idx" ON "polls" USING btree ("story_id");
  CREATE INDEX "polls_legacy_word_press_id_idx" ON "polls" USING btree ("legacy_word_press_id");
  CREATE INDEX "polls_updated_at_idx" ON "polls" USING btree ("updated_at");
  CREATE INDEX "polls_created_at_idx" ON "polls" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_polls_fk" FOREIGN KEY ("polls_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_polls_id_idx" ON "payload_locked_documents_rels" USING btree ("polls_id");`)
}
