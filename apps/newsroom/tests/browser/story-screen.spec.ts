import { expect, test, type Page } from "@playwright/test";
import { createStory, lexical, login, paragraph, signIn, waitForSaved } from "./helpers";

/**
 * The reporter-first Story screen (docs/story-screen.md): opening a Story
 * opens the Story; Reporting is a labelled, always-visible way in; History is
 * secondary; Review is contextual; Plan is gone; Story Context is a rail when
 * the article has room and the same content in a Sheet when it does not.
 */

let storyId = 0;
let token = "";
const headers = (baseURL: string) => ({ Authorization: `JWT ${token}`, Origin: baseURL });

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  const { docs } = await (await request.get("/api/sections?depth=0&limit=1", { headers: headers(baseURL!) })).json();
  storyId = await createStory(request, baseURL!, token, {
    headline: `Canteen could return next semester ${Date.now()}`,
    section: docs[0]?.id,
    body: lexical([paragraph("The canteen closed in May after the district ended its contract.")])
  });
  const appointment = await request.post(`/api/byline/stories/${storyId}/appointments`, {
    headers: headers(baseURL!),
    data: { title: "Principal Smith interview", kind: "interview", status: "confirmed", scheduleMode: "unscheduled" }
  });
  expect(appointment.ok(), await appointment.text()).toBeTruthy();
});

async function open(page: Page, search = "") {
  await page.goto(`/admin/collections/stories/${storyId}${search}`);
  await expect(page.locator("[data-story-view]")).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

test("opens the Story itself, with Reporting visible and no tab bar or Plan", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "story");
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reporting", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Plan$/ })).toHaveCount(0);
  await expect(page.getByText("Add them in Plan")).toHaveCount(0);
  // Review is not navigation: no Review button for a Story nobody submitted.
  await expect(page.getByRole("button", { name: /Review submitted version/ })).toHaveCount(0);
  // History is secondary: only in the overflow menu.
  await expect(page.getByRole("button", { name: "View history" })).toHaveCount(0);
  await page.getByRole("button", { name: "More story actions" }).click();
  await expect(page.getByRole("menuitem", { name: "View history" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Reporting is a focused mode with Back to story, Back/Forward, and Sources added there", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Reporting", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=reporting/);
  await expect(page.getByRole("heading", { name: "Reporting", level: 1 })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  // Sources are created in Reporting, never "in Plan".
  // Beside the notebook when Reporting is wide enough, otherwise in its Sheet.
  const toggle = page.getByRole("button", { name: "Sources & appointments" });
  if (await toggle.isVisible()) await toggle.click();
  const rail = page.locator("aside[aria-label='Sources and appointments'], [role=dialog]:has-text('Sources & appointments')").first();
  await rail.getByRole("button", { name: "Add source" }).click();
  const dialog = page.getByRole("dialog", { name: /source/i });
  await dialog.getByLabel(/Name|Who/).first().fill("District food services");
  await dialog.getByRole("button", { name: /Add source|Save/ }).click();
  await expect(rail.getByText("District food services")).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "story");
  await page.goForward();
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "reporting");
  await page.getByRole("button", { name: "Back to story" }).click();
  await expect(page).not.toHaveURL(/view=/);
});

test("legacy and deep links land where they mean", async ({ page, request, baseURL }) => {
  await open(page, "?tab=reporting");
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "reporting");
  await open(page, "?tab=plan");
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "story");
  const { appointments } = await (await request.get(`/api/byline/stories/${storyId}/workspace`, { headers: headers(baseURL!) })).json();
  await open(page, `?appointment=${appointments[0].id}`);
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "reporting");
  await expect(page.getByRole("dialog", { name: /appointment/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await open(page, "?view=history");
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
});

test("Story Context is a rail when there is room and the same content in a Sheet when not", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await open(page);
  const rail = page.locator("[data-story-context-rail]");
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Angle" })).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Reporting" })).toBeVisible();
  // The article keeps its 760px reading measure beside the rail.
  const column = await page.locator("[data-story-article] textarea[aria-label='Headline']").boundingBox();
  expect(column!.width).toBeGreaterThanOrEqual(700);

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(rail).toHaveCount(0);
  await page.getByRole("button", { name: "Story context" }).click();
  const sheet = page.getByRole("dialog", { name: "Story context" });
  await expect(sheet.getByRole("heading", { name: "Angle" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A phone keeps Reporting discoverable and labelled.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Reporting", exact: true })).toBeVisible();
});

test("the Angle is edited inline and saved", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await open(page);
  const rail = page.locator("[data-story-context-rail]");
  await rail.getByRole("button", { name: /Add|Edit/ }).first().click();
  await rail.getByRole("textbox", { name: "Angle" }).fill("Why the canteen closed and whether it can return.");
  await rail.getByRole("button", { name: "Save" }).click();
  await expect(rail.getByText("Why the canteen closed and whether it can return.")).toBeVisible();
  await waitForSaved(page);
});
