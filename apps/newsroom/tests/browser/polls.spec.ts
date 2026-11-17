import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { markWelcomeSeen } from "./helpers";

/**
 * The whole Wildcat Polls workflow (docs/wildcat-polls.md): sign in → Polls →
 * import the example workbook → validate → preview a branch → publish → start
 * fieldwork → kiosk → decline → a student's response → submit → back to the
 * interviewer with the PIN → end → results → export. Accounts come from
 * scripts/seed-polls-browser.ts (test values for that fixture only).
 */
const EDITOR = { email: "editor@polls.test", password: "polls-browser-editor-2026" };
const WORKBOOK = fileURLToPath(new URL("../../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx", import.meta.url));
const PIN = "4826";

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
const next = (page: Page, name = "Next") => runner(page).getByRole("button", { name, exact: true }).click();
const heading = (page: Page) => runner(page).locator("h1");

async function enterPin(page: Page) {
  for (const digit of PIN) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}

test("import, preview, publish, run fieldwork on a kiosk, and read the results", async ({ page }) => {
  await signIn(page, "/admin/polls");
  await expect(page.getByRole("heading", { level: 1, name: "Polls", exact: true })).toBeVisible();

  // Import → validate → review → preview → publish.
  await page.getByRole("button", { name: "Import spreadsheet" }).first().click();
  await page.locator("[data-polls-upload]").setInputFiles(WORKBOOK);
  await expect(page.getByText("No errors.")).toBeVisible();
  await page.getByRole("button", { name: "Review questions" }).click();
  await expect(page.getByText(/Shown when .*Have you been assigned a book report this year\?.* is .*Yes/)).toBeVisible();
  await page.getByRole("button", { name: "Try it" }).click();
  await runner(page).getByRole("button", { name: "Start" }).click();
  await answer(page, "10th grade");
  await next(page);
  await runner(page).getByRole("button", { name: "Skip" }).click();
  // Skip to the book report and take the "yes" branch.
  while ((await heading(page).textContent()) !== "Have you been assigned a book report this year?") await runner(page).getByRole("button", { name: "Skip" }).click();
  await answer(page, "Yes");
  await next(page);
  await expect(heading(page)).toHaveText("Did you use AI for any part of it?");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();

  // Start fieldwork and lock this "iPad".
  await page.getByRole("button", { name: "Start fieldwork" }).click();
  await page.getByText("Cafeteria", { exact: true }).click();
  await page.getByRole("radio", { name: "Lunch A" }).or(page.getByRole("button", { name: "Lunch A" })).first().click();
  await page.getByLabel("PIN", { exact: true }).fill(PIN);
  await page.getByLabel("Again", { exact: true }).fill(PIN);
  await page.getByRole("button", { name: "Start session and lock this iPad" }).click();
  await page.waitForURL("**/polls/kiosk");

  // The device is no longer signed in to Byline.
  expect((await (await page.request.get("/api/users/me")).json()).user).toBeNull();
  expect((await page.request.get("/api/byline/polls")).status()).toBe(401);
  await expect(page.getByText("Interviewer", { exact: true })).toBeVisible();

  // A refusal, then a student who agrees.
  await page.getByRole("button", { name: "Student declined" }).click();
  await expect(page.getByText("Decline recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Student agreed — begin survey" }).click();
  await runner(page).getByRole("button", { name: "Start" }).click();
  await answer(page, "11th grade");
  await next(page);
  while ((await heading(page).textContent()) !== "Have you been assigned a book report this year?") await runner(page).getByRole("button", { name: "Skip" }).click();
  await answer(page, "Yes");
  await next(page);
  await answer(page, "Yes");
  await next(page);
  await answer(page, "Brainstorming ideas");
  await answer(page, "Checking grammar or spelling");
  await next(page);
  await answer(page, "The rules weren’t clear to me");
  await next(page);
  await next(page); // The note before the last question.
  await runner(page).getByRole("textbox").fill("I used it to check my commas.");
  await next(page, "Submit");
  await expect(runner(page).getByText("Your answers are saved.")).toBeVisible();

  // Back to the interviewer, then end the session.
  await runner(page).getByRole("button", { name: "Return to interviewer" }).click();
  await enterPin(page);
  await expect(page.getByText("Completed").locator("..").getByText("1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "Session ended" })).toBeVisible();
  await expect(page.getByText("1 completed · 1 declined · 0 incomplete")).toBeVisible();

  // Results and export, signed in again.
  await signIn(page, "/admin/polls");
  await page.getByRole("button", { name: "AI at Ninety Six High School" }).first().click();
  await page.getByRole("tab", { name: "Results" }).click();
  await expect(page.locator("[data-polls-results]").getByText("response", { exact: true })).toBeVisible();
  await expect(page.getByText("2 approached in person · 1 declined · 0 incomplete.", { exact: false })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Responses CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ai-at-ninety-six-high-school-responses-\d{4}-\d{2}-\d{2}\.csv$/);
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await download.path(), "utf8");
  expect(text.split("\r\n")[0]).toContain("ai_purpose/grammar");
  expect(text).toContain("brainstorm grammar");
});
