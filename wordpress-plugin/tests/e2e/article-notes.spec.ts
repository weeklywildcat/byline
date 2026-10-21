import { randomUUID } from "node:crypto";
import { expect, test, type AdminSession } from "./fixtures";
import { boardUrl, createPlanningStory, token } from "./planning-fixture";

/**
 * WordPress Core Notes inside Byline.
 *
 * Notes are created through the real Core comments REST controller exactly as
 * Gutenberg creates them (type=note; open = hold, resolved = approved), so this
 * runs the installed WordPress 7.1 rather than a mock. Nothing here touches the
 * block editor's private DOM: Byline only summarises Notes and links to the
 * editor, which these tests confirm is the ordinary edit URL.
 */
type Note = { id: number };

async function addNote(session: AdminSession, post: number, content: string, parent = 0): Promise<number> {
  const response = await session.rest<Note>("/wp/v2/comments", "POST", { post, content, type: "note", status: "hold", parent });
  expect(response.status, JSON.stringify(response.payload)).toBe(201);
  return response.payload.id;
}

/** Resolving is what the editor does: approve the thread, then add the text-less marker reply. */
async function resolveNote(session: AdminSession, post: number, id: number): Promise<void> {
  expect((await session.rest(`/wp/v2/comments/${id}`, "POST", { status: "approved" })).ok).toBe(true);
  expect((await session.rest("/wp/v2/comments", "POST", { post, content: "", type: "note", status: "approved", parent: id, meta: { _wp_note_status: "resolved" } })).ok).toBe(true);
}

async function seedNotes(session: AdminSession, post: number, open: number, resolved: number) {
  const ids: number[] = [];
  for (let index = 0; index < open; index += 1) ids.push(await addNote(session, post, `<p>Can we verify point ${index + 1}? <strong>Source needed</strong> before this runs.</p>`));
  // Previews are newest first, so the replies go on the newest thread to show up in the card.
  await addNote(session, post, "<p>I'll check with the principal.</p>", ids[ids.length - 1]!);
  await addNote(session, post, "<p>Confirmed with the district.</p>", ids[ids.length - 1]!);
  for (let index = 0; index < resolved; index += 1) await resolveNote(session, post, await addNote(session, post, `<p>Fix typo ${index + 1}.</p>`));
  session.addCleanup(async () => { for (const id of ids) await session.rest(`/wp/v2/comments/${id}?force=true`, "DELETE"); });
  return ids;
}

const workspaceUrl = (id: number) => `/wp-admin/admin.php?page=byline-planning&story=${id}`;

test.describe("Article Notes", () => {
  test("an editor sees open Notes in the workspace, Peek and Planning, and is sent to the real editor", async ({ adminPage: page, adminSession: session }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const unique = token();
    const title = `${unique} Notes story`;
    const id = await createPlanningStory(session, { title, status: "editing" });
    await seedNotes(session, id, 4, 2);
    const editUrl = new RegExp(`post=${id}&action=edit$`);

    // --- Story Workspace
    await page.setViewportSize({ width: 1440, height: 1000 });
    const loaded = page.waitForResponse((response) => response.url().includes(`/editorial/stories/${id}/notes`) && response.ok());
    await page.goto(workspaceUrl(id));
    const card = page.getByRole("region", { name: "Article Notes" });
    await expect(card).toBeVisible();
    await loaded;
    await expect(card.getByText("4 open", { exact: true })).toBeVisible();
    const list = card.getByRole("list", { name: "Open article notes" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").first()).toContainText("Can we verify point 4");
    await expect(list.getByText("2 replies")).toBeVisible();
    await expect(card.getByText("+1 more open note")).toBeVisible();
    await expect(card.getByText("2 resolved")).toBeVisible();
    // Previews are plain text: no markup survives into the card.
    await expect(card.locator("strong")).toHaveCount(0);
    await expect(card).not.toContainText("<p>");

    const cta = card.getByRole("link", { name: /Review notes in editor/ });
    await expect(cta).toHaveAttribute("href", editUrl);
    await expect(cta).toHaveAttribute("target", "_blank");
    const editorHref = (await cta.getAttribute("href")) as string;
    expect(editorHref).not.toContain("#");

    // Details, Article Notes, Files & Links, Recent Activity.
    const order = await page.locator('aside[aria-label="Story context"] [role="region"]').evaluateAll((regions) => regions.map((region) => region.getAttribute("aria-labelledby") || ""));
    expect(order.indexOf("ws-details-title")).toBeLessThan(order.indexOf("ws-notes-title"));
    expect(order.indexOf("ws-notes-title")).toBeLessThan(order.indexOf("ws-files-title"));

    // --- Planning board: a quiet icon and count with an accessible name.
    await page.goto(boardUrl(unique));
    const boardCard = page.locator(`[data-story-id="${id}"]`);
    await expect(boardCard).toBeVisible();
    const indicator = boardCard.locator("[data-story-notes]");
    await expect(indicator).toHaveAttribute("data-story-notes", "4");
    await expect(indicator).toContainText("4 open article notes");
    await indicator.hover();
    await expect(page.locator("[data-slot=tooltip-content]")).toContainText("4 open article notes");
    await expect(boardCard).not.toContainText("resolved");
    // No Note text ever reaches the Planning response.
    const planning = await session.rest<{ stories: Array<{ id: number; notes: { openCount: number; resolvedCount: number } | null }> }>(`/byline/v1/editorial/planning?search=${unique}`);
    const row = planning.payload.stories.find((story) => story.id === id)!;
    expect(row.notes).toMatchObject({ available: true, canView: true, openCount: 4, resolvedCount: 2 });
    expect(JSON.stringify(planning.payload)).not.toContain("Can we verify");

    // --- Story Peek: one keyboard-reachable row that opens the editor.
    await boardCard.getByRole("button", { name: title, exact: true }).click();
    const peek = page.getByRole("dialog");
    await expect(peek).toBeVisible();
    const peekLink = peek.getByRole("link", { name: /4 open notes/ });
    await expect(peekLink).toContainText("Review in editor");
    await expect(peekLink).toHaveAttribute("href", editUrl);
    await peekLink.focus();
    await expect(peekLink).toBeFocused();
    await page.keyboard.press("Escape");

    // --- The link really opens the WordPress editor for that story.
    const editor = await page.context().newPage();
    await editor.goto(editorHref);
    await expect(editor).toHaveURL(editUrl);
    await expect(editor.locator("body.block-editor-page")).toBeVisible({ timeout: 60_000 });
    await editor.close();
    expect(errors).toEqual([]);
  });

  test("resolving Notes in WordPress is reflected here, down to the empty state", async ({ adminPage: page, adminSession: session }) => {
    const id = await createPlanningStory(session, { title: `${token()} Resolve me`, status: "editing" });
    const [first, second] = await seedNotes(session, id, 2, 1);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(workspaceUrl(id));
    const card = page.getByRole("region", { name: "Article Notes" });
    await expect(card.getByText("2 open", { exact: true })).toBeVisible();
    await expect(card.getByText("1 resolved")).toBeVisible();

    await resolveNote(session, id, first!);
    await page.reload();
    await expect(card.getByText("1 open", { exact: true })).toBeVisible();
    await expect(card.getByText("2 resolved")).toBeVisible();

    await resolveNote(session, id, second!);
    await page.reload();
    await expect(card.getByText("No open article notes")).toBeVisible();
    await expect(card.getByText("Copy-editing comments and suggestions will appear here.")).toBeVisible();
    await expect(card.getByText("3 resolved")).toBeVisible();
    await expect(card.getByText("open", { exact: true })).toHaveCount(0);
    await expect(card.getByRole("link", { name: /Open article in editor/ })).toHaveAttribute("href", new RegExp(`post=${id}&action=edit$`));

    // A story that never had Notes behaves the same, minus the resolved count.
    const quiet = await createPlanningStory(session, { title: `${token()} Quiet`, status: "editing" });
    await page.goto(workspaceUrl(quiet));
    await expect(page.getByRole("region", { name: "Article Notes" }).getByText("No open article notes")).toBeVisible();
    await expect(page.getByRole("region", { name: "Article Notes" }).getByText(/resolved/)).toHaveCount(0);
    // Planning stays quiet: no icon without an open Note.
    await page.goto(boardUrl("Quiet"));
    await expect(page.locator(`[data-story-id="${quiet}"]`)).toBeVisible();
    await expect(page.locator(`[data-story-id="${quiet}"] [data-story-notes]`)).toHaveCount(0);
  });

  test("a participant who can open the workspace but not edit the story learns nothing about its Notes", async ({ browser, adminSession: session }) => {
    const title = `${token()} Private copy edits`;
    const id = await createPlanningStory(session, { title, status: "editing" });
    await seedNotes(session, id, 3, 1);
    const username = `notes-photog-${Date.now()}`;
    const password = randomUUID();
    const user = await session.rest<{ id: number }>("/wp/v2/users", "POST", { username, password, email: `${username}@example.test`, name: "Maycie Photographer", roles: ["author"] });
    expect(user.status).toBe(201);
    session.addCleanup(async () => { await session.rest(`/wp/v2/users/${user.payload.id}?force=true&reassign=1`, "DELETE"); });
    const assignment = await session.rest(`/byline/v1/editorial/stories/${id}/media-assignments`, "POST", { title: "Canteen photos", type: "photo", assigneeId: user.payload.id, dueAt: "2030-01-01T17:00" });
    expect(assignment.ok).toBe(true);

    const context = await browser.newContext({ baseURL: process.env.WP_BASE_URL || "http://localhost:8888" });
    const page = await context.newPage();
    try {
      await page.goto("/wp-login.php");
      await page.getByLabel("Username or Email Address").fill(username);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Log In", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      const requests: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      const workspace = page.waitForResponse((response) => response.url().includes(`/editorial/stories/${id}/workspace`));
      await page.goto(workspaceUrl(id));
      const payload = await (await workspace).json() as { capabilities: { role: string; editArticle: boolean }; story: { notes: unknown } };
      expect(payload.capabilities).toMatchObject({ role: "participant", editArticle: false });
      expect(payload.story.notes ?? null).toBeNull();
      expect(JSON.stringify(payload)).not.toContain("Can we verify");
      await expect(page.getByRole("region", { name: "Details" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Article Notes" })).toHaveCount(0);
      await expect(page.getByText(/open notes?|article notes?/i)).toHaveCount(0);
      expect(requests.some((url) => url.includes("/notes"))).toBe(false);

      const denied = await page.evaluate(async (story) => {
        const settings = (window as unknown as { wpApiSettings?: { nonce?: string } }).wpApiSettings;
        const response = await fetch(`/wp-json/byline/v1/editorial/stories/${story}/notes`, { headers: { "X-WP-Nonce": settings?.nonce ?? "" } });
        return { status: response.status, body: await response.text() };
      }, id);
      expect(denied.status).toBe(403);
      expect(denied.body).not.toContain("Can we verify");
      const core = await context.request.get(`/wp-json/wp/v2/comments?post=${id}&type=note`);
      expect(core.ok()).toBe(false);
    } finally { await context.close(); }

    // Anonymous visitors get nothing, here or from the public comments API.
    const anonymous = await browser.newContext({ baseURL: process.env.WP_BASE_URL || "http://localhost:8888" });
    try {
      expect((await anonymous.request.get(`/wp-json/byline/v1/editorial/stories/${id}/notes`)).status()).toBe(401);
      expect(await (await anonymous.request.get(`/wp-json/wp/v2/comments?post=${id}`)).text()).not.toContain("Can we verify");
    } finally { await anonymous.close(); }
  });

  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1100], ["mobile", 390, 844]] as const) {
    test(`the Notes card and indicators fit at ${name} width`, async ({ adminPage: page, adminSession: session }) => {
      const unique = token();
      const id = await createPlanningStory(session, { title: `${unique} A rather long headline about the canteen that must wrap instead of overflowing the narrow card`, status: "editing" });
      await seedNotes(session, id, 4, 3);
      await addNote(session, id, `<p>${"Supercalifragilisticexpialidocious".repeat(8)} ${"This is a very long copy-editing remark that should be clamped to two lines in the compact card. ".repeat(4)}</p>`);
      await page.setViewportSize({ width, height });
      await page.goto(workspaceUrl(id));
      const card = page.getByRole("region", { name: "Article Notes" });
      await expect(card.getByRole("list", { name: "Open article notes" }).getByRole("listitem")).toHaveCount(3);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await card.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      // The excerpt is clamped, not a wall of text.
      const heights = await card.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      expect(Math.max(...heights)).toBeLessThan(110);
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `test-results/article-notes-${name}-workspace.png`, animations: "disabled" });

      await page.goto(boardUrl(unique, width < 700 ? "list" : "board"));
      await expect(page.locator(`[data-story-notes="5"]`).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/article-notes-${name}-planning.png`, animations: "disabled" });
    });
  }
});
