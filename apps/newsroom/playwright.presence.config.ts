import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const database = new URL(process.env.BYLINE_PRESENCE_BROWSER_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_presence_browser");
if (!/^\/byline_newsroom_test_presence_browser[a-z0-9_]*$/.test(database.pathname)) {
  throw new Error("Presence browser tests require a disposable byline_newsroom_test_presence_browser database.");
}
const url = "http://localhost:3027";

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "presence.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1366, height: 900 },
    channel: process.env.BYLINE_PLAYWRIGHT_CHANNEL || undefined,
    baseURL: url,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node --import tsx scripts/seed-presence-browser.ts && next dev --port 3027",
    cwd: import.meta.dirname,
    url: `${url}/admin/login`,
    timeout: 120_000,
    env: {
      DATABASE_URL: database.toString(),
      PAYLOAD_SECRET: "presence-browser-fixture-secret-0123456789",
      BYLINE_DB_PUSH: "0",
      BYLINE_NEWSROOM_URL: url,
      BYLINE_GOOGLE_CLIENT_ID: "",
      BYLINE_MEDIA_LOCAL_DIR: join(tmpdir(), "byline-presence-browser-media"),
      BYLINE_PUBLICATION_MEDIA_DIR: join(tmpdir(), "byline-presence-browser-publication"),
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
});
