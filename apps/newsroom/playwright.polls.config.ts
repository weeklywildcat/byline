import { defineConfig, devices } from "@playwright/test";

/**
 * Wildcat Polls end to end (docs/wildcat-polls.md#tests), against a throwaway
 * database seeded by scripts/seed-polls-browser.ts.
 *
 *   npm run test:polls:browser --workspace @byline/newsroom
 *
 * - studio-chromium: the whole workflow on a laptop (Poll Studio, pairing,
 *   an anonymous "iPad" context, results), plus Build's keyboard sorting and
 *   the narrow section drawer.
 * - ipad-landscape / ipad-portrait: real WebKit with iPad touch emulation:
 *   pairing at /poll, the locked kiosk, interviewer screen and respondent
 *   screens, touch targets, keyboard and reduced motion.
 * - phone-public: a public web link on a narrow WebKit phone.
 *
 * Chromium uses PLAYWRIGHT_CHROMIUM_CHANNEL (e.g. `chrome`) when set; WebKit
 * needs `npx playwright install webkit` once. It starts its own dev server on
 * port 3093 unless BYLINE_POLLS_BROWSER_REUSE=1; stop any other dev server
 * using this checkout's .next first.
 */
export default defineConfig({
  testDir: "tests/browser",
  outputDir: "/private/tmp/byline-polls-playwright-results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: "http://localhost:3093",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "studio-chromium",
      testMatch: "polls.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL }
    },
    {
      name: "ipad-landscape",
      testMatch: "polls-devices.spec.ts",
      grep: /@ipad/,
      use: { ...devices["iPad Pro 11 landscape"] }
    },
    {
      name: "ipad-portrait",
      testMatch: "polls-devices.spec.ts",
      grep: /@ipad/,
      use: { ...devices["iPad Pro 11"] }
    },
    {
      name: "phone-public",
      testMatch: "polls-devices.spec.ts",
      grep: /@phone/,
      use: { ...devices["iPhone 15"] }
    }
  ],
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
