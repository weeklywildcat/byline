import pg from "pg";

/**
 * A fresh, throwaway database per run. Point BYLINE_TEST_DATABASE_URL at any
 * PostgreSQL the current user can create databases on; the database named in
 * it is dropped and recreated. Never point it at real data.
 */
export default async function setup() {
  const url = new URL(process.env.BYLINE_TEST_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test");
  const name = url.pathname.slice(1);
  if (!/^byline_newsroom_test[a-z0-9_]*$/.test(name)) throw new Error(`Refusing to reset "${name}": the test database name must start with byline_newsroom_test.`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
  process.env.DATABASE_URL = url.toString();
  process.env.PAYLOAD_SECRET = "byline-integration-test-secret-not-for-production-0123456789";
  process.env.BYLINE_DB_PUSH = "1";
  process.env.BYLINE_NEWSROOM_URL = "http://localhost:3010";
  delete process.env.BYLINE_MEDIA_PRIVATE_BUCKET;
  delete process.env.BYLINE_GOOGLE_CLIENT_ID;
}
