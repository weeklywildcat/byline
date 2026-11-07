import { expect, test, type Page } from "@playwright/test";

const staff = "staff@weeklywildcat.com";
const password = "byline-browser-password";
const configured = process.env.BYLINE_LOGIN_GOOGLE_DISABLED !== "1";

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
