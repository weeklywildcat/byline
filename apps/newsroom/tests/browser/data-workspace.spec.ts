import { expect, test, type Page } from "@playwright/test";
import { login, signIn } from "./helpers";

/**
 * Byline Data in the newsroom (docs/byline-data.md), end to end in a browser:
 * a dataset made by pasting a table, the grid's keyboard path, Publish data,
 * a project from a built-in template, the shared preview with working and
 * published data, and staff limits enforced by the server, not the screen.
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3010 npx playwright test --config playwright.editor.config.ts tests/browser/data-workspace.spec.ts
 */
const run = Date.now().toString(36);
const datasetTitle = `Band results ${run}`;
const projectTitle = `Band rankings ${run}`;
const TABLE = "Band\tScore\tDivision\tJudges\nGreenwood High\t92.4\tAA\tPrivate note\nLakeview\t92.4\tAA\t\nNorth County\t88.1\tA\t\nRiverside\t85.6\tA\t\n";

async function asEditor(page: Page, baseURL: string) {
  await signIn(page.context(), baseURL, await login(page.request, baseURL, "EDITOR"));
}

const grid = (page: Page) => page.getByRole("grid", { name: "Dataset rows" });
const cell = (page: Page, row: number, col: number) => grid(page).locator(`[data-cell="${row}:${col}"]`);

test.describe.serial("Data workspace", () => {
  test("an editor makes a dataset by pasting a table, edits it from the keyboard and publishes it", async ({ page, baseURL }) => {
    await asEditor(page, baseURL!);
    await page.goto("/admin/data?tab=datasets");
    await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();
    await page.getByRole("button", { name: "New dataset" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New dataset" });
    await dialog.getByLabel("Name", { exact: true }).fill(datasetTitle);
    await dialog.getByLabel("Table").fill(TABLE);
    await expect(dialog.getByText("4 fields and 4 rows.")).toBeVisible();
    await expect(dialog.getByLabel("Type of Score")).toHaveText(/Number/);
    await expect(dialog.getByLabel("Type of Division")).toHaveText(/Choice/);
    await dialog.getByRole("button", { name: "Create dataset" }).click();
    await expect(page).toHaveURL(/\?dataset=\d+/);
    await expect(page.getByRole("heading", { level: 1, name: datasetTitle })).toBeVisible();
    await expect(page.getByText("Not published yet.")).toBeVisible();
    await expect(cell(page, 3, 0)).toHaveText("Riverside");

    // Keyboard: select, move, Enter to edit, type, Enter to commit and move down.
    await cell(page, 0, 0).click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 1, 1)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Meta+A");
    await page.keyboard.type("91.9");
    await page.keyboard.press("Enter");
    await expect(cell(page, 1, 1)).toHaveText("91.9");
    await expect(cell(page, 2, 1)).toBeFocused();
    // Nonsense is refused in place, never saved.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Meta+A");
    await page.keyboard.type("lots");
    await page.keyboard.press("Enter");
    await expect(grid(page).getByRole("textbox", { name: "Score" })).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await expect(cell(page, 2, 1)).toHaveText("88.1");

    // Make the judges' column private, then publish.
    await page.getByRole("button", { name: "Fields" }).click();
    const sheet = page.getByRole("dialog", { name: "Fields" });
    await sheet.getByRole("button", { name: /^Judges/ }).click();
    await sheet.getByRole("switch", { name: "Public" }).click();
    await sheet.getByRole("button", { name: "Save fields" }).click();
    await expect(page.getByText("Fields saved.")).toBeVisible();
    await page.getByRole("button", { name: "Publish data" }).click();
    const confirm = page.getByRole("dialog", { name: `Publish ${datasetTitle}?` });
    await expect(confirm.getByText("Stays in the newsroom")).toBeVisible();
    await confirm.getByRole("button", { name: "Publish data" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText(/^Published .* · 4 rows · release [0-9a-f]{7}/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish data" })).toBeDisabled();
  });

  test("an editor builds a project from the Ranking template, previews working and published data, and publishes it", async ({ page, baseURL }) => {
    await asEditor(page, baseURL!);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/data");
    await page.getByRole("button", { name: "New project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Name", { exact: true }).fill(projectTitle);
    await dialog.getByText("Ranking", { exact: true }).click();
    await dialog.getByLabel("Start from").click();
    await page.getByRole("option", { name: datasetTitle }).click();
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\?project=\d+/);
    await expect(page.getByRole("heading", { level: 1, name: projectTitle })).toBeVisible();
    // Name and Score were matched by name and type.
    await expect(page.locator("#data-role-entries-name")).toHaveText(/Band/);
    await expect(page.locator("#data-role-entries-value")).toHaveText(/Score/);

    const frame = page.frameLocator("iframe[title^='Preview of']");
    await expect(frame.getByRole("heading", { level: 1, name: projectTitle })).toBeVisible();
    await expect(frame.getByLabel("Tied for 1")).toHaveCount(0);
    await expect(frame.getByText("Greenwood High")).toBeVisible();
    await page.getByRole("button", { name: "Published data" }).click();
    await expect(page.frameLocator("iframe[title*='published data']").getByText("Greenwood High")).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Published\. The page goes live/)).toBeVisible();
    await expect(page.getByRole("link", { name: /\/data\/band-rankings-/ })).toBeVisible();
  });

  test("working edits leave the published preview alone until the data is published again", async ({ page, baseURL }) => {
    await asEditor(page, baseURL!);
    await page.goto("/admin/data?tab=datasets");
    await page.getByRole("button", { name: datasetTitle }).click();
    await cell(page, 0, 0).dblclick();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Meta+A");
    await page.keyboard.type("Greenwood High Wildcats");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/not yet published/)).toBeVisible();
    await page.getByRole("button", { name: /Used by|Band rankings/ }).filter({ hasText: projectTitle }).first().click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Published data" }).click();
    const published = page.frameLocator("iframe[title*='published data']");
    await expect(published.getByText("Greenwood High", { exact: true })).toBeVisible();
    await expect(published.getByText("Greenwood High Wildcats")).toHaveCount(0);
    await page.getByRole("button", { name: "Working data" }).click();
    await expect(page.frameLocator("iframe[title*='working data']").getByText("Greenwood High Wildcats")).toBeVisible();
  });

  test("staff edit rows but can't change fields or publish, on the screen or through the API", async ({ page, baseURL }) => {
    const token = await login(page.request, baseURL!, "STAFF");
    await signIn(page.context(), baseURL!, token);
    await page.goto("/admin/data?tab=datasets");
    await page.getByRole("button", { name: datasetTitle }).click();
    await expect(page.getByRole("button", { name: "Publish data" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Fields" })).toBeDisabled();
    const id = new URL(page.url()).searchParams.get("dataset");
    const refused = await page.request.post(`/api/byline/data/datasets/${id}/publish`, { headers: { Authorization: `JWT ${token}`, Origin: baseURL! }, data: {} });
    expect(refused.status()).toBe(403);
    await cell(page, 3, 0).dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" (unofficial)");
    await page.keyboard.press("Enter");
    await expect(cell(page, 3, 0)).toHaveText("Riverside (unofficial)");
  });
});
