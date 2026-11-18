import { expect, test, type Page } from "@playwright/test";
import { markWelcomeSeen } from "./helpers";

/**
 * Google Analytics in the newsroom (docs/google-analytics.md), in order, against the seeded fixture and a fake
 * Google: an administrator connects and publishes the setup; an editor reads the Analytics desk (including on a
 * narrow screen); a Story's Performance opens as a focused view without disturbing the Write editor; staff
 * reach neither the desk nor the setup. The accounts are test values for this fixture only.
 */
const ACCOUNTS = {
  admin: { email: "admin@analytics.test", password: "analytics-browser-admin-2026" },
  editor: { email: "editor@analytics.test", password: "analytics-browser-editor-2026" },
  staff: { email: "staff@analytics.test", password: "analytics-browser-staff-2026" }
};
const STORY = "Where the sidewalk stands";
// The seed creates the Stories in this order (scripts/seed-analytics-browser.ts): two published, then a draft.
const PUBLISHED_ID = 1;
const DRAFT_ID = 3;

async function signIn(page: Page, who: keyof typeof ACCOUNTS, next: string) {
  const account = ACCOUNTS[who];
  await page.goto(`/admin/login?redirect=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin") && !url.pathname.endsWith("/login"));
  const login = await page.request.post("/api/users/login", { data: account });
  await markWelcomeSeen(page.request, { Authorization: `JWT ${(await login.json()).token}` });
  await page.goto(next);
}

/**
 * Google's consent screen is answered by the test. A browser can't be intercepted mid-redirect, so Byline's own
 * `connect` response is: the authorization request it built is checked, then the browser is sent straight back to
 * the callback with a code for this nonce (and the round-trip cookie Byline set), as Google would after consent.
 */
async function fakeGoogleConsent(page: Page) {
  await page.route("**/api/byline/analytics/connect", async (route) => {
    // The page's click is a same-origin navigation; a Playwright-side fetch doesn't send that browser-managed header.
    const response = await route.fetch({ maxRedirects: 0, headers: { ...route.request().headers(), "sec-fetch-site": "same-origin" } });
    const url = new URL(response.headers()["location"]!);
    expect(url.hostname).toBe("accounts.google.com");
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("analytics.readonly");
    expect(scope).not.toContain("analytics.edit");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("access_type")).toBe("offline");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", `fake-code.${url.searchParams.get("nonce")}`);
    await route.fulfill({ status: 302, headers: { location: callback.toString(), "set-cookie": response.headers()["set-cookie"]! } });
  });
}

/** `BYLINE_ANALYTICS_SCREENSHOTS=<dir>` saves what each step looks like, for a person to review. */
const shot = async (page: Page, name: string) => { if (process.env.BYLINE_ANALYTICS_SCREENSHOTS) await page.screenshot({ path: `${process.env.BYLINE_ANALYTICS_SCREENSHOTS}/${name}.png` }); };

const noPageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe.serial("Google Analytics", () => {
  test("an administrator connects, chooses a property and stream, picks measurement and publishes it", async ({ page }) => {
    await signIn(page, "admin", "/admin/site?tab=analytics");
    await expect(page.getByText("Connect a GA4 property to see audience and Story performance inside Byline.")).toBeVisible();
    await expect(page.getByText("Read-only access to Google Analytics.")).toBeVisible();
    await expect(page.getByText("No Google password or service-account file is stored.")).toBeVisible();

    await fakeGoogleConsent(page);
    await page.getByRole("link", { name: "Connect Google Analytics" }).click();
    await expect(page).toHaveURL(/\/admin\/site\?tab=analytics/);
    await expect(page.getByText("Connect Google Analytics", { exact: true })).toBeVisible();
    const steps = page.getByRole("list", { name: "Setup steps" });
    for (const step of ["Google account", "Property", "Measurement", "Review"]) await expect(steps).toContainText(step);
    await expect(steps.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");

    // Properties are grouped under their account; a keyboard is enough to choose.
    await expect(page.getByText("Weekly Wildcat", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Someone else")).toBeVisible();
    const property = page.getByRole("radio", { name: "weeklywildcat.com" });
    await property.focus();
    await page.keyboard.press("Space");
    await expect(property).toBeChecked();
    await expect(page.getByText("Analytics uses America/Chicago while Byline uses America/New_York.")).toBeVisible();

    // Two web streams; the one on this site is Recommended, and neither is chosen for you.
    const main = page.getByRole("radio", { name: /Main site/ });
    await expect(main).toContainText("Recommended").catch(() => undefined);
    await expect(page.getByText("Recommended", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /Preview/ })).not.toBeChecked();
    await expect(main).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(page.getByText("G-MAIN12345")).toBeVisible();
    await main.focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Continue" }).click();

    // Measurement: never auto-selected; privacy only appears with Install with Byline.
    await expect(steps.getByRole("listitem").nth(2)).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("radio", { name: "Already installed" })).toBeChecked();
    await expect(page.getByText("Byline reads Analytics but does not change the public site's tracking.")).toBeVisible();
    await expect(page.getByText("Consent and tag behavior are managed outside Byline.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Ask readers first" })).toHaveCount(0);
    await page.getByRole("radio", { name: "Install with Byline" }).check();
    await expect(page.getByRole("radio", { name: /Ask readers first/ })).toBeChecked();
    await expect(page.getByText("Do not load Google Analytics until the reader accepts analytics.")).toBeVisible();
    await expect(page.getByText("Keep all advertising consent states denied.")).toBeVisible();
    await page.getByRole("button", { name: "Review" }).click();

    // Review, then the one explicit public action.
    for (const fact of ["owner@gmail.com", "weeklywildcat.com (10)", "Main site", "G-MAIN12345", "Byline", "Ask readers first"]) await expect(page.getByRole("main")).toContainText(fact);
    await page.getByRole("button", { name: "Save & publish analytics setup" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await shot(page, "01-site-connected");
    await expect(page.getByText("Byline installs the Google tag")).toBeVisible();
    await expect(page.getByText("Ask readers first")).toBeVisible();
    await expect(page.getByText("Saved, not published")).toHaveCount(0);

    await page.getByRole("button", { name: "Check connection" }).click();
    const result = page.getByRole("status").filter({ hasText: "Connected" });
    await expect(result).toContainText("Google access and reporting are working.");
    for (const check of ["Google access", "Property", "Web stream", "Reporting", "Public tag"]) await expect(result).toContainText(check);
    expect(await page.content()).not.toMatch(/SECRET-(REFRESH|ACCESS)/);
  });

  test("an editor reads the Analytics desk: overview, date ranges, realtime and content", async ({ page }) => {
    await signIn(page, "editor", "/admin/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    for (const tab of ["Overview", "Realtime", "Content", "Acquisition", "Audience", "Events"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    await expect(page.locator('[data-sidebar="menu-button"]', { hasText: "Analytics" })).toHaveCount(1);

    // Overview: the numbers, with a comparison that is words, and Top Stories that open Performance.
    const views = page.locator('[data-slot="card"]').filter({ hasText: "Views" }).first();
    await expect(views).toContainText("4,200");
    await expect(views).toContainText("+40%");
    await expect(page.getByText("Average engagement")).toBeVisible();
    await expect(page.getByRole("img", { name: /Views and active users by day/ })).toBeVisible();
    await expect(page.getByText(/views over 7 days/)).toBeVisible();
    await shot(page, "02-overview");
    await expect(page.getByRole("link", { name: STORY })).toHaveAttribute("href", /\/admin\/collections\/stories\/\d+\?view=performance/);

    // A different range asks the server again, and the address keeps it.
    const requested = page.waitForRequest((request) => request.url().includes("/api/byline/analytics/overview") && request.url().includes("preset=28d"));
    await page.getByRole("button", { name: "28 days" }).click();
    await requested;
    await expect(page).toHaveURL(/preset=28d/);
    await page.getByRole("button", { name: "Custom" }).click();
    await expect(page.getByRole("button", { name: "From" })).toBeVisible();
    await page.getByRole("button", { name: "7 days" }).click();

    // Realtime: Google's last 30 minutes, with no date control and no invented sources.
    await page.getByRole("tab", { name: "Realtime" }).click();
    await expect(page).toHaveURL(/tab=realtime/);
    await expect(page.getByText("Readers right now")).toBeVisible();
    await expect(page.getByText("Last 30 minutes").first()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "9" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Date range" })).toHaveCount(0);
    await expect(page.getByText(/traffic sources/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: STORY })).toBeVisible();
    await shot(page, "03-realtime");
    const refreshed = page.waitForRequest((request) => request.url().includes("/api/byline/analytics/realtime") && request.url().includes("refresh=1"));
    await page.getByRole("button", { name: "Refresh Analytics" }).click();
    await refreshed;

    // Content joins Google's rows to Stories; a row opens that Story's Performance.
    await page.getByRole("tab", { name: "Content" }).click();
    await expect(page.getByRole("link", { name: STORY })).toBeVisible();
    await expect(page.getByText("Other pages")).toBeVisible();
    await page.getByLabel("Section").selectOption("news");
    await expect(page).toHaveURL(/section=news/);
    await page.getByRole("link", { name: STORY }).click();
    await expect(page).toHaveURL(/\/admin\/collections\/stories\/\d+\?view=performance/);
    await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
    await expect(page.getByText("Reading now")).toBeVisible();
    await expect(page.getByText("Last 30 minutes").first()).toBeVisible();
    await expect(page.getByText("How readers found this Story")).toBeVisible();
    await expect(page.getByText("Reading", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /View in Analytics/ })).toHaveAttribute("href", /\/admin\/analytics\?tab=content&story=\d+/);
    await expect(page.getByText("1,500").first()).toBeVisible();
    await shot(page, "04-performance");
  });

  test("on a narrow screen the desk condenses instead of scrolling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "editor", "/admin/analytics?tab=content");
    await expect(page.getByRole("list", { name: "Stories" })).toBeVisible();
    await expect(page.locator("table").first()).toBeHidden();
    const row = page.getByRole("list", { name: "Stories" }).getByRole("listitem").first();
    await expect(row).toContainText(STORY);
    await row.locator("summary").click();
    await expect(row).toContainText("Active users");
    await expect(row.getByRole("link", { name: "Open Performance" })).toBeVisible();
    expect(await noPageOverflow(page)).toBe(true);
    await shot(page, "05-content-narrow");
    await page.getByRole("tab", { name: "Acquisition" }).click();
    await expect(page.getByText("How did readers get here?")).toBeVisible();
    expect(await noPageOverflow(page)).toBe(true);
    // Touch-sized controls on a coarse pointer are the shared Button's job (any-pointer-coarse); the toggles are real buttons.
    expect(await page.getByRole("button", { name: "Refresh Analytics" }).boundingBox()).toBeTruthy();
  });

  test("Performance is a focused view of the Story: Back, Back/Forward, and Write stays mounted", async ({ page }) => {
    await signIn(page, "editor", "/admin/analytics");
    const href = await page.getByRole("link", { name: STORY }).first().getAttribute("href");
    const story = href!.split("?")[0]!;
    await page.goto(`${story}?view=write`);
    const headline = page.locator("[data-story-article] textarea[aria-label='Headline']");
    await expect(headline).toBeVisible();
    await headline.fill(`${STORY} (unsaved edit)`);
    await page.getByRole("button", { name: "More story actions" }).click();
    await page.getByRole("menuitem", { name: "Performance" }).click();
    await expect(page).toHaveURL(/\?view=performance/);
    await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
    // No third workspace tab appeared; the Write editor is hidden, not gone.
    await expect(page.getByRole("tab", { name: "Performance" })).toHaveCount(0);
    expect(await headline.count()).toBe(1);
    await page.getByRole("button", { name: "Back to Write" }).click();
    await expect(page).toHaveURL(/\?view=write/);
    await expect(headline).toHaveValue(`${STORY} (unsaved edit)`);
    await page.goBack();
    await expect(page).toHaveURL(/\?view=performance/);
    await expect(page.getByText("Reading now")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\?view=write/);
    await expect(headline).toHaveValue(`${STORY} (unsaved edit)`);
    await headline.fill(STORY);
  });

  test("an unpublished Story says Performance starts after publishing", async ({ page }) => {
    await signIn(page, "editor", "/admin/stories");
    await page.goto(`/admin/collections/stories/${DRAFT_ID}?view=performance`);
    await expect(page.getByText("Performance starts after this Story is published.")).toBeVisible();
  });

  test("staff reach neither the desk nor the setup, but can see their own Story's Performance", async ({ page }) => {
    await signIn(page, "staff", "/admin/analytics");
    await expect(page.getByText("Only editors can use Analytics.")).toBeVisible();
    await expect(page.locator('[data-sidebar="menu-button"]', { hasText: "Analytics" })).toHaveCount(0);
    await expect(page.locator('[data-sidebar="menu-button"]', { hasText: "Stories" }).first()).toBeVisible();
    await page.goto("/admin/site?tab=analytics");
    await expect(page.getByText("Only administrators manage the site.")).toBeVisible();
    // The server, not the screen, refuses: straight API calls with this account's own token.
    const token = (await (await page.request.post("/api/users/login", { data: ACCOUNTS.staff })).json()).token as string;
    for (const path of ["connection", "options", "overview", "realtime", "content", "home"]) expect((await page.request.get(`/api/byline/analytics/${path}`, { headers: { Authorization: `JWT ${token}` } })).status(), path).toBe(403);
    expect((await page.request.get(`/api/byline/stories/${PUBLISHED_ID}/analytics`, { headers: { Authorization: `JWT ${token}` } })).status()).toBe(200);
    await page.goto(`/admin/collections/stories/${PUBLISHED_ID}?view=performance`);
    await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
    await expect(page.getByText("Reading now")).toBeVisible();
  });

  test("disconnecting asks first, revokes and returns to the start", async ({ page }) => {
    await signIn(page, "admin", "/admin/site?tab=analytics");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Disconnect Google Analytics?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("link", { name: "Connect Google Analytics" })).toBeVisible();
  });
});
