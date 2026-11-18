import { expect, test, type Page } from "@playwright/test";
import { emptyDefinition, type SurveyDefinition } from "../../src/polls/engine/types";
import { markWelcomeSeen } from "./helpers";

const EDITOR = { email: "editor@polls.test", password: "polls-browser-editor-2026" };
const canvas = (page: Page) => page.getByRole("region", { name: "Poll logic map" });
const node = (page: Page, name: string) => canvas(page).locator(".react-flow__node").filter({ has: page.getByText(name, { exact: true }).and(page.locator("[data-poll-map-label]")) });
const edge = (page: Page, label: string) => canvas(page).locator(".poll-dependency").filter({ hasText: label });
const save = (page: Page) => page.locator("[data-polls-save]");

async function poll(page: Page, { condition, published = false, section = false }: { condition?: string; published?: boolean; section?: boolean } = {}) {
  const title = "Book report Logic Map";
  const login = await page.request.post("/api/users/login", { data: EDITOR });
  expect(login.ok()).toBe(true);
  const headers = { Authorization: `JWT ${(await login.json()).token}` };
  await markWelcomeSeen(page.request, headers);
  const response = await page.request.post("/api/byline/polls/surveys", { headers, data: { title } });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  const url = `/api/byline/polls/surveys/${id}`;
  const detail = await (await page.request.get(url, { headers })).json();
  const draft: SurveyDefinition = {
    ...emptyDefinition(title),
    lists: [{ name: "yes_no", choices: [{ name: "yes", label: "Yes" }, { name: "no", label: "No" }] }],
    groups: section ? [
      { name: "follow_up", label: "Follow-up", groups: [], relevant: "  ${book} != ''  " },
      { name: "closing", label: "Closing", groups: ["follow_up"] }
    ] : [],
    questions: [
      { kind: "select_one", list: "yes_no", name: "book", label: "Book report?", groups: [], required: false },
      { kind: "text", multiline: false, name: "detail", label: "Tell us more", groups: [], required: false, relevant: condition },
      { kind: "note", name: "note", label: "Thanks for helping", groups: section ? ["follow_up", "closing"] : [] }
    ]
  };
  const seeded = await page.request.patch(url, { headers, data: { draft, draftRevision: detail.survey.draftRevision } });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  if (published) {
    const seededDetail = await seeded.json();
    expect((await page.request.post(`${url}/publish`, { headers, data: { draftRevision: seededDetail.survey.draftRevision } })).ok()).toBe(true);
  }
  await page.goto(`/admin/polls?poll=${id}&tab=build`);
  await expect(page.getByRole("tab", { name: "Questions", exact: true })).toBeVisible();
  return async () => (await page.request.get(url, { headers })).json();
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

test("@laptop creates by dragging, synchronizes views, undoes removal and tests the respondent path", async ({ page }) => {
  const read = await poll(page, { published: true });
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(page).toHaveURL(/build=logic/);
  await expect(canvas(page).locator(".react-flow__node")).toHaveCount(5);
  await expect(canvas(page).getByText(/Q[123] ·/)).toHaveText(["Q1 · Single choice", "Q2 · Written answer", "Q3 · Information"]);
  const source = await node(page, "Book report?").locator("[data-handleid='choice:yes']").boundingBox();
  const target = await node(page, "Tell us more").locator("[data-handleid='shown-when']").boundingBox();
  expect(source && target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Show “Tell us more” when" })).toBeVisible();
  await expect(edge(page, "Yes")).toHaveCount(0);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(edge(page, "Yes")).toHaveCount(1);
  await expect(save(page)).toHaveAttribute("data-polls-save", "saved");
  expect((await read()).current.definition.questions[1].relevant).toBeUndefined();
  expect((await read()).draft.questions[1].relevant).toBe("${book} = 'yes'");

  await page.getByRole("button", { name: "Edit question", exact: true }).click();
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue("Tell us more");
  await choose(page, "Answer", "No");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(edge(page, "No")).toHaveCount(1);
  const rule = edge(page, "No");
  await rule.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Remove condition", exact: true }).click();
  await expect(rule).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rule).toHaveCount(1);
  await expect(save(page)).toHaveAttribute("data-polls-save", "saved");

  await page.getByRole("button", { name: "Test path", exact: true }).click();
  await expect(node(page, "Tell us more")).toHaveAttribute("data-path-visible", "false");
  await choose(page, "Question or section", /^Q1/);
  await choose(page, "Test answer", "No");
  await expect(node(page, "Tell us more")).toHaveAttribute("data-path-visible", "true");
  await expect(rule).toHaveAttribute("data-active", "true");
  await choose(page, "Question or section", /^Q2/);
  await page.getByText("Why is this shown?", { exact: true }).click();
  await expect(page.getByText("“Book report?” is “No”", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Test answer" }).fill("An answer to prune");
  await page.getByRole("button", { name: "Set answer", exact: true }).click();
  await choose(page, "Question or section", /^Q1/);
  await choose(page, "Test answer", "Yes");
  await expect(node(page, "Tell us more")).toHaveAttribute("data-path-visible", "false");
  await choose(page, "Test answer", "No");
  await choose(page, "Question or section", /^Q2/);
  await expect(page.getByRole("textbox", { name: "Test answer" })).toHaveValue("");
  await page.reload();
  await expect(edge(page, "No")).toHaveCount(1);
});

test("@laptop selects nodes and adds logic with the keyboard", async ({ page }) => {
  await poll(page);
  await page.getByRole("tab", { name: "Logic", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toBeVisible();
  const book = node(page, "Book report?");
  const more = node(page, "Tell us more");
  await book.focus();
  await page.keyboard.press("Tab");
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Question or section" })).toContainText("Tell us more");
  await book.focus();
  await page.keyboard.press("Enter");
  const add = page.getByRole("button", { name: "Add logic", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add logic" })).toBeFocused();
  const pick = page.getByRole("combobox", { name: "Destination" });
  await pick.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(pick).toContainText("Tell us more");
  await page.getByRole("button", { name: "Continue", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Apply", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(edge(page, "Yes")).toHaveCount(1);
  for (const name of ["Fit map", "Reset layout"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toBeFocused();
  }
});

test("@ipad uses 44px controls and a Drawer without overflowing the shell", async ({ page }) => {
  await poll(page);
  expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
  await page.getByRole("tab", { name: "Logic", exact: true }).tap();
  await expect(canvas(page)).toBeVisible();
  const width = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await width()).toBeLessThanOrEqual(1);
  const add = page.getByRole("button", { name: "Add logic", exact: true });
  expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await add.tap();
  const drawer = page.getByRole("dialog", { name: "Add logic" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("combobox", { name: "Destination" }).tap();
  await page.getByRole("option", { name: /Tell us more/ }).tap();
  await drawer.getByRole("button", { name: "Continue", exact: true }).tap();
  const editor = page.getByRole("dialog", { name: "Show “Tell us more” when" });
  await expect(editor).toBeVisible();
  const apply = editor.getByRole("button", { name: "Apply", exact: true });
  expect((await apply.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await apply.tap();
  await expect(edge(page, "Yes")).toHaveCount(1);
  await expect(editor).toBeHidden();
  const viewport = canvas(page).locator(".react-flow__viewport");
  const beforePan = await viewport.getAttribute("style");
  const pane = canvas(page).locator(".react-flow__pane");
  await pane.scrollIntoViewIfNeeded();
  const bounds = await pane.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds!.x + 50, bounds!.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 130, bounds!.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("style", beforePan ?? "");
  const beforeZoom = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Zoom in" }).tap();
  await expect(viewport).not.toHaveAttribute("style", beforeZoom ?? "");
  await page.getByRole("button", { name: "Fit map" }).tap();
  expect(await width()).toBeLessThanOrEqual(1);
  await expect(save(page)).toHaveAttribute("data-polls-save", "saved");
});

test("@laptop preserves Advanced and group rules across Build edits, and flags a forward reference", async ({ page }) => {
  const raw = '  string-length(${book}) > 0  ';
  const read = await poll(page, { condition: raw, section: true });
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "Follow-up")).toContainText("Section · Q3");
  await expect(node(page, "Closing")).toContainText("Follow-up");
  const groupEdge = canvas(page).locator(".poll-dependency").filter({ has: page.getByText("Was answered", { exact: true }) });
  await expect(groupEdge).toHaveCount(1);
  await expect(groupEdge).toHaveAttribute("aria-label", /Follow-up/);
  await edge(page, "Advanced condition").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Condition", { exact: true })).toHaveValue(raw);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit question", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill("What did you read?");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByLabel("Identifier", { exact: true }).fill("reading_detail");
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "What did you read?")).toHaveAttribute("data-id", "question:reading_detail");
  await expect(save(page)).toHaveAttribute("data-polls-save", "saved");
  const saved = await read();
  expect(saved.draft.questions[1].relevant).toBe(raw);
  expect(saved.draft.groups[0].relevant).toBe("  ${book} != ''  ");

  await page.getByRole("button", { name: "Edit display logic", exact: true }).click();
  await page.getByRole("button", { name: "Replace with builder" }).click();
  await page.getByRole("button", { name: "Only when…" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(edge(page, "Yes")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit question", exact: true }).click();
  await page.getByRole("button", { name: "Move up", exact: true }).click();
  await expect(page.getByText(/asked later in the survey/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "What did you read?")).toContainText("Check rule");
  await expect(page.getByRole("complementary", { name: "Logic details" })).toContainText("asked later in the survey");
});

test("@laptop saves moved cards as preferences and keeps the Poll draft intact", async ({ page }) => {
  const read = await poll(page);
  const before = await read();
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  const card = node(page, "Book report?");
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Enter");
  // The React Flow keyboard movement changes only the map card position.
  const beforeMove = await card.getAttribute("style");
  const pref = page.waitForResponse((response) => response.url().includes("/payload-preferences/poll-logic-layout") && response.request().method() === "POST");
  await page.keyboard.press("ArrowDown");
  await expect(card).not.toHaveAttribute("style", beforeMove ?? "");
  expect((await pref).ok()).toBe(true);
  const moved = await card.evaluate((element) => (element as HTMLElement).style.transform);
  await page.reload();
  await expect.poll(() => card.evaluate((element) => (element as HTMLElement).style.transform)).toBe(moved);
  const after = await read();
  expect(after.draft).toEqual(before.draft);
  expect(after.survey.draftRevision).toBe(before.survey.draftRevision);
});

test("@laptop reflects question, answer and section edits when switching from Questions", async ({ page }) => {
  await poll(page);
  await page.getByRole("button", { name: "Add answer" }).click();
  await page.getByLabel("Answer 3", { exact: true }).fill("Maybe");
  await page.getByRole("button", { name: "Move answer “Maybe”" }).focus();
  const announcement = page.locator("[data-polls-inspector] [id^=DndLiveRegion]");
  await page.keyboard.press("Space");
  await expect(announcement).toContainText("“Maybe” is over position 3");
  // Let the keyboard sensor attach after lift before sending the next key.
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toContainText("over position 2");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Answer 2", { exact: true })).toHaveValue("Maybe");
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "Book report?").locator("li")).toHaveText(["Yes", "Maybe", "No"]);
  await page.getByRole("button", { name: "Edit question", exact: true }).click();
  await page.getByRole("button", { name: "Remove Maybe", exact: true }).click();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill("Which class?");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Section heading").fill("Classes");
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "Book report?").locator("li")).toHaveText(["Yes", "No"]);
  await expect(node(page, "Classes")).toContainText("Section · Q2");
  await expect(node(page, "Which class?")).toContainText("Classes");
  await page.getByRole("button", { name: "Edit question", exact: true }).click();
  await page.getByRole("button", { name: "More question actions" }).click();
  await page.getByRole("menuitem", { name: "Delete question" }).click();
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(node(page, "Which class?")).toHaveCount(0);
  await expect(node(page, "Tell us more")).toContainText("Q2");
});
