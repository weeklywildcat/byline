import { expect, test as base, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

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

  // The admin bar is not guaranteed on every admin screen/theme. The stable
  // login boundary is the authenticated admin document itself, which exposes
  // the REST nonce used by the session fixture.
  await expect.poll(
    () => page.evaluate(() => {
      const body = document.body;
      const pathname = window.location.pathname;
      return !pathname.endsWith("/wp-login.php") && body.classList.contains("wp-admin");
    }),
    { timeout: 20_000, intervals: [100, 250, 500] }
  ).toBe(true);
}

export type AdminRestResult<T = unknown> = { ok: boolean; status: number; payload: T };

export type AdminSession = {
  rest: <T = unknown>(path: string, method?: "GET" | "POST" | "DELETE", data?: unknown) => Promise<AdminRestResult<T>>;
  registerTestPost: (postId: number) => void;
  addCleanup: (callback: () => Promise<void>) => void;
};

async function createAdminSession(page: Page, context: BrowserContext): Promise<{ session: AdminSession; cleanup: () => Promise<void> }> {
  const nonce = await page.evaluate(() => {
    const settings = (window as Window & { wpApiSettings?: { nonce?: string } }).wpApiSettings;
    return settings?.nonce ?? "";
  });
  const baseUrl = process.env.WP_BASE_URL ?? "http://localhost:8888";
  const cleanupCallbacks: Array<() => Promise<void>> = [];
  const postIds = new Set<number>();

  const rest = async <T = unknown>(path: string, method: "GET" | "POST" | "DELETE" = "GET", data?: unknown): Promise<AdminRestResult<T>> => {
    const response = await context.request.fetch(new URL(`/wp-json${path}`, baseUrl).toString(), {
      method,
      headers: {
        "X-WP-Nonce": nonce,
        ...(data !== undefined ? { "Content-Type": "application/json" } : {})
      },
      data: data !== undefined ? JSON.stringify(data) : undefined
    });
    return {
      ok: response.ok(),
      status: response.status(),
      payload: await response.json().catch(() => null) as T
    };
  };

  const registerTestPost = (postId: number) => {
    if (!Number.isSafeInteger(postId) || postId <= 0 || postIds.has(postId)) return;
    postIds.add(postId);
    cleanupCallbacks.push(async () => {
      const result = await rest(`/wp/v2/posts/${postId}?force=true`, "DELETE");
      if (!result.ok && result.status !== 404) {
        throw new Error(`Could not clean up E2E story ${postId}; WordPress returned HTTP ${result.status}.`);
      }
    });
  };

  const session: AdminSession = {
    rest,
    registerTestPost,
    addCleanup: (callback) => cleanupCallbacks.push(callback)
  };
  return {
    session,
    cleanup: async () => {
      const errors: Error[] = [];
      for (const callback of [...cleanupCallbacks].reverse()) {
        try {
          await callback();
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (errors.length) throw new Error(errors.map((error) => error.message).join("\n"));
    }
  };
}

type Fixtures = {
  adminPage: Page;
  adminSession: AdminSession;
  registerTestPost: (postId: number) => void;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page, request }, use) => {
    await assertWordPressEnvironment(request);
    await loginAsAdmin(page);
    await use(page);
  },
  adminSession: async ({ adminPage, context }, use) => {
    const { session, cleanup } = await createAdminSession(adminPage, context);
    try {
      await use(session);
    } finally {
      await cleanup();
    }
  },
  registerTestPost: async ({ adminSession }, use) => {
    await use(adminSession.registerTestPost);
  }
});

export { expect };
