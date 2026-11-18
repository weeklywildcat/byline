import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.BYLINE_BROWSER_PORT || 4173);
const baseURL = "http://127.0.0.1:" + port;

// Story-embed specs need the offline-snapshot fixture build (`npm run build:data-embed-fixture`), not the browser fixture.
const dataEmbedBuild = process.env.BYLINE_BROWSER_FIXTURE === "data-embed";
// Google Analytics specs need the fixture built with Byline-managed measurement (`npm run build:analytics-fixture`).
const analyticsBuild = process.env.BYLINE_BROWSER_FIXTURE === "analytics";

export default defineConfig({
  testDir: path.resolve(__dirname, "tests/browser"),
  ...(dataEmbedBuild ? { testMatch: /data-embeds\.spec\.ts$/ } : analyticsBuild ? { testMatch: /analytics\.spec\.ts$/ } : { testIgnore: [/data-embeds\.spec\.ts$/, /analytics\.spec\.ts$/] }),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    // The site sets `html { scrollbar-gutter: stable }`. Headless Linux Chromium hides the bar but still reserves a
    // 15px gutter for it, so every viewport-width assertion (an edge-to-edge photo, a full-width opening) would be
    // 15px short there while passing on macOS and on phones, which use overlay scrollbars. Overlay scrollbars make
    // all three agree. Specs that need a drawn classic scrollbar style `::-webkit-scrollbar`, which is never overlay.
    launchOptions: { args: ["--enable-features=CDPScreenshotNewSurface,OverlayScrollbar"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.BYLINE_BROWSER_VIDEO === "0" ? "off" : "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: "node scripts/serve-static.mjs",
    cwd: path.resolve(__dirname),
    url: baseURL + "/",
    // The test must exercise the output produced by the preceding fixture
    // build. Reusing an arbitrary process already listening on this port can
    // silently serve a different directory or an older build.
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
