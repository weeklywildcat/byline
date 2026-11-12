import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { body, createStory, lexical, login, paragraph, readDraft, signIn, waitForSaved } from "./helpers";

/**
 * The Story screen's two workspaces (docs/story-screen.md): Plan and Write,
 * as tabs under the Story header. Plan holds the brief, Reporting, To do and
 * Activity; Write is the article. Review, History and a Transcript are
 * focused views with a way back. Moving between any of them never remounts
 * the editor and never changes the Story's stage.
 */

let token = "";
let staffToken = "";
let sectionId = 0;
let personId = 0;
let personName = "";
let pitchId = 0;
let draftId = 0;
let assignmentId = 0;
let transcriptId = 0;
const stamp = Date.now();
const headers = (baseURL: string, who = token) => ({ Authorization: `JWT ${who}`, Origin: baseURL });

async function seedReporting(request: APIRequestContext, baseURL: string, storyId: number) {
  const appointment = await request.post(`/api/byline/stories/${storyId}/appointments`, {
    headers: headers(baseURL),
    data: { title: "Principal Smith interview", kind: "interview", status: "confirmed", scheduleMode: "unscheduled" }
  });
  expect(appointment.ok(), await appointment.text()).toBeTruthy();
  const imported = await request.post(`/api/byline/stories/${storyId}/reporting/transcripts`, {
    headers: headers(baseURL),
    multipart: {
      file: { name: `principal-${stamp}.txt`, mimeType: "text/plain", buffer: Buffer.from("Principal Smith: The district wants bids by March.\n\nPrincipal Smith: Students deserve a hot lunch.") },
      _payload: JSON.stringify({ clientKey: `plan-write-${stamp}` })
    }
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  transcriptId = (await imported.json()).transcriptId;
  const quote = await request.post(`/api/byline/reporting/transcripts/${transcriptId}/selections`, { headers: headers(baseURL), data: { segmentIds: ["s1"], kind: "quote" } });
  expect(quote.ok(), await quote.text()).toBeTruthy();
  const verified = await request.post(`/api/byline/reporting/selections/${(await quote.json()).id}/verify`, { headers: headers(baseURL), data: { verified: true } });
  expect(verified.ok(), await verified.text()).toBeTruthy();
}

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  staffToken = await login(request, baseURL!, "STAFF");
  sectionId = (await (await request.get("/api/sections?depth=0&limit=1", { headers: headers(baseURL!) })).json()).docs[0]?.id;
  const person = (await (await request.get("/api/people?depth=0&limit=1", { headers: headers(baseURL!) })).json()).docs[0];
  personId = person?.id;
  personName = person?.name;
  pitchId = await createStory(request, baseURL!, token, { headline: `A new pitch ${stamp}`, section: sectionId });
  assignmentId = await createStory(request, baseURL!, token, { headline: `Plan assignment editing ${stamp}`, section: sectionId });
  draftId = await createStory(request, baseURL!, token, {
    headline: `Canteen could return next semester ${stamp}`,
    section: sectionId,
    ...(personId ? { contributors: [personId] } : {}),
    body: lexical([paragraph("The canteen closed in May after the district ended its contract.")])
  });
  await seedReporting(request, baseURL!, draftId);
});

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

async function open(page: Page, id: number, search = "") {
  await page.goto(`/admin/collections/stories/${id}${search}`);
  await expect(page.locator("[data-story-view]")).toBeVisible({ timeout: 60_000 });
}
const tabs = (page: Page) => page.getByRole("tablist", { name: "Story workspace" });
const tab = (page: Page, name: "Plan" | "Write") => tabs(page).getByRole("tab", { name, exact: true });
const editor = (page: Page) => page.locator("[data-story-article] [contenteditable=true]").first();

test("a new Pitch opens Plan, with its brief first, under exactly two tabs", async ({ page }) => {
  await open(page, pitchId);
  await expect(tabs(page).getByRole("tab")).toHaveText(["Plan", "Write"]);
  await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/view=/);
  const brief = page.locator("#plan-brief");
  await expect(brief.getByRole("heading", { name: "Story brief", level: 2 })).toBeVisible();
  for (const name of ["Reporting", "To do", "Activity"]) await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible();
  // No other permanent tabs, and no Reporting button: Reporting is part of Plan.
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator("[data-story-header]").getByRole("button", { name: "Reporting", exact: true })).toHaveCount(0);
  // The assignment is edited in place and is a planning record: it survives a reload without saving the Story.
  await brief.getByRole("button", { name: /Add angle and assignment/ }).click();
  await brief.getByRole("textbox", { name: "Angle and assignment" }).fill("Why did the canteen close, and can it come back? Talk to the principal and the district.");
  await brief.getByRole("button", { name: "Save" }).click();
  await expect(brief.locator("[data-story-brief-text]")).toContainText("Why did the canteen close");
  await expect(brief.locator("[data-story-deliverables]")).toHaveText(/Article/);
  await page.reload();
  await expect(page.locator("#plan-brief [data-story-brief-text]")).toContainText("Why did the canteen close", { timeout: 60_000 });
  // Switching tabs never moves the Story through its lifecycle.
  await expect(page.locator("[data-story-phase]")).toHaveAttribute("data-story-phase", "pitch");
  await tab(page, "Write").click();
  await tab(page, "Plan").click();
  await expect(page.locator("[data-story-phase]")).toHaveAttribute("data-story-phase", "pitch");
});

test("Plan edits reporters and section in the same autosaving Story form as Write", async ({ page, request, baseURL }) => {
  await open(page, assignmentId, "?view=plan");
  const brief = page.locator("#plan-brief");
  await brief.getByRole("button", { name: "Reporters: none" }).click();
  await page.getByRole("option", { name: personName, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(brief.getByRole("button", { name: `Reporters: ${personName}` })).toBeVisible();

  await brief.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: "No section" }).click();
  await expect(brief.getByRole("combobox", { name: "Section" })).toContainText("No section");

  await tab(page, "Write").click();
  await expect(page.locator("[data-story-article]").getByRole("button", { name: `Byline: ${personName}` })).toBeVisible();
  await expect(page.locator("[data-story-article]").getByRole("combobox", { name: "Section" })).toContainText("No section");
  await waitForSaved(page);
  await expect.poll(async () => {
    const draft = await readDraft(request, baseURL!, token, assignmentId);
    return { contributors: draft.contributors, section: draft.section };
  }).toEqual({ contributors: [personId], section: null });

  await tab(page, "Plan").click();
  await page.reload();
  await expect(page.locator("#plan-brief").getByRole("button", { name: `Reporters: ${personName}` })).toBeVisible();
  await expect(page.locator("#plan-brief").getByRole("combobox", { name: "Section" })).toContainText("No section");
});

test("Plan's Reporting holds the notebook; interviews show in To do; a source is added there", async ({ page }) => {
  await open(page, draftId, "?view=plan");
  const reporting = page.locator("#plan-reporting");
  await expect(reporting.getByText("Principal Smith interview").first()).toBeVisible();
  await expect(page.locator("#plan-todo").getByText("Principal Smith interview")).toBeVisible();
  await expect(reporting.locator("[data-plan-quotes]")).toContainText("Students deserve a hot lunch");
  const toggle = reporting.getByRole("button", { name: "Sources & appointments" });
  if (await toggle.isVisible()) await toggle.click();
  const rail = page.locator("aside[aria-label='Sources and appointments'], [role=dialog]:has-text('Sources & appointments')").first();
  await rail.getByRole("button", { name: "Add source" }).click();
  const dialog = page.getByRole("dialog", { name: /source/i });
  await dialog.getByRole("textbox", { name: "Label" }).fill(`District food services ${stamp}`);
  await dialog.getByRole("button", { name: /Add source|Save/ }).click();
  await expect(rail.getByText(`District food services ${stamp}`)).toBeVisible();
  await page.keyboard.press("Escape");
  // Jump links move between Plan's sections without a second tab bar.
  await page.getByRole("navigation", { name: "Plan sections" }).getByRole("button", { name: /^To do/ }).click();
  await expect(page.locator("#plan-todo-title")).toBeFocused();
});

test("Cancel discards an unfinished story note instead of reopening stale text", async ({ page }) => {
  await open(page, pitchId, "?view=plan");
  const notes = page.locator("#plan-story-notes");
  await notes.getByRole("button", { name: "Add note" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a story note" });
  await dialog.getByRole("textbox", { name: "Note text" }).fill("Discard this unfinished note");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("dialog", { name: "Add a story note" }).getByRole("textbox", { name: "Note text" })).toBeEmpty();
});

test("a transcript opens from Plan as a focused view, with Back to Plan and browser Back/Forward", async ({ page }) => {
  await open(page, draftId, "?view=plan");
  await page.locator("#plan-reporting").getByRole("button", { name: "Open transcript" }).first().click();
  await expect(page).toHaveURL(new RegExp(`[?&]transcript=${transcriptId}`));
  await expect(page.getByRole("heading", { name: "Transcript", level: 1 })).toBeVisible();
  await expect(page.getByRole("tablist")).toBeHidden();
  await page.goBack();
  await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Transcript", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Back to Plan" }).click();
  await expect(page).toHaveURL(/view=plan&section=reporting/);
  await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
});

test("an interview recording accepts a transcript upload and attaches it to that recording", async ({ page, request, baseURL }) => {
  const wav = Buffer.alloc(44 + 8000 * 2 * 5);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);

  const uploaded = await request.post(`/api/byline/stories/${draftId}/reporting/files`, {
    headers: headers(baseURL!),
    multipart: {
      file: { name: `interview-${stamp}.wav`, mimeType: "audio/wav", buffer: wav },
      _payload: JSON.stringify({ clientKey: `interview-audio-${stamp}` })
    }
  });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const recordingId = (await uploaded.json()).id;

  await open(page, draftId, "?view=plan&section=reporting");
  const row = page.locator(`[data-key="file:${recordingId}"]`);
  await expect(row).toContainText(`interview-${stamp}.wav`);
  await expect(row.getByRole("button", { name: "Add transcript" })).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await row.getByRole("button", { name: "Add transcript" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: `interview-${stamp}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("[00:00] Principal Smith: Students deserve a hot lunch.\n\n[00:03] Principal Smith: The district is reviewing the schedule.")
  });

  await expect(row.getByRole("button", { name: "Open transcript" })).toBeVisible();
  const transcript = await request.get(`/api/reporting-transcripts?where[file][equals]=${recordingId}&depth=0`, { headers: headers(baseURL!) });
  expect(transcript.ok(), await transcript.text()).toBeTruthy();
  const docs = (await transcript.json()).docs;
  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({ file: recordingId, state: "ready", origin: "manual", provider: null });
  expect(docs[0].segments.map(({ startMs, endMs }: { startMs: number | null; endMs: number | null }) => ({ startMs, endMs }))).toEqual([
    { startMs: 0, endMs: 3000 },
    { startMs: 3000, endMs: null }
  ]);

  await row.getByRole("button", { name: "Open transcript" }).click();
  const transcriptView = page.locator("[data-transcript-view]");
  const finalPassage = transcriptView.locator('[data-segment="s1"]');
  await expect(finalPassage).toBeVisible();
  const player = transcriptView.locator("audio");
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1);

  const transcriptSearch = transcriptView.getByRole("searchbox", { name: "Search this transcript" });
  await transcriptSearch.fill("district");
  await transcriptSearch.press("Enter");
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(3);
  expect(await player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);

  const firstPassageText = transcriptView.locator('[data-segment="s0"] [data-segment-text]');
  await firstPassageText.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(transcriptView.getByRole("toolbar", { name: "Selected words" })).toBeVisible();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await expect(transcriptView.getByRole("toolbar", { name: "Selected words" })).toBeHidden();

  await player.evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = 3.5;
    audio.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  await expect(finalPassage).toHaveAttribute("data-active", "");
  await transcriptView.getByRole("button", { name: "Reporting" }).click();
  await expect(page.locator(`[data-key="file:${recordingId}"]`)).toBeVisible();

  const quote = await request.post(`/api/byline/reporting/transcripts/${docs[0].id}/selections`, {
    headers: headers(baseURL!),
    data: { segmentIds: ["s0"], kind: "quote" }
  });
  expect(quote.ok(), await quote.text()).toBeTruthy();

  await page.reload();
  const refreshed = page.locator(`[data-key="file:${recordingId}"]`);
  await refreshed.getByRole("button", { name: "Replace transcript" }).click();
  const replace = page.getByRole("alertdialog");
  await expect(replace).toContainText("The saved quote or highlight stays exactly as saved, including any verification.");
  await replace.getByRole("button", { name: "Cancel" }).click();

  await refreshed.getByRole("button", { name: `More actions for interview-${stamp}.wav` }).click();
  await page.getByRole("menuitem", { name: "Remove…" }).click();
  const remove = page.getByRole("alertdialog");
  await expect(remove).toContainText("Saved quotes or highlights from that transcript will also be deleted.");
  await remove.getByRole("button", { name: "Cancel" }).click();
});

test("switching Write → Plan → Write keeps the same editor, its unsaved words and its undo history", async ({ page, request, baseURL }) => {
  await open(page, draftId, "?view=write");
  await expect(tab(page, "Write")).toHaveAttribute("aria-selected", "true");
  const handle = await editor(page).elementHandle();
  await body(page).getByText("The canteen closed in May").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Bids are due in March.");
  // Leave before autosave has run.
  await tab(page, "Plan").click();
  await expect(page.locator("[data-story-article]")).toBeHidden();
  await expect(page).toHaveURL(/view=plan/);
  await page.goBack();
  await expect(tab(page, "Write")).toHaveAttribute("aria-selected", "true");
  await expect(editor(page)).toContainText("Bids are due in March.");
  // The same DOM node: never remounted.
  expect(await handle!.evaluate((node) => node.isConnected && node === document.querySelector("[data-story-article] [contenteditable=true]"))).toBe(true);
  // Undo still knows what was typed before leaving.
  await body(page).getByText("Bids are due in March.").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).not.toContainText("Bids are due in March.");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor(page)).toContainText("Bids are due in March.");
  await waitForSaved(page);
  expect(JSON.stringify((await readDraft(request, baseURL!, token, draftId)).body)).toContain("Bids are due in March.");
});

test("Reporting reference sits beside the article when there is room, inserts only a verified quote, and is a Sheet when narrow", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await open(page, draftId, "?view=write");
  const toggle = page.locator("[data-reporting-reference-toggle]");
  await toggle.click();
  const pane = page.locator("[data-reporting-reference=pane]");
  await expect(pane).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // The article keeps a comfortable measure beside it.
  expect((await page.locator("[data-story-article] textarea[aria-label='Headline']").boundingBox())!.width).toBeGreaterThanOrEqual(600);
  const quote = pane.locator("[data-saved-quote][data-state=verified]").filter({ hasText: "Students deserve a hot lunch" });
  await quote.getByRole("button", { name: "Insert quote" }).click();
  await expect(body(page).locator(":scope > .byline-block-reportedQuote")).toHaveCount(1);
  await pane.getByRole("button", { name: "Close reporting reference" }).click();
  await expect(pane).toHaveCount(0);
  await expect(toggle).toBeFocused();
  // Undo the insertion so later runs start from the same article.
  await body(page).click();
  await page.keyboard.press("ControlOrMeta+z");

  await page.setViewportSize({ width: 820, height: 1180 });
  await toggle.click();
  const sheet = page.getByRole("dialog", { name: "Reporting reference" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Students deserve a hot lunch")).toBeVisible();
  await sheet.getByRole("button", { name: "Back to article" }).click();
  await expect(sheet).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("the tabs work from the keyboard and follow the WAI-ARIA tabs pattern", async ({ page }) => {
  await open(page, draftId, "?view=write");
  await tab(page, "Write").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "Plan")).toBeFocused();
  await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/view=plan/);
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Write")).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "Write" });
  await expect(panel).toBeVisible();
  expect(await tab(page, "Write").getAttribute("aria-controls")).toBe(await panel.getAttribute("id"));
  const ring = await tab(page, "Write").evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.boxShadow}`; });
  expect(ring).not.toBe("none|none");
});

test("old links land where they meant: Reporting and Production in Plan, Live in Write, History and Review focused", async ({ page }) => {
  for (const [search, expected] of [["?view=reporting", "plan"], ["?tab=reporting", "plan"], ["?tab=plan", "plan"], ["?tab=production", "plan"], ["?tab=write", "write"], ["?tab=live", "write"], ["?tab=history", "history"], ["?view=history", "history"], ["?view=review", "review"]] as const) {
    await open(page, draftId, search);
    await expect(page.locator("[data-story-view]"), search).toHaveAttribute("data-story-view", expected);
  }
  await open(page, draftId, "?view=reporting");
  await expect(page.locator("#plan-reporting-title")).toBeInViewport();
  await open(page, draftId, "?view=history");
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Back to (Plan|Write)$/ }).click();
  await expect(page.getByRole("tablist", { name: "Story workspace" })).toBeVisible();
});

test("Standard and Live are a Write setting, and switching tabs leaves the mode alone", async ({ page }) => {
  await open(page, draftId, "?view=write");
  const mode = page.getByRole("group", { name: "Story mode" });
  await mode.getByRole("button", { name: "Live", exact: true }).click();
  // Live coverage has its own setup; this Story isn't published, so set it up for later.
  await page.getByRole("dialog", { name: "Set up live coverage" }).getByRole("button", { name: "Set up for later" }).click();
  await expect(page.locator("[data-story-mode=live]")).toBeVisible();
  await tab(page, "Plan").click();
  await tab(page, "Write").click();
  await expect(page.locator("[data-story-mode=live]")).toBeVisible();
  await mode.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page.locator("[data-story-mode=standard]")).toBeVisible();
});

test("submitting for review, requesting changes, and publishing keep their lifecycle and permissions", async ({ page, request, baseURL }) => {
  const id = await createStory(request, baseURL!, token, {
    headline: `Review round trip ${stamp}`,
    section: sectionId,
    ...(personId ? { contributors: [personId] } : {}),
    body: lexical([paragraph("Students lined up for twenty minutes on Monday.")])
  });
  await request.post(`/api/byline/stories/${id}/workflow`, { headers: headers(baseURL!), data: { status: "writing" } });
  await open(page, id, "?view=plan");
  // The header and its one primary action are the same over Plan and Write.
  await expect(page.locator("[data-primary-action]")).toHaveText(/Submit for review/);
  await page.locator("[data-primary-action]").click();
  const status = page.locator("[data-story-status]");
  const failed = page.locator("[data-routing-failure]");
  await expect(status.or(failed).first()).toBeVisible();
  test.skip(await failed.isVisible(), "No reviewer is routable in this fixture's newsroom roles.");
  await expect(page.locator("[data-story-phase]")).toHaveAttribute("data-story-phase", "review");
  // Review is a labelled way in, never a tab.
  const review = page.locator("[data-primary-action]").filter({ hasText: "Review submitted version" });
  if (await review.count()) await review.click();
  else await status.click();
  await expect(page).toHaveURL(/view=review/);
  // Below the rail width, Review's decisions are in its Sheet.
  const panel = page.locator("[data-story-mode=review]").getByRole("button", { name: "Review", exact: true });
  if (await panel.isVisible()) await panel.click();
  // A queue step is claimed before deciding.
  const take = page.getByRole("button", { name: "Take this review" });
  if (await take.isVisible()) await take.click();
  const requestChanges = page.locator("[data-decision=request-changes]");
  await expect(requestChanges).toBeVisible();
  await requestChanges.click();
  await page.getByRole("dialog", { name: "Request changes" }).getByRole("textbox", { name: "What should change?" }).fill("Add the district's response.");
  await page.getByRole("dialog", { name: "Request changes" }).getByRole("button", { name: "Request changes" }).click();
  // A decision returns to the workspace the reviewer came from.
  await expect(page.getByRole("tablist", { name: "Story workspace" })).toBeVisible();
  await expect(page.locator("[data-story-phase]")).toHaveAttribute("data-story-phase", "drafting");
  await expect(status).toHaveText(/Changes requested/);
  await expect(page.locator("[data-open-feedback]")).toBeVisible();

  // Publishing is still Payload's publish with its access rules: staff are refused, an editor publishes.
  const refused = await request.patch(`/api/stories/${id}?draft=false`, { headers: headers(baseURL!, staffToken), data: { _status: "published" } });
  expect(refused.ok()).toBe(false);
  await tab(page, "Write").click();
  await page.getByRole("button", { name: "More story actions" }).click();
  await page.getByRole("menuitem", { name: "Publish now, without review" }).click();
  await expect(page.locator("[data-story-phase]")).toHaveAttribute("data-story-phase", "published");
  // Editing a published story: open it again, change the words, and Publish changes becomes available.
  await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeDisabled();
  await open(page, id, "?view=write");
  await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeDisabled();
  await body(page).getByText("Students lined up").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" The line moved faster on Tuesday.");
  // The edit reaches the draft (autosave), not the published story.
  await expect.poll(async () => JSON.stringify((await readDraft(request, baseURL!, token, id)).body), { timeout: 30_000 }).toContain("faster on Tuesday");
  await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeEnabled();
});

test("a Pitch can be moved to Trash from either workspace", async ({ page, request, baseURL }) => {
  const id = await createStory(request, baseURL!, token, { headline: `Pitch to trash ${stamp}`, section: sectionId });
  await open(page, id);
  await expect(tab(page, "Plan")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "More story actions" }).click();
  await page.getByRole("menuitem", { name: /Move to trash/ }).click();
  await page.getByRole("alertdialog", { name: "Move this story to Trash?" }).getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/admin\/stories/);
  const trashed = await request.get(`/api/stories/${id}?depth=0&draft=true&trash=true`, { headers: headers(baseURL!) });
  expect((await trashed.json()).deletedAt).toBeTruthy();
});

test("the breadcrumb is Stories › this Story, and a focused view adds its name and a way back", async ({ page }) => {
  await open(page, draftId, "?view=write");
  const crumbs = page.getByRole("navigation", { name: "breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Stories" })).toHaveAttribute("href", "/admin/stories");
  await expect(crumbs.getByRole("listitem").last()).toContainText("Canteen could return next semester");
  await page.getByRole("button", { name: "More story actions" }).click();
  await page.getByRole("menuitem", { name: "View history" }).click();
  await expect(crumbs.getByRole("listitem").last()).toHaveText("History");
  await crumbs.getByRole("button", { name: /Canteen could return next semester/ }).click();
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "write");
});

test("right-clicking the stage offers the same moves as the header, and the stage badge is colored", async ({ page }) => {
  await open(page, pitchId);
  const stage = page.locator("[data-story-phase]");
  await expect(stage.locator("[data-phase-badge=pitch]")).toBeVisible();
  const tint = await stage.locator("[data-phase-badge]").evaluate((node) => getComputedStyle(node).backgroundColor);
  const neutral = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(tint).not.toBe(neutral);
  await stage.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Accept pitch" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Put on hold" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-primary-action]")).toHaveText(/Accept pitch/);
});
