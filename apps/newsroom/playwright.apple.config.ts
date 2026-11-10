import { defineConfig, devices } from "@playwright/test";

/**
 * Apple-platform regression coverage: WebKit at the sizes and inputs Apple devices use.
 * This is regression coverage, NOT proof of iOS Safari: WebKit in Playwright has no
 * software keyboard, safe-area insets, Dynamic Island, Apple Pencil or Home Screen mode.
 * Those are checked by hand (docs/apple-platforms.md).
 *
 * Projects (smaller than the Chromium suite on purpose; they cover the critical surfaces):
 *   webkit-desktop       Desktop Safari, mouse + keyboard
 *   webkit-iphone        iPhone, portrait (below the 768px bottom-navigation breakpoint)
 *   webkit-ipad-portrait iPad Pro 11, portrait, touch (tablet navigation, never a phone)
 *   webkit-ipad-wide     iPad Pro 11, landscape, touch (wide Story workspace)
 *
 *   npx playwright install webkit
 *   npm run test:apple:browser --workspace @byline/newsroom
 *
 * Starts its own newsroom on port 3061 against BYLINE_APPLE_DATABASE_URL (a throwaway
 * byline_newsroom_* database; accounts come from apps/newsroom/.env, created by
 * tests/fixtures/seed-browser-accounts.ts). Set BYLINE_EDITOR_E2E_URL to use a running server instead.
 */
const origin = process.env.BYLINE_EDITOR_E2E_URL ?? "http://localhost:3061";

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "apple-platform.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: origin, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
    { name: "webkit-ipad-portrait", use: { ...devices["iPad Pro 11"] } },
    { name: "webkit-ipad-wide", use: { ...devices["iPad Pro 11 landscape"] } }
  ],
  webServer: process.env.BYLINE_EDITOR_E2E_URL
    ? undefined
    : {
        command: "next dev --port 3061",
        url: `${origin}/admin/login`,
        reuseExistingServer: true,
        timeout: 240_000,
        env: { NEXT_TELEMETRY_DISABLED: "1", ...(process.env.BYLINE_APPLE_DATABASE_URL ? { DATABASE_URL: process.env.BYLINE_APPLE_DATABASE_URL } : {}) }
      }
});
