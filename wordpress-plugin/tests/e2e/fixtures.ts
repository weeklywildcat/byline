import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

const adminUser = process.env.WP_ADMIN_USER ?? "admin";
const adminPassword = process.env.WP_ADMIN_PASSWORD ?? "password";

export async function assertWordPressEnvironment(request: APIRequestContext): Promise<void> {
  try {
    const response = await request.get("/wp-login.php", { timeout: 10_000 });
    if (!response.ok()) {
      throw new Error(`WordPress returned HTTP ${response.status()}.`);
    }
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      `WordPress E2E environment is unavailable at ${process.env.WP_BASE_URL ?? "http://localhost:8888"}.${detail} Start it with 'npm run env:start' from wordpress-plugin/.`
    );
  }
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/wp-login.php", { waitUntil: "domcontentloaded" });

  const loginField = page.locator("#user_login");
  if (await loginField.isVisible().catch(() => false)) {
    await loginField.fill(adminUser);
    await page.fill("#user_pass", adminPassword);
    await page.click("#wp-submit");
  }

  await expect(page.locator("#wpadminbar")).toBeVisible();
}

type Fixtures = {
  adminPage: Page;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page, request }, use) => {
    await assertWordPressEnvironment(request);
    await loginAsAdmin(page);
    await use(page);
  }
});

export { expect };
