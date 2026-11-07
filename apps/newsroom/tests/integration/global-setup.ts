import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

/**
 * Fresh, throwaway databases per run, one per integration test file, so no
 * file depends on another's records. Point BYLINE_TEST_DATABASE_URL at any
 * PostgreSQL the current user can create databases on; databases named after
 * it are dropped and recreated. Never point it at real data.
 */
export const TEST_DATABASE_SUFFIXES = ["", "_screens", "_planning", "_schedule", "_publication", "_media", "_collections", "_people", "_publication_media", "_migration", "_snapshot", "_presence", "_story_body", "_health"] as const;

export default async function setup() {
  const url = new URL(process.env.BYLINE_TEST_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test");
  const name = url.pathname.slice(1);
  if (!/^byline_newsroom_test[a-z0-9_]*$/.test(name)) throw new Error(`Refusing to reset "${name}": the test database name must start with byline_newsroom_test.`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  for (const suffix of TEST_DATABASE_SUFFIXES) {
    await client.query(`DROP DATABASE IF EXISTS "${name}${suffix}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}${suffix}"`);
  }
  await client.end();
  process.env.DATABASE_URL = url.toString();
  process.env.PAYLOAD_SECRET = "byline-integration-test-secret-not-for-production-0123456789";
  process.env.BYLINE_DB_PUSH = "1";
  process.env.BYLINE_NEWSROOM_URL = "http://localhost:3010";
    // Uploaded test files go to a throwaway directory, never the development media folder.
  const media = mkdtempSync(path.join(tmpdir(), "byline-newsroom-media-"));
  process.env.BYLINE_MEDIA_LOCAL_DIR = media;
  // Prepared publication files: a second, separate throwaway store.
  const publication = mkdtempSync(path.join(tmpdir(), "byline-newsroom-publication-"));
  process.env.BYLINE_PUBLICATION_MEDIA_DIR = publication;
  delete process.env.BYLINE_BUILD_TOKEN;
  delete process.env.BYLINE_GOOGLE_CLIENT_ID;
  return () => {
    rmSync(media, { recursive: true, force: true });
    rmSync(publication, { recursive: true, force: true });
  };
}
