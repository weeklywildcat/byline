import { expect, test, type Page } from "@playwright/test";
import { login, signIn } from "./helpers";

/**
 * Newsroom Roles, the review workflow builder, routing preview and workload
 * (docs/newsroom-roles.md): editors only, every action reachable without
 * dragging, and nothing that ranks or scores people.
 */

const stamp = Date.now();
let token = "";

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
});
test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test("creates a scoped role, adds and removes a member, all from Items, a Sheet and Dialogs", async ({ page }) => {
  await page.goto("/admin/people?view=roles");
  await expect(page.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Newsroom roles" })).toBeVisible();

  const name = `Photo Desk ${stamp}`;
  await page.getByRole("button", { name: "New role" }).click();
  const create = page.getByRole("dialog", { name: "New role" });
  await create.getByLabel("Name").fill(name);
  await create.getByRole("radio", { name: "By media type" }).check();
  await create.getByRole("button", { name: "Create role" }).click();

  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Nobody holds")).toBeVisible();
  await sheet.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog", { name: `Add someone to ${name}` });
  await dialog.getByLabel("Person").fill("Maycie");
  await page.getByRole("option", { name: /Maycie/ }).click();
  // A scoped role needs a scope: the server's reason is shown in the Dialog, nothing is added.
  await dialog.getByRole("button", { name: "Add to role" }).click();
  await expect(dialog.getByText("Choose at least one media type.")).toBeVisible();
  await dialog.getByLabel("Media types", { exact: true }).fill("Photo");
  await page.getByRole("option", { name: "Photo", exact: true }).click();
  await dialog.getByRole("button", { name: "Add to role" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Maycie Krajewski")).toBeVisible();
  await expect(sheet.getByText("Photo", { exact: true })).toBeVisible();

  await sheet.getByRole("button", { name: /Remove Maycie Krajewski/ }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Their past reviews");
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(sheet.getByText("Nobody holds")).toBeVisible();

  // Escape closes the Sheet. Opened again from its Item, focus returns to that Item.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const item = page.getByRole("button", { name: new RegExp(`^${name}:`) });
  await item.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(item).toBeFocused();
  // Archive it so the fixture doesn't accumulate.
  await item.click();
  await sheet.getByRole("button", { name: "Archive role" }).click();
  await expect(sheet.getByRole("button", { name: "Restore role" })).toBeVisible();
});

test("builds a workflow: reorder with the buttons, save, and preview a real story through the server's routing", async ({ page, request, baseURL }) => {
  const headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
  const sections = (await (await request.get("/api/sections?depth=0&limit=1", { headers })).json()).docs;
  const created = await request.post("/api/stories?draft=true", { headers, data: { _status: "draft", headline: `Workflow preview ${stamp}`, section: sections[0]?.id } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.goto("/admin/review-workflows");
  await expect(page.getByRole("heading", { name: "Review workflows", level: 1 })).toBeVisible();
  const name = `Desk flow ${stamp}`;
  await page.getByRole("button", { name: "New workflow" }).click();
  await page.getByRole("dialog", { name: "New review workflow" }).getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create workflow" }).click();
  await expect(page.getByRole("combobox", { name: "Workflow" })).toContainText(name);

  // Add a second step, a role step, and edit it in the Sheet.
  await page.getByRole("button", { name: "Add step" }).click();
  const sheet = page.getByRole("dialog"); // the title follows the step name as it is typed
  await sheet.getByLabel("Step name").fill("Copy check");
  await sheet.getByRole("radio", { name: "Copy" }).check();
  await sheet.getByRole("radio", { name: "A newsroom role" }).check();
  await sheet.getByLabel("Role", { exact: true }).fill("Copy");
  await page.getByRole("option", { name: /Copy Desk/ }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const steps = page.getByRole("list", { name: "Review steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1)).toContainText("Copy check");
  await expect(steps.nth(1)).toContainText("Copy Desk");
  // Never drag-only: Move up does the same.
  await page.getByRole("button", { name: "Move step 2, Copy check, up" }).click();
  await expect(steps.nth(0)).toContainText("Copy check");
  await expect(page.getByRole("button", { name: "Move step 1, Copy check, up" })).toBeDisabled();
  await expect(page.locator("[data-byline-workflows-screen]").getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.locator("[data-byline-workflows-screen]").getByText("Unsaved changes", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Workflow" })).toContainText(name);
  await expect(page.getByRole("list", { name: "Review steps" }).getByRole("listitem").nth(0)).toContainText("Copy check");

  // Preview with a story: the same resolver as submission, including unsaved edits.
  await page.getByLabel("Story", { exact: true }).fill("Workflow preview");
  await page.getByRole("option", { name: new RegExp(`Workflow preview ${stamp}`) }).click();
  const result = page.getByRole("heading", { name: "Preview with story…" }).locator("xpath=ancestor::section[1]");
  await expect(result.getByText(`Workflow preview ${stamp}`, { exact: false }).first()).toBeVisible();
  await expect(result.getByText("Copy check")).toBeVisible();
  await expect(result.getByText(/Skipped|Assigned|Queue|Can’t be routed/).first()).toBeVisible();
  // Whatever the result, it says so in words as well as colour.
  await expect(result.locator("[data-slot=badge]").first()).toBeVisible();
});

test("a step's drag handle reorders too", async ({ page }) => {
  await page.goto("/admin/review-workflows");
  await expect(page.getByRole("heading", { name: "Review workflows", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("dialog").getByLabel("Step name").fill("Drag me");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  const steps = page.getByRole("list", { name: "Review steps" }).getByRole("listitem");
  const count = await steps.count();
  const last = steps.nth(count - 1);
  await expect(last).toContainText("Drag me");
  await last.locator("[title='Drag to reorder']").dragTo(steps.nth(0));
  await expect(steps.nth(0)).toContainText("Drag me");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.locator("[data-byline-workflows-screen]").getByText("Unsaved changes", { exact: true })).toBeHidden();
});

test("workload is factual, alphabetical and has no scores", async ({ page }) => {
  await page.goto("/admin/people?view=workload");
  await expect(page.getByRole("heading", { name: "Workload", level: 1 })).toBeVisible();
  const table = page.getByRole("table");
  for (const column of ["Active stories", "Due this week", "Overdue", "Reviews", "Media assignments"]) await expect(table.getByRole("columnheader", { name: column })).toBeVisible();
  const names = await table.getByRole("rowheader").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await expect(page.getByText(/score|rank|productivity|hours/i)).toHaveCount(0);
});

test("staff can't open any of it", async ({ page, context, request, baseURL }) => {
  const staff = await login(request, baseURL!, "STAFF");
  await context.clearCookies();
  await signIn(context, baseURL!, staff);
  await page.goto("/admin/review-workflows");
  await expect(page.getByText("Only editors manage review workflows.")).toBeVisible();
  await page.goto("/admin/people?view=roles");
  await expect(page.getByText(/Only editors manage People/)).toBeVisible();
  expect((await request.get("/api/byline/roles", { headers: { Authorization: `JWT ${staff}`, Origin: baseURL! } })).status()).toBe(403);
});

for (const width of [1440, 1024, 820, 390]) {
  test(`fits at ${width}px without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/people?view=roles", "/admin/review-workflows", "/admin/people?view=workload"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(800);
      await noOverflow(page);
    }
    // The role Sheet and the step Sheet fit too.
    await page.goto("/admin/people?view=roles");
    await page.getByRole("list", { name: "Newsroom roles" }).getByRole("button").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await noOverflow(page);
  });
}
