import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stories_feature_width" AS ENUM('wide', 'full');
  CREATE TYPE "public"."enum_stories_split_image_side" AS ENUM('left', 'right');
  CREATE TYPE "public"."enum_stories_site_navigation" AS ENUM('standard', 'minimal');
  CREATE TYPE "public"."enum__stories_v_version_feature_width" AS ENUM('wide', 'full');
  CREATE TYPE "public"."enum__stories_v_version_split_image_side" AS ENUM('left', 'right');
  CREATE TYPE "public"."enum__stories_v_version_site_navigation" AS ENUM('standard', 'minimal');
  ALTER TYPE "public"."enum_stories_presentation" ADD VALUE 'feature' BEFORE 'immersive';
  ALTER TYPE "public"."enum_stories_presentation" ADD VALUE 'split';
  ALTER TYPE "public"."enum__stories_v_version_presentation" ADD VALUE 'feature' BEFORE 'immersive';
  ALTER TYPE "public"."enum__stories_v_version_presentation" ADD VALUE 'split';
  ALTER TABLE "stories" ADD COLUMN "feature_width" "enum_stories_feature_width" DEFAULT 'wide';
  ALTER TABLE "stories" ADD COLUMN "split_image_side" "enum_stories_split_image_side" DEFAULT 'right';
  ALTER TABLE "stories" ADD COLUMN "site_navigation" "enum_stories_site_navigation" DEFAULT 'standard';
  ALTER TABLE "_stories_v" ADD COLUMN "version_feature_width" "enum__stories_v_version_feature_width" DEFAULT 'wide';
  ALTER TABLE "_stories_v" ADD COLUMN "version_split_image_side" "enum__stories_v_version_split_image_side" DEFAULT 'right';
  ALTER TABLE "_stories_v" ADD COLUMN "version_site_navigation" "enum__stories_v_version_site_navigation" DEFAULT 'standard';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ALTER COLUMN "presentation" SET DATA TYPE text;
  ALTER TABLE "stories" ALTER COLUMN "presentation" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum_stories_presentation";
  CREATE TYPE "public"."enum_stories_presentation" AS ENUM('standard', 'immersive');
  ALTER TABLE "stories" ALTER COLUMN "presentation" SET DEFAULT 'standard'::"public"."enum_stories_presentation";
  ALTER TABLE "stories" ALTER COLUMN "presentation" SET DATA TYPE "public"."enum_stories_presentation" USING "presentation"::"public"."enum_stories_presentation";
  ALTER TABLE "_stories_v" ALTER COLUMN "version_presentation" SET DATA TYPE text;
  ALTER TABLE "_stories_v" ALTER COLUMN "version_presentation" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum__stories_v_version_presentation";
  CREATE TYPE "public"."enum__stories_v_version_presentation" AS ENUM('standard', 'immersive');
  ALTER TABLE "_stories_v" ALTER COLUMN "version_presentation" SET DEFAULT 'standard'::"public"."enum__stories_v_version_presentation";
  ALTER TABLE "_stories_v" ALTER COLUMN "version_presentation" SET DATA TYPE "public"."enum__stories_v_version_presentation" USING "version_presentation"::"public"."enum__stories_v_version_presentation";
  ALTER TABLE "stories" DROP COLUMN "feature_width";
  ALTER TABLE "stories" DROP COLUMN "split_image_side";
  ALTER TABLE "stories" DROP COLUMN "site_navigation";
  ALTER TABLE "_stories_v" DROP COLUMN "version_feature_width";
  ALTER TABLE "_stories_v" DROP COLUMN "version_split_image_side";
  ALTER TABLE "_stories_v" DROP COLUMN "version_site_navigation";
  DROP TYPE "public"."enum_stories_feature_width";
  DROP TYPE "public"."enum_stories_split_image_side";
  DROP TYPE "public"."enum_stories_site_navigation";
  DROP TYPE "public"."enum__stories_v_version_feature_width";
  DROP TYPE "public"."enum__stories_v_version_split_image_side";
  DROP TYPE "public"."enum__stories_v_version_site_navigation";`)
}
