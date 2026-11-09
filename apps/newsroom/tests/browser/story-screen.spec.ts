import { expect, test, type Page } from "@playwright/test";
import { createStory, lexical, login, paragraph, signIn } from "./helpers";

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
  // One quiet header: Reporting, the lifecycle action and a single menu. Preview, Field Mode, Story context and the publication actions live in it.
  for (const name of ["Preview", "Field Mode", "Story context", "Publication actions"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(More story|Publication) actions$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Plan$/ })).toHaveCount(0);
  await expect(page.getByText("Add them in Plan")).toHaveCount(0);
  // Review is not navigation: no Review button for a Story nobody submitted.
  await expect(page.getByRole("button", { name: /Review submitted version/ })).toHaveCount(0);
  // History is secondary: only in the overflow menu.
  await expect(page.getByRole("button", { name: "View history" })).toHaveCount(0);
  await page.getByRole("button", { name: "More story actions" }).click();
  await expect(page.getByRole("menuitem", { name: "View history" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Move to trash/ })).toBeVisible();
  // Story mode is a property of the Story beside Section and Story type, not a bar above the headline.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Story mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Live", exact: true })).toBeVisible();
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
  await dialog.getByRole("textbox", { name: "Label" }).fill("District food services");
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
  await page.getByRole("button", { name: "More story actions" }).click();
  await page.getByRole("menuitem", { name: "Story context" }).click();
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
  // The Angle is a Byline record, not a document field: it persists without saving the Story.
  await page.reload();
  await expect(page.locator("[data-story-context-rail]").getByText("Why the canteen closed and whether it can return.")).toBeVisible({ timeout: 60_000 });
});

test("Reporting capture saves notes, note edits and links in place, never reloading the Story", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?view=reporting");
  // A marker that only survives if the document is never reloaded or submitted.
  await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
  const stillHere = () => page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true);
  const notebook = page.locator("[data-story-view=reporting]");

  await notebook.getByRole("button", { name: "Capture" }).click();
  await page.getByRole("menuitem", { name: "Note" }).click();
  const composer = page.locator("[data-note-composer]");
  await expect(composer).toHaveAttribute("role", "group");
  await composer.getByRole("textbox", { name: "Note" }).fill("Cafeteria manager says");
  // Enter is a newline in a note; it must not submit anything.
  await composer.getByRole("textbox", { name: "Note" }).press("Enter");
  await composer.getByRole("textbox", { name: "Note" }).pressSequentially("the district wants bids by March.");
  await composer.getByRole("button", { name: "Save note" }).click();
  await expect(notebook.getByText(/the district wants bids by March\./)).toBeVisible();
  expect(await stillHere()).toBe(true);

  // Editing a note inline, saved with ⌘/Ctrl+Enter.
  await notebook.locator("[data-material=note]").filter({ hasText: "bids by March" }).getByRole("button", { name: "Edit" }).click();
  const editor = notebook.getByRole("group", { name: "Edit note" }).getByRole("textbox", { name: "Note" });
  await editor.fill("Cafeteria manager: district wants bids by April.");
  await editor.press("ControlOrMeta+Enter");
  await expect(notebook.getByText("Cafeteria manager: district wants bids by April.")).toBeVisible();
  expect(await stillHere()).toBe(true);

  // A link, added with Enter in its single-line field.
  await notebook.getByRole("button", { name: "Capture" }).click();
  await page.getByRole("menuitem", { name: "Add link" }).click();
  const link = notebook.getByRole("textbox", { name: "Link address" });
  await link.fill("https://www.example.org/district-food-contract");
  await link.press("Enter");
  await expect(notebook.getByText(/example\.org/).first()).toBeVisible();
  expect(await stillHere()).toBe(true);
  await expect(page).toHaveURL(/view=reporting/);
});

test("Legacy Story view is off by default and puts the Story back under Write / Plan / Production / History tabs", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  const setLegacy = async (on: boolean) => {
    // By keyboard: the Next dev badge sits over the avatar in the compact rail.
    await page.getByRole("button", { name: /^Account:/ }).focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitemcheckbox", { name: "Legacy Story view" });
    await expect(item).toHaveAttribute("aria-checked", on ? "false" : "true");
    await item.click();
  };

  try {
    await setLegacy(true);
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab")).toHaveText(["Write", "Plan", "Production", "History"]);
    await expect(tabs.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");
    // Same header and lifecycle; only the arrangement differs.
    await expect(page.getByRole("button", { name: "Reporting", exact: true })).toBeVisible();
    const editor = page.locator("[data-story-article] [contenteditable=true]").first();
    const handle = await editor.elementHandle();

    await tabs.getByRole("tab", { name: "Plan" }).click();
    await expect(page.locator("[data-story-article]")).toBeHidden();
    await expect(page.getByRole("tabpanel")).toContainText("Brief");
    await tabs.getByRole("tab", { name: "Production" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Media & Production");
    await tabs.getByRole("tab", { name: "Write" }).click();
    await expect(editor).toBeVisible();
    // The editor was only hidden, never remounted.
    expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);

    // History is a tab here: the overflow menu and an old link land on it.
    await page.getByRole("button", { name: "More story actions" }).first().click();
    await page.getByRole("menuitem", { name: "View history" }).click();
    await expect(tabs.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");

    // The choice is the account's: it survives a reload, and `?tab=` still picks the tab.
    await open(page, "?tab=production");
    await expect(page.getByRole("tab", { name: "Production" })).toHaveAttribute("aria-selected", "true");
  } finally {
    await setLegacy(false);
  }
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("the top bar's breadcrumb is Stories › this Story, and a focused mode adds its name and a way back", async ({ page }) => {
  await open(page);
  const crumbs = page.getByRole("navigation", { name: "breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Stories" })).toHaveAttribute("href", "/admin/stories");
  await expect(crumbs.getByRole("listitem").last()).toContainText("Canteen could return next semester");
  await page.getByRole("button", { name: "Reporting", exact: true }).click();
  await expect(crumbs.getByRole("listitem").last()).toHaveText("Reporting");
  await crumbs.getByRole("button", { name: /Canteen could return next semester/ }).click();
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "story");
  await expect(page).not.toHaveURL(/view=reporting/);
});

test("right-clicking the stage offers the same moves as the header, and the stage badge is colored", async ({ page }) => {
  await open(page);
  const stage = page.locator("[data-story-phase]");
  await expect(stage.locator("[data-phase-badge=pitch]")).toBeVisible();
  // Color is a second cue: the badge has a tint, never the plain secondary gray.
  const tint = await stage.locator("[data-phase-badge]").evaluate((node) => getComputedStyle(node).backgroundColor);
  const neutral = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(tint).not.toBe(neutral);
  await stage.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Accept pitch" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Put on hold" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Drop story" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The header button and the overflow menu are still the keyboard way to the same moves.
  await expect(page.locator("[data-primary-action]")).toHaveText(/Accept pitch/);
});

test("an editor can right-click the stage and jump straight to any stage, with Undo", async ({ page, request, baseURL }) => {
  // Start from a Pitch whatever an earlier run left behind.
  await request.post(`/api/byline/stories/${storyId}/workflow`, { headers: headers(baseURL!), data: { status: "pitch" } });
  await open(page);
  const stage = page.locator("[data-story-phase]");
  await expect(stage.locator("[data-phase-badge=pitch]")).toBeVisible();
  await stage.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to stage" }).click();
  // Pitch to Drafting in one move, skipping Reporting.
  await page.getByRole("menuitemradio", { name: "Drafting" }).click();
  await expect(stage.locator("[data-phase-badge=drafting]")).toBeVisible();
  await expect(page.getByText(/Moved to Drafting/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(stage.locator("[data-phase-badge=pitch]")).toBeVisible();
});
