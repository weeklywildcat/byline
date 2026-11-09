import { expect, test, type Locator, type Page } from "@playwright/test";
import { FIXTURE_ARTICLE_BODY } from "@byline/article-body/fixtures";
import { lexicalFromArticleBody } from "@byline/editor/serialize";
import { block, body, caretAfter, createStory, ensureMedia, expectToolbarClear, login, pageOverflow, PDF_NAME, readDraft, signIn, waitForSaved } from "./helpers";

/**
 * The newer article tools in the real Payload editor, on one story holding
 * every registered block (the shared fixture, on this database's Media and
 * Events): toolbars that never cover the article, popovers that keep their
 * block selected, Source and Footnote references from the selection toolbar,
 * and the direct editing of Gallery, native Chart, Event, Social Post and
 * Final Score. Runs like article-editor.spec.ts, against a running newsroom.
 */
test.describe.configure({ mode: "serial" });

let editorToken = "";
let storyId = 0;
const PROVIDERS = /(^|\.)(instagram|threads|facebook|tiktok|twitter|x|bsky|cdninstagram|fbcdn|twimg)\.(com|net|app)$/;

test.beforeAll(async ({ request, baseURL }) => {
  editorToken = await login(request, baseURL!, "EDITOR");
  const adminToken = await login(request, baseURL!, "ADMIN");
  const media = await ensureMedia(request, baseURL!, editorToken);
  const headers = { Authorization: `JWT ${adminToken}`, Origin: baseURL! };
  const event = async (data: Record<string, unknown>) => {
    const response = await request.post("/api/events", { headers, data: { _status: "published", ...data } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).doc.id as number;
  };
  const vote = await event({ title: "School board budget vote", eventType: "Meeting", startAt: "2026-12-14T23:00:00.000Z", location: "Greenwood High library", eventStatus: "scheduled" });
  await event({ title: "Winter band concert", startAt: "2026-12-18T01:00:00.000Z", location: "Auditorium", eventStatus: "canceled" });

  // The fixture's Media and Event IDs, mapped onto this database's.
  const photos = ["newsroom-panorama.jpg", "newsroom-laughing.jpg", "newsroom-tablet.jpg", "newsroom-meeting.jpg"].map((name) => media[name]!);
  const fixtureMedia = new Set(Object.keys(FIXTURE_ARTICLE_BODY.media).map(Number));
  let next = 0;
  const remap = (value: unknown, key: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => remap(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, remap(item, name)]));
    if (typeof value === "number" && fixtureMedia.has(value) && !["page", "width", "height", "level"].includes(key)) {
      if (value === 201) return media[PDF_NAME];
      return value === 202 ? value : photos[next++ % photos.length];
    }
    return key === "event" && value === 701 ? vote : value;
  };
  const nodes = remap(FIXTURE_ARTICLE_BODY.nodes, "") as typeof FIXTURE_ARTICLE_BODY.nodes;
  storyId = await createStory(request, baseURL!, editorToken, { headline: "Every article tool", body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes, media: {} }) });
});

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, editorToken);
});

async function openStory(page: Page) {
  await page.goto(`/admin/collections/stories/${storyId}`);
  await expect(body(page)).toBeVisible({ timeout: 60_000 });
  await expect(body(page)).toHaveAttribute("contenteditable", "true");
}

/** Selects a block the way a keyboard user does: focus its first field (or its first tool). */
async function select(frame: Locator) {
  await frame.scrollIntoViewIfNeeded();
  await frame.evaluate((element) => {
    const target = element.querySelector<HTMLElement>("textarea:not([readonly]), input:not([type=hidden]):not([readonly]), [contenteditable=true]") ?? element.querySelector<HTMLElement>(".byline-block-chrome button");
    target?.focus();
  });
  await expect(frame.locator(".byline-block-chrome")).toHaveCSS("opacity", "1");
}

/** With the caret at the end of a sentence, selects its last word (the full stop stays out). */
async function selectLastWord(page: Page, word: string) {
  await page.keyboard.press("ArrowLeft");
  for (let index = 0; index < word.length; index++) await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(word);
}

/** The paragraph containing `text`, in the story. */
const prose = (page: Page, text: string) => body(page).locator(":scope > p", { hasText: text }).first();

for (const width of [1366, 1180]) {
  test(`every tool's toolbar stays clear of the article above it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page);
    const frames = body(page).locator(":scope > .byline-block");
    const count = await frames.count();
    expect(count).toBeGreaterThan(25);
    for (let index = 0; index < count; index++) {
      const frame = frames.nth(index);
      const type = await frame.evaluate((element) => /byline-block-(\w+)/.exec(element.className)?.[1]);
      await test.step(type ?? `block ${index}`, async () => {
        await select(frame);
        await expectToolbarClear(frame);
      });
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test("a toolbar Popover keeps its block selected while open and as it closes; pasted chart data survives reload", async ({ page, request, baseURL }) => {
  await openStory(page);
  const chart = block(page, "chartMap", 1);
  await select(chart);
  // The native chart's data grid opens with the block.
  await expect(chart.locator(".byline-chart-editor-data .byline-data-table")).toBeVisible();
  const paste = chart.getByRole("button", { name: "Paste table" });
  await paste.click();
  await page.getByRole("textbox", { name: "Pasted table" }).fill("Day\tFirst lunch\tSecond lunch\tThird lunch\nMonday\t7\t13\t4\nTuesday\t8\t14\t5\nWednesday\t8\t12\t3");
  // Focus is in the portaled Popover: the block stays selected, its toolbar stays put.
  await expect(chart).toHaveAttribute("data-popup-held", "");
  await expect(chart.locator(".byline-block-chrome")).toHaveCSS("opacity", "1");
  await expectToolbarClear(chart);
  await page.getByRole("button", { name: "Use this table" }).click();
  await expect(paste).toBeFocused();
  await expect(chart.locator(".byline-chart-editor-data tbody tr")).toHaveCount(3);
  await expect(chart.locator(".byline-chart-editor-data")).toContainText("Data · 3 rows, 3 series");
  await chart.locator(".byline-block-chrome").getByText("Line", { exact: true }).click();
  await expect(chart.locator(".byline-native-chart")).toHaveAttribute("data-chart", "line");
  await waitForSaved(page);

  await page.reload();
  await expect(body(page)).toHaveAttribute("contenteditable", "true", { timeout: 60_000 });
  const reloaded = block(page, "chartMap", 1);
  await expect(reloaded.locator(".byline-native-chart")).toHaveAttribute("data-chart", "line");
  // Unselected, the grid folds to one line where the public chart offers "Show the data".
  await expect(reloaded.locator(".byline-chart-editor-data .byline-data-table")).toBeHidden();
  await select(reloaded);
  await expect(reloaded.locator(".byline-chart-editor-data tbody tr")).toHaveCount(3);
  const stored = JSON.stringify((await readDraft(request, baseURL!, editorToken, storyId)).body);
  expect(stored).toContain("Third lunch");
});

test("Source and Footnote from the selection toolbar keep the words, open Byline's Popover and return the caret after the reference", async ({ page }) => {
  await openStory(page);
  const drawer = page.getByRole("heading", { name: /^Edit (Source|Footnote)$/ });

  // Source after a selected word.
  const paragraph = prose(page, "Not every student has the school app");
  await caretAfter(page, "Not every student has the school app");
  await selectLastWord(page, "existed");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const popover = page.locator("[data-slot=popover-content]").filter({ hasText: /^Source \d/ });
  await expect(popover).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await expect(paragraph).toContainText("did not know the express station existed");
  await expect(popover.getByPlaceholder("https://")).toBeFocused();
  await page.keyboard.type("https://example.org/greenwood-app-survey");
  await popover.getByRole("textbox", { name: "Title" }).fill("School app usage survey");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  // The caret is after the reference: typing continues the sentence.
  await page.keyboard.type(" Typed after.");
  await expect.poll(() => paragraph.evaluate((element) => {
    const reference = element.querySelector(".byline-source-edit");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent ?? "").includes("Typed after.")) return Boolean(reference && reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    }
    return false;
  })).toBe(true);
  await expect(paragraph.locator(".byline-source-edit")).toHaveAttribute("aria-label", /^Source \d: School app usage survey\./);

  // Sources number by reading order: the new one sits between the survey and the budget request.
  const labels = await body(page).locator(".byline-source-edit").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
  expect(labels.map((label) => /^Source (\d+)/.exec(label ?? "")?.[1])).toEqual(labels.map((_, index) => String(index + 1)));
  expect(labels.findIndex((label) => label?.includes("School app usage survey"))).toBeGreaterThan(labels.findIndex((label) => label?.includes("Student council lunch survey")));

  // Footnote: Done also returns to the sentence; an empty one closed with Escape disappears.
  const football = prose(page, "Greenwood's football team");
  await caretAfter(page, "Greenwood's football team");
  await selectLastWord(page, "win");
  await page.getByRole("button", { name: "Footnote", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(football).toContainText("closed the regular season with a win");
  await page.getByRole("textbox", { name: "Footnote text" }).fill("A 42-14 win over Abbeville.");
  await page.getByRole("button", { name: "Done" }).click();
  await page.keyboard.type(" More");
  // The reference follows "win" and the writer's words follow the reference; the full stop stays last.
  await expect(football).toContainText(/with a win\d+ More\.$/);
  await expect(football.locator(".byline-footnote-edit")).toHaveCount(1);
  await waitForSaved(page);
});

test("Social Post accepts public post addresses only and never loads the provider in the editor", async ({ page }) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (PROVIDERS.test(host)) providerRequests.push(request.url());
  });
  await openStory(page);
  const social = block(page, "socialPost");
  await select(social);
  await social.getByRole("button", { name: "Replace post" }).click();
  const address = page.getByRole("textbox", { name: "Post address" });
  await address.fill("https://instagram.com.evil.example/p/CdEf123/");
  await address.press("Enter");
  await expect(page.getByText(/That site isn't supported/)).toBeVisible();
  await address.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await expect(page.getByText(/YouTube videos go in a Video block/)).toBeVisible();
  await address.fill("https://x.com/weeklywildcat/status/1234567890123456789");
  await address.press("Enter");
  await expect(address).toBeHidden();
  await expect(social).toContainText(/X post/i);
  await expect(social.getByRole("link", { name: /View the post on X/ })).toHaveAttribute("href", "https://x.com/weeklywildcat/status/1234567890123456789");
  await expect(social.locator("iframe, script")).toHaveCount(0);
  expect(providerRequests).toEqual([]);
});

test("Final Score swaps teams, keeps a zero and stores plain numbers; Event replaces by keyboard; Gallery features a photo", async ({ page, request, baseURL }) => {
  await openStory(page);
  const score = block(page, "finalScore");
  await select(score);
  await score.getByRole("button", { name: "Swap teams" }).click();
  await expect(score.getByRole("textbox", { name: "First team" })).toHaveValue("Abbeville");
  await score.getByRole("textbox", { name: "Abbeville score" }).fill("0");
  await expectToolbarClear(score);

  const event = block(page, "event");
  await select(event);
  await event.getByRole("button", { name: "Replace event" }).click();
  await page.getByPlaceholder("Search by event name").fill("band");
  await page.keyboard.press("Enter");
  await expect(event).toContainText("Winter band concert");
  await expect(event).toContainText(/Canceled/i);
  await expect(event.getByRole("button", { name: "Replace event" })).toBeFocused();

  const gallery = block(page, "gallery");
  await select(gallery);
  await gallery.locator(".byline-block-chrome").getByText("Featured", { exact: true }).click();
  const second = gallery.locator(".byline-gallery-item").nth(1);
  const secondCaption = await second.locator("textarea").first().inputValue();
  await second.hover();
  await second.getByRole("button", { name: "Make featured" }).click();
  await expect(gallery.getByRole("textbox", { name: "Caption for the featured photograph" })).toBeFocused();
  await expect(gallery.getByRole("textbox", { name: "Caption for the featured photograph" })).toHaveValue(secondCaption);

  await waitForSaved(page);
  const stored = (await readDraft(request, baseURL!, editorToken, storyId)).body as { root: { children: Array<{ type: string; fields?: Record<string, unknown> }> } };
  const fields = (type: string) => stored.root.children.find((node) => node.type === "block" && node.fields?.blockType === type)?.fields;
  expect(fields("finalScore")).toMatchObject({ teamA: "Abbeville", teamAScore: 0, teamB: "Greenwood", teamBScore: 42 });
  expect(fields("gallery")).toMatchObject({ layout: "featured" });
});

test("at 390px block settings open as a bottom Sheet and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page);
  const social = block(page, "socialPost");
  await select(social);
  const replace = social.getByRole("button", { name: "Replace post" });
  expect((await replace.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await replace.click();
  const sheet = page.locator("[data-slot=sheet-content]");
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(388);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});
