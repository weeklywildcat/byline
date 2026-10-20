import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

type Item = { label: string; title: string; body: string; current?: boolean };

const timelineItems = (page: Page): Promise<Item[]> =>
  page.evaluate(() => (window as any).wp.data.select("core/block-editor").getBlocks().find((block: any) => block.name === "byline/timeline").attributes.items);

async function openTimeline(page: Page, adminSession: any, label: string, items?: Item[]) {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  await page.evaluate((items) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([wp.blocks.createBlock("byline/timeline", items ? { items } : {})]);
  }, items ?? null);
  const editor = await waitForEditorReady(page);
  return { story, editor, timeline: editor.canvas.locator(".byline-timeline-editor") };
}

test("a new Timeline starts empty, is written in place from the keyboard, and publishes only finished events", async ({ adminPage: page, adminSession }) => {
  const { story, timeline } = await openTimeline(page, adminSession, "timeline keyboard");
  // Two empty events with sentences that tell the writer what to write; no filler that could be published.
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(2);
  expect(await timelineItems(page)).toEqual([{ label: "", title: "", body: "" }, { label: "", title: "", body: "" }]);
  await expect(timeline.getByLabel("Event title").first()).toHaveAttribute("placeholder", "What happened?");
  expect((await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered).not.toContain("byline-timeline");

  // Date, headline and explanation with Enter between them; Enter after the last explanation adds the next event.
  await timeline.getByLabel("Date or label").first().click();
  await page.keyboard.type("June 12, 2026");
  await page.keyboard.press("Enter");
  await expect(timeline.getByLabel("Event title").first()).toBeFocused();
  await page.keyboard.type("Board approves schedule");
  await page.keyboard.press("Enter");
  await expect(timeline.getByLabel("Event explanation").first()).toBeFocused();
  await page.keyboard.type("The vote is 4–3.");
  await page.keyboard.press("Enter");
  await expect(timeline.getByLabel("Date or label").nth(1)).toBeFocused();
  await page.keyboard.type("Jan. 5, 2027");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second event");
  await page.keyboard.press("Enter");
  await page.keyboard.type("More reporting.");
  await page.keyboard.press("Enter");
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(3);
  await expect(timeline.getByLabel("Date or label").nth(2)).toBeFocused();
  // Nothing in a date or headline field ever holds a line break.
  expect((await timelineItems(page)).slice(0, 2)).toEqual([
    { label: "June 12, 2026", title: "Board approves schedule", body: "The vote is 4–3." },
    { label: "Jan. 5, 2027", title: "Second event", body: "More reporting." }
  ]);
  // The third event has only a date: the canvas says it will not be published.
  await page.keyboard.type("Only a date");
  await expect(timeline.getByText("this event will not be published")).toBeVisible();

  // Only finished events reach readers, and a new year is marked.
  await saveEditorDraft(page);
  const html = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  expect(html.match(/<li class="byline-timeline-item/g)).toHaveLength(2);
  expect(html).toContain('<li class="byline-timeline-item is-new-period">');
  expect(html).not.toContain("Only a date");
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  expect((await timelineItems(page)).map((item) => item.title)).toEqual(["Board approves schedule", "Second event", ""]);
});

test("the toolbar adds, duplicates, moves, marks and removes the event the caret is in, and focus follows", async ({ adminPage: page, adminSession }) => {
  const seed: Item[] = [
    { label: "A", title: "First", body: "One." },
    { label: "B", title: "Second", body: "Two." },
    { label: "C", title: "Third", body: "Three." }
  ];
  const { timeline } = await openTimeline(page, adminSession, "timeline toolbar", seed);
  const titles = async () => (await timelineItems(page)).map((item) => item.title);
  // Typing hides Gutenberg's block toolbar until the pointer moves again.
  const reveal = async () => { await page.mouse.move(700, 120); await page.mouse.move(740, 140); };
  const toolbar = (name: string) => page.getByRole("button", { name, exact: true });
  const press = async (name: string) => { await reveal(); await toolbar(name).click(); };

  await timeline.getByLabel("Event title").nth(1).click();
  await press("Add event below");
  await expect(timeline.getByLabel("Date or label").nth(2)).toBeFocused();
  expect(await titles()).toEqual(["First", "Second", "", "Third"]);
  await page.keyboard.type("New");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Inserted");

  await press("Add event above");
  await expect(timeline.getByLabel("Date or label").nth(2)).toBeFocused();
  expect(await titles()).toEqual(["First", "Second", "", "Inserted", "Third"]);
  await press("Remove event");
  expect(await titles()).toEqual(["First", "Second", "Inserted", "Third"]);

  // Moving keeps the caret in the same kind of field, on the moved event.
  await timeline.getByLabel("Event title").nth(2).click();
  await press("Move event earlier");
  expect(await titles()).toEqual(["First", "Inserted", "Second", "Third"]);
  await expect(timeline.getByLabel("Event title").nth(1)).toBeFocused();
  await page.keyboard.press("Alt+Shift+ArrowDown");
  expect(await titles()).toEqual(["First", "Second", "Inserted", "Third"]);
  await expect(timeline.getByLabel("Event title").nth(2)).toBeFocused();
  await reveal();
  await expect(toolbar("Move event earlier")).toBeEnabled();
  await timeline.getByLabel("Event title").first().click();
  await reveal();
  await expect(toolbar("Move event earlier")).toBeDisabled();
  await timeline.getByLabel("Event title").last().click();
  await reveal();
  await expect(toolbar("Move event later")).toBeDisabled();

  // A duplicate sits after its original, with the same words; it can be marked as the latest event, but only one can be.
  await timeline.getByLabel("Event title").nth(1).click();
  await press("Duplicate event");
  expect(await titles()).toEqual(["First", "Second", "Second", "Inserted", "Third"]);
  await expect(timeline.getByLabel("Event title").nth(2)).toBeFocused();
  await press("Mark as the latest event");
  expect((await timelineItems(page)).map((item) => Boolean(item.current))).toEqual([false, false, true, false, false]);
  await expect(timeline.locator(".byline-timeline-item.is-current")).toHaveCount(1);
  await timeline.getByLabel("Event title").nth(4).click();
  await press("Mark as the latest event");
  expect((await timelineItems(page)).map((item) => Boolean(item.current))).toEqual([false, false, false, false, true]);
  await press("Mark as the latest event");
  expect((await timelineItems(page)).some((item) => item.current)).toBe(false);

  // Removing the only event leaves one empty event to fill.
  for (let i = 0; i < 5; i += 1) { await timeline.getByLabel("Event title").first().click(); await press("Remove event"); }
  expect(await timelineItems(page)).toEqual([{ label: "", title: "", body: "" }]);
});

test("a Timeline stops at 25 events", async ({ adminPage: page, adminSession }) => {
  const { timeline } = await openTimeline(page, adminSession, "timeline cap", Array.from({ length: 24 }, (_, i) => ({ label: `L${i}`, title: `T${i}`, body: "" })));
  await timeline.getByLabel("Event explanation").last().click();
  await page.keyboard.press("Enter");
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(25);
  await expect(timeline.getByText("25 of 25 events")).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Add event", exact: true })).toBeDisabled();
  await page.keyboard.press("Tab"); // out of the focused label, then back
  await timeline.getByLabel("Event explanation").last().click();
  await page.keyboard.press("Enter");
  await expect(timeline.locator(".byline-timeline-item")).toHaveCount(25);
  await page.mouse.move(700, 120); await page.mouse.move(720, 130);
  await expect(page.getByRole("button", { name: "Duplicate event", exact: true })).toBeDisabled();
});

test("Timelines saved by Byline 0.3.24 still open, including its untouched sample events", async ({ adminPage: page, adminSession }) => {
  const { story } = await openTimeline(page, adminSession, "timeline legacy");
  const legacy = [
    '<!-- wp:byline/timeline -->',
    '<ol class="wp-block-byline-timeline byline-timeline"><li class="byline-timeline-item"><p class="byline-timeline-label">Earlier</p><h3 class="byline-timeline-title">How it began</h3><p class="byline-timeline-body">Add the context behind this event.</p></li><li class="byline-timeline-item"><p class="byline-timeline-label">Now</p><h3 class="byline-timeline-title">What happened next</h3><p class="byline-timeline-body">Explain the next development.</p></li></ol>',
    '<!-- /wp:byline/timeline -->',
    '<!-- wp:byline/timeline {"items":[{"label":"Oct. 8","title":"Meeting","body":"Held."},{"label":"Only a label","title":"","body":""}]} -->',
    '<ol class="wp-block-byline-timeline byline-timeline"><li class="byline-timeline-item"><p class="byline-timeline-label">Oct. 8</p><h3 class="byline-timeline-title">Meeting</h3><p class="byline-timeline-body">Held.</p></li><li class="byline-timeline-item"><p class="byline-timeline-label">Only a label</p></li></ol>',
    '<!-- /wp:byline/timeline -->'
  ].join("\n\n");
  const result = await page.evaluate((markup) => {
    const wp = (window as any).wp;
    const blocks = wp.blocks.parse(markup);
    wp.data.dispatch("core/block-editor").resetBlocks(blocks);
    return blocks.map((block: any) => ({ name: block.name, valid: block.isValid, titles: block.attributes.items.map((item: any) => item.title) }));
  }, legacy);
  expect(result).toEqual([
    { name: "byline/timeline", valid: true, titles: ["How it began", "What happened next"] },
    { name: "byline/timeline", valid: true, titles: ["Meeting", ""] }
  ]);
  await saveEditorDraft(page);
  const html = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  expect(html.match(/<li class="byline-timeline-item/g)).toHaveLength(3); // the label-only stub is not published
});
