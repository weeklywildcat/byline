import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
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

async function openAnnotatedDraft(page: Page, adminSession: any, label: string, notes: Note[] = []) {
  const story = await createEditorDraft(page, adminSession.registerTestPost, label);
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const upload = await page.request.post("/wp-json/wp/v2/media", {
    headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${label.replace(/\W+/g, "-")}.jpg"` },
    data: await readFile(path.join(repoRoot, "apps/web/public/newsroom/newsroom-meeting-640.jpg"))
  });
  expect(upload.ok()).toBe(true);
  const media = (await upload.json()) as { id: number; source_url: string; media_details: { width: number; height: number } };
  adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
  await page.evaluate(({ media, notes }) => {
    const wp = (window as any).wp;
    wp.data.dispatch("core/block-editor").resetBlocks([
      wp.blocks.createBlock("byline/annotated-image", {
        image: { id: media.id, url: media.source_url, alt: "A floor plan", width: media.media_details.width, height: media.media_details.height },
        caption: "The proposed plan.",
        annotations: notes
      })
    ]);
  }, { media, notes });
  const editor = await waitForEditorReady(page);
  return { story, media, editor };
}

const inRange = (notes: Note[]) => notes.every((note) => note.x >= 0 && note.x <= 100 && note.y >= 0 && note.y <= 100);

test("annotations can be added, positioned, reordered and removed from the keyboard alone, keeping stable IDs", async ({ adminPage: page, adminSession }) => {
  const { story, editor } = await openAnnotatedDraft(page, adminSession, "annotated keyboard authoring");
  const block = editor.canvas.locator(".byline-annotated-image").first();
  const notes = () => annotatedBlocks(page).then((blocks) => blocks[0].annotations);

  // Add three annotations with Enter on the button, typing each one without a pointer.
  const add = block.getByRole("button", { name: "Add annotation", exact: true });
  for (const [index, title] of ["First", "Second", "Third"].entries()) {
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(block.getByLabel(`Annotation ${index + 1} title`)).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press("Tab");
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

  // Position the second marker with the arrow keys on the marker itself.
  const marker = block.getByRole("button", { name: "Select annotation 2", exact: true });
  const before = current[1];
  await marker.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await notes())[1]).toMatchObject({ x: before.x + 5, y: before.y + 10 });
  // Page-level scrolling and block navigation did not react to those arrows.
  expect((await notes())[1].id).toBe(before.id);

  // And with the X / Y controls: keyboard stepping on the range, and typed values that are clamped to 0-100.
  const noteOne = block.locator('[data-note-id]').nth(0);
  const x = noteOne.locator('input[type="number"]').nth(0);
  const y = noteOne.locator('input[type="number"]').nth(1);
  await noteOne.locator('input[type="range"]').nth(0).focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await notes())[0].x).toBe(0);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await notes())[0].x).toBe(1);
  await x.fill("150"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0].x).toBe(100);
  await y.fill("-20"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0].y).toBe(0);
  await x.fill("42"); await page.keyboard.press("Tab");
  await y.fill("64"); await page.keyboard.press("Tab");
  await expect.poll(async () => (await notes())[0]).toMatchObject({ x: 42, y: 64 });
  expect(inRange(await notes())).toBe(true);

  // Reorder with the labelled buttons. The moved note keeps its ID and focus follows it.
  const noteThree = block.locator('[data-note-id]').nth(2);
  await expect(block.getByRole("button", { name: "Move annotation up", exact: true }).first()).toBeDisabled();
  await expect(block.getByRole("button", { name: "Move annotation down", exact: true }).last()).toBeDisabled();
  await noteThree.getByRole("button", { name: "Move annotation up", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await notes()).map((note) => note.title)).toEqual(["First", "Third", "Second"]);
  current = await notes();
  expect(current.map((note) => note.id)).toEqual([ids[0], ids[2], ids[1]]);
  await expect(block.getByLabel("Annotation 2 title")).toBeFocused();
  await expect(block.getByLabel("Annotation 2 title")).toHaveValue("Third");
  // The number labels follow the new order on the markers and in the saved list.
  await expect(block.locator(".byline-annotation-marker")).toHaveText(["1", "2", "3"]);

  // Remove one. The survivors keep their IDs, order and positions.
  const survivors = [current[0], current[2]];
  await block.locator('[data-note-id]').nth(1).getByRole("button", { name: "Remove annotation", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await notes()).length).toBe(2);
  expect(await notes()).toEqual(survivors);
  await expect(block.locator(".byline-annotation-marker")).toHaveCount(2);
  await expect(block.getByText("2 / 12 annotations.")).toBeVisible();

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
  // The new copy is re-identified once the editor has seen it; the original never changes.
  await expect.poll(async () => {
    const [kept, copy] = await annotatedBlocks(page);
    return kept.annotations.map((note) => note.id).join() === "seed-entrance,seed-library" && copy.annotations.every((note) => !["seed-entrance", "seed-library"].includes(note.id));
  }).toBe(true);
  let blocks = await annotatedBlocks(page);
  expect(blocks[1].annotations.map(({ x, y, title, body }) => ({ x, y, title, body }))).toEqual(seed.map(({ x, y, title, body }) => ({ x, y, title, body })));
  expect(blocks[0].annotations).toEqual(seed);

  // Paste (or insert a saved pattern): the serialized first block, with its original IDs, arrives
  // after the second. This is what Gutenberg's paste handler does, without touching the OS clipboard.
  await page.evaluate((clientId) => {
    const wp = (window as any).wp;
    const source = wp.data.select("core/block-editor").getBlock(clientId);
    const [pasted] = wp.blocks.parse(wp.blocks.serialize(source));
    wp.data.dispatch("core/block-editor").insertBlocks(pasted, 2);
  }, blocks[0].clientId);
  await expect.poll(async () => (await annotatedBlocks(page)).length).toBe(3);
  await expect.poll(async () => {
    const all = (await annotatedBlocks(page)).flatMap((block) => block.annotations.map((note) => note.id));
    return all.length === 6 && new Set(all).size === 6;
  }).toBe(true);
  blocks = await annotatedBlocks(page);
  expect(blocks[0].annotations).toEqual(seed);
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
