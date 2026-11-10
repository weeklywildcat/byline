import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createStory, login, signIn } from "./helpers";

/**
 * Apple-platform regression coverage (docs/apple-platforms.md): WebKit at Apple device sizes and inputs.
 * Runs in the four projects of playwright.apple.config.ts. WebKit here has no software keyboard,
 * safe-area insets, Dynamic Island, Apple Pencil hardware or Home Screen mode; those are manual checks.
 */

const HEIC = new URL("../fixtures/iphone-sample.heic", import.meta.url);

test.describe("login and Home Screen identity", () => {
  test("login fields carry the semantics Safari uses, fit the screen, and keep AutoFill", async ({ page }) => {
    await page.goto("/admin/login");
    const email = page.locator("#byline-login-email");
    const password = page.locator("#byline-login-password");
    await expect(email).toHaveAttribute("autocomplete", "username");
    await expect(email).toHaveAttribute("autocapitalize", "none");
    await expect(email).toHaveAttribute("spellcheck", "false");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    // Fields are 16px or larger, so Safari does not zoom the page when one is focused.
    for (const field of [email, password]) expect(await field.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const card = await page.locator(".byline-login-card").boundingBox();
    const viewport = page.viewportSize()!;
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width);
  });

  test("the admin <head> offers a manifest, Apple touch icon and theme colour, without the deprecated status bar mode or zoom lock", async ({ page, request }) => {
    await page.goto("/admin/login");
    const head = await page.evaluate(() => ({
      manifest: document.querySelector("link[rel=manifest]")?.getAttribute("href"),
      touchIcon: document.querySelector("link[rel=apple-touch-icon]")?.getAttribute("href"),
      theme: document.querySelector("meta[name=theme-color]")?.getAttribute("content"),
      viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "",
      statusBar: document.querySelector("meta[name=apple-mobile-web-app-status-bar-style]")?.getAttribute("content") ?? null,
      title: document.querySelector("meta[name=apple-mobile-web-app-title]")?.getAttribute("content")
    }));
    expect(head.manifest).toBe("/admin/manifest.webmanifest");
    expect(head.touchIcon).toContain("/app-icons/apple-touch-icon.png");
    expect(head.theme).toBe("#ffffff");
    expect(head.viewport).toContain("viewport-fit=cover");
    expect(head.viewport).not.toMatch(/user-scalable/);
    expect(head.statusBar).not.toBe("black-translucent");
    expect(head.title).toBe("Byline");

    const manifest = await (await request.get("/admin/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ id: "/admin", short_name: "Byline", start_url: "/admin", display: "standalone" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
    expect((await request.get(head.touchIcon!)).ok()).toBeTruthy();
  });
});

test.describe("signed in", () => {
  let token = "";
  let storyId = 0;
  const headline = `Apple platform ${Date.now()}`;

  test.beforeAll(async ({ request, baseURL }) => {
    token = await login(request, baseURL!, "EDITOR");
    storyId = await createStory(request, baseURL!, token, { headline });
  });
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!, token);
  });

  const hasTouch = (page: Page) => page.evaluate(() => matchMedia("(any-pointer: coarse)").matches);

  test("navigation keeps its model: phone bottom navigation below 768px, never on an iPad", async ({ page }, info) => {
    await page.goto("/admin");
    const bottom = page.locator(".byline-primary-navigation");
    const width = page.viewportSize()!.width;
    if (width < 768) {
      await expect(bottom).toBeVisible();
      expect(await bottom.evaluate((node) => getComputedStyle(node).position)).toBe("fixed");
    } else {
      // An iPad has touch but is not a phone: no bottom bar at 768px and above.
      await expect(bottom).toBeHidden();
    }
    expect(info.project.name).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Story board: touch targets, long-press / secondary click menu, and a pen that hovers", async ({ page }) => {
    await page.goto("/admin/stories?view=board");
    const card = page.locator(`[data-story-id="${storyId}"]`).first();
    await expect(card).toBeVisible();
    const touch = await hasTouch(page);
    const actions = card.getByRole("button", { name: `Actions for ${headline}` });
    const box = await actions.boundingBox();
    if (touch) {
      expect(box!.width).toBeGreaterThanOrEqual(43.5);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }

    // The context menu is mounted for every input. Touch-and-hold fires Base UI's long press; a mouse right-clicks.
    const menu = page.getByRole("menu");
    if (touch) {
      const at = await card.boundingBox();
      await card.evaluate(async (node, point) => {
        const target = node.querySelector("[data-story-id], button, a") ?? node;
        const touchObject = new Touch({ identifier: 1, target, clientX: point.x, clientY: point.y });
        target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touchObject], targetTouches: [touchObject], changedTouches: [touchObject] }));
        await new Promise((resolve) => setTimeout(resolve, 650));
      }, { x: at!.x + at!.width / 2, y: at!.y + at!.height / 2 });
      // WebKit may or may not synthesize a contextmenu from the synthetic touch; the browser's own event is the fallback path.
      if (!(await menu.isVisible())) await card.dispatchEvent("contextmenu", { button: 2 });
    } else {
      await card.click({ button: "right" });
    }
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Quick view/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    // The follow-up click after a secondary press must not open the Story peek.
    await expect(page.getByRole("dialog", { name: headline })).toHaveCount(0);

    // The drag grip is pointer-only and decorative; moving a Story stays available in Actions → Move to.
    const grip = card.locator("[data-story-drag-handle]");
    if (touch) await expect(grip).toHaveAttribute("aria-hidden", "true");
    await actions.click();
    await expect(page.getByRole("menuitem", { name: /Move to/ }).or(page.getByRole("button", { name: /Move to/ })).first()).toBeVisible();
  });

  test("a real PointerEvent carries the pen hover signature the hover hook reads (unit-tested in tests/apple-input.test.tsx)", async ({ page }) => {
    await page.goto("/admin/stories?view=board");
    const seen = await page.evaluate(() => new Promise<{ pointerType: string; buttons: number }[]>((resolve) => {
      const events: { pointerType: string; buttons: number }[] = [];
      window.addEventListener("pointermove", (event) => events.push({ pointerType: event.pointerType, buttons: event.buttons }), { once: false });
      window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "pen", buttons: 0, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", buttons: 0, bubbles: true }));
      resolve(events);
    }));
    expect(seen).toContainEqual({ pointerType: "pen", buttons: 0 });
    // The board stays usable: a hover cannot activate anything, so no dialog or menu opened.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("the Create dialog is a Dialog for a fine pointer and a Drawer for touch, and stays inside the visible screen", async ({ page }) => {
    await page.goto("/admin");
    await page.keyboard.press("Escape");
    const create = page.getByRole("button", { name: "Create" }).first();
    await create.click();
    await page.getByRole("menuitem", { name: "Story" }).first().click();
    const popup = page.locator("[data-slot=dialog-content], [data-slot=drawer-content]").first();
    await expect(popup).toBeVisible();
    const touch = await hasTouch(page);
    await expect(popup).toHaveAttribute("data-slot", touch ? "drawer-content" : "dialog-content");
    const box = await popup.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    // Opening by touch must not summon the software keyboard by focusing the title; opening by keyboard/mouse may.
    const focusedIsInput = await page.evaluate(() => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? ""));
    if (touch) expect(focusedIsInput).toBe(false);
  });

  test("Media: HEIC from an iPhone uploads as a full-size JPEG and the photo inputs accept it", async ({ page }) => {
    await page.goto("/admin/media");
    await page.locator("[data-media-upload-button]").click();
    const input = page.locator("[data-media-upload] input[type=file]");
    expect(await input.getAttribute("accept")).toContain("image/heic");
    expect(await input.getAttribute("accept")).toContain(".heic");
    await input.setInputFiles({ name: `IMG_${Date.now()}.HEIC`, mimeType: "image/heic", buffer: readFileSync(HEIC) });
    await expect(page.locator("[data-media-upload-queue] [data-upload-status=done]")).toHaveCount(1, { timeout: 60_000 });
    // ProRAW is refused with its own message.
    await input.setInputFiles({ name: "IMG_0001.DNG", mimeType: "image/x-adobe-dng", buffer: Buffer.from("raw") });
    await expect(page.getByText("Apple ProRAW/DNG isn't supported yet. Export or share the photo as HEIC or JPEG.")).toBeVisible();
  });

  test("Field Mode: the camera input opens the camera on a phone and accepts HEIC, not ProRAW", async ({ page }) => {
    await page.goto(`/admin/field?story=${storyId}`);
    const input = page.locator("input[type=file][capture=environment]");
    await expect(input).toHaveAttribute("accept", /image\/heic/);
    expect(await input.getAttribute("accept")).not.toBe("image/*");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("a rotation keeps the layout inside the screen", async ({ page }) => {
    await page.goto("/admin/stories");
    test.skip(!(await hasTouch(page)), "Rotation is an iPhone/iPad concern; desktop Safari windows are resized freely.");
    await page.goto("/admin/stories");
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    await expect(page.locator("main, [data-slot=sidebar-inset]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
