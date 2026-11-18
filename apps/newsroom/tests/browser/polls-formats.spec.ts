import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createMatrix } from "../../src/polls/engine/build-items";
import { emptyDefinition, type SurveyDefinition } from "../../src/polls/engine/types";
import { markWelcomeSeen } from "./helpers";

const EDITOR = { email: "editor@polls.test", password: "polls-browser-editor-2026" };
const PIN = "4826";
const graphics = [
  { file: /^poll-wildcat(?:-\d+)?\.png$/, alt: "Maroon school graphic", label: "Wildcat" },
  { file: /^poll-tiger(?:-\d+)?\.png$/, alt: "Gold school graphic", label: "Tiger" }
];
const runner = (page: Page) => page.locator("[data-poll-runner]");
const step = (page: Page, name = "Continue") => runner(page).getByRole("button", { name, exact: true });

async function connect(request: APIRequestContext) {
  const login = await request.post("/api/users/login", { data: EDITOR });
  expect(login.ok()).toBe(true);
  const headers = { Authorization: `JWT ${(await login.json()).token}` };
  async function call(method: "get" | "post" | "patch", path: string, data?: unknown) {
    const response = await request[method](`/api/byline/polls${path}`, { headers, ...(data === undefined ? {} : { data }) });
    expect(response.ok(), `${method} ${path} · ${await response.text()}`).toBeTruthy();
    return response.json();
  }
  return { call, headers };
}

async function signIn(page: Page, path: string) {
  await page.goto(`/admin/login?redirect=${encodeURIComponent(path)}`);
  await page.getByRole("textbox", { name: "Email" }).fill(EDITOR.email);
  await page.getByLabel("Password", { exact: true }).fill(EDITOR.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin/polls");
  const { headers } = await connect(page.request);
  await markWelcomeSeen(page.request, headers);
  await page.reload();
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function answerMatrix(page: Page, options: { landscape?: boolean; checkMissing?: boolean }) {
  const matrix = runner(page).locator("[data-poll-matrix]");
  const rows = matrix.getByRole("radiogroup");
  await expect(rows).toHaveCount(3);
  if (options.landscape !== undefined) {
    const cells = rows.first().getByRole("radio");
    const first = (await cells.nth(0).boundingBox())!;
    const second = (await cells.nth(1).boundingBox())!;
    if (options.landscape) expect(Math.abs(first.y - second.y)).toBeLessThan(4);
    else expect(second.y - first.y).toBeGreaterThanOrEqual(44);
  }
  if (options.checkMissing) {
    await step(page).click();
    await expect(runner(page).getByRole("alert")).toContainText("First statement");
  }
  for (let i = 0; i < 3; i++) await rows.nth(i).getByRole("radio", { name: "Agree", exact: true }).click();
  await assertNoOverflow(page);
  await step(page).click();
}

async function buildQuestion(page: Page, kind: string, label: string) {
  await page.getByRole("button", { name: "Add a different kind of question" }).click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
  const editor = page.locator("[data-polls-inspector]");
  await editor.getByLabel("Question", { exact: true }).fill(label);
  return editor;
}

test("Build, preview and publish expanded questions, then collect and read Results", async ({ page, request, browser }) => {
  const { call } = await connect(request);
  const { id } = await call("post", "/surveys", { title: "Browser question formats" });
  await signIn(page, `/admin/polls?poll=${id}&tab=build`);
  await expect(page.locator("[data-polls-editor]")).toBeVisible();

  const display = async (value: string) => {
    await page.locator("[data-polls-inspector]").getByLabel("Display", { exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  };
  let editor = await buildQuestion(page, "Single choice", "Which card do you like?");
  await display("Cards");
  await editor.getByLabel("Answer 1", { exact: true }).fill("Journalist");
  await editor.getByLabel("Answer 2", { exact: true }).fill("Photographer");
  await buildQuestion(page, "Single choice", "How much do you agree?");
  await display("Likert");
  await expect(editor.getByLabel("Answer 5", { exact: true })).toHaveValue("Strongly agree");

  editor = await buildQuestion(page, "Image choice", "Pick a school graphic");
  await editor.getByLabel("Answer 1", { exact: true }).fill("Wildcat");
  await editor.getByLabel("Answer 2", { exact: true }).fill("Tiger");
  for (const { file, label } of graphics) {
    await editor.getByRole("button", { name: `Choose image for ${label}` }).click();
    const picker = page.locator("[data-media-picker]");
    await expect(picker).toBeVisible();
    await picker.getByText(file).first().click();
    await picker.getByRole("button", { name: "Use image", exact: true }).click();
    await expect(editor.getByRole("button", { name: `Replace image for ${label}` })).toBeVisible();
  }
  await editor.getByRole("button", { name: "Preview question" }).click();
  await expect(editor.locator("[data-polls-question-preview]").getByAltText(graphics[0].alt)).toBeVisible();

  editor = await buildQuestion(page, "Ranking", "Rank the school issues");
  await editor.getByLabel("Answer 1", { exact: true }).fill("School lunch");
  await editor.getByLabel("Answer 2", { exact: true }).fill("Parking");
  await editor.getByRole("button", { name: "Add answer", exact: true }).click();
  await editor.getByLabel("Answer 3", { exact: true }).fill("Events");
  await editor.getByRole("switch", { name: "Required" }).click();

  await buildQuestion(page, "Matrix", "Rate these statements");
  await expect(page.locator("[data-polls-matrix-editor]")).toBeVisible();
  await expect(page.locator("[data-polls-question-map]").getByText("Matrix · 3 rows", { exact: false })).toHaveCount(1);
  await expect(page.locator("[data-polls-question-map]").getByText("First statement", { exact: true })).toHaveCount(0);
  await buildQuestion(page, "Confirmation", "I have read the directions");
  await page.locator("[data-polls-inspector]").getByRole("switch", { name: "Required" }).click();
  await expect(page.locator("[data-polls-save=saved]")).toBeVisible();

  await page.getByRole("tab", { name: "Preview" }).click();
  await step(page, "Start").click();
  await expect(runner(page).locator("[data-choice-display=cards]")).toBeVisible();
  await runner(page).getByRole("radio", { name: "Journalist" }).check();
  await step(page).click();
  await expect(runner(page).locator("[data-choice-display=likert]")).toBeVisible();
  await runner(page).getByRole("radio", { name: "Strongly agree" }).check();
  await step(page).click();
  await expect(runner(page).getByAltText(graphics[0].alt)).toBeVisible();
  await runner(page).getByText("Wildcat", { exact: true }).click();
  await step(page).click();

  await expect(step(page)).toBeDisabled();
  await step(page, "Use this order").click();
  await expect(step(page)).toBeEnabled();
  const order = runner(page).getByRole("list", { name: "Current ranking" });
  await order.getByRole("button", { name: "Move School lunch down" }).click();
  await expect(order.locator("li").first()).toContainText("Parking");
  const drag = order.getByRole("button", { name: "Drag Parking to reorder" });
  await drag.focus();
  await page.keyboard.press("Space");
  const rankingStatus = runner(page).locator("[id^=DndLiveRegion]");
  await expect(rankingStatus).toContainText("Parking is over position 1");
  await page.keyboard.press("ArrowDown");
  await expect(rankingStatus).toContainText("Parking is over position 2");
  await page.keyboard.press("Space");
  await expect(order.locator("li").first()).toContainText("School lunch");
  const from = (await order.getByRole("button", { name: "Drag Events to reorder" }).boundingBox())!;
  const to = (await order.locator("li").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(order.locator("li").first()).toContainText("Events");
  // dnd-kit briefly consumes clicks after a pointer drag so a drop doesn't activate a control.
  await page.waitForTimeout(100);
  await step(page, "Use this order").click();
  await expect(step(page, "Order confirmed")).toBeVisible();
  await expect(step(page)).toBeEnabled();
  await step(page).click();
  await expect(runner(page).locator("[data-poll-progress]")).toHaveText("Question 5 of 6");
  await answerMatrix(page, { checkMissing: true });
  await expect(step(page, "Submit")).toBeDisabled();
  await runner(page).getByRole("checkbox", { name: "I understand" }).check();
  await step(page, "Submit").click();
  await expect(runner(page).getByText("Preview finished. Nothing was saved.")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Version 1", { exact: true }).first()).toBeVisible();
  const linked = await call("patch", `/surveys/${id}`, { publicLink: { enabled: true } });
  const anonymous = await browser.newContext();
  try {
    const respondent = await anonymous.newPage();
    await respondent.goto(new URL(`/poll/${linked.survey.publicLinkSettings.key}`, page.url()).href);
    await step(respondent, "Start").click();
    await step(respondent, "Skip").click();
    await step(respondent, "Skip").click();
    const image = runner(respondent).getByAltText(graphics[0].alt);
    await expect(image).toHaveAttribute("src", /^\/api\/byline\/polls\/media\/\d+\/\d+\/[\w-]{43}$/);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await runner(respondent).getByText("Wildcat", { exact: true }).click();
    await step(respondent).click();
    await step(respondent, "Use this order").click();
    await step(respondent).click();
    await answerMatrix(respondent, { landscape: true });
    await runner(respondent).getByRole("checkbox", { name: "I understand" }).check();
    // Public links keep their existing minimum time between starting and submitting.
    await respondent.waitForTimeout(3100);
    await step(respondent, "Submit").click();
    await expect(runner(respondent).getByText("Your answers are saved.")).toBeVisible();
  } finally {
    await anonymous.close();
  }
  await page.getByRole("tab", { name: "Results" }).click();
  await expect(page.locator("[data-polls-ranking-result]").getByText("School lunch", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-polls-confirmation-result]")).toContainText("Confirmed");
  await expect(page.locator("[data-polls-matrix-result]")).toContainText("1 answered");
  await page.locator("[data-polls-matrix-result]").getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table", { name: /Matrix distribution/ })).toContainText("100% (1)");
});

async function devicePoll(request: APIRequestContext, pair: boolean) {
  const { call, headers } = await connect(request);
  const assets = await request.get("/api/media?limit=20", { headers });
  const documents: Array<{ filename: string; id: number }> = (await assets.json()).docs;
  const images = graphics.map(({ file, label }, i) => {
    const mediaId = documents.find(({ filename }) => file.test(filename))?.id;
    if (!mediaId) throw new Error(`Media fixture is missing for ${label}.`);
    return { name: `graphic_${i}`, label, image: { mediaId } };
  });
  const definition: SurveyDefinition = {
    ...emptyDefinition("School formats on a device"),
    questions: [
      { kind: "select_one", name: "graphic", label: "Choose a graphic", groups: [], required: true, appearance: "columns", list: "graphics" },
      { kind: "rank", name: "rank", label: "Rank our topics", groups: [], required: true, list: "topics" }
    ],
    lists: [
      { name: "graphics", choices: images },
      { name: "topics", choices: ["Lunch", "Events", "Parking"].map((label) => ({ name: label.toLowerCase(), label })) }
    ]
  };
  const { draft } = createMatrix(definition, 2, []);
  draft.questions.push({ kind: "acknowledge", name: "confirmed", label: "I have reviewed my answers", groups: [], required: true });
  const { id } = await call("post", "/surveys", { definition: draft });
  const published = await call("post", `/surveys/${id}/publish`, { draftRevision: 1 });
  if (!pair) return { code: "", key: (await call("patch", `/surveys/${id}`, { publicLink: { enabled: true } })).survey.publicLinkSettings.key, images: [] as string[] };
  const { locations } = await call("get", "");
  const session = await call("post", "/sessions", { surveyId: id, locationId: locations[0].id, period: "Lunch A", method: "Every third student" });
  const code = (await call("post", `/sessions/${session.id}/pairing`, { pin: PIN })).code;
  return { code, key: "", images: Object.values(published.current.images.graphics).map((value) => (value as { src: string }).src) };
}

test("@ipad @phone uses image cards, ranking, a responsive Matrix and Confirmation", async ({ page, request, context }, info) => {
  const pair = info.project.name.startsWith("ipad");
  const poll = await devicePoll(request, pair);
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (pair) {
    const preloaded = Promise.all(poll.images.map((src) => page.waitForResponse((response) => new URL(response.url()).pathname === src && response.ok())));
    await page.goto(`/poll#${poll.code}`);
    await page.getByRole("button", { name: "Pair this iPad" }).click();
    await page.waitForURL("**/polls/kiosk");
    await preloaded;
    for (const digit of PIN) await page.getByRole("button", { name: digit, exact: true }).click();
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("button", { name: "Student agreed — begin survey" }).click();
    await expect(step(page, "Start")).toBeVisible();
    await context.setOffline(true);
    await step(page, "Start").click();
  } else {
    await page.goto(`/poll/${poll.key}`);
  }
  if (!pair) await step(page, "Start").click();
  const image = runner(page).getByAltText(graphics[0].alt);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  expect((await runner(page).getByText("Wildcat", { exact: true }).locator("..").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await assertNoOverflow(page);
  await runner(page).getByText("Wildcat", { exact: true }).click();
  await step(page).click();
  const move = runner(page).getByRole("button", { name: "Move Events up" });
  expect((await move.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await move.tap();
  await expect(runner(page).getByRole("list", { name: "Current ranking" }).locator("li").first()).toContainText("Events");
  await step(page, "Use this order").tap();
  await step(page).tap();
  await answerMatrix(page, { landscape: info.project.name === "ipad-landscape", checkMissing: true });
  await runner(page).getByRole("checkbox", { name: "I understand" }).check();
  await assertNoOverflow(page);
  if (!pair) await page.waitForTimeout(3100);
  await step(page, "Submit").click();
  if (pair) {
    await expect(runner(page).getByText(/saved on this iPad/)).toBeVisible();
    await context.setOffline(false);
    await expect(runner(page).getByText("Your answers are saved.")).toBeVisible();
  } else await expect(runner(page).getByText("Your answers are saved.")).toBeVisible();
});

test("answers with List, Horizontal and both Dropdown presentations from the keyboard", async ({ page, request }) => {
  const { call } = await connect(request);
  const definition: SurveyDefinition = {
    ...emptyDefinition("Choice displays"),
    questions: [
      { kind: "select_one", name: "list", label: "List", groups: [], required: true, list: "places" },
      { kind: "select_one", name: "horizontal", label: "Horizontal choices", groups: [], required: true, list: "places", appearance: "horizontal-compact" },
      { kind: "select_one", name: "dropdown", label: "Pick one place", groups: [], required: true, list: "places", appearance: "minimal" },
      { kind: "select_multiple", name: "multiple", label: "Pick several places", groups: [], required: true, list: "places", appearance: "minimal" }
    ],
    lists: [{ name: "places", choices: [
      { name: "library", label: "Library" }, { name: "cafeteria", label: "School cafeteria" }, { name: "gym", label: "School gymnasium" }
    ] }]
  };
  const { id } = await call("post", "/surveys", { definition });
  await call("post", `/surveys/${id}/publish`, { draftRevision: 1 });
  const { survey } = await call("patch", `/surveys/${id}`, { publicLink: { enabled: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/poll/${survey.publicLinkSettings.key}`);
  await step(page, "Start").click();
  await expect(runner(page).locator("[data-choice-display=list]")).toBeVisible();
  const library = runner(page).getByRole("radio", { name: "Library" });
  await library.focus();
  await page.keyboard.press("Space");
  await expect(library).toBeChecked();
  await step(page).click();
  await expect(runner(page).locator("[data-choice-display=horizontal]")).toBeVisible();
  await assertNoOverflow(page);
  await runner(page).getByRole("radio", { name: "School cafeteria" }).check();
  await step(page).click();
  const one = runner(page).getByRole("combobox", { name: "Pick one place" });
  await one.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Library", exact: true }).press("Enter");
  await expect(one).toContainText("Library");
  await step(page).click();
  const multiple = runner(page).getByRole("combobox", { name: "Pick several places" });
  await multiple.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Library", exact: true }).press("Enter");
  await page.getByRole("option", { name: "School gymnasium", exact: true }).press("Enter");
  await page.keyboard.press("Escape");
  await expect(multiple).toContainText("2 selected");
  await expect(runner(page).getByText("Library, School gymnasium", { exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await page.waitForTimeout(3100);
  await step(page, "Submit").click();
  await expect(runner(page).getByText("Your answers are saved.")).toBeVisible();
});
