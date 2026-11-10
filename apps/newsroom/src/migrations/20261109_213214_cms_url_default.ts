import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "publication" ALTER COLUMN "urls_cms" SET DEFAULT 'https://byline.weeklywildcat.com';
  ALTER TABLE "_publication_v" ALTER COLUMN "version_urls_cms" SET DEFAULT 'https://byline.weeklywildcat.com';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "publication" ALTER COLUMN "urls_cms" SET DEFAULT 'https://cms.weeklywildcat.com';
  ALTER TABLE "_publication_v" ALTER COLUMN "version_urls_cms" SET DEFAULT 'https://cms.weeklywildcat.com';`)
}
