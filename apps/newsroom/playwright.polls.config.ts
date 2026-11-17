import { defineConfig, devices } from "@playwright/test";

/**
 * Wildcat Polls end to end (docs/wildcat-polls.md), at iPad landscape size,
 * against a throwaway database seeded by scripts/seed-polls-browser.ts.
 *
 *   npm run test:polls:browser --workspace @byline/newsroom
 *
 * It starts its own dev server on port 3093; stop any other dev server using
 * this checkout's .next first.
 */
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "polls.spec.ts",
  outputDir: "/private/tmp/byline-polls-playwright-results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1180, height: 820 },
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    baseURL: "http://localhost:3093",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run seed:polls:browser && next dev --port 3093",
    cwd: import.meta.dirname,
    url: "http://localhost:3093/admin/login",
    reuseExistingServer: process.env.BYLINE_POLLS_BROWSER_REUSE === "1",
    timeout: 180_000,
    env: {
      PAYLOAD_SECRET: "polls-browser-fixture-secret-0123456789",
      DATABASE_URL: "postgres://localhost:5432/byline_newsroom_test_polls_browser",
      BYLINE_DB_PUSH: "0",
      BYLINE_NEWSROOM_URL: "http://localhost:3093",
      NEXT_TELEMETRY_DISABLED: "1",
      BYLINE_GOOGLE_CLIENT_ID: ""
    }
  }
});
