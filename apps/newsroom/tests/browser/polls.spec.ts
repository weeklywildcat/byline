import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { markWelcomeSeen } from "./helpers";

/**
 * The whole Wildcat Polls workflow (docs/wildcat-polls.md), on a laptop with
 * an anonymous second browser as the iPad: sign in → Polls → import the
 * example workbook → preview a branch → publish → Collect → start fieldwork →
 * pairing code → the "iPad" opens /poll without signing in → claims the code →
 * locked → interviewer PIN → decline → a student's response → back to the
 * interviewer → end → results and export. Then Build's keyboard sorting and
 * the narrow section drawer. Accounts come from scripts/seed-polls-browser.ts
 * (test values for that fixture only).
 */
const EDITOR = { email: "editor@polls.test", password: "polls-browser-editor-2026" };
const WORKBOOK = fileURLToPath(new URL("../../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx", import.meta.url));
const PIN = "4826";
const TITLE = "AI at Ninety Six High School";
const SAMPLING = "Every third student in the lunch line";

async function signIn(page: Page, next: string) {
  await page.goto(`/admin/login?redirect=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: "Email" }).fill(EDITOR.email);
  await page.getByLabel("Password", { exact: true }).fill(EDITOR.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin") && !url.pathname.endsWith("/login"));
  // Skip the welcome tour. Preferences need a token header; the browser keeps the session the form created.
  const login = await page.request.post("/api/users/login", { data: EDITOR });
  await markWelcomeSeen(page.request, { Authorization: `JWT ${(await login.json()).token}` });
  await page.reload();
}

const runner = (page: Page) => page.locator("[data-poll-runner]");
const answer = (page: Page, label: string) => runner(page).getByText(label, { exact: true }).click();
const next = (page: Page, name = "Continue") => runner(page).getByRole("button", { name, exact: true }).click();
const heading = (page: Page) => runner(page).locator("h1");

async function enterPin(page: Page) {
  for (const digit of PIN) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}

test("build, publish, pair an iPad with a code, collect a response and read the results", async ({ page, browser }) => {
  await signIn(page, "/admin/polls");
  await expect(page.getByRole("heading", { level: 1, name: "Polls", exact: true })).toBeVisible();
  // New poll is the primary action; Import is secondary.
  await expect(page.locator("[data-polls-home]").getByRole("button", { name: "New poll" })).toBeVisible();

  // Import → review (validation and every question) → preview → publish.
  await page.getByRole("button", { name: "Import", exact: true }).first().click();
  await page.locator("[data-polls-upload]").setInputFiles(WORKBOOK);
  await expect(page.getByText("No errors.")).toBeVisible();
  await expect(page.getByText(/Shown when .*Have you been assigned a book report this year\?.* is .*Yes/)).toBeVisible();
  await page.getByRole("button", { name: "Try it" }).click();
  await runner(page).getByRole("button", { name: "Start" }).click();
  // The example branches, so progress never states a total that could move.
  await expect(runner(page).locator("[data-poll-progress]")).toHaveText("Question 1");
  await answer(page, "10th grade");
  await next(page);
  await runner(page).getByRole("button", { name: "Skip" }).click();
  while ((await heading(page).textContent()) !== "Have you been assigned a book report this year?") await runner(page).getByRole("button", { name: "Skip" }).click();
  await answer(page, "Yes");
  await next(page);
  await expect(heading(page)).toHaveText("Did you use AI for any part of it?");
  await page.getByRole("button", { name: "Continue to publish" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Version 1", { exact: true }).first()).toBeVisible();

  // Collect: start fieldwork on this laptop and get a pairing code.
  await page.getByRole("tab", { name: "Collect" }).click();
  await page.getByRole("button", { name: "Start fieldwork" }).first().click();
  await page.locator("[data-polls-setup]").getByText("Cafeteria", { exact: true }).click();
  await page.getByRole("radio", { name: "Lunch A" }).or(page.getByRole("button", { name: "Lunch A" })).first().click();
  await page.getByLabel("How you'll choose students").fill(SAMPLING);
  await page.getByLabel("PIN", { exact: true }).fill(PIN);
  await page.getByLabel("Again", { exact: true }).fill(PIN);
  await page.getByRole("button", { name: "Get a pairing code" }).click();
  const shown = (await page.locator("[data-polls-pairing-code]").textContent()) ?? "";
  expect(shown).toMatch(/^\d{3} \d{3}$/);
  await expect(page.locator("[data-polls-qr]")).toBeVisible();

  // The iPad: a fresh browser that has never signed in to Byline.
  const ipadContext = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const ipad = await ipadContext.newPage();
  await ipad.goto("/poll");
  await expect(ipad.getByRole("heading", { name: "Set up this iPad for a poll" })).toBeVisible();
  // A wrong code says only that it didn't work.
  await ipad.getByLabel("Pairing code").fill("000000");
  await ipad.getByRole("button", { name: "Pair this iPad" }).click();
  await expect(ipad.getByText("That code didn't work. Check it, or ask the interviewer for a new one.")).toBeVisible();
  await ipad.getByLabel("Pairing code").fill(shown.replace(" ", ""));
  await ipad.getByRole("button", { name: "Pair this iPad" }).click();
  await ipad.waitForURL("**/polls/kiosk");
  expect((await (await ipad.request.get("/api/users/me")).json()).user).toBeNull();
  expect((await ipad.request.get("/api/byline/polls")).status()).toBe(401);
  // Paired devices start locked, showing only the poll and place.
  await expect(ipad.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(ipad.getByText(/Cafeteria · Lunch A\. Interviewer: enter your PIN/)).toBeVisible();
  await expect(page.getByText("The iPad is paired")).toBeVisible({ timeout: 15_000 });
  await enterPin(ipad);

  // The interviewer screen keeps the sampling rule in front of the reporter.
  await expect(ipad.locator("[data-polls-sampling]")).toContainText(SAMPLING);
  await ipad.getByRole("button", { name: "Student declined" }).click();
  await expect(ipad.getByText("Decline recorded.")).toBeVisible();
  await ipad.getByRole("button", { name: "Student agreed — begin survey" }).click();
  await runner(ipad).getByRole("button", { name: "Start" }).click();
  await answer(ipad, "11th grade");
  await next(ipad);
  while ((await heading(ipad).textContent()) !== "Have you been assigned a book report this year?") await runner(ipad).getByRole("button", { name: "Skip" }).click();
  await answer(ipad, "Yes");
  await next(ipad);
  await answer(ipad, "Yes");
  await next(ipad);
  await answer(ipad, "Brainstorming ideas");
  await answer(ipad, "Checking grammar or spelling");
  await next(ipad);
  await answer(ipad, "The rules weren’t clear to me");
  await next(ipad);
  await next(ipad); // The note before the last question.
  await runner(ipad).getByRole("textbox").fill("I used it to check my commas.");
  await next(ipad, "Submit");
  await expect(runner(ipad).getByText("Your answers are saved.")).toBeVisible();

  // Back to the interviewer, then end the session.
  await runner(ipad).getByRole("button", { name: "Return to interviewer" }).click();
  await enterPin(ipad);
  await expect(ipad.getByText("Completed").locator("..").getByText("1", { exact: true })).toBeVisible();
  await ipad.getByRole("button", { name: "End session" }).click();
  await ipad.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(ipad.getByRole("heading", { name: "Session ended" })).toBeVisible();
  await expect(ipad.getByText("1 completed · 1 declined · 0 incomplete")).toBeVisible();
  await expect(ipad.getByText("Pair this iPad with a new code")).toBeVisible();
  await ipadContext.close();

  // Results on the laptop, which stayed signed in throughout.
  await page.getByRole("tab", { name: "Results" }).click();
  const summary = page.locator("[data-polls-summary]");
  await expect(summary.getByText("Responses")).toBeVisible();
  await expect(summary.getByText("1", { exact: true }).first()).toBeVisible();
  // Too few approaches to state rates.
  await expect(summary.getByText(/Too few approaches/).first()).toBeVisible();
  // Charts are real, accessible Recharts charts.
  await expect(page.locator("[data-polls-results] .recharts-surface").first()).toBeVisible();
  await expect(page.locator("[data-polls-question-result=used_ai] [data-polls-base]")).toHaveText(/1 answered/);
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText("CSV of all responses")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Responses CSV (one row each)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ai-at-ninety-six-high-school-responses-\d{4}-\d{2}-\d{2}\.csv$/);
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await download.path(), "utf8");
  expect(text.split("\r\n")[0]).toContain("ai_purpose/grammar");
  expect(text).toContain("brainstorm grammar");
});

test("sorts questions in Build from the keyboard and saves as it goes", async ({ page }) => {
  await signIn(page, "/admin/polls");
  await page.locator("[data-polls-row]").filter({ hasText: TITLE }).first().click();
  await page.getByRole("tab", { name: "Build" }).click();
  const questions = page.locator("[data-polls-question-map] [data-polls-question]");
  const first = await questions.nth(0).getAttribute("data-polls-question");
  const second = await questions.nth(1).getAttribute("data-polls-question");
  const handle = questions.nth(0).getByRole("button", { name: /^Move “/ });
  await handle.focus();
  // Pick up, move, drop, with the pauses a person would leave between keys.
  for (const key of ["Space", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect(page.locator("[id^=DndLiveRegion]").first()).toContainText("moved to position 2");
  await expect(questions.nth(0)).toHaveAttribute("data-polls-question", second!);
  await expect(questions.nth(1)).toHaveAttribute("data-polls-question", first!);
  await expect(page.locator("[data-polls-save=saved]")).toBeVisible({ timeout: 10_000 });
  // Move up from the overflow menu puts it back.
  await questions.nth(1).getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(questions.nth(0)).toHaveAttribute("data-polls-question", first!);
  await expect(page.locator("[data-polls-save=saved]")).toBeVisible({ timeout: 10_000 });
  // Identifiers stay out of the normal workflow.
  await questions.nth(0).locator("button[aria-current], button:not([aria-label])").first().click();
  await expect(page.locator("[data-polls-inspector]").getByLabel("Identifier")).toBeHidden();
});

test("uses a section drawer, not a scrolling tab strip, on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/admin/polls");
  await page.locator("[data-polls-row]").filter({ hasText: TITLE }).first().click();
  await expect(page.getByRole("tab", { name: "Results" })).toHaveCount(0);
  await page.locator("[data-polls-section-button]").click();
  await page.getByRole("navigation", { name: "Poll sections" }).getByRole("button", { name: "Results" }).click();
  await expect(page).toHaveURL(/tab=results/);
  await expect(page.locator("[data-polls-section-button]")).toContainText("Results");
  // Filters move into a drawer too.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("heading", { name: "Filter results" })).toBeVisible();
});
