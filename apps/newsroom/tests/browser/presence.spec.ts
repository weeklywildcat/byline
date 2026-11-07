import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { PRESENCE_TIMING } from "../../src/domain/presence";

const API = "/api/byline/presence";
const STORY = "Greenwood expands its library";
const trigger = (page: Page) => page.getByRole("button", { name: /^Newsroom presence/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Newsroom", exact: true });
const section = (page: Page, name: string) => panel(page).getByRole("region", { name, exact: true });
const row = (parent: ReturnType<typeof panel>, name: string) => parent.getByRole("listitem").filter({ hasText: name });

async function login(page: Page, name: string, origin: string) {
  const response = await page.request.post("/api/users/login", { headers: { Origin: origin }, data: { email: `${name}@example.test`, password: "presence-fixture-password" } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

// Headless Chromium doesn't consistently hide background pages across contexts.
// Drive the browser event deterministically and observe real network writes.
async function visibility(page: Page, state: "visible" | "hidden") {
  const response = page.waitForResponse((response) => response.url().endsWith(API) && response.request().method() === "POST" &&
    response.request().postDataJSON().state === (state === "visible" ? "active" : "away"));
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
  expect((await response).ok()).toBe(true);
}

async function go(page: Page, path: string) {
  const posted = page.waitForResponse((response) => response.url().endsWith(API) && response.request().method() === "POST" && response.request().postDataJSON().state === "active");
  await page.goto(path);
  const response = await posted;
  expect(response.ok(), await response.text()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
}

test("Presence follows two browser accounts through locations, tab transitions, and guarded links", async ({ browser, baseURL }, info) => {
  const [first, second] = await Promise.all([
    browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } }),
    browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
  ]);
  try {
    const [maya, alex] = await Promise.all([first.newPage(), second.newPage()]);
    expect((await alex.request.get(API)).status()).toBe(401);
    await Promise.all([login(maya, "maya", baseURL!), login(alex, "alex", baseURL!)]);
    const records = async (path: string) => {
      const response = await alex.request.get(path, { headers: { Origin: baseURL! } });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()).docs;
    };
    const story = (await records("/api/stories?draft=true&depth=0")).find(({ headline }: { headline: string }) => headline === STORY);
    const collection = (await records("/api/collections?depth=0")).find(({ name }: { name: string }) => name === "City Hall reporting");
    const storyPath = `/admin/collections/stories/${story.id}`;
    const collectionPath = `/admin/collections?collection=${collection.id}`;

    await go(maya, "/admin/media");
    const firstId = await maya.evaluate(() => sessionStorage.getItem("byline:presence-session"));
    await go(alex, "/admin/stories");
    await expect(trigger(alex)).toHaveAccessibleName("Newsroom presence, 1 other person active");
    await trigger(alex).focus();
    await alex.keyboard.press("Enter");
    await expect(panel(alex)).toBeVisible();
    await expect(row(section(alex, "Around the newsroom"), "Maya Torres")).toContainText("Media");
    await expect(row(panel(alex), "Maya Torres").locator("img")).toBeVisible();
    await expect(row(panel(alex), "Maya Torres").locator("img")).toHaveJSProperty("complete", true);
    await expect(panel(alex).getByText("Jordan Lee")).toHaveCount(0);
    const offline = panel(alex).getByRole("button", { name: "1 offline" });
    await expect(row(panel(alex), "Maya Torres").getByRole("link", { name: "Media" })).toBeFocused();
    await alex.keyboard.press("Tab");
    await expect(offline).toBeFocused();
    await alex.keyboard.press("Space");
    await expect(row(panel(alex), "Jordan Lee")).toContainText("Not seen yet");
    await alex.keyboard.press("Space");
    await expect(row(panel(alex), "Jordan Lee")).not.toBeVisible();
    await alex.keyboard.press("Escape");
    await expect(panel(alex)).not.toBeVisible();
    await expect(trigger(alex)).toBeFocused();

    await go(maya, storyPath);
    expect(await maya.evaluate(() => sessionStorage.getItem("byline:presence-session"))).toBe(firstId);
    await visibility(alex, "visible");
    await trigger(alex).click();
    await expect(row(section(alex, "Around the newsroom"), "Maya Torres").getByRole("link", { name: STORY })).toBeVisible();
    await row(panel(alex), "Maya Torres").getByRole("link", { name: STORY }).click();
    await expect(alex).toHaveURL(new RegExp(`${storyPath}$`));
    await expect(panel(alex)).not.toBeVisible();
    await trigger(alex).click();
    await expect(row(section(alex, "Here"), "Maya Torres")).toContainText("Here with you");

    await visibility(maya, "hidden");
    await visibility(alex, "visible");
    await expect(row(section(alex, "Away"), "Maya Torres")).toContainText("Just now");
    await expect(trigger(alex)).toHaveAccessibleName("Newsroom presence, 0 other people active");
    await visibility(maya, "visible");
    await visibility(alex, "visible");
    await expect(row(section(alex, "Here"), "Maya Torres")).toBeVisible();

    // Model browser tab duplication by starting a new page with copied sessionStorage.
    const duplicate = await first.newPage();
    await duplicate.addInitScript((id) => sessionStorage.setItem("byline:presence-session", id!), firstId);
    await go(duplicate, "/admin/media");
    expect(await duplicate.evaluate(() => sessionStorage.getItem("byline:presence-session"))).not.toBe(firstId);
    await visibility(duplicate, "hidden");
    await visibility(alex, "visible");
    await expect(row(section(alex, "Here"), "Maya Torres")).toBeVisible();
    await duplicate.close();

    // The foreground tab stays active while reading, goes away at idle, and
    // a real keypress returns it to active without waiting for the next tick.
    await maya.clock.install();
    await visibility(maya, "visible");
    await maya.clock.fastForward(90_000);
    await visibility(alex, "visible");
    await expect(row(section(alex, "Here"), "Maya Torres")).toBeVisible();
    const idle = maya.waitForResponse((response) => response.url().endsWith(API) && response.request().method() === "POST" && response.request().postDataJSON().state === "away");
    await maya.clock.fastForward(PRESENCE_TIMING.idle);
    expect((await idle).ok()).toBe(true);
    await visibility(alex, "visible");
    await expect(row(section(alex, "Away"), "Maya Torres")).toBeVisible();
    const woke = maya.waitForResponse((response) => response.url().endsWith(API) && response.request().method() === "POST" && response.request().postDataJSON().state === "active");
    await maya.keyboard.press("Shift");
    expect((await woke).ok()).toBe(true);

    // Navigate away from an explicit-save Collection with the actual shell guard.
    await go(alex, collectionPath);
    await alex.getByRole("button", { name: "Add brief", exact: true }).click();
    await alex.getByRole("textbox", { name: "Reporting brief and key angles" }).fill("Unsaved field notes.");
    await trigger(alex).click();
    await row(panel(alex), "Maya Torres").getByRole("link", { name: STORY }).click();
    const guard = alex.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Stay", exact: true }).click();
    await expect(alex.getByRole("textbox", { name: "Reporting brief and key angles" })).toHaveValue("Unsaved field notes.");
    await trigger(alex).click();
    await row(panel(alex), "Maya Torres").getByRole("link", { name: STORY }).click();
    await guard.getByRole("button", { name: "Leave anyway" }).click();
    await expect(alex).toHaveURL(new RegExp(`${storyPath}$`));

    await go(alex, "/admin/media");
    for (const width of [390, 820, 1180, 1366, 1440]) {
      await alex.setViewportSize({ width, height: 900 });
      await expect.poll(() => trigger(alex).evaluate((button) => {
        const header = button.closest("header")!;
        return header.scrollWidth <= header.clientWidth + 1 && button.getBoundingClientRect().right <= window.innerWidth;
      }), { message: `Presence fits in the header at ${width}px` }).toBe(true);
      await trigger(alex).click();
      const mobile = width === 390;
      await expect(panel(alex)).toHaveAttribute("data-slot", mobile ? "sheet-content" : "popover-content");
      await expect(panel(alex)).toContainText("1 active · 0 away");
      await expect(row(panel(alex), "Maya Torres")).toBeVisible();
      if (mobile || width === 1440) await alex.screenshot({
        path: info.outputPath(`presence-${width}.png`), animations: "disabled", style: "nextjs-portal { display: none !important }"
      });
      if (mobile) await panel(alex).getByRole("button", { name: "Close newsroom presence" }).click();
      else await alex.keyboard.press("Escape");
      await expect(panel(alex)).not.toBeVisible();
      await expect(trigger(alex)).toBeFocused();
    }

    // Degrade gracefully while retaining the last successful snapshot.
    await alex.route(`**${API}`, (route) => route.fulfill({ status: 503 }));
    await alex.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await trigger(alex).click();
    await expect(panel(alex).getByText("Couldn’t refresh presence.")).toBeVisible();
    await expect(row(panel(alex), "Maya Torres")).toBeVisible();
    await alex.unroute(`**${API}`);
    await panel(alex).getByRole("button", { name: "Retry" }).click();
    await expect(panel(alex).getByText("Couldn’t refresh presence.")).toHaveCount(0);

    await visibility(maya, "hidden");
    await maya.close();
    const db = new pg.Client({ connectionString: process.env.BYLINE_PRESENCE_BROWSER_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_presence_browser" });
    await db.connect();
    try {
      await db.query(
        "UPDATE byline_presence_sessions SET last_seen = $1, last_active = $1 WHERE user_id = (SELECT id FROM users WHERE email = $2)",
        [new Date(Date.now() - PRESENCE_TIMING.recent - 1000), "maya@example.test"]
      );
    } finally {
      await db.end();
    }
    await visibility(alex, "visible");
    await expect(panel(alex).getByText("No one else is active in Byline right now.")).toBeVisible();
    await panel(alex).getByRole("button", { name: "2 offline" }).click();
    await expect(row(panel(alex), "Maya Torres")).toContainText("5 min ago");
    await expect(row(panel(alex), "Maya Torres").getByRole("link")).toHaveCount(0);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
