import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { lexicalFromArticleBody } from "@byline/editor/serialize";
import { addWithMenu, block, body, createStory, login, pageOverflow, paragraph, lexical, readDraft, signIn, waitForSaved } from "./helpers";

/**
 * A Data Project inside a Story, in the real editor (docs/byline-data.md#story-embeds):
 * Add → Data Project → search → choose, the project's real presentation in the
 * canvas, a heading and description that belong to this story, replacing the
 * project without losing them, draft and unpublished-changes states, and the
 * bottom Sheet with touch-sized targets on a phone. Like the other editor
 * specs it runs against a running newsroom:
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3010 npx playwright test --config playwright.editor.config.ts tests/browser/data-story-embed.spec.ts
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const names = { published: `Sidewalk ${run}`, changed: `Budget ${run}`, draft: `Election ${run}` };
let token = "";
let storyId = 0;
const projects: Record<string, number> = {};

const api = (baseURL: string) => ({ Authorization: `JWT ${token}`, Origin: baseURL });
async function send(request: APIRequestContext, baseURL: string, method: "post" | "patch", path: string, data: unknown) {
  const response = await request[method](`/api${path}`, { headers: api(baseURL), data });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  const dataset = await send(request, baseURL!, "post", "/byline/data/datasets", {
    title: `Embed phases ${run}`,
    schema: { fields: [{ key: "name", label: "Name", type: "text", required: true, visibility: "public", options: { maxLength: 200 } }, { key: "score", label: "Score", type: "integer", required: false, visibility: "public", options: {} }], retiredKeys: [] }
  });
  await send(request, baseURL!, "post", `/byline/data/datasets/${dataset.id}/rows`, { rows: [{ values: { name: "North segment", score: 92 } }, { values: { name: "South segment", score: 70 } }] });
  await send(request, baseURL!, "post", `/byline/data/datasets/${dataset.id}/publish`, {});
  const make = async (title: string, deck: string) => {
    const created = await send(request, baseURL!, "post", "/byline/data/projects", { title, presentation: "table", dataset: dataset.key });
    const detail = await (await request.get(`/api/byline/data/projects/${created.id}`, { headers: api(baseURL!) })).json();
    await send(request, baseURL!, "patch", `/byline/data/projects/${created.id}`, { deck, source: "City records.", expectedUpdatedAt: detail.project.updatedAt });
    return created.id as number;
  };
  projects.published = await make(names.published, "Where the sidewalk project stands.");
  projects.changed = await make(names.changed, "The district's budget in one table.");
  projects.draft = await make(names.draft, "Results as they arrive.");
  for (const id of [projects.published, projects.changed]) await send(request, baseURL!, "post", `/byline/data/projects/${id}/publish`, {});
  // Unpublished changes: edit the deck after publishing.
  const detail = await (await request.get(`/api/byline/data/projects/${projects.changed}`, { headers: api(baseURL!) })).json();
  await send(request, baseURL!, "patch", `/byline/data/projects/${projects.changed}`, { deck: "A newer draft deck.", expectedUpdatedAt: detail.project.updatedAt });
  storyId = await createStory(request, baseURL!, token, { headline: `Data embed ${run}`, body: lexical([paragraph("Opening paragraph of the story."), paragraph("Closing paragraph.")]) });
});

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL!, token);
});

async function openStory(page: Page) {
  await page.goto(`/admin/collections/stories/${storyId}?view=write`);
  await expect(body(page)).toBeVisible({ timeout: 60_000 });
  await expect(body(page)).toHaveAttribute("contenteditable", "true");
  // Payload remembers an open Live Preview for the account: start every test from the editor alone.
  if (await page.locator(".live-preview-window--is-live-previewing").count()) await togglePreview(page);
  await expect(page.locator(".live-preview-window--is-live-previewing")).toHaveCount(0);
}

async function togglePreview(page: Page) {
  await page.getByRole("button", { name: "More story actions" }).click();
  await page.locator("[data-story-preview]").click();
}

const frame = (page: Page) => block(page, "dataProject");
const heading = (page: Page) => frame(page).getByRole("textbox", { name: "Heading" });
const description = (page: Page) => frame(page).getByRole("textbox", { name: "Description" });
/** Selects the block the way a keyboard user does: focus its heading, which shows its toolbar. */
async function select(page: Page) {
  await frame(page).scrollIntoViewIfNeeded();
  await heading(page).focus();
  await expect(frame(page).locator(".byline-block-chrome")).toHaveCSS("opacity", "1");
}
const picker = (page: Page) => page.locator("[data-data-project-picker]");

async function choose(page: Page, title: string, expectSurface: "popover" | "sheet") {
  const surface = page.locator(expectSurface === "popover" ? '[data-slot="popover-content"]' : '[data-slot="sheet-content"]').filter({ has: picker(page) });
  await expect(surface).toBeVisible();
  await expect(page.locator(expectSurface === "popover" ? '[data-slot="sheet-content"]' : '[data-slot="popover-content"]').filter({ has: picker(page) })).toHaveCount(0);
  await expect(picker(page).getByRole("combobox", { name: "Search Data Projects" })).toBeFocused();
  await picker(page).getByRole("combobox", { name: "Search Data Projects" }).fill(title);
  const row = picker(page).locator("[data-slot=command-item]").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(surface).toHaveCount(0);
}

test("Add → Data Project → search → choose: the project's real presentation appears with the story's own copy", async ({ page }) => {
  await openStory(page);
  await body(page).locator(":scope > p", { hasText: "Opening paragraph" }).click();
  await addWithMenu(page, "dataset", /Data Project/);
  const empty = frame(page).getByRole("button", { name: "Choose a Data Project" });
  await expect(empty).toBeVisible();
  await empty.click();

  // The Popover is wider than the default and groups drafts apart from what readers can see.
  const popover = page.locator('[data-slot="popover-content"]').filter({ has: picker(page) });
  await expect(popover).toBeVisible();
  expect((await popover.boundingBox())!.width).toBeGreaterThan(400);
  await picker(page).getByRole("combobox", { name: "Search Data Projects" }).fill(run);
  await expect(picker(page).locator("[data-slot=command-item]")).toHaveCount(3);
  await expect(picker(page).locator("[cmdk-group-heading]")).toHaveText(["Published", "Unpublished changes", "Drafts"]);
  // Keyboard: arrows move, Escape closes, focus returns to the trigger.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(empty).toBeFocused();
  await empty.click();
  await picker(page).getByRole("combobox", { name: "Search Data Projects" }).fill("zzzz-no-such-project");
  await expect(picker(page).getByText("No Data Project matches.")).toBeVisible();
  await page.keyboard.press("Escape");
  await empty.click();

  await choose(page, names.published, "popover");
  await expect(heading(page)).toHaveValue(names.published);
  await expect(description(page)).toHaveValue("Where the sidewalk project stands.");
  // The real presentation (the private embed frame), sized to its content, not a metadata card.
  const embed = frame(page).locator("iframe.byline-data-embed-frame");
  await expect(embed).toBeVisible();
  await expect(page.frameLocator("iframe.byline-data-embed-frame").getByRole("table")).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator("iframe.byline-data-embed-frame").getByText("North segment")).toBeVisible();
  expect((await embed.boundingBox())!.height).toBeGreaterThan(80);
  await expect(frame(page).getByText("Published", { exact: true }).first()).toBeVisible();
  await expect(frame(page).getByRole("link", { name: "View full data project" })).toHaveAttribute("href", /\/data\/sidewalk-/);
  await expect(frame(page).getByRole("toolbar").getByRole("link", { name: "Open project" })).toHaveAttribute("href", new RegExp(`/admin/data\\?project=${projects.published}$`));
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

  // The heading and description belong to this story.
  await heading(page).fill("Where the sidewalk stands");
  await description(page).fill("Our own words about it.");
  await waitForSaved(page);
  const stored = (await readDraft(page.request, page.url().split("/admin")[0]!, token, storyId)) as { body: { root: { children: Array<{ fields?: Record<string, unknown> }> } } };
  const saved = stored.body.root.children.find((node) => node.fields?.blockType === "dataProject")!.fields!;
  expect(saved).toMatchObject({ project: projects.published, title: "Where the sidewalk stands", description: "Our own words about it." });
  // Only the relationship and the story's copy are stored.
  expect(Object.keys(saved).sort()).toEqual(["blockName", "blockType", "description", "id", "project", "title"]);
});

test("replacing the project keeps the copy a reporter wrote, and the choice survives a reload", async ({ page }) => {
  await openStory(page);
  await expect(heading(page)).toHaveValue("Where the sidewalk stands");
  await select(page);
  await frame(page).getByRole("button", { name: "Replace project" }).click();
  await choose(page, names.changed, "popover");
  // Copy the reporter wrote is preserved when the project changes.
  await expect(heading(page)).toHaveValue("Where the sidewalk stands");
  await expect(description(page)).toHaveValue("Our own words about it.");
  await expect(frame(page).getByText("This project has unpublished changes. Readers will see its published version.").first()).toBeVisible();
  await waitForSaved(page);
  await page.reload();
  await expect(body(page)).toBeVisible({ timeout: 60_000 });
  await expect(heading(page)).toHaveValue("Where the sidewalk stands");
  await expect(frame(page).getByText("Unpublished changes", { exact: true }).first()).toBeVisible();
  // Published version is what the frame draws: the old deck, not the draft deck.
  const stored = (await readDraft(page.request, page.url().split("/admin")[0]!, token, storyId)) as { body: { root: { children: Array<{ fields?: Record<string, unknown> }> } } };
  expect(stored.body.root.children.find((node) => node.fields?.blockType === "dataProject")!.fields!.project).toBe(projects.changed);
});

test("a draft-only project is chosen freely and says plainly it cannot publish yet", async ({ page }) => {
  await openStory(page);
  await select(page);
  await frame(page).getByRole("button", { name: "Replace project" }).click();
  await choose(page, names.draft, "popover");
  await expect(frame(page).getByText("Draft Data Project · not yet publishable").first()).toBeVisible();
  // The note appears under the selected block, in calm words, not an alarm.
  await frame(page).getByRole("textbox", { name: "Heading" }).focus();
  await expect(frame(page).getByText("Publish this Data Project before publishing the story.")).toBeVisible();
  await waitForSaved(page);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the picker is a bottom Sheet with touch-sized targets and nothing overflows", async ({ page }) => {
    await openStory(page);
    await select(page);
    await frame(page).getByRole("button", { name: "Replace project" }).tap();
    const sheet = page.locator('[data-slot="sheet-content"]').filter({ has: picker(page) });
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(800);
    expect(box.width).toBeLessThanOrEqual(390);
    await picker(page).getByRole("combobox", { name: "Search Data Projects" }).fill(run);
    const rows = picker(page).locator("[data-slot=command-item]");
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await rows.filter({ hasText: names.published }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(frame(page).locator("iframe.byline-data-embed-frame")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("Live Preview", () => {
  const seeded = async (request: APIRequestContext, baseURL: string, project: number, title: string) => createStory(request, baseURL, token, {
    headline: `Preview ${title} ${run}`,
    body: lexicalFromArticleBody({ format: "byline-v1", version: 1, media: {}, nodes: [
      { type: "paragraph", children: [{ type: "text", text: "Opening paragraph of the story." }] },
      { type: "dataProject", id: "preview-embed", project, title: `Heading for ${title}`, description: "Described for readers." }
    ] })
  });
  const openPreview = async (page: Page, id: number) => {
    await page.goto(`/admin/collections/stories/${id}?view=write`);
    await expect(body(page)).toBeVisible({ timeout: 60_000 });
    if (!(await page.locator(".live-preview-window--is-live-previewing").count())) await togglePreview(page);
    return page.frameLocator("iframe[src*='/preview/story']");
  };

  test("says plainly that a draft project cannot publish yet, and still shows the story's words", async ({ page, request, baseURL }) => {
    const id = await seeded(request, baseURL!, projects.draft, "draft");
    const preview = await openPreview(page, id);
    await expect(preview.getByText("Draft Data Project · not yet publishable.")).toBeVisible({ timeout: 90_000 });
    await expect(preview.getByRole("heading", { level: 2, name: "Heading for draft" })).toBeVisible();
    await expect(preview.getByText("Described for readers.")).toBeVisible();
    await togglePreview(page);
  });

  test("draws the published project's real presentation, and says when it has unpublished changes", async ({ page, request, baseURL }) => {
    const published = await openPreview(page, await seeded(request, baseURL!, projects.published, "published"));
    await expect(published.locator("iframe.byline-data-embed-frame").first()).toBeVisible({ timeout: 90_000 });
    await expect(published.getByText("not yet publishable")).toHaveCount(0);
    await expect(published.frameLocator("iframe.byline-data-embed-frame").first().getByText("North segment")).toBeVisible({ timeout: 60_000 });
    await expect(published.getByRole("link", { name: "View full data project" })).toBeVisible();
    await togglePreview(page);
    const changed = await openPreview(page, await seeded(request, baseURL!, projects.changed, "changed"));
    await expect(changed.getByText("This project has unpublished changes. Readers will see its published version.")).toBeVisible({ timeout: 90_000 });
    await togglePreview(page);
  });
});
