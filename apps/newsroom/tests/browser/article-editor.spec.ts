import { expect, test, type Page, type Request } from "@playwright/test";
import { articleMediaFromPayload, collectMediaIds, normalizePayloadArticleBody } from "@byline/editor/normalize";
import { addWithMenu, block, body, caretAfter, createStory, ensureMedia, expectToolbarClear, lexical, login, pageOverflow, paragraph, PDF_NAME, pickInMedia, readDraft, readMediaDocs, signIn, slash, waitForSaved } from "./helpers";

/**
 * Writing a real Weekly Wildcat story with the Byline editor, end to end:
 * prose, slash and Add-menu insertion, the eight story blocks edited in
 * place, Media through Byline's picker, autosave into Payload's own body,
 * and the canonical body the public site will render.
 */
test.describe.configure({ mode: "serial" });

const ANCHORS = {
  intro: "The bell for second lunch rings at 11:38 a.m.",
  quote: "You can tell who has a class on the far side",
  staff: "Cafeteria staff say the problem is space, not effort.",
  changes: "Royal said her team has already made the changes",
  express: "Not every student has the school app",
  district: "The district's 2026 budget request",
  ending: "Until then, Okafor said, she will keep eating on the steps."
};

/** The eight blocks this story writes; the newer article tools have their own spec (article-tools.spec.ts). */
const FIRST_PHASE_BLOCKS = ["photo", "gallery", "reportedQuote", "pullQuote", "keyFacts", "context", "document", "timeline"] as const;

let editorToken = "";
let media: Record<string, number> = {};
let storyId = 0;

test.beforeAll(async ({ request, baseURL }) => {
  editorToken = await login(request, baseURL!, "EDITOR");
  media = await ensureMedia(request, baseURL!, editorToken);
  storyId = await createStory(request, baseURL!, editorToken, {
    headline: "Greenwood's lunch line is longer than lunch",
    deck: "With 1,400 students and a kitchen built for 900, some students get 12 minutes to eat. The district wants a third serving window.",
    kicker: "Student life",
    body: lexical([
      paragraph(`${ANCHORS.intro} By the time junior Amara Okafor reaches the cafeteria, the line already curls past the trophy case.`),
      paragraph(`“${ANCHORS.quote} of the building,” Okafor said. “They’re the ones at the back.”`),
      paragraph(`${ANCHORS.staff} The serving line was built when the school enrolled about 900 students; this year it serves roughly 1,400 in two periods.`),
      paragraph(`${ANCHORS.changes} it can make without construction:`),
      paragraph(`${ANCHORS.express}, and some said they did not know the express station existed.`),
      paragraph(`${ANCHORS.district}, released Oct. 21, asks for money to add a third serving window at Greenwood.`),
      paragraph(ANCHORS.ending)
    ])
  });
});

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, editorToken);
});

async function openStory(page: Page) {
  await page.goto(`/admin/collections/stories/${storyId}`);
  await expect(body(page)).toBeVisible({ timeout: 60_000 });
  await expect(body(page)).toHaveAttribute("contenteditable", "true");
}

/** Story writes that are not autosaves: a nested dialog form submitting Payload's form would make one. */
function watchForSubmits(page: Page) {
  const submits: string[] = [];
  page.on("request", (request: Request) => {
    const url = request.url();
    if (["PATCH", "POST"].includes(request.method()) && new RegExp(`/api/stories/${storyId}(\\?|$)`).test(url) && !url.includes("autosave=true")) submits.push(`${request.method()} ${url}`);
  });
  return submits;
}

test("writes the story: prose, slash insertion and all eight blocks", async ({ page, request, baseURL }) => {
  const submits = watchForSubmits(page);
  await openStory(page);

  // Prose: an H2 through the slash menu, then a list through the Markdown shortcut.
  await caretAfter(page, ANCHORS.staff);
  await page.keyboard.press("Enter");
  await slash(page, "h2", "Heading 2");
  await page.keyboard.type("A kitchen built for a smaller school");
  await caretAfter(page, ANCHORS.changes);
  await page.keyboard.press("Enter");
  await page.keyboard.type("- a second register at the main window;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("pre-wrapped grab-and-go meals at the end of the line;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("and an express station for students who order ahead.");
  await expect(body(page).locator(":scope > h2")).toHaveText("A kitchen built for a smaller school");
  await expect(body(page).locator(":scope > ul > li")).toHaveCount(3);

  // Photo, from the slash menu: the native menu lists both photo tools.
  await caretAfter(page, ANCHORS.quote);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/photo");
  const menu = page.locator(".slash-menu-popup").first();
  await expect(menu).toContainText("Photo Gallery");
  await expect(menu.getByText("Photo", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  const photo = block(page, "photo");
  await expect(photo.getByText("Add a photograph")).toBeVisible();
  // It lands where the caret was: right after the second paragraph.
  await expect(body(page).locator(":scope > *").nth(2)).toHaveClass(/byline-block-photo/);
  await expect(photo.getByRole("button", { name: "Choose from Media" })).toBeFocused();
  await photo.getByRole("button", { name: "Choose from Media" }).click();
  await pickInMedia(page, ["newsroom-panorama.jpg"], /Use this file/);
  await expect(photo.locator("img")).toHaveAttribute("src", /newsroom-panorama/);
  await expect(photo.locator(".photo-credit")).toHaveText("Photo: Maya Torres");
  await photo.getByRole("textbox", { name: "Caption" }).fill("By 11:42 a.m. on a Tuesday in October, the second-lunch line at Greenwood High stretched from the serving windows past the trophy case and around the corner toward the gym, leaving some students fewer than 12 minutes to eat.");
  await photo.getByRole("radio", { name: "Wide" }).or(photo.getByRole("button", { name: "Wide" })).first().click();
  await expect(photo).toHaveClass(/alignwide/);
  await expect(body(page).locator(":scope > *").nth(2)).toHaveClass(/byline-block-photo/);

  // Reported Quote, from the Add menu.
  await caretAfter(page, ANCHORS.staff);
  await addWithMenu(page, "quote", /Reported Quote/);
  const reported = block(page, "reportedQuote");
  await expect(reported.getByRole("textbox", { name: "Quote" })).toBeFocused();
  await page.keyboard.type("We are feeding 1,400 students in two lunch periods with a kitchen built for 900. Every minute we save at the register is a minute a kid gets to sit down.");
  await page.keyboard.press("Enter");
  await expect(reported.getByRole("textbox", { name: "Who said it" })).toBeFocused();
  await page.keyboard.type("Denise Royal, Greenwood cafeteria manager");

  // Key Facts then Gallery after the list (each lands right after the caret).
  await caretAfter(page, "and an express station for students who order ahead.");
  await addWithMenu(page, "facts", /Key Facts/);
  const facts = block(page, "keyFacts");
  await expect(facts.getByRole("textbox", { name: "Fact 1 of 1" })).toBeFocused();
  await page.keyboard.type("Greenwood serves about 1,400 students in two 30-minute lunch periods.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The kitchen and serving line were built in 1998 for a school of 900.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The district's proposed 2026 budget adds $48,000 for a third serving window.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("An express station opened Oct. 6 and served 212 students in its first week.");
  // Move the last fact up one with the keyboard, then check the order.
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(facts.locator("li textarea").nth(2)).toHaveValue(/express station/);
  await expect(facts.locator("li textarea")).toHaveCount(4);

  await caretAfter(page, "and an express station for students who order ahead.");
  await addWithMenu(page, "gallery", /Photo Gallery/);
  const gallery = block(page, "gallery");
  await gallery.getByRole("button", { name: "Choose from Media" }).click();
  await pickInMedia(page, ["newsroom-laughing.jpg", "newsroom-tablet.jpg"], /Add to gallery/);
  await expect(gallery.locator(".byline-gallery-item")).toHaveCount(2);
  await expect(gallery.locator(".byline-gallery")).toHaveClass(/is-pair/);
  await gallery.getByRole("textbox", { name: "Caption for photograph 1 of 2" }).fill("Junior Amara Okafor eats on the courtyard steps after giving up on the line.");
  await gallery.getByRole("textbox", { name: "Caption for photograph 2 of 2" }).fill("Cafeteria manager Denise Royal checks orders at the new express station, which opened Oct. 6.");
  // Reorder with the keyboard from the second caption, then back with the button.
  await gallery.getByRole("textbox", { name: "Caption for photograph 2 of 2" }).press("Alt+Shift+ArrowLeft");
  await expect(gallery.locator(".byline-gallery-item").first().locator("img")).toHaveAttribute("src", /newsroom-tablet/);
  await gallery.locator(".byline-gallery-item").first().hover();
  await gallery.getByRole("button", { name: "Move later" }).first().click();
  await expect(gallery.locator(".byline-gallery-item").first().locator("img")).toHaveAttribute("src", /newsroom-laughing/);
  await expect(gallery.locator(".photo-credit").nth(1)).toHaveText("Photo: Jordan Lee");

  // Context then Pull Quote after the express paragraph.
  await caretAfter(page, ANCHORS.express);
  await addWithMenu(page, "why it matters", /Context/);
  const context = block(page, "context");
  await context.getByRole("button", { name: "Heading" }).click();
  await page.getByRole("menuitem", { name: "Why it matters" }).click();
  await expect(context.getByRole("textbox", { name: "Heading" })).toHaveValue("Why it matters");
  await context.getByRole("textbox", { name: "Context" }).click();
  await page.keyboard.type("Research on school meals has found that students with less than 20 minutes to eat throw away more food and eat fewer fruits and vegetables.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Lunch is also the only meal of the day for some students: 38% of Greenwood students qualify for free or reduced-price meals.");
  // Context is one bounded rich field holding the article's own paragraphs (bold, italic and links allowed).
  await expect(context.locator(".byline-rich-field > p")).toHaveCount(2);

  await caretAfter(page, ANCHORS.express);
  await addWithMenu(page, "quote", /Pull Quote/);
  const pull = block(page, "pullQuote");
  await expect(pull.getByRole("textbox", { name: "Pull quote" })).toBeFocused();
  await page.keyboard.type("Some days I just buy chips from the vending machine because I know I won't make it to the front.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Theo Martinez, sophomore");

  // Timeline then Document after the district paragraph.
  await caretAfter(page, ANCHORS.district);
  await addWithMenu(page, "timeline", /Timeline/);
  const timeline = block(page, "timeline");
  const events = [
    ["Aug. 2025", "Enrollment passes 1,400", "Greenwood opens the school year with its largest enrollment since the building opened."],
    ["Sept. 2025", "Student council surveys the lunch line", "More than 600 students answer; 71% say they regularly have less than 15 minutes to eat."],
    ["Oct. 6, 2025", "Express station opens", "Students can pre-order a wrap or salad on the school app and pick it up at a separate window."],
    ["Jan. 2026", "School board votes on the budget", "The board is scheduled to vote on the Nutrition Services request at its Jan. 14 meeting."]
  ];
  // Enter: label → headline → explanation → the next event, adding one after the last.
  for (const [index, [label, title, explanation]] of events.entries()) {
    await expect(timeline.getByRole("textbox", { name: `Date or label, event ${index + 1}` })).toBeFocused();
    await page.keyboard.type(label!);
    await page.keyboard.press("Enter");
    await expect(timeline.getByRole("textbox", { name: `Headline, event ${index + 1}` })).toBeFocused();
    await page.keyboard.type(title!);
    await page.keyboard.press("Enter");
    await expect(timeline.getByRole("textbox", { name: `Explanation, event ${index + 1}` })).toBeFocused();
    await page.keyboard.type(explanation!);
    if (index < events.length - 1) await page.keyboard.press("Enter");
  }
  await expect(timeline.locator(".byline-timeline-label").nth(0)).toHaveValue("Aug. 2025");
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(4);
  await timeline.getByRole("button", { name: "Mark as the latest event" }).click();
  await expect(timeline.locator(".byline-timeline-item").nth(3)).toHaveClass(/is-current/);
  await expect(timeline.locator(".byline-timeline-item").nth(3)).toHaveClass(/is-new-period/);
  // Duplicate, move and remove an event, keeping the four real ones.
  await timeline.getByRole("button", { name: "Duplicate event" }).click();
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(5);
  await timeline.getByRole("button", { name: /Move event earlier/ }).click();
  await expect(timeline.locator(".byline-timeline-item").nth(3).locator(".byline-timeline-title")).toHaveValue("School board votes on the budget");
  await timeline.getByRole("button", { name: "Remove event" }).click();
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(4);
  await expect(page.locator("[data-byline-editor-announcer]")).toContainText(/Event removed/);
  // The toolbar never covers the paragraph above: the next step clicks that paragraph's last line.
  await expectToolbarClear(timeline);

  await caretAfter(page, ANCHORS.district);
  await addWithMenu(page, "pdf", /Document/);
  const documentBlock = block(page, "document");
  await documentBlock.getByRole("button", { name: "Choose from Media" }).click();
  await pickInMedia(page, [PDF_NAME], /Use this PDF|Use this file/);
  await documentBlock.getByRole("textbox", { name: "Document title" }).fill("Nutrition Services budget request, 2026");
  await documentBlock.getByRole("textbox", { name: "Why it matters" }).fill("The request asks for a third serving window and two part-time cashiers, and lists Greenwood's average wait times by period.");
  await documentBlock.getByRole("textbox", { name: "Source" }).fill("Greenwood School District, released Oct. 21");
  // Page references are typed in the block: Add page focuses the new reference's page number.
  await documentBlock.getByRole("button", { name: "Add page" }).click();
  await expect(documentBlock.getByRole("spinbutton", { name: "Page number for reference 1" })).toBeFocused();
  await page.keyboard.type("4");
  await documentBlock.getByRole("textbox", { name: "What is on page 4" }).fill("Wait times by school and lunch period");
  await expect(documentBlock.locator("object")).toHaveAttribute("data", /#view=FitH/);

  // Everything is Payload's form: one autosave covers it all.
  await waitForSaved(page);
  expect(submits, "no dialog or control submitted the story form").toEqual([]);

  const story = await readDraft(request, baseURL!, editorToken, storyId);
  const stored = JSON.stringify(story.body);
  expect(stored).not.toMatch(/"credit"/);
  const docs = await readMediaDocs(request, baseURL!, editorToken, collectMediaIds(story.body).map(Number));
  const assets = new Map(docs.map((doc) => [String(doc.id), articleMediaFromPayload(doc, (item) => `/api/media/file/${item.filename as string}`)]));
  const { body: article, issues } = normalizePayloadArticleBody(story.body, { media: (id) => assets.get(String(id)) ?? null });
  expect(issues).toEqual([]);
  const sequence = article.nodes.map((node) => node.type);
  for (const type of FIRST_PHASE_BLOCKS) expect(sequence, `the story has a ${type}`).toContain(type);
  expect(sequence).toEqual([
    "paragraph", "paragraph", "photo", "paragraph", "reportedQuote", "heading", "paragraph", "list", "gallery", "keyFacts", "paragraph", "pullQuote", "context", "paragraph", "document", "timeline", "paragraph"
  ]);
  const byType = Object.fromEntries(article.nodes.map((node) => [node.type, node]));
  expect(byType.photo).toMatchObject({ placement: "wide", media: media["newsroom-panorama.jpg"] });
  expect(byType.reportedQuote).toMatchObject({ attribution: "Denise Royal, Greenwood cafeteria manager" });
  expect(byType.context).toMatchObject({ heading: "Why it matters" });
  expect((byType.context as { body: unknown[] }).body).toHaveLength(2);
  expect(byType.document).toMatchObject({ title: "Nutrition Services budget request, 2026", pages: [{ page: 4, label: "Wait times by school and lunch period" }] });
  expect((byType.timeline as { items: Array<{ current: boolean }> }).items.map((item) => item.current)).toEqual([false, false, false, true]);
  expect((byType.keyFacts as { facts: unknown[] }).facts).toHaveLength(4);
  expect(article.media[String(media["newsroom-tablet.jpg"])]?.credit).toBe("Jordan Lee");
});

test("moves and removes whole blocks as document edits, with Undo", async ({ page }) => {
  await openStory(page);
  const order = () => body(page).locator(":scope > .byline-block").evaluateAll((frames) => frames.map((frame) => frame.getAttribute("class")?.match(/byline-block-(\w+)/)?.[1]));
  const before = await order();
  const pull = block(page, "pullQuote");
  await pull.getByRole("textbox", { name: "Pull quote" }).click();
  await pull.getByRole("button", { name: "More Pull Quote actions" }).click();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  // The pull quote now follows the context block.
  await expect.poll(order).toEqual(before.map((type) => (type === "pullQuote" ? "context" : type === "context" ? "pullQuote" : type)));

  await block(page, "keyFacts").getByRole("textbox", { name: /Fact 1/ }).click();
  await block(page, "keyFacts").getByRole("button", { name: "More Key Facts actions" }).click();
  await page.getByRole("menuitem", { name: "Remove key facts" }).click();
  await expect(block(page, "keyFacts")).toHaveCount(0);
  await expect(page.locator("[data-byline-editor-announcer]")).toContainText("Key Facts removed.");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(block(page, "keyFacts")).toHaveCount(1);
  await expect(block(page, "keyFacts").locator("li textarea")).toHaveCount(4);
  await waitForSaved(page);
});

test("keeps the editor state across tabs and saves edits made just before leaving Write", async ({ page, request, baseURL }) => {
  await openStory(page);
  const caption = block(page, "photo").getByRole("textbox", { name: "Caption" });
  await caption.click();
  // The end of the caption, not of the visual line clicked (a long caption wraps).
  await caption.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length));
  await page.keyboard.type(" (Tab test.)");
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByRole("tab", { name: "Write" }).click();
  await expect(caption).toHaveValue(/\(Tab test\.\)$/);
  await waitForSaved(page);
  const story = await readDraft(request, baseURL!, editorToken, storyId);
  expect(JSON.stringify(story.body)).toContain("(Tab test.)");
});

test("never submits the story from a dialog, popover or block field", async ({ page }) => {
  const submits = watchForSubmits(page);
  await openStory(page);
  const photo = block(page, "photo");
  await photo.getByRole("textbox", { name: "Caption" }).click();
  // The Media picker's own search, and Enter inside it.
  await photo.getByRole("button", { name: "Replace" }).click();
  const picker = page.locator("[data-media-picker]");
  await picker.getByPlaceholder(/Search filename/).fill("newsroom");
  await picker.getByPlaceholder(/Search filename/).press("Enter");
  await picker.getByRole("button", { name: "Cancel" }).click();
  // The alt-text popover, and Enter in the Add menu search.
  await photo.getByRole("textbox", { name: "Caption" }).click();
  await photo.getByRole("button", { name: "Alt text" }).click();
  await page.getByRole("textbox", { name: "Alt text for this story" }).fill("Students wait in the second-lunch line.");
  await page.getByRole("textbox", { name: "Alt text for this story" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add photo, quote, facts…" }).click();
  await page.getByRole("combobox", { name: "Find a story tool" }).press("Escape");
  await waitForSaved(page);
  expect(submits).toEqual([]);
});

test("is read-only while another user holds the story", async ({ page, browser, baseURL, request }) => {
  await openStory(page);
  // The editor holds Payload's document lock; an administrator opens the same story.
  const adminToken = await login(request, baseURL!, "ADMIN");
  const other = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signIn(other, baseURL!, adminToken);
  const second = await other.newPage();
  await second.goto(`${baseURL}/admin/collections/stories/${storyId}`);
  // Payload's lock dialog; not the story's own Preview button, which also says "view".
  await second.getByRole("button", { name: "View read-only" }).click({ timeout: 30_000 });
  await expect(second.getByText("Someone else is editing this story.")).toBeVisible();
  const lockedBody = body(second);
  await expect(lockedBody).toHaveAttribute("contenteditable", "false");
  // The article stays readable; nothing in it can change.
  await expect(block(second, "photo").locator("img")).toBeVisible();
  await expect(block(second, "photo").getByRole("textbox", { name: "Caption" })).toHaveAttribute("readonly", "");
  await expect(second.locator(".byline-block-chrome")).toHaveCount(0);
  await expect(second.getByRole("button", { name: "Add photo, quote, facts…" })).toHaveCount(0);
  await expect(block(second, "timeline").getByRole("button", { name: "Add event" })).toHaveCount(0);
  await other.close();
});

for (const width of [1920, 1366, 1180, 820, 390]) {
  test(`works at ${width}px: no overflow, reachable controls, touch-safe insertion`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await openStory(page);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    // Prose keeps the 760px measure (or the column it has).
    const measure = await body(page).locator(":scope > p").first().evaluate((element) => element.getBoundingClientRect().width);
    expect(measure).toBeLessThanOrEqual(760);
    // A selected block's toolbar never covers the text above it.
    const reported = block(page, "reportedQuote");
    await reported.getByRole("textbox", { name: "Quote" }).click();
    const toolbar = reported.locator(".byline-block-chrome");
    await expect(toolbar).toBeVisible();
    // Measured once the block has opened its room (the margin animates).
    await expectToolbarClear(reported);
    if (width < 768) {
      // Touch: chrome sits in the flow with 44px targets; Add opens a Sheet.
      const target = await toolbar.getByRole("button").first().boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      await page.getByRole("button", { name: "Add photo, quote, facts…" }).click();
      await expect(page.getByRole("dialog", { name: "Add to the story" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await page.getByRole("button", { name: "Add photo, quote, facts…" }).click();
      await expect(page.getByRole("combobox", { name: "Find a story tool" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    // The Media picker opens at every width.
    await block(page, "photo").getByRole("textbox", { name: "Caption" }).click();
    await block(page, "photo").getByRole("button", { name: "Replace" }).click();
    await expect(page.locator("[data-media-picker]")).toBeVisible();
    await page.locator("[data-media-picker]").getByRole("button", { name: "Cancel" }).click();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });
}
