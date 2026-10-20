/**
 * The whole editorial workflow for a realistic visual story, end to end:
 * build it in Gutenberg with real photographs and realistic copy, save, reload
 * with no validation errors, duplicate, reorder and remove tools, open Preview as
 * Byline (Immersive, at three widths) and compare it with the WordPress-rendered
 * article that the static site publishes.
 *
 * Tool-level interaction (placing markers, dragging the comparison, reordering
 * steps, ...) has its own spec per tool. This one proves the tools work together
 * in one article and survive every save and reload.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");
const PHOTOS = ["laughing", "meeting", "meeting-before", "meeting-after", "panorama", "square", "tablet"] as const;
type Photo = (typeof PHOTOS)[number];
type Media = { id: number; url: string; width: number; height: number };
type Spec = { name: string; attributes?: Record<string, unknown>; inner?: Spec[] };

const BODY = "Reporters reviewed board minutes from June 12 and August 21, interviewed eleven students, four teachers and two administrators, and requested cafeteria sales data under the state public records law.";

/** Block specs for the demonstration article; photographs are filled in from the uploaded media. */
function lunchSqueeze(m: Record<Photo, Media>): Spec[] {
  const image = (photo: Photo, alt: string) => ({ id: m[photo].id, url: m[photo].url, alt, width: m[photo].width, height: m[photo].height });
  const p = (content: string): Spec => ({ name: "core/paragraph", attributes: { content } });
  const h = (content: string, level = 2): Spec => ({ name: "core/heading", attributes: { content, level } });
  return [
    p("When the district announced the new bell schedule in August, administrators described it as a modest adjustment. Eight weeks in, students say the change has rearranged almost everything else about their school lives."),
    { name: "core/image", attributes: { id: m.meeting.id, url: m.meeting.url, alt: "Two students review a draft.", align: "wide", sizeSlug: "large", linkDestination: "none", caption: "Junior Elena Marquez reviews a draft schedule with a classmate during second period on October 14." } },
    h("What changed, and when"), p(BODY),
    { name: "byline/timeline", attributes: { items: [
      { label: "June 12", title: "Board approves new schedule", body: "The vote is 4–3. Two dissenting members ask for a cafeteria capacity study that is never scheduled." },
      { label: "Aug. 19", title: "Families notified by email", body: "The message goes out four working days before classes begin and does not mention the lunch changes." },
      { label: "Sept. 3", title: "First Wednesday late start", body: "Buses arrive on a staggered plan; 212 students are marked tardy in the first week." },
      { label: "Oct. 8", title: "Principal meets council", body: "Administrators agree to “review options” but commit to no changes before January." }
    ] } },
    { name: "core/pullquote", attributes: { className: "is-style-byline-feature-quote", value: "I eat in fourteen minutes now. I used to have thirty, and a conversation.", citation: "Marcus Bell, senior" } },
    { name: "core/group", attributes: { className: "is-style-byline-context", tagName: "aside" }, inner: [h("Context", 3), p("The state requires 180 instructional days but leaves the length of the school day to each district.")] },
    { name: "byline/annotated-image", attributes: { image: image("meeting", "Two students review a draft on a tablet."), caption: "The conference room where the student council met with administrators on October 8.", annotations: [
      { id: "a1", x: 22, y: 38, title: "Student council member", body: "Sophomore representative Daniel Cho presented the petition and asked for a recorded vote." },
      { id: "a2", x: 66, y: 48, title: "The proposed schedule", body: "The draft on the tablet shows a third lunch wave beginning at 12:20." },
      { id: "a3", x: 50, y: 72, title: "Cafeteria capacity data", body: "Facilities staff estimate the cafeteria seats 410 at once; about 780 students are present in each wave." }
    ] } },
    { name: "byline/before-after", attributes: { before: image("meeting-before", "The conference room, muted."), after: image("meeting-after", "The conference room, saturated."), beforeLabel: "Before", afterLabel: "After", caption: "The same room, shown with and without colour correction." } },
    { name: "byline/visualization", attributes: { title: "Lunch period length, by wave", description: "Minutes between the start of a lunch wave and the final bell, before and after the new schedule.", type: "chart", mode: "static", heightPreset: "standard", source: "District bell schedules, 2025–26 and 2026–27", notes: "Passing time not included.", credit: "Weekly Wildcat staff", image: image("panorama", "A wide view of the newsroom.") } },
    { name: "byline/scrolly", attributes: { fit: "contain" }, inner: [
      { name: "byline/scrolly-step", attributes: { image: image("laughing", "A student laughs at a desk."), caption: "Seniors gather before the 11:40 bell." }, inner: [h("11:38 a.m. The doors open"), p("Seniors with first-wave lunch cross the quad together; the cafeteria holds the line to the library.")] },
      { name: "byline/scrolly-step", attributes: { image: image("meeting", "Two students review a draft."), caption: "A table of juniors at 11:51." }, inner: [h("11:51 a.m. Nine minutes left"), p("Students who joined the line at 11:42 sit down with a tray and a countdown.")] },
      { name: "byline/scrolly-step", attributes: { image: image("tablet", "A student at a laptop."), caption: "The bell, as seen from the hallway." }, inner: [h("12:03 p.m. Back to class"), p("The second wave is already forming outside.")] }
    ] },
    { name: "core/gallery", attributes: { linkTo: "media", columns: 3, className: "is-style-byline-photo-gallery", align: "wide" }, inner: (["laughing", "meeting", "tablet"] as Photo[]).map((photo) => ({ name: "core/image", attributes: { id: m[photo].id, url: m[photo].url, alt: photo, sizeSlug: "large", linkDestination: "none", caption: "Photo caption long enough to wrap onto two lines at the gallery size." } })) },
    p("The district has said it will publish the results of a survey of families in November.")
  ];
}

async function uploadPhotos(page: Page, adminSession: { addCleanup: (cleanup: () => Promise<void>) => void; rest: Function }) {
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const media = {} as Record<Photo, Media>;
  for (const photo of PHOTOS) {
    const response = await page.request.post("/wp-json/wp/v2/media", {
      headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="story-${Date.now()}-${photo}.jpg"` },
      data: await readFile(path.join(repoRoot, `tests/fixtures/story-media/newsroom-${photo}.jpg`))
    });
    expect(response.ok()).toBe(true);
    const body = await response.json() as { id: number; source_url: string; media_details: { width: number; height: number } };
    adminSession.addCleanup(async () => { await adminSession.rest(`/wp/v2/media/${body.id}?force=true`, "DELETE"); });
    media[photo] = { id: body.id, url: body.source_url, width: body.media_details.width, height: body.media_details.height };
  }
  return media;
}

const names = (page: Page) => page.evaluate(() => (window as any).wp.data.select("core/block-editor").getBlocks().map((block: any) => block.name));
const invalidBlocks = (page: Page) => page.evaluate(() => {
  const wp = (window as any).wp;
  const walk = (blocks: any[]): string[] => blocks.flatMap((block) => [...(!block.isValid ? [block.name] : []), ...walk(block.innerBlocks)]);
  return walk(wp.blocks.parse(wp.data.select("core/editor").getEditedPostContent()));
});

test("a realistic visual story survives build, save, reload, edit and preview", async ({ adminPage: page, adminSession }) => {
  test.setTimeout(240_000);
  const media = await uploadPhotos(page, adminSession);
  const story = await createEditorDraft(page, adminSession.registerTestPost, "visual story");
  await page.reload({ waitUntil: "domcontentloaded" });
  const editor = await waitForEditorReady(page);

  await page.evaluate(({ specs, featured }) => {
    const wp = (window as any).wp;
    const build = (spec: Spec): unknown => wp.blocks.createBlock(spec.name, spec.attributes ?? {}, (spec.inner ?? []).map(build));
    wp.data.dispatch("core/block-editor").resetBlocks(specs.map(build));
    wp.data.dispatch("core/editor").editPost({ featured_media: featured, meta: { byline_story_presentation: "immersive", byline_story_immersive_alignment: "bottom-left" } });
  }, { specs: lunchSqueeze(media), featured: media.panorama.id });
  const toolNames = ["byline/timeline", "byline/annotated-image", "byline/before-after", "byline/visualization", "byline/scrolly"];
  expect((await names(page)).filter((name: string) => toolNames.includes(name))).toEqual(toolNames);

  // Save and reopen: nothing is invalid, every tool is still there.
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorReady(page);
  await expect(page.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
  expect(await invalidBlocks(page)).toEqual([]);
  expect((await names(page)).filter((name: string) => toolNames.includes(name))).toEqual(toolNames);

  // Duplicate, reorder and remove tools the way a writer would, then save again.
  const result = await page.evaluate(async () => {
    const wp = (window as any).wp;
    const dispatch = wp.data.dispatch("core/block-editor");
    const select = wp.data.select("core/block-editor");
    const first = (name: string) => select.getBlocks().find((block: any) => block.name === name);
    const timeline = first("byline/timeline");
    dispatch.duplicateBlocks([timeline.clientId]);
    const annotated = first("byline/annotated-image");
    dispatch.moveBlocksDown([annotated.clientId]);
    const before = first("byline/before-after");
    dispatch.removeBlock(before.clientId);
    const annotations = select.getBlocks().filter((block: any) => block.name === "byline/annotated-image").flatMap((block: any) => block.attributes.annotations.map((note: any) => note.id));
    return { timelines: select.getBlocks().filter((block: any) => block.name === "byline/timeline").length, beforeAfter: select.getBlocks().filter((block: any) => block.name === "byline/before-after").length, annotations };
  });
  expect(result).toMatchObject({ timelines: 2, beforeAfter: 0 });
  expect(new Set(result.annotations).size).toBe(result.annotations.length);
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorReady(page);
  expect(await invalidBlocks(page)).toEqual([]);
  void editor;

  // What the static site publishes: WordPress's rendered article.
  const rendered = (await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`)).payload.content.rendered;
  expect(rendered).toContain("byline-timeline");
  expect(rendered).toContain("byline-annotated-image");
  expect(rendered).not.toContain("byline-before-after"); // removed in the editor above
  expect(rendered).not.toContain("Choose both photographs");
  expect(rendered).not.toContain("Annotated image pending");
  // Story blocks get responsive candidates sized for their own layout, not WordPress's generic "100vw, 1600px".
  const annotated = rendered.match(/<figure class="wp-block-byline-annotated-image[\s\S]*?<\/figure>/)![0];
  expect(annotated).toMatch(/<img [^>]*srcset="[^"]+"/);
  expect(annotated).not.toMatch(/sizes="(?:auto, )?\(max-width: 1600px\) 100vw, 1600px"/);

  // Preview as Byline: the Immersive opening and every tool, at three widths, without third-party frames.
  await page.goto(`/wp-admin/admin.php?page=byline-article-preview&post=${story.id}`, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('iframe[title="Byline article preview"]');
  await expect(frame.locator(".immersive-article")).toBeVisible();
  for (const [name, width] of [["Desktop", 1200], ["Tablet", 768], ["Mobile", 390]] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(frame.locator(".article-body .byline-timeline").first()).toBeVisible();
    await expect(frame.locator(".byline-annotated-image")).toBeVisible();
    await expect(frame.locator(".byline-visualization")).toBeVisible();
    await expect(frame.locator(".byline-scrolly")).toBeVisible();
    const overflow = await frame.locator("body").evaluate((body) => body.ownerDocument.documentElement.scrollWidth - body.ownerDocument.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await expect(frame.locator('iframe[src^="http"]')).toHaveCount(0);
  }
});
