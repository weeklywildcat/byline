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
