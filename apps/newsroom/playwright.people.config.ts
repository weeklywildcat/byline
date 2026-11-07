import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  outputDir: "/private/tmp/byline-people-playwright-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    baseURL: "http://localhost:3012",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run seed:people:browser && next dev --port 3012",
    cwd: import.meta.dirname,
    url: "http://localhost:3012/admin/login",
    reuseExistingServer: process.env.BYLINE_PEOPLE_BROWSER_REUSE === "1",
    timeout: 120_000,
    env: {
      PAYLOAD_SECRET: "people-browser-fixture-secret-0123456789",
      DATABASE_URL:
        "postgres://localhost:5432/byline_newsroom_test_people_browser",
      BYLINE_DB_PUSH: "1",
      BYLINE_NEWSROOM_URL: "http://localhost:3012",
      BYLINE_MEDIA_LOCAL_DIR: "/private/tmp/byline-people-browser-media",
      NEXT_TELEMETRY_DISABLED: "1",
      BYLINE_GOOGLE_CLIENT_ID: "",
    },
  },
});
