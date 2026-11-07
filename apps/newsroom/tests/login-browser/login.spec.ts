import { expect, test, type Page } from "@playwright/test";
import { sign } from "node:crypto";

const staff = "staff@weeklywildcat.com";
const buttonAccount = "other@weeklywildcat.com";
const password = "byline-browser-password";
const configured = process.env.BYLINE_LOGIN_GOOGLE_DISABLED !== "1";
const googleScript = "https://accounts.google.com/gsi/client";
const buttonChallenge = "/api/byline/auth/google/button";

test.beforeEach(async ({ page }) => {
  // Keep the redirect tests deterministic and off Google's real services.
  await page.route(googleScript, route => route.abort());
});

async function googleButton(page: Page, wrongNonce = false) {
  await page.unroute(googleScript);
  await page.route(googleScript, route => route.fulfill({
    contentType: "application/javascript",
    body: `
      let options;
      window.google = { accounts: { id: {
        initialize(value) { options = value; },
        renderButton(host, appearance) {
          if (options.ux_mode !== "popup" || !options.use_fedcm_for_button || appearance.size !== "large" ||
              appearance.type !== "standard" || appearance.width < 200) throw Error("Not personalizable");
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Continue as Staff";
          button.addEventListener("click", () => options.callback({ credential: window.bylineTestCredential }));
          host.append(button);
        }
      } } };
    `,
  }));
  const response = page.waitForResponse(res => new URL(res.url()).pathname === buttonChallenge);
  await page.goto("/admin/login?redirect=%2Fadmin%2Fstories");
  const { nonce, state } = await (await response).json();
  expect(nonce).toMatch(/^[\w-]{43}$/);
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", kid: "byline-playwright-key" });
  const claims = b64({
    iss: "https://accounts.google.com", aud: "byline-test.apps.googleusercontent.com",
    exp: now + 120, iat: now, hd: "weeklywildcat.com", email_verified: true,
    email: buttonAccount, sub: "button-subject", nonce: wrongNonce ? "other-browser" : nonce,
  });
  const jwt = `${header}.${claims}`;
  const credential = `${jwt}.${sign("sha256", Buffer.from(jwt), process.env.BYLINE_LOGIN_TEST_SIGNING_KEY!).toString("base64url")}`;
  await page.evaluate(credential => Object.assign(window, { bylineTestCredential: credential }), credential);
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue as Staff" }).click();
  return { state, credential };
}

async function signIn(page: Page, email: string, value: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function currentAccount(page: Page) {
  return page.evaluate(async () => (await (await fetch("/api/users/me")).json()).user);
}

async function signOut(page: Page) {
  expect(await page.evaluate(async () => (await fetch("/api/users/logout", { method: "POST" })).status)).toBe(200);
}

async function google(page: Page, mode: string) {
  await page.route(url => url.pathname === "/api/byline/auth/google", async route => {
    // Playwright only routes the first request of a redirect chain. Run the real
    // start endpoint, then simulate the provider's return instead of leaving localhost.
    const start = await route.fetch({ maxRedirects: 0 });
    expect(start.status()).toBe(303);
    const provider = new URL(start.headers().location);
    expect(provider.origin + provider.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const auth = provider.searchParams;
    expect(auth.get("scope")).toBe("openid email profile");
    expect(auth.get("hd")).toBe("weeklywildcat.com");
    expect(auth.get("response_type")).toBe("code");
    expect(auth.get("code_challenge_method")).toBe("S256");
    expect(auth.get("client_secret")).toBeNull();
    const nonce = auth.get("nonce");
    const challenge = auth.get("code_challenge");
    expect(nonce).toMatch(/^[\w-]{43}$/);
    expect(challenge).toMatch(/^[\w-]{43}$/);
    const callback = new URL(auth.get("redirect_uri")!);
    callback.searchParams.set("state", mode === "state" ? "0".repeat(43) : auth.get("state")!);
    callback.searchParams.set("code", Buffer.from(JSON.stringify({ nonce, challenge, mode })).toString("base64url"));
    await route.fulfill({ response: start, headers: { ...start.headers(), location: callback.href } });
  }, { times: 1 });
  await page.getByRole("link", { name: "Continue with Google" }).click();
}

test.describe("Google configured", () => {
  test.skip(!configured);

  test("Google's button creates a native session and consumes the browser challenge", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    const credential = await googleButton(page);
    await expect(page).toHaveURL(/\/admin\/stories$/);
    expect(await currentAccount(page)).toMatchObject({ email: buttonAccount, role: "staff" });
    expect((await page.context().cookies()).some(cookie => cookie.name === "byline-google-button")).toBe(false);
    await signOut(page);
    const replay = await page.evaluate(async credential => (await fetch("/api/byline/auth/google/button/credential", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credential),
    })).status, credential);
    expect(replay).toBe(401);
  });

  test("rejects a signed button credential from a different browser challenge", async ({ page }) => {
    await googleButton(page, true);
    await expect(page.getByRole("alert").filter({ hasText: "Google sign-in didn’t complete" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    expect(await currentAccount(page)).toBeNull();
  });

  test("does not issue or redeem button challenges for another origin", async ({ request }) => {
    for (const path of [buttonChallenge, `${buttonChallenge}/credential`]) {
      const result = await request.post(path, { headers: { Origin: "https://example.test" }, data: {} });
      expect(result.status()).toBe(403);
    }
  });

  for (const width of [375, 390, 820, 1366]) {
    test(`shows Google first and keeps keyboard access to passwords at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/admin/login");
      await expect(page.getByRole("img", { name: "Weekly Wildcat" })).toBeVisible();
      const primary = page.getByRole("link", { name: "Continue with Google" });
      const toggle = page.getByRole("button", { name: "Use email and password" });
      await expect(primary).toBeVisible();
      await expect(page.getByText("Use your @weeklywildcat.com account.")).toBeVisible();
      const email = page.getByLabel("Email", { exact: true });
      await expect(email).toBeHidden();
      expect((await primary.boundingBox())!.y).toBeLessThan((await toggle.boundingBox())!.y);
      await page.keyboard.press("Tab");
      await expect(primary).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(email).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Ask a newsroom administrator", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }

  test("keeps password controls on errors and signs an invited staff account in", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByRole("button", { name: "Use email and password" }).click();
    await signIn(page, staff, "wrong-password");
    await expect(page.getByRole("form", { name: "Email and password" }).getByRole("alert")).toContainText("Couldn’t sign in");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await signIn(page, staff, password);
    await expect(page).toHaveURL(/\/admin$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff, role: "staff" });
  });

  test("rejects a disabled password account", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByRole("button", { name: "Use email and password" }).click();
    await signIn(page, "disabled@weeklywildcat.com", password);
    await expect(page.getByRole("form", { name: "Email and password" }).getByRole("alert")).toContainText("Couldn’t sign in");
    expect(await currentAccount(page)).toBeNull();
  });

  test("an OAuth client configuration error leaves password sign-in usable", async ({ page }) => {
    await page.goto("/admin/login");
    await google(page, "invalid-client");
    await expect(page.getByText("Google sign-in didn’t complete.", { exact: false })).toBeVisible();
    await signIn(page, staff, password);
    await expect(page).toHaveURL(/\/admin$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff });
  });

  test("binds verified email, keeps the same subject bound and uses a normal revocable session", async ({ page }) => {
    await page.goto("/admin/login?redirect=https%3A%2F%2Fexample.test");
    await google(page, "verified");
    await expect(page).toHaveURL(/\/admin$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff, role: "staff" });
    const cookie = (await page.context().cookies()).find(c => c.name === "payload-token");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff });
    await signOut(page);
    expect(await currentAccount(page)).toBeNull();
    // Restoring the old cookie cannot restore a logged-out session.
    await page.context().addCookies([cookie!]);
    expect(await currentAccount(page)).toBeNull();
    await page.context().clearCookies();

    await page.goto("/admin/login?redirect=%2Fadmin%2Fstories");
    await google(page, "bound");
    await expect(page).toHaveURL(/\/admin\/stories$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff });

    await signOut(page);
    await page.goto("/admin/login");
    await google(page, "takeover");
    await expect(page.getByText("Google sign-in didn’t complete.", { exact: false })).toBeVisible();
    expect(await currentAccount(page)).toBeNull();
  });

  for (const mode of ["unknown", "disabled", "domain", "unverified", "signature", "expired", "audience", "issuer", "state", "nonce", "malformed-subject"]) {
    test(`rejects Google sign-in: ${mode}`, async ({ page }) => {
      await page.goto("/admin/login");
      await google(page, mode);
      const error = page.getByRole("alert").filter({ hasText: "Google sign-in didn’t complete" });
      await expect(error).toBeVisible();
      await expect(error).toBeFocused();
      await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
      expect(await currentAccount(page)).toBeNull();
    });
  }

  test("renders the attributed photo without sending either key to the browser", async ({ page }) => {
    await page.route("https://images.unsplash.com/**", route => route.fulfill({
      contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1400"/>',
    }));
    await expect(async () => {
      await page.goto("/admin/login");
      await expect(page.getByRole("link", { name: "Test Photographer" })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Test Photographer" })).toHaveAttribute(
      "href", "https://unsplash.com/@fixture?utm_source=weekly_wildcat_cms&utm_medium=referral",
    );
    await expect(page.getByRole("link", { name: "Unsplash" })).toHaveAttribute(
      "href", "https://unsplash.com/photos/fixture?utm_source=weekly_wildcat_cms&utm_medium=referral",
    );
    expect(await page.content()).not.toMatch(/fixture-unsplash-private-key|fixture-google-secret/);
  });
});

test.describe("Google absent and Unsplash unavailable", () => {
  test.skip(configured);

  test("staff can sign in with a password after the photo API fails", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Unsplash" })).toHaveCount(0);
    expect(await page.content()).not.toContain("fixture-unsplash-private-key");
    await signIn(page, staff, password);
    await expect(page).toHaveURL(/\/admin$/);
    expect(await currentAccount(page)).toMatchObject({ email: staff });
  });

  test("a Google start request without usable configuration still offers password sign-in", async ({ page }) => {
    await page.goto("/api/byline/auth/google?returnTo=//example.test");
    await expect(page.getByText("Google sign-in didn’t complete.", { exact: false })).toBeVisible();
    await signIn(page, staff, password);
    await expect(page).toHaveURL(/\/admin$/);
  });
});
