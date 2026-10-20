import fs from "node:fs/promises";
import { expect, test } from "./fixtures";
import { seedCanteenStory } from "./story-workspace-fixture";

/**
 * The Story Workspace is built from shadcn Nova (Item, Field, Select,
 * RadioGroup, Empty, Collapsible, Dialog, AlertDialog). These tests drive it the way a
 * reporter would and pin the behaviours the component migration must not lose.
 */
test("the workspace reads as Nova: sources, appointments, tasks, files and a scheduling dialog that works", async ({ adminPage: page, adminSession: session }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const fixture = await seedCanteenStory(session);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(fixture.workspaceUrl);
  await expect(page.getByRole("heading", { level: 1, name: fixture.title })).toBeVisible();

  // Navigation is a real link, not a button-shaped anchor.
  await expect(page.getByRole("navigation", { name: "breadcrumb" }).getByRole("link", { name: "Stories" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit article" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit article" })).toHaveCount(0);
  await expect(page.locator("header").getByRole("link", { name: /^Working draft/ })).toHaveAttribute("target", "_blank");

  const reporting = page.getByRole("region", { name: "Reporting", exact: true });
  await expect(reporting.getByRole("button", { name: /Mrs\. Hamby/ }).first()).toBeVisible();
  await expect(reporting.getByRole("heading", { name: "To schedule" })).toBeVisible();
  await expect(reporting.getByText("Interview local reporter")).toBeVisible();

  // A source: validation is a FieldError, success is a new row.
  await reporting.getByRole("button", { name: "Add source", exact: true }).click();
  const sourceDialog = page.getByRole("dialog", { name: "Add source" });
  await sourceDialog.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(sourceDialog.getByRole("alert")).toContainText("label");
  await sourceDialog.getByLabel("Label").fill("Athletic director");
  await sourceDialog.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Needs scheduling" }).click();
  await sourceDialog.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(sourceDialog).toBeHidden();
  await expect(reporting.getByRole("button", { name: /Athletic director/ })).toBeVisible();

  // An appointment: Not scheduled / Target date range / Exact date & time are native RadioGroup choice cards.
  await reporting.getByRole("button", { name: "Add appointment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add appointment" });
  await dialog.getByLabel("Title").fill("Call the athletic director");
  await expect(dialog.getByRole("radio", { name: /Not scheduled/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /Target date range/ }).click();
  await expect(dialog.getByRole("button", { name: "This week" })).toBeVisible();
  await dialog.getByRole("button", { name: "Next week" }).click();
  await expect(dialog.getByRole("button", { name: "Target dates" })).not.toContainText("Choose target dates");
  await dialog.getByRole("radio", { name: /Exact date & time/ }).click();
  await expect(dialog.getByLabel("Start time")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "This week" })).toHaveCount(0);
  // Leaving a mode clears its fields: pick the range again before saving.
  await dialog.getByRole("radio", { name: /Target date range/ }).click();
  await expect(dialog.getByRole("button", { name: "Target dates" })).toContainText("Choose target dates");
  await dialog.getByRole("button", { name: "This week" }).click();
  await dialog.getByRole("button", { name: "Add appointment", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(reporting.getByRole("button", { name: /Call the athletic director/ })).toBeVisible();

  // Tasks: high-frequency fields edit directly; the title still has a full edit dialog.
  const tasks = page.getByRole("region", { name: "Tasks", exact: true });
  await tasks.getByRole("button", { name: "Task priority: normal" }).first().click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await expect(tasks.getByRole("button", { name: "Task priority: high" }).first()).toBeVisible();

  await tasks.getByRole("button", { name: "Change task due date" }).first().click();
  await page.getByRole("button", { name: "Clear date" }).click();
  await expect(tasks.getByRole("button", { name: "Change task due date" }).first()).toContainText("No due date");

  await tasks.getByRole("button", { name: "Interview three students", exact: true }).click();
  const taskDialog = page.getByRole("dialog", { name: "Edit task" });
  await taskDialog.getByLabel("What needs doing?").fill("Interview four students");
  await taskDialog.getByRole("button", { name: "Save task" }).click();
  await expect(taskDialog).toBeHidden();
  await expect(tasks.getByRole("button", { name: "Interview four students", exact: true })).toBeVisible();

  // Completion still moves the task into the completed Collapsible.
  const task = tasks.getByRole("checkbox", { name: "Interview four students" });
  await task.click();
  await expect(task).toHaveCount(0);
  await tasks.getByRole("button", { name: /^Completed/ }).click();
  await expect(tasks.getByRole("checkbox", { name: "Interview four students" })).toBeChecked();

  // Files & Links: each row is a link that opens a new tab; management lives in a menu.
  const files = page.getByRole("region", { name: "Files & Links", exact: true });
  await expect(files.getByRole("link", { name: /Mrs\. Hamby questions/ })).toHaveAttribute("target", "_blank");
  await files.getByRole("button", { name: "Actions for Research folder" }).click();
  await page.getByRole("menuitem", { name: "Edit link" }).click();
  const link = page.getByRole("dialog", { name: "Edit link" });
  await expect(link.getByLabel("Label")).toHaveValue("Research folder");
  await link.getByRole("button", { name: "Cancel" }).click();
  await expect(link).toBeHidden();

  // The brief edits in place.
  const brief = page.getByRole("region", { name: "Brief", exact: true });
  await brief.getByRole("button", { name: "Edit", exact: true }).click();
  await brief.getByLabel("Brief").fill("Why the canteen stopped, and what bringing it back would take.");
  await brief.getByRole("button", { name: "Save brief" }).click();
  await expect(brief.getByText("Why the canteen stopped, and what bringing it back would take.")).toBeVisible();

  expect(pageErrors).toEqual([]);
  // The styles belong to the Byline screens only: leave them and nothing is left behind.
  await page.goto("/wp-admin/edit.php");
  expect(await page.locator('link[href*="style-story-workspace"],link[href*="style-home"]').count()).toBe(0);
  expect(await page.locator(".byline-ui-root").count()).toBe(0);
});

test("the workspace keeps its layout from 1440 down to a phone", async ({ adminPage: page, adminSession: session }) => {
  const fixture = await seedCanteenStory(session, { keep: true });
  await fs.mkdir("/tmp/byline-workspace-qa", { recursive: true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(fixture.workspaceUrl);
    await expect(page.getByRole("heading", { level: 1, name: fixture.title })).toBeVisible();
    await expect(page.getByRole("region", { name: "Reporting", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/byline-workspace-qa/workspace-${width}.png`, fullPage: true, animations: "disabled" });
    if (width === 1440 || width === 390) {
      await page.getByRole("region", { name: "Reporting", exact: true }).getByRole("button", { name: /Interview local reporter/ }).click();
      const dialog = page.getByRole("dialog", { name: "Edit appointment" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("opacity", "1");
      await page.screenshot({ path: `/tmp/byline-workspace-qa/appointment-${width}.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
  // On a phone the page reads in the order a reporter works: brief, reporting, tasks, media, files, details, activity.
  const order = await page.evaluate(() => Array.from(document.querySelectorAll("main [role=region][aria-labelledby]"))
    .map((section) => ({ title: section.querySelector("[role=heading][aria-level='2']")?.textContent, top: section.getBoundingClientRect().top }))
    .filter((section) => section.title).sort((a, b) => a.top - b.top).map((section) => section.title));
  expect(order).toEqual(["Brief", "Reporting", "Tasks", "Media & Production", "Files & Links", "Details", "Recent Activity"]);
});
