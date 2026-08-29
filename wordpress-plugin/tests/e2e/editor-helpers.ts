import { expect, type Frame, type Locator, type Page } from "@playwright/test";

const EDITOR_CANVAS_SELECTORS = [
  'iframe[name="editor-canvas"]',
  "iframe.block-editor-iframe__iframe",
  "iframe.editor-canvas__iframe",
  'iframe[title*="Editor content" i]',
  'iframe[title*="Editor" i]'
] as const;
const EDITOR_PLUGIN_NAME = "byline-editorial-workflow";
const EDITOR_READY_TIMEOUT = 20_000;
const EDITOR_ROOT_SELECTOR = [
  "body.editor-styles-wrapper",
  ".editor-styles-wrapper",
  ".block-editor-writing-flow",
  ".block-editor-block-list__layout",
  '[data-type="core/post-title"]'
].join(", ");

export type EditorSurface = Page | Frame;

export type GutenbergEditor = {
  canvas: EditorSurface;
  frame: Frame | null;
  isIframe: boolean;
};

export type EditorBlock = {
  name: string;
  attributes?: Record<string, unknown>;
  innerBlocks?: EditorBlock[];
};

type WordPressEditorState = {
  wp?: {
    data?: {
      select?: (store: string) => {
        getCurrentPostId?: () => number | string;
        getEditedPostAttribute?: (attribute: string) => unknown;
        getEditedPostContent?: () => string;
        isSavingPost?: () => boolean;
        isEditedPostDirty?: () => boolean;
      } | undefined;
      dispatch?: (store: string) => {
        insertBlock?: (block: unknown, index?: number, rootClientId?: string) => void;
        insertBlocks?: (blocks: unknown[], index?: number, rootClientId?: string) => void;
      } | undefined;
    };
    blocks?: {
      createBlock?: (name: string, attributes?: Record<string, unknown>, innerBlocks?: unknown[]) => unknown;
    };
    plugins?: {
      getPlugin?: (name: string) => unknown;
    };
  };
};

async function waitForEditorStore(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window as unknown as WordPressEditorState;
      const editor = state.wp?.data?.select?.("core/editor");
      return Boolean(editor && typeof editor.getEditedPostAttribute === "function");
    },
    undefined,
    { timeout: EDITOR_READY_TIMEOUT }
  );
}

async function findEditorFrame(page: Page): Promise<Frame | null> {
  for (const selector of EDITOR_CANVAS_SELECTORS) {
    const candidates = page.locator(selector);
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
      // Locator.contentFrame() returns a FrameLocator. Resolve the iframe's
      // element handle first so callers can use the same Frame surface as the
      // page.frames() fallback below.
      const frameElement = await candidates.nth(index).elementHandle();
      const frame = await frameElement?.contentFrame();
      if (frame) return frame;
    }
  }

  // Keep a semantic fallback for a Gutenberg build that changes the iframe
  // class/name. The editor frame has either the editor-styles root or the
  // title control; unrelated admin frames do not.
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await frame.locator(EDITOR_ROOT_SELECTOR).count().catch(() => 0)) return frame;
    if (await frame.getByRole("textbox", { name: /add title/i }).count().catch(() => 0)) return frame;
  }

  return null;
}

/**
 * Return the live Gutenberg editor frame when the host uses the modern
 * always-iframed editor. WordPress 6.6 can still render the legacy canvas in
 * the admin document, so callers use the same surface API for both shapes.
 */
export async function discoverEditorFrame(page: Page): Promise<Frame | null> {
  await waitForEditorStore(page);
  await expect.poll(
    async () => {
      if (await findEditorFrame(page)) return "iframe";

      const legacyTitle = page.locator(
        '[aria-label="Add title"], [placeholder="Add title"], [data-type="core/post-title"]'
      ).first();
      return await legacyTitle.isVisible().catch(() => false) ? "legacy" : false;
    },
    { timeout: EDITOR_READY_TIMEOUT, intervals: [100, 250, 500] }
  ).toBeTruthy();
  return findEditorFrame(page);
}

export async function getEditorCanvas(page: Page): Promise<EditorSurface> {
  const frame = await discoverEditorFrame(page);
  return frame ?? page;
}

/**
 * Wait for the host editor, its state store, and the Byline plugin registration
 * before a test interacts with either the canvas or the Story sidebar.
 */
export async function waitForEditorReady(page: Page): Promise<GutenbergEditor> {
  await expect(page.locator("body")).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });
  await dismissEditorWelcome(page);
  const frame = await discoverEditorFrame(page);
  // The welcome modal can mount after the editor store/iframe. Check again at
  // the point where the title is about to be interacted with so it cannot
  // intercept a valid semantic locator on either WordPress version.
  await dismissEditorWelcome(page);
  const canvas = frame ?? page;

  await expect(await editorTitleLocator(canvas)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });

  return { canvas, frame, isIframe: frame !== null };
}

export async function waitForBylineEditorReady(page: Page): Promise<GutenbergEditor> {
  const editor = await waitForEditorReady(page);

  await page.waitForFunction(
    (pluginName) => {
      const state = window as unknown as WordPressEditorState;
      return typeof state.wp?.plugins?.getPlugin === "function"
        && Boolean(state.wp.plugins.getPlugin(pluginName));
    },
    EDITOR_PLUGIN_NAME,
    { timeout: EDITOR_READY_TIMEOUT }
  );

  return editor;
}

export async function dismissEditorWelcome(page: Page): Promise<void> {
  const dialogs = page.getByRole("dialog");
  for (let index = 0; index < await dialogs.count(); index += 1) {
    const dialog = dialogs.nth(index);
    if (!(await dialog.isVisible().catch(() => false))) continue;
    const welcome = dialog.filter({ hasText: /welcome(?: to)? the (?:block )?editor|get started/i });
    if (!(await welcome.isVisible().catch(() => false))) continue;

    // The modern guide can briefly leave its button covered while the editor
    // iframe is attaching. Escape is the guide's own keyboard dismissal and
    // avoids waiting for a stale overlay hit target. Fall back to the named
    // control when an older build does not wire Escape.
    await welcome.press("Escape").catch(() => undefined);
    if (await welcome.isVisible().catch(() => false)) {
      const dismiss = welcome.getByRole("button", { name: /^(?:get started|close|dismiss)$/i }).first();
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click({ timeout: 5_000 }).catch(() => undefined);
      }
    }
    await expect(welcome).not.toBeVisible({ timeout: 5_000 }).catch(() => undefined);
    return;
  }

  // Some older editor builds render the welcome control without a dialog
  // wrapper. Check it without waiting for an optional element.
  const getStarted = page.getByRole("button", { name: /get started/i }).first();
  if (await getStarted.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => undefined);
    if (await getStarted.isVisible().catch(() => false)) await getStarted.click({ timeout: 5_000 }).catch(() => undefined);
  }
}

async function editorTitleLocator(canvas: EditorSurface): Promise<Locator> {
  const candidates = [
    canvas.getByRole("textbox", { name: /add title/i }).first(),
    canvas.locator('[aria-label="Add title"]').first(),
    canvas.locator('[placeholder="Add title"]').first(),
    canvas.locator('[data-type="core/post-title"] [contenteditable="true"]').first(),
    canvas.locator("h1.editor-post-title__input").first()
  ];
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return candidates[0];
}

export async function getEditorTitle(page: Page): Promise<Locator> {
  const editor = await waitForEditorReady(page);
  return editorTitleLocator(editor.canvas);
}

export async function fillEditorTitle(page: Page, title: string): Promise<void> {
  const editor = await waitForEditorReady(page);
  const titleField = await editorTitleLocator(editor.canvas);
  await expect(titleField).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });
  await titleField.fill(title);
  await expect.poll(
    () => titleField.evaluate((element, expected) => {
      const value = "value" in element ? String((element as HTMLInputElement).value) : element.textContent ?? "";
      return value === expected;
    }, title),
    { timeout: EDITOR_READY_TIMEOUT }
  ).toBe(true);
}

async function waitForWordPressBlocks(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window as unknown as WordPressEditorState;
      return typeof state.wp?.blocks?.createBlock === "function"
        && typeof state.wp?.data?.dispatch === "function"
        && typeof state.wp?.data?.select === "function";
    },
    undefined,
    { timeout: EDITOR_READY_TIMEOUT }
  );
}

async function countEditorBlocks(page: Page, name: string): Promise<number> {
  return page.evaluate<number, string>((blockName) => {
    const state = window as unknown as WordPressEditorState;
    const blocks = state.wp?.data?.select?.("core/block-editor") as unknown as { getBlocks?: () => unknown[] } | undefined;
    const countNestedBlocks = (items: unknown[]): number => items.reduce<number>((count: number, item: unknown): number => {
      if (!item || typeof item !== "object") return count;
      const record = item as { name?: unknown; innerBlocks?: unknown };
      const children = Array.isArray(record.innerBlocks) ? countNestedBlocks(record.innerBlocks) : 0;
      return count + (record.name === blockName ? 1 : 0) + children;
    }, 0);
    return countNestedBlocks(blocks?.getBlocks?.() ?? []);
  }, name);
}

/** Insert a block through the editor store so the helper works in either canvas. */
export async function insertEditorBlock(page: Page, block: EditorBlock): Promise<void> {
  await waitForBylineEditorReady(page);
  await waitForWordPressBlocks(page);
  const previousCount = await countEditorBlocks(page, block.name);

  await page.evaluate((representation) => {
    const state = window as unknown as WordPressEditorState;
    const createBlock = state.wp?.blocks?.createBlock;
    const dispatch = state.wp?.data?.dispatch?.("core/block-editor");
    if (!createBlock || !dispatch) throw new Error("The WordPress block editor store is unavailable.");

    const build = (value: EditorBlock): unknown => createBlock(
      value.name,
      value.attributes,
      (value.innerBlocks ?? []).map(build)
    );
    const created = build(representation);

    if (typeof dispatch.insertBlocks === "function") {
      dispatch.insertBlocks([created]);
    } else if (typeof dispatch.insertBlock === "function") {
      dispatch.insertBlock(created);
    } else {
      throw new Error("The WordPress block editor cannot insert blocks.");
    }
  }, block);

  await expect.poll(
    () => countEditorBlocks(page, block.name),
    { timeout: EDITOR_READY_TIMEOUT }
  ).toBeGreaterThan(previousCount);
}

function blockSlug(name: string): string {
  return name.split("/").pop()?.replace(/-/g, " ") || name;
}

async function editorBlockLocator(page: Page, name: string, index: number): Promise<Locator> {
  const editor = await waitForBylineEditorReady(page);
  const label = new RegExp(`${blockSlug(name)}(?: block)?`, "i");
  const byRole = editor.canvas.getByRole("document", { name: label }).nth(index);
  if (await byRole.count() > 0) return byRole;

  const escapedName = name.replace(/"/g, '\\"');
  return editor.canvas.locator(`[data-type="${escapedName}"]`).nth(index);
}

/** Edit block text through its contenteditable surface, with a state check. */
export async function editEditorBlockText(page: Page, name: string, text: string, index = 0): Promise<void> {
  const block = await editorBlockLocator(page, name, index);
  await expect(block).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });

  const editable = block.locator('[contenteditable="true"]').first();
  if (await editable.count() > 0) {
    await editable.fill(text);
  } else {
    const textbox = block.getByRole("textbox").first();
    if (await textbox.count() > 0) {
      await textbox.fill(text);
    } else {
      await block.fill(text);
    }
  }

  await expect.poll(
    () => readEditedPostContent(page),
    { timeout: EDITOR_READY_TIMEOUT }
  ).toContain(text);
}

export async function readEditedPostContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = window as unknown as WordPressEditorState;
    return state.wp?.data?.select?.("core/editor")?.getEditedPostContent?.() ?? "";
  });
}

export async function currentPostId(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = window as unknown as WordPressEditorState;
    const fromStore = state.wp?.data?.select?.("core/editor")?.getCurrentPostId?.();
    const fromUrl = new URL(window.location.href).searchParams.get("post");
    const value = Number(fromStore || fromUrl || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  });
}

export async function saveEditorDraft(page: Page): Promise<number> {
  await waitForBylineEditorReady(page);
  const topBar = page.getByRole("region", { name: /editor top bar/i });
  const topBarSave = topBar.getByRole("button", { name: /save draft/i }).first();
  const saveButton = await topBarSave.isVisible().catch(() => false)
    ? topBarSave
    : page.getByRole("button", { name: /save draft/i }).first();
  await expect(saveButton).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(
    () => currentPostId(page),
    { timeout: 30_000 }
  ).toBeGreaterThan(0);

  await expect.poll(
    () => page.evaluate(() => {
      const state = window as unknown as WordPressEditorState;
      const isSavingPost = state.wp?.data?.select?.("core/editor")?.isSavingPost;
      return typeof isSavingPost !== "function" || isSavingPost() === false;
    }),
    { timeout: 30_000 }
  ).toBe(true);

  return currentPostId(page);
}

export async function waitForCurrentPostId(page: Page): Promise<number> {
  await expect.poll(() => currentPostId(page), { timeout: EDITOR_READY_TIMEOUT }).toBeGreaterThan(0);
  return currentPostId(page);
}

/** Open the one native Story sidebar registration through Gutenberg's More menu. */
export async function openStorySidebar(page: Page): Promise<Locator> {
  await waitForBylineEditorReady(page);
  // WordPress 6.6 and the modern editor expose the PluginSidebar region with
  // slightly different accessible names ("Story" vs. "Story sidebar"). The
  // plugin-owned semantic name is stable; do not couple the helper to one
  // Gutenberg wording variant.
  const existing = page.getByRole("region", { name: /story/i }).first();
  const ownedSurface = page.locator(".byline-editorial-sidebar").first();
  if (await existing.isVisible().catch(() => false)) return existing;
  if (await ownedSurface.isVisible().catch(() => false)) return ownedSurface;

  const topBar = page.getByRole("region", { name: /editor top bar/i });
  const optionCandidates = [
    topBar.getByRole("button", { name: /^options$/i }).first(),
    topBar.getByRole("button", { name: /view options/i }).first(),
    topBar.getByRole("button", { name: /more tools.*options|more options/i }).first(),
    topBar.getByRole("button", { name: /^more$/i }).first(),
    page.getByRole("button", { name: /^options$/i }).first(),
    page.getByRole("button", { name: /view options/i }).first(),
    page.getByRole("button", { name: /more tools.*options|more options/i }).first(),
    page.getByRole("button", { name: /^more$/i }).first()
  ];
  let optionsButton = optionCandidates[0];
  for (const candidate of optionCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      optionsButton = candidate;
      break;
    }
  }
  await expect(optionsButton).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });
  await optionsButton.click();

  const checkboxes = page.getByRole("menuitemcheckbox", { name: /^Story$/i });
  const menuItems = page.getByRole("menuitem", { name: /^Story$/i });
  const storyItems = (await checkboxes.count()) > 0 ? checkboxes : menuItems;
  await expect(storyItems).toHaveCount(1);
  await storyItems.first().click();

  await expect.poll(
    async () => (await existing.isVisible().catch(() => false)) || (await ownedSurface.isVisible().catch(() => false)),
    { timeout: EDITOR_READY_TIMEOUT, intervals: [100, 250, 500] }
  ).toBe(true);
  return (await existing.isVisible().catch(() => false)) ? existing : ownedSurface;
}

export type StoryPanel = "workflow" | "tasks" | "visuals" | "contributors";

const storyPanelLabels: Record<StoryPanel, RegExp> = {
  workflow: /^Workflow$/i,
  tasks: /^Tasks(?:\s+·\s+\d+\s+open)?$/i,
  visuals: /^Visuals$/i,
  contributors: /^Contributors(?:\s+·\s+\d+)?$/i
};

/** Open one of the controlled Story PanelBody sections by its accessible name. */
export async function openStoryPanel(page: Page, panel: StoryPanel): Promise<Locator> {
  const sidebar = await openStorySidebar(page);
  const panelButton = sidebar.getByRole("button", { name: storyPanelLabels[panel] }).first();
  await expect(panelButton).toBeVisible({ timeout: EDITOR_READY_TIMEOUT });
  if ((await panelButton.getAttribute("aria-expanded")) !== "true") await panelButton.click();
  await expect(panelButton).toHaveAttribute("aria-expanded", "true");
  return sidebar;
}

export async function closeStorySidebar(page: Page): Promise<void> {
  const sidebar = page.getByRole("region", { name: /story/i }).first();
  const ownedSurface = page.locator(".byline-editorial-sidebar").first();
  const surface = await sidebar.isVisible().catch(() => false) ? sidebar : ownedSurface;
  if (!(await surface.isVisible().catch(() => false))) return;

  const closeButton = surface.getByRole("button", { name: /close story|close/i }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
}
