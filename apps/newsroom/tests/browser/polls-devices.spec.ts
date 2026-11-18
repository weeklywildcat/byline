import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * Wildcat Polls on Apple devices (docs/wildcat-polls.md#tests), in WebKit:
 *
 * - @ipad (landscape and portrait projects): pairing at /poll with a code
 *   from the link's fragment, the locked kiosk, the interviewer screen and
 *   the respondent screens, with coarse-pointer touch targets, keyboard
 *   answers and reduced motion.
 * - @phone: a public web link on a narrow phone, at /poll/<key> and the older
 *   /polls/s/<key>.
 *
 * Setup goes through the API with a test editor's token (seed-polls-browser.ts).
 */
const EDITOR = { email: "editor@polls.test", password: "polls-browser-editor-2026" };
const PIN = "4826";

type Setup = { surveyId: number; code: string; key: string; title: string };

async function setUp(request: APIRequestContext, options: { pair: boolean }): Promise<Setup> {
  const login = await request.post("/api/users/login", { data: EDITOR });
  const headers = { Authorization: `JWT ${(await login.json()).token}` };
  const call = async (method: "get" | "post" | "patch", path: string, data?: unknown) => {
    const response = await request[method](`/api/byline/polls${path}`, { headers, ...(data === undefined ? {} : { data }) });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
    return response.json();
  };
  const { id } = await call("post", "/surveys", { example: true });
  const detail = await call("get", `/surveys/${id}`);
  await call("post", `/surveys/${id}/publish`, { draftRevision: detail.survey.draftRevision });
  const opened = await call("patch", `/surveys/${id}`, { publicLink: { enabled: true } });
  let code = "";
  if (options.pair) {
    const locations = (await call("get", "")).locations as Array<{ id: number; name: string }>;
    const session = await call("post", "/sessions", { surveyId: id, locationId: locations[0].id, period: "Lunch B", method: "Every fifth student at the door" });
    code = (await call("post", `/sessions/${session.id}/pairing`, { pin: PIN, expiresInMinutes: 30 })).code;
  }
  return { surveyId: id, code, key: opened.survey.publicLinkSettings.key, title: opened.survey.title };
}

const runner = (page: Page) => page.locator("[data-poll-runner]");
const height = async (locator: Locator) => (await locator.boundingBox())?.height ?? 0;

async function enterPin(page: Page) {
  for (const digit of PIN) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}

test("@ipad pairs without signing in, starts locked, and is sized for a finger", async ({ page, request }) => {
  const setup = await setUp(request, { pair: true });
  // A pairing link carries the code after #, which the browser never sends to the server.
  await page.goto(`/poll#${setup.code.replace(" ", "")}`);
  await expect(page.getByLabel("Pairing code")).toHaveValue(setup.code);
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
  expect(await height(page.getByRole("button", { name: "Pair this iPad" }))).toBeGreaterThanOrEqual(52);
  await page.getByRole("button", { name: "Pair this iPad" }).click();
  await page.waitForURL("**/polls/kiosk");

  // Locked: the poll and the place, and the keypad.
  await expect(page.getByRole("heading", { name: setup.title })).toBeVisible();
  for (const digit of ["1", "5", "0"]) expect(await height(page.getByRole("button", { name: digit, exact: true }))).toBeGreaterThanOrEqual(60);
  await enterPin(page);

  // The interviewer screen: the sampling rule up front, enormous primary actions, quiet when healthy.
  await expect(page.locator("[data-polls-sampling]")).toContainText("Every fifth student at the door");
  expect(await height(page.getByRole("button", { name: "Student agreed — begin survey" }))).toBeGreaterThanOrEqual(88);
  expect(await height(page.getByRole("button", { name: "Student declined" }))).toBeGreaterThanOrEqual(72);
  await expect(page.locator("[data-polls-durability]")).toBeVisible();
  await expect(page.locator("[data-polls-offline]")).toHaveCount(0);

  // A student's screens.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Student agreed — begin survey" }).click();
  const start = runner(page).getByRole("button", { name: "Start" });
  expect(await height(start)).toBeGreaterThanOrEqual(52);
  await start.click();
  await expect(runner(page).locator("[data-poll-progress]")).toHaveText("Question 1");
  // No motion when it's asked for.
  expect(await runner(page).locator("section[aria-labelledby]").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  // Every answer is a big target, and the chosen one is obvious.
  const targets = runner(page).getByRole("radiogroup").locator("label[data-slot=field-label]");
  const count = await targets.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) expect(await height(targets.nth(i))).toBeGreaterThanOrEqual(44);
  // The keyboard works too: focus the answers and move with the arrows.
  const ninth = runner(page).getByRole("radio", { name: "9th grade" });
  await ninth.focus();
  await page.keyboard.press("Space");
  await expect(ninth).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(runner(page).getByRole("radio", { name: "10th grade" })).toBeChecked();
  const proceed = runner(page).getByRole("button", { name: "Continue", exact: true });
  expect(await height(proceed)).toBeGreaterThanOrEqual(52);
  // The footer stays on screen and clears the bottom inset.
  const footer = runner(page).locator("footer");
  const box = await footer.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await proceed.click();
  await expect(runner(page).getByRole("button", { name: "Back" })).toBeVisible();

  // The respondent stops; only the PIN returns the iPad, and the survey ends as incomplete.
  await runner(page).getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Unlocking ends the current survey as incomplete.", { exact: false })).toBeVisible();
  await enterPin(page);
  await expect(page.getByText("Incomplete").locator("..").getByText("1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "Session ended" })).toBeVisible();
});

test("@phone answers a public web link on a narrow screen, at both addresses", async ({ page, request }) => {
  const setup = await setUp(request, { pair: false });
  await page.goto(`/polls/s/${setup.key}`);
  await expect(runner(page).getByRole("heading", { name: setup.title })).toBeVisible();
  await page.goto(`/poll/${setup.key}`);
  const welcome = runner(page).getByRole("heading", { name: setup.title });
  await expect(welcome).toBeVisible();
  await expect(runner(page).getByText(/Up to \d+ questions/)).toBeVisible();
  // Nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await runner(page).getByRole("button", { name: "Start" }).click();
  await expect(runner(page).locator("[data-poll-progress]")).toHaveText("Question 1");
  expect(await height(runner(page).locator("label[data-slot=field-label]").first())).toBeGreaterThanOrEqual(44);
  await runner(page).getByText("9th grade", { exact: true }).click();
  await runner(page).getByRole("button", { name: "Continue", exact: true }).click();
  await expect(runner(page).locator("[data-poll-progress]")).toHaveText("Question 2");
  // Skip only appears on optional questions; finish by skipping the rest.
  for (let guard = 0; guard < 30; guard++) {
    if (await runner(page).getByRole("button", { name: "Submit" }).isVisible()) break;
    const skip = runner(page).getByRole("button", { name: "Skip" });
    if (await skip.isVisible()) await skip.click();
    else await runner(page).getByRole("button", { name: "Continue", exact: true }).click();
  }
  // The last question wants a written answer; the on-screen keyboard mustn't hide the footer.
  const box = runner(page).getByRole("textbox");
  if (await box.isVisible()) {
    await box.fill("Nothing else.");
    const footer = await runner(page).locator("footer").boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
  // Public links refuse a submission faster than a person could read.
  await page.waitForTimeout(3200);
  await runner(page).getByRole("button", { name: "Submit" }).click();
  await expect(runner(page).getByText("Your answers are saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You've already answered this poll on this device. Thank you.")).toBeVisible();
});
