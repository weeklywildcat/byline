import { expect, test } from "./fixtures";

test.describe("WordPress environment", () => {
  test("authenticated admin can load the dashboard", async ({ adminPage }) => {
    await adminPage.goto("/wp-admin/");
    await expect(adminPage.locator("#wpbody-content")).toBeVisible();
    await expect(adminPage.locator("#wpadminbar")).toBeVisible();
  });

  test("newsroom presence mounts in the native admin bar and opens its shadcn popover", async ({ adminPage }) => {
    await adminPage.goto("/wp-admin/");
    const presence = adminPage.getByRole("button", { name: /Newsroom presence/ });
    await expect(presence).toBeVisible();

    // This specifically guards the cross-directory Tailwind source boundary:
    // the trigger can still be "visible" while an unstyled avatar renders at
    // its natural image size and spills down over the WordPress admin screen.
    await expect(presence).toHaveCSS("height", "32px");
    const triggerAvatar = presence.locator('[data-slot="avatar"]').first();
    await expect(triggerAvatar).toBeVisible();
    // Match the shared shadcn default avatar variant (32px), not the small
    // toolbar-only variant. WordPress still serves a 96px source image.
    await expect(triggerAvatar).toHaveAttribute("data-size", "default");
    await expect(triggerAvatar).toHaveCSS("width", "32px");
    await expect(triggerAvatar).toHaveCSS("height", "32px");
    await expect(triggerAvatar.locator('[data-slot="avatar-image"]')).toHaveCSS("width", "32px");
    await expect(triggerAvatar.locator('[data-slot="avatar-image"]')).toHaveCSS("height", "32px");

    await presence.click();
    await expect(adminPage.getByText("Newsroom", { exact: true })).toBeVisible();
    await expect(adminPage.getByText("Active now", { exact: true })).toBeVisible();
    await expect(adminPage.getByText(/people? active/)).toBeVisible();
  });

  test("Byline REST namespace is registered", async ({ adminPage }) => {
    const response = await adminPage.request.get("/wp-json/");
    expect(response.ok()).toBe(true);

    const index = (await response.json()) as { namespaces?: unknown };
    expect(index.namespaces).toContain("byline/v1");
  });
});
