import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");

type Note = { id: string; x: number; y: number; title: string; body: string };
type AnnotatedBlock = { clientId: string; annotations: Note[] };

/** Every Annotated Image in the document, in order, as the editor holds it. */
function annotatedBlocks(page: Page): Promise<AnnotatedBlock[]> {
  return page.evaluate(() => {
    const walk = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...walk(node.innerBlocks || [])]);
    return walk((window as any).wp.data.select("core/block-editor").getBlocks())
      .filter((block) => block.name === "byline/annotated-image")
      .map((block) => ({ clientId: block.clientId, annotations: block.attributes.annotations }));
  });
}

async function openAnnotatedDraft(page: Page, adminSession: any, label: string, notes: Note[] = [], image: Record<string, unknown> = {}) {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const upload = await page.request.post("/wp-json/wp/v2/media", {
    headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${label.replace(/\W+/g, "-")}.jpg"` },
    data: await readFile(path.join(repoRoot, "apps/web/public/newsroom/newsroom-meeting-640.jpg"))
  });
  expect(upload.ok()).toBe(true);
  const media = (await upload.json()) as { id: number; source_url: string; media_details: { width: number; height: number } };
  adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
  await page.evaluate(({ media, notes, image }) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([
      wp.blocks.createBlock("byline/annotated-image", {
        image: { id: media.id, url: media.source_url, alt: "A floor plan", width: media.media_details.width, height: media.media_details.height, ...image },
        caption: "The proposed plan.",
        annotations: notes
      })
    ]);
  }, { media, notes, image });
  const editor = await waitForEditorReady(page);
  return { story, media, editor };
}

const inRange = (notes: Note[]) => notes.every((note) => note.x >= 0 && note.x <= 100 && note.y >= 0 && note.y <= 100);
const near = (actual: number, expected: number, tolerance = 1.5) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
const marker = (block: Locator, index: number) => block.locator("[data-marker-id]").nth(index);
const announcement = (block: Locator) => block.locator('[role="status"][aria-live="polite"]');
const selectedBlockId = (page: Page) => page.evaluate(() => (window as any).wp.data.select("core/block-editor").getSelectedBlockClientId() as string | null);
/** The ID of the marker that has keyboard focus, or "" when focus is elsewhere. */
const focusedMarker = (page: Page) => page.evaluate(() => {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]');
  return (frame?.contentDocument?.activeElement as HTMLElement | null)?.dataset?.markerId ?? "";
});

test("markers are added, written, positioned, reordered and removed from the keyboard alone, keeping stable IDs", async ({ adminPage: page, adminSession }) => {
  const { story, editor } = await openAnnotatedDraft(page, adminSession, "annotated keyboard authoring");
  const block = editor.canvas.locator(".byline-annotated-image").first();
  const notes = () => annotatedBlocks(page).then((blocks) => blocks[0].annotations);

  // Add three markers with Enter on the in-canvas button, typing each title and explanation without a pointer.
  const add = block.getByRole("button", { name: "Add marker", exact: true });
  for (const [index, title] of ["First", "Second", "Third"].entries()) {
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(block.getByLabel(`Marker ${index + 1} title`, { exact: true })).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press("Tab");
    await expect(block.getByLabel(`Marker ${index + 1} explanation`, { exact: true })).toBeFocused();
    await page.keyboard.type(`${title} explanation.`);
  }
  let current = await notes();
  expect(current.map((note) => note.title)).toEqual(["First", "Second", "Third"]);
  expect(current.map((note) => note.body)).toEqual(["First explanation.", "Second explanation.", "Third explanation."]);
  const ids = current.map((note) => note.id);
  expect(new Set(ids).size).toBe(3);
  expect(ids.every((id) => /^[\w-]+$/.test(id))).toBe(true);
  // New markers do not pile up on one point.
  expect(new Set(current.map((note) => `${note.x},${note.y}`)).size).toBe(3);
  expect(inRange(current)).toBe(true);
  // Only the selected marker's note is a form; the others read as they will publish. Adding was announced.
  await expect(block.locator(".byline-annotations > li.is-editing")).toHaveCount(1);
  await expect(announcement(block)).toContainText("Marker 3 added");
  await expect(block.locator(".byline-annotation-marker")).toHaveText(["1", "2", "3"]);

  // Position the second marker with the arrow keys on the marker itself; Shift moves 10%.
  const before = current[1];
  await marker(block, 1).focus();
  await expect(block.locator(".byline-annotations > li.is-editing")).toHaveAttribute("data-note-id", ids[1]);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await notes())[1]).toMatchObject({ x: before.x + 5, y: before.y + 10 });
  // Page-level scrolling, block navigation and caret movement did not react to those arrows, and the move was announced.
  expect((await notes())[1].id).toBe(before.id);
  await expect(announcement(block)).toContainText("Marker 2 at");
  expect(await focusedMarker(page)).toBe(ids[1]);

  // Enter goes to the marker's own text; Escape comes back to the block.
  await page.keyboard.press("Enter");
  await expect(block.getByLabel("Marker 2 title", { exact: true })).toBeFocused();
  await marker(block, 1).focus();
  await page.keyboard.press("Escape");
  await expect(block).toBeFocused();

  // Reorder with [ and ] on the marker; it keeps its ID and focus follows it.
  await marker(block, 2).focus();
  await page.keyboard.press("[");
  await expect.poll(async () => (await notes()).map((note) => note.title)).toEqual(["First", "Third", "Second"]);
  current = await notes();
  expect(current.map((note) => note.id)).toEqual([ids[0], ids[2], ids[1]]);
  await expect.poll(() => focusedMarker(page)).toBe(ids[2]);
  await expect(announcement(block)).toContainText("position 2 of 3");
  await page.keyboard.press("]");
  await expect.poll(async () => (await notes()).map((note) => note.title)).toEqual(["First", "Second", "Third"]);
  await expect(block.locator(".byline-annotation-marker")).toHaveText(["1", "2", "3"]);

  // ...and with the buttons beside the selected note.
  await marker(block, 2).focus();
  const selectedNote = block.locator(".byline-annotations > li.is-editing");
  await expect(selectedNote.getByRole("button", { name: "Move marker later", exact: true })).toBeDisabled();
  await selectedNote.getByRole("button", { name: "Move marker earlier", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await notes()).map((note) => note.title)).toEqual(["First", "Third", "Second"]);
  await marker(block, 0).focus();
  await expect(block.locator(".byline-annotations > li.is-editing")).toHaveAttribute("data-note-id", ids[0]);
  await expect(block.locator(".byline-annotations > li.is-editing").getByRole("button", { name: "Move marker earlier", exact: true })).toBeDisabled();

  // Delete removes the focused marker. The survivors keep their IDs, order and positions, and focus moves to a neighbour.
  current = await notes();
  const survivors = [current[0], current[2]];
  await marker(block, 1).focus();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await notes()).length).toBe(2);
  expect(await notes()).toEqual(survivors);
  await expect(block.locator(".byline-annotation-marker")).toHaveCount(2);
  await expect(block.getByText("2 of 12", { exact: true })).toBeVisible();
  await expect(announcement(block)).toContainText("Marker 2 removed");
  await expect.poll(() => focusedMarker(page)).toBe(survivors[1].id);

  // Save, reload and confirm the marker positions and IDs persisted, then check the public markup.
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = await waitForEditorReady(page);
  await expect(reopened.canvas.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  expect((await annotatedBlocks(page))[0].annotations).toEqual(survivors);
  await expect(reopened.canvas.locator(".byline-annotation-marker")).toHaveCount(2);

  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`);
  const html = response.payload.content.rendered;
  for (const note of survivors) {
    expect(html).toContain(`id="annotation-${note.id}"`);
    expect(html).toContain(`href="#annotation-${note.id}"`);
    expect(html).toContain(`left:clamp(16px, ${note.x}%, calc(100% - 16px))`);
    expect(html).toContain(`top:clamp(16px, ${note.y}%, calc(100% - 16px))`);
  }
  // The complete ordered list is in the document, not a tooltip.
  expect(html.indexOf(`id="annotation-${survivors[0].id}"`)).toBeLessThan(html.indexOf(`id="annotation-${survivors[1].id}"`));
  expect(html).toContain("Second explanation.");
  expect(html).not.toContain("Third explanation.");
  expect(html).not.toContain("Annotated image pending");
});

test("markers are placed by clicking the photograph and moved by dragging, and a first click only selects the block", async ({ adminPage: page, adminSession }) => {
  const seed: Note[] = [{ id: "seed-a", x: 20, y: 30, title: "Existing", body: "Already there." }];
  // Tall enough that the whole photograph is on screen for the mouse.
  await page.setViewportSize({ width: 1440, height: 1300 });
  const { editor } = await openAnnotatedDraft(page, adminSession, "annotated pointer authoring", seed);
  const block = editor.canvas.locator(".byline-annotated-image").first();
  const photo = block.locator(".byline-annotation-canvas img");
  const notes = () => annotatedBlocks(page).then((blocks) => blocks[0].annotations);
  await expect(photo).toHaveJSProperty("complete", true);
  await page.evaluate(() => (window as any).wp.data.dispatch("core/block-editor").clearSelectedBlock());
  expect(await selectedBlockId(page)).toBeNull();

  // The first click selects the block and places nothing.
  let box = (await photo.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.8);
  await expect.poll(() => selectedBlockId(page)).toBe((await annotatedBlocks(page))[0].clientId);
  expect(await notes()).toHaveLength(1);

  // The next click adds a marker exactly there, selects it and moves to its title.
  box = (await photo.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4);
  await expect.poll(async () => (await notes()).length).toBe(2);
  let added = (await notes())[1];
  near(added.x, 25); near(added.y, 40);
  await expect(block.getByLabel("Marker 2 title", { exact: true })).toBeFocused();
  await page.keyboard.type("Placed by click");
  await expect.poll(async () => (await notes())[1].title).toBe("Placed by click");

  // Dragging a marker moves it; the press alone does not.
  const handle = marker(block, 1);
  const from = (await handle.boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.up();
  expect((await notes())[1]).toMatchObject({ x: added.x, y: added.y });
  box = (await photo.boundingBox())!;
  const target = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.6 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move((start.x + target.x) / 2, (start.y + target.y) / 2, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await notes())[1].x).toBeGreaterThan(65);
  added = (await notes())[1];
  near(added.x, 70); near(added.y, 60);
  // A drag does not also drop a new marker where it ended, and the others did not move.
  expect(await notes()).toHaveLength(2);
  expect((await notes())[0]).toEqual(seed[0]);
  // Dragging past the photograph keeps the marker inside it.
  await page.mouse.move(target.x, target.y); await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y - 120, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await notes())[1]).toMatchObject({ x: 0, y: 0 });
});

test("the selected marker is placed precisely from the sidebar, and a marker with no text is not published", async ({ adminPage: page, adminSession }) => {
  const seed: Note[] = [
    { id: "seed-entrance", x: 25, y: 40, title: "New entrance", body: "Faces the street." },
    { id: "seed-blank", x: 60, y: 60, title: "", body: "" }
  ];
  const { story, editor } = await openAnnotatedDraft(page, adminSession, "annotated precise position", seed);
  const block = editor.canvas.locator(".byline-annotated-image").first();
  const notes = () => annotatedBlocks(page).then((blocks) => blocks[0].annotations);
  await page.evaluate((clientId) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(clientId), (await annotatedBlocks(page))[0].clientId);
  await page.evaluate(() => (window as any).wp.data.dispatch("core/edit-post").openGeneralSidebar("edit-post/block"));

  // Selecting a block from the keyboard lands on its first marker, and the sidebar follows it.
  await expect(page.getByRole("heading", { name: "Marker 1", level: 2 })).toBeVisible();
  await marker(block, 0).click();
  const x = page.getByRole("spinbutton", { name: "Left to right (%)" });
  const y = page.getByRole("spinbutton", { name: "Top to bottom (%)" });
  await expect(x).toHaveValue("25");
  await x.fill("150"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0].x).toBe(100);
  await y.fill("-20"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0].y).toBe(0);
  await x.fill("42.5"); await page.keyboard.press("Tab");
  await y.fill("64"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0]).toMatchObject({ x: 42.5, y: 64 });
  expect(inRange(await notes())).toBe(true);
  // The slider steps from the keyboard too.
  await page.getByRole("slider", { name: "Left to right (%)" }).focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await notes())[0].x).toBe(0);

  // The marker with no text reads as unfinished here and is left out of the published article.
  await expect(marker(block, 1)).toHaveClass(/is-unfinished/);
  await expect(block.getByText("No text yet.")).toBeVisible();
  await saveEditorDraft(page);
  const html = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  expect(html).toContain('id="annotation-seed-entrance"');
  expect(html).not.toContain("seed-blank");
  expect(Array.from(html.matchAll(/class="byline-annotation-marker"/g))).toHaveLength(1);
});

test("a photograph with no alternative text is called out, an empty block says what to do, and twelve markers is the limit", async ({ adminPage: page, adminSession }) => {
  const { editor } = await openAnnotatedDraft(page, adminSession, "annotated warnings", [], { alt: "" });
  const block = editor.canvas.locator(".byline-annotated-image").first();
  const clientId = (await annotatedBlocks(page))[0].clientId;
  await page.evaluate((id) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(id), clientId);
  await expect(block.getByText("No alternative text yet.")).toBeVisible();
  await page.evaluate(() => (window as any).wp.data.dispatch("core/edit-post").openGeneralSidebar("edit-post/block"));
  await expect(page.getByText("Select a marker on the photograph to place it precisely.")).toBeVisible();
  await expect(block.getByText("Click the photograph to place a marker, then type what readers should notice.")).toBeVisible();
  await expect(block.getByRole("button", { name: "Add marker", exact: true })).toBeEnabled();
  await page.evaluate((id) => {
    const notes = Array.from({ length: 12 }, (_, i) => ({ id: `limit-${i}`, x: 10 + i * 6, y: 50, title: `Marker ${i + 1}`, body: "" }));
    (window as any).wp.data.dispatch("core/block-editor").updateBlockAttributes(id, { annotations: notes });
  }, clientId);
  await expect(block.getByRole("button", { name: "Add marker", exact: true })).toBeDisabled();
  await expect(block.getByText("12 of 12", { exact: true })).toBeVisible();
});

test("duplicated and pasted Annotated Image blocks get fresh annotation IDs", async ({ adminPage: page, adminSession }) => {
  const seed: Note[] = [
    { id: "seed-entrance", x: 25, y: 40, title: "New entrance", body: "Faces the street." },
    { id: "seed-library", x: 73, y: 65, title: "Library", body: "A reading room." }
  ];
  const { story, editor } = await openAnnotatedDraft(page, adminSession, "annotated duplicate ids", seed);
  const first = editor.canvas.locator(".byline-annotated-image").first();
  await expect(first.locator(".byline-annotation-marker")).toHaveCount(2);

  // Duplicate with Gutenberg's own shortcut.
  const original = (await annotatedBlocks(page))[0];
  await page.evaluate((clientId) => (window as any).wp.data.dispatch("core/block-editor").selectBlock(clientId), original.clientId);
  await first.focus();
  await page.keyboard.press("ControlOrMeta+Shift+D");
  await expect.poll(async () => (await annotatedBlocks(page)).length).toBe(2);
  // The new copy is re-identified as it appears; the original never changes.
  await expect.poll(async () => {
    const [kept, copy] = await annotatedBlocks(page);
    return kept.annotations.map((note) => note.id).join() === "seed-entrance,seed-library" && copy.annotations.every((note) => !["seed-entrance", "seed-library"].includes(note.id));
  }).toBe(true);
  let blocks = await annotatedBlocks(page);
  expect(blocks[1].annotations.map(({ x, y, title, body }) => ({ x, y, title, body }))).toEqual(seed.map(({ x, y, title, body }) => ({ x, y, title, body })));
  expect(blocks[0].annotations).toEqual(seed);

  // Paste (or insert a saved pattern): the serialized first block, with its original IDs, arrives
  // before the first. It is the new one, so it is the one that changes. This is what Gutenberg's
  // paste handler does, without touching the OS clipboard.
  await page.evaluate((clientId) => {
    const wp = (window as any).wp;
    const source = wp.data.select("core/block-editor").getBlock(clientId);
    const [pasted] = wp.blocks.parse(wp.blocks.serialize(source));
    wp.data.dispatch("core/block-editor").insertBlocks(pasted, 0);
  }, blocks[0].clientId);
  await expect.poll(async () => (await annotatedBlocks(page)).length).toBe(3);
  await expect.poll(async () => {
    const all = (await annotatedBlocks(page)).flatMap((block) => block.annotations.map((note) => note.id));
    return all.length === 6 && new Set(all).size === 6;
  }).toBe(true);
  blocks = await annotatedBlocks(page);
  // The block that was already in the article kept its IDs.
  expect(blocks[1].annotations).toEqual(seed);
  expect(blocks.every((block) => inRange(block.annotations))).toBe(true);

  // The rendered post links every marker to its own, unique note.
  await saveEditorDraft(page);
  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`);
  const html = response.payload.content.rendered;
  const noteIds = Array.from(html.matchAll(/<li id="annotation-([^"]+)"/g), (match) => match[1]);
  expect(noteIds).toHaveLength(6);
  expect(new Set(noteIds).size).toBe(6);
  const markerLinks = Array.from(html.matchAll(/class="byline-annotation-marker" href="#annotation-([^"]+)"/g), (match) => match[1]);
  expect(markerLinks).toEqual(noteIds);
  expect(blocks.flatMap((block) => block.annotations.map((note) => note.id))).toEqual(noteIds);
});
