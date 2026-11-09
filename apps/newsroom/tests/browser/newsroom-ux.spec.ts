import { expect, test } from "@playwright/test";
import { createStory, fixturePdf, login, signIn, waitForSaved } from "./helpers";

for (const width of [1440, 820, 390]) {
  test.describe(`newsroom workflows at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1000 });
    test("edit a permalink, preserve its old path, and use History, search and Site", async ({ page, context, request, baseURL }) => {
      const token = await login(request, baseURL!, "ADMIN");
      const headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
      const { docs } = await (await request.get("/api/sections?depth=0&limit=1", { headers })).json();
      const section = docs[0];
      const suffix = `${width}-${Date.now()}`;
      const title = `Newsroom UX ${suffix}`;
      const id = await createStory(request, baseURL!, token, { headline: title, slug: `ux-${suffix}`, section: section.id });
      await signIn(context, baseURL!, token);
      await page.goto(`/admin/collections/stories/${id}`);
      // Story details is secondary: in the header's overflow menu.
      const detailsButton = { click: async () => { await page.getByRole("button", { name: "More story actions" }).click(); await page.getByRole("menuitem", { name: /Story details/ }).click(); } };
      const details = page.getByRole("dialog", { name: "Story details" });
      const closeDetails = () => details.getByRole("button", { name: "Close", exact: true }).click();
      await detailsButton.click();
      const url = details.getByRole("region", { name: "Public URL" });
      await expect(url).toContainText("The date is assigned on first publication.");
      const edit = url.getByRole("button", { name: "Edit URL" });
      await edit.click();
      const dialog = page.getByRole("dialog", { name: "Edit public URL" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Apply to draft" })).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(edit).toBeFocused();
      await edit.click();
      await dialog.getByLabel(/First publication/).fill("2026-11-07T23:30");
      await dialog.getByRole("button", { name: "Apply to draft" }).click();
      await closeDetails();
      await waitForSaved(page);
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await detailsButton.click();
      await expect(url.getByRole("link", { name: "Open published story" })).toHaveAttribute("href", new RegExp(`/2026/11/07/${section.slug}/ux-${suffix}/$`));

      await edit.click();
      await dialog.getByLabel("Story slug").fill(`new-${suffix}`);
      await dialog.getByRole("button", { name: "Apply to draft" }).click();
      await closeDetails();
      await waitForSaved(page);
      await page.getByRole("button", { name: "Publish changes", exact: true }).click();
      const confirmation = page.getByRole("alertdialog", { name: "Change the published URL?" });
      await expect(confirmation).toContainText("permanent redirect");
      await expect(confirmation.getByRole("button", { name: "Publish with redirect" })).toBeInViewport();
      await confirmation.getByRole("button", { name: "Publish with redirect" }).click();
      await detailsButton.click();
      await expect(url.getByRole("link", { name: "Open published story" })).toHaveAttribute("href", new RegExp(`/new-${suffix}/$`));

      await closeDetails();
      // History is reachable, secondarily: ••• → View history, as a focused mode with Back to story.
      await page.getByRole("button", { name: "More story actions" }).click();
      await page.getByRole("menuitem", { name: "View history" }).click();
      await expect(page).toHaveURL(/[?&]view=history/);
      await expect(page.getByText("Currently published", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Add notice" }).click();
      const notice = page.getByRole("dialog", { name: "Add a public notice" });
      await notice.getByLabel("Public notice text").fill("We clarified when the meeting starts.");
      await notice.getByRole("button", { name: "Save notice" }).click();
      await expect(page.getByText("We clarified when the meeting starts.", { exact: true })).toBeVisible();

      await page.keyboard.press("Control+k");
      const search = page.getByRole("combobox", { name: "Search the newsroom" });
      await search.fill("Vivian Search");
      await expect(page.getByRole("option", { name: /Vivian Search Fixture/ })).toBeVisible();
      await search.press("Enter");
      await expect(page).toHaveURL(/\/admin\/people\?person=\d+/);

      await expect(page.getByText("Vivian Search Fixture", { exact: true }).first()).toBeVisible();
      await page.keyboard.press("Control+k");
      await search.fill("Open Site");
      await expect(page.getByRole("option", { name: "Open Site" })).toBeVisible();
      await search.press("Enter");
      await expect(page.getByRole("heading", { name: "Site", exact: true })).toBeVisible();
      await page.getByRole("tab", { name: "Redirects" }).click();
      await expect(page).toHaveURL(/tab=redirects/);
      await expect(page.getByText(new RegExp(`/ux-${suffix}/`))).toBeVisible();
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);

      if (width === 1440) {
        await page.getByRole("tab", { name: "Pages" }).click();
        await page.getByRole("button", { name: "Add Page" }).click();
        const pageDialog = page.getByRole("dialog", { name: "Add Page" });
        await pageDialog.getByLabel("Title").fill(`Institutional guide ${suffix}`);
        await pageDialog.getByRole("button", { name: "Create draft" }).click();
        await expect(page).toHaveURL(/\/admin\/collections\/pages\/\d+/);
        await expect(page.getByRole("tab", { name: "Edit page" })).toBeVisible();
        await page.getByRole("button", { name: "Publish page", exact: true }).click();
        await expect(page.getByRole("link", { name: `/institutional-guide-${suffix}/` })).toBeVisible();
      }
    });
  });
}

test("moves a Story to Trash from the shadcn publication menu", async ({ page, context, request, baseURL }) => {
  const token = await login(request, baseURL!, "ADMIN");
  const headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
  const id = await createStory(request, baseURL!, token, {
    headline: "Trash action fixture",
    slug: `trash-${Date.now()}`,
  });
  await signIn(context, baseURL!, token);
  await page.goto(`/admin/collections/stories/${id}`);
  await expect(page.getByRole("heading", { name: "Trash action fixture", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publication actions" }).click();
  await page.getByRole("menuitem", { name: /Move to trash/i }).click();

  const dialog = page.getByRole("alertdialog", { name: "Move this story to Trash?" });
  await expect(dialog).toContainText("recoverable");
  await dialog.getByRole("button", { name: "Move to Trash", exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/stories$/);
  const stored = await request.get(`/api/stories/${id}?trash=true&depth=0`, { headers });
  const storedBody = await stored.json();
  expect(stored.ok(), JSON.stringify(storedBody)).toBeTruthy();
  expect(storedBody.deletedAt).toEqual(expect.any(String));
});

test("keyboard command results open Stories, Collections and Media at their destinations", async ({ page, context, request, baseURL }) => {
  const token = await login(request, baseURL!, "ADMIN");
  const headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
  const key = `command-${Date.now()}`;
  const id = await createStory(request, baseURL!, token, { headline: "Unique desk story", slug: `story-${key}` });
  const collection = await request.post("/api/byline/collections", { headers, data: { name: `Collection ${key}`, type: "event" } });
  expect(collection.ok()).toBeTruthy();
  const collectionId = (await collection.json()).id;
  const media = await request.post("/api/media", { headers, multipart: {
    file: { name: `${key}.pdf`, mimeType: "application/pdf", buffer: fixturePdf(1) },
    _payload: JSON.stringify({ credit: `Attribution ${key}` })
  } });
  expect(media.ok()).toBeTruthy();
  const mediaId = (await media.json()).doc.id;
  await signIn(context, baseURL!, token);
  await page.goto("/admin/site");
  const input = page.getByRole("combobox", { name: "Search the newsroom" });
  async function choose(search: string, result: RegExp) {
    await page.keyboard.press("Control+k");
    await input.fill(search);
    await expect(page.getByRole("option", { name: result })).toBeVisible();
    await input.press("Enter");
  }
  await choose(`story-${key}`, /Unique desk story/);
  await expect(page).toHaveURL(new RegExp(`/admin/collections/stories/${id}$`));
  await expect(page.getByRole("heading", { name: "Unique desk story", exact: true })).toBeVisible();
  await choose(`Collection ${key}`, new RegExp(`Collection ${key}`));
  await expect(page).toHaveURL(new RegExp(`/admin/collections[?].*collection=${collectionId}`));
  await expect(page.getByRole("heading", { name: `Collection ${key}`, exact: true }).first()).toBeVisible();
  await choose(`Attribution ${key}`, new RegExp(`${key}\\.pdf`));
  await expect(page).toHaveURL(new RegExp(`/admin/media[?].*asset=${mediaId}`));
});
