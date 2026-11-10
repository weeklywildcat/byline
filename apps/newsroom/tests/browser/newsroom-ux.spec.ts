import { expect, test } from "@playwright/test";
import { body, createStory, fixturePdf, lexical, login, paragraph, pickDateTime, readDraft, signIn, waitForSaved } from "./helpers";

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
      await pickDateTime(page, dialog, /First publication/, "2026-11-07T23:30");
      await dialog.getByRole("button", { name: "Apply to draft" }).click();
      await closeDetails();
      await waitForSaved(page);
      // A new Story is a Pitch: the header's Publish appears at Ready. An editor publishes earlier from the overflow menu.
      await page.getByRole("button", { name: "More story actions" }).click();
      await page.getByRole("menuitem", { name: "Publish now, without review" }).click();
      await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeVisible();
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
  await page.goto(`/admin/collections/stories/${id}?view=write`);
  await expect(page.getByRole("textbox", { name: "Headline" })).toHaveValue("Trash action fixture");

  await page.getByRole("button", { name: "More story actions" }).click();
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
  await expect(page.getByRole("textbox", { name: "Headline" })).toHaveValue("Unique desk story");
  await choose(`Collection ${key}`, new RegExp(`Collection ${key}`));
  await expect(page).toHaveURL(new RegExp(`/admin/collections[?].*collection=${collectionId}`));
  await expect(page.getByRole("heading", { name: `Collection ${key}`, exact: true }).first()).toBeVisible();
  await choose(`Attribution ${key}`, new RegExp(`${key}\\.pdf`));
  await expect(page).toHaveURL(new RegExp(`/admin/media[?].*asset=${mediaId}`));
});

test("primary navigation adapts to the viewport and follows guarded newsroom routes", async ({ page, context, request, baseURL }) => {
  const token = await login(request, baseURL!, "ADMIN");
  const headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
  const collection = await request.post("/api/byline/collections", { headers, data: { name: "Navigation guard fixture", type: "event" } });
  expect(collection.ok()).toBeTruthy();
  const { id } = await collection.json();
  await signIn(context, baseURL!, token);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/admin");

  const header = page.locator(".byline-app-header");
  const nav = header.locator(".byline-primary-navigation");
  const selected = nav.locator('[aria-current="page"]');
  const toggle = header.getByRole("button", { name: "Toggle navigation" });
  const create = header.getByRole("button", { name: "Create", exact: true });
  const more = header.locator(".byline-more-trigger");
  const drawer = page.getByRole("dialog", { name: "More", exact: true });
  await expect(nav.getByRole("link")).toHaveText(["Home", "Stories", "Calendar"]);
  await expect(selected).toHaveText("Home");
  await expect(toggle).toBeHidden();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
  const phoneTabs = await nav.boundingBox();
  expect(phoneTabs).toMatchObject({ x: 0, width: 320, height: 56 });
  expect(phoneTabs!.y + phoneTabs!.height).toBe(640);
  for (const tab of await nav.locator("a, button").all()) {
    expect(await tab.boundingBox()).toMatchObject({ width: 80 });
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  const historyLength = await page.evaluate(() => history.length);
  await expect(more).toHaveAttribute("aria-haspopup", "dialog");
  await more.click();
  await expect(drawer).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(more).not.toHaveAttribute("aria-current");
  await expect(page).toHaveURL(/\/admin$/);
  await expect.poll(() => drawer.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(96);
  const underlined = (element: Element) => getComputedStyle(element).borderTopColor !== "rgba(0, 0, 0, 0)";
  expect(await more.evaluate(underlined)).toBe(true);
  expect(await selected.evaluate(underlined)).toBe(false);
  await drawer.getByRole("button", { name: "Close More" }).click();
  await expect(drawer).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(selected).toHaveText("Home");
  expect(await selected.evaluate(underlined)).toBe(true);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  const drawerTop = () => drawer.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  async function dragHandle(distance: number) {
    const handle = await drawer.locator(':scope > [aria-hidden="true"]').boundingBox();
    const x = handle!.x + handle!.width / 2;
    const y = handle!.y + handle!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance, { steps: 10 });
    await page.mouse.up();
  }

  await more.click();
  await expect.poll(drawerTop).toBe(96);
  await dragHandle(-96);
  await expect.poll(drawerTop).toBe(0);
  await dragHandle(110);
  await expect.poll(drawerTop).toBe(96);
  await dragHandle(210);
  await expect(drawer).toBeHidden();
  await more.click();
  await expect.poll(drawerTop).toBe(96);
  await page.mouse.click(160, 40);
  await expect(drawer).toBeHidden();
  await expect(selected).toHaveText("Home");

  await more.click();
  await expect(drawer.getByRole("link", { name: "System administration" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Ready for review" })).toHaveAttribute("href", /\/admin\/stories.*needs_review=1/);
  await drawer.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");

  await create.click();
  const chooser = page.getByRole("dialog", { name: "Create", exact: true });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("button", { name: "New collection" })).toBeVisible();
  await chooser.getByRole("button", { name: "New story" }).click();
  const storyForm = page.getByRole("dialog", { name: "New story", exact: true });
  await storyForm.getByLabel("What's the story?").fill("Story created from the phone header");
  await storyForm.getByRole("button", { name: "Create pitch" }).click();
  await expect(page).toHaveURL(/\/admin\/collections\/stories\/\d+$/);
  await expect(selected).toHaveText("Stories");
  await more.click();
  await drawer.getByRole("link", { name: "Media", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/media$/);
  await expect(drawer).toBeHidden();
  await expect(selected).toHaveCount(0);
  const back = header.getByRole("link", { name: "Back to Home" });
  await expect(back).toHaveAttribute("href", "/admin");
  await page.goBack();
  await expect(selected).toHaveText("Stories");
  await expect(header.getByRole("link", { name: "Back to Stories" })).toHaveAttribute("href", "/admin/stories");
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/media$/);
  for (const width of [767, 768, 1100, 1199, 1200]) {
    await page.setViewportSize({ width, height: 720 });
    if (width < 1200) {
      await expect(nav).toBeVisible();
      await expect(toggle).toBeHidden();
      await expect(selected).toHaveCount(0);
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
      expect(await nav.evaluate((element) => getComputedStyle(element).position)).toBe(width < 768 ? "fixed" : "static");
    } else {
      await expect(nav).toBeHidden();
      await expect(toggle).toBeVisible();
      await expect(page.locator('[data-composition="media-workspace"]')).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 820, height: 720 });
  await more.click();
  await expect(drawer).toHaveAttribute("data-slot", "popover-content");
  await page.keyboard.press("Escape");
  await create.click();
  await page.getByRole("menuitem", { name: "Upload media" }).click();
  const upload = page.getByRole("dialog", { name: "Upload media" });
  await upload.locator('input[type="file"]').setInputFiles({
    name: `navigation-${Date.now()}.pdf`,
    mimeType: "application/pdf",
    buffer: fixturePdf(1)
  });
  await expect(upload.getByText("1 uploaded", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await back.click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/collections?collection=${id}`);
  await page.getByRole("button", { name: "Add brief", exact: true }).click();
  const brief = page.getByRole("textbox", { name: "Reporting brief and key angles" });
  await brief.fill("Unsaved across a viewport change");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(brief).toHaveValue("Unsaved across a viewport change");
  await page.setViewportSize({ width: 390, height: 720 });
  await more.click();
  await drawer.getByRole("link", { name: "Media", exact: true }).click();
  const guard = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await guard.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(brief).toHaveValue("Unsaved across a viewport change");
  await nav.getByRole("link", { name: "Calendar" }).click();
  await guard.getByRole("button", { name: "Leave anyway" }).click();
  await expect(selected).toHaveText("Calendar");
  await page.goBack();
  await expect(selected).toHaveCount(0);
  await page.goForward();
  await expect(selected).toHaveText("Calendar");

  await page.goto("/admin/collections/media");
  await expect(nav).toHaveCount(0);
  await expect(toggle).toBeVisible();
});

test("More and the phone Create drawer respect staff access", async ({ page, context, request, baseURL }) => {
  const token = await login(request, baseURL!, "STAFF");
  await signIn(context, baseURL!, token);
  await page.setViewportSize({ width: 390, height: 720 });
  const story = await createStory(request, baseURL!, token, { headline: "Primary navigation story", slug: `nav-${Date.now()}` });
  await page.goto(`/admin/collections/stories/${story}?tab=reporting`);
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Stories");
  await expect(page.getByRole("link", { name: "Back to Stories", exact: true })).toBeVisible();
  const more = nav.getByRole("button", { name: "More", exact: true });
  const drawer = page.getByRole("dialog", { name: "More", exact: true });
  await more.click();
  await expect(drawer.getByRole("link", { name: "Media", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "My profile", exact: true })).toBeVisible();
  for (const destination of ["People", "Ready for review", "Front Page", "Distribution", "Content Health", "Site", "System administration"]) {
    await expect(drawer.getByRole("link", { name: destination, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Create", exact: true });
  await expect(chooser.getByRole("button")).toHaveText(["New story", "New task", "Upload media", "Cancel"]);
  await chooser.getByRole("button", { name: "Cancel" }).click();
  await more.click();
  await drawer.getByRole("link", { name: "Field Mode" }).click();
  await expect(page).toHaveURL(/\/admin\/field$/);
  await expect(nav).toHaveCount(0);
  await expect(page.locator(".byline-app-header")).toHaveCount(0);
});

test("More preserves a live Story editor and waits for its autosave before leaving", async ({ page, context, request, baseURL }) => {
  const token = await login(request, baseURL!, "ADMIN");
  await signIn(context, baseURL!, token);
  const story = await createStory(request, baseURL!, token, {
    headline: "Drawer autosave fixture",
    body: lexical([paragraph("The newsroom is open.")])
  });
  const storyPath = `/admin/collections/stories/${story}?view=write`;
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto(storyPath);
  const editor = body(page);
  await expect(editor).toContainText("The newsroom is open.");
  const original = await editor.elementHandle();
  const more = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "More", exact: true });
  const drawer = page.getByRole("dialog", { name: "More", exact: true });

  let releaseSave!: () => void;
  const hold = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(new RegExp(`/api/stories/${story}[?].*autosave=true`), async (route) => {
    await hold;
    await route.continue();
  });

  try {
    await editor.getByText("The newsroom is open.").click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" The deadline is Friday.");
    await expect(editor).toContainText("The deadline is Friday.");
    await more.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(baseURL + storyPath);
    await expect(editor).toContainText("The deadline is Friday.");
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);

    await more.click();
    await drawer.getByRole("link", { name: "Media", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByText("Saving your changes…", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(baseURL + storyPath);
  } finally {
    releaseSave();
  }
  await expect(page).toHaveURL(/\/admin\/media$/);
  expect(JSON.stringify((await readDraft(request, baseURL!, token, story)).body)).toContain("The deadline is Friday.");
});
