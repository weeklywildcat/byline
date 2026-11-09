import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";

/** Local accounts from apps/newsroom/.env (never printed). */
function env(): Record<string, string> {
  const file = new URL("../../.env", import.meta.url);
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1] as string] = match[2] as string;
  }
  return { ...values, ...(process.env as Record<string, string>) };
}

export type Account = "EDITOR" | "STAFF" | "ADMIN";

export async function login(request: APIRequestContext, baseURL: string, who: Account): Promise<string> {
  const values = env();
  const response = await request.post("/api/users/login", { headers: { Origin: baseURL }, data: { email: values[`BYLINE_DEV_${who}_EMAIL`], password: values[`BYLINE_DEV_${who}_PASSWORD`] } });
  expect(response.ok(), `sign in as ${who}`).toBeTruthy();
  return (await response.json()).token as string;
}

export async function signIn(context: BrowserContext, baseURL: string, token: string): Promise<void> {
  const url = new URL(baseURL);
  await context.addCookies([{ name: "payload-token", value: token, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

const auth = (baseURL: string, token: string) => ({ Authorization: `JWT ${token}`, Origin: baseURL });

export const FIXTURE_DIR = new URL("../../../../tests/fixtures/story-media/", import.meta.url);

/** A real multi-page PDF with a correct xref table (Payload validates uploaded PDFs). */
export function fixturePdf(pages = 10): Buffer {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`];
  const font = 3 + pages * 2;
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 24 Tf 72 720 Td (Greenwood Nutrition Services budget request - page ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

const MEDIA = [
  { file: "newsroom-panorama.jpg", data: { alt: "Students wait in a long line outside the Greenwood High cafeteria.", creator: "Maya Torres", credit: "Maya Torres / The Weekly Wildcat" } },
  { file: "newsroom-laughing.jpg", data: { alt: "A junior laughs with friends while eating lunch on the courtyard steps.", creator: "Maya Torres" } },
  { file: "newsroom-tablet.jpg", data: { alt: "A cafeteria worker checks orders on a tablet at the new express station.", credit: "Photo by Jordan Lee" } },
  { file: "newsroom-meeting.jpg", data: { alt: "Members of the student council review survey results.", creator: "Jordan Lee" } }
] as const;
export const PDF_NAME = "e2e-nutrition-services-budget-2026.pdf";

/** The Media the acceptance story uses, uploaded once per database. Returns IDs by filename. */
export async function ensureMedia(request: APIRequestContext, baseURL: string, token: string): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  const all = [...MEDIA.map((entry) => entry.file), PDF_NAME];
  for (const name of all) {
    const found = await request.get(`/api/media?where[filename][equals]=${encodeURIComponent(name)}&limit=1&depth=0`, { headers: auth(baseURL, token) });
    const doc = (await found.json()).docs?.[0];
    if (doc) {
      ids[name] = doc.id;
      continue;
    }
    const entry = MEDIA.find((item) => item.file === name);
    const buffer = entry ? readFileSync(new URL(name, FIXTURE_DIR)) : fixturePdf();
    const created = await request.post("/api/media", {
      headers: auth(baseURL, token),
      multipart: { file: { name, mimeType: entry ? "image/jpeg" : "application/pdf", buffer }, _payload: JSON.stringify(entry?.data ?? { credit: "Greenwood School District" }) }
    });
    expect(created.ok(), `upload ${name}: ${await created.text()}`).toBeTruthy();
    ids[name] = (await created.json()).doc.id;
  }
  return ids;
}

export async function createStory(request: APIRequestContext, baseURL: string, token: string, data: Record<string, unknown>): Promise<number> {
  const response = await request.post("/api/stories?draft=true", { headers: auth(baseURL, token), data: { _status: "draft", ...data } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).doc.id as number;
}

export async function readDraft(request: APIRequestContext, baseURL: string, token: string, id: number): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/stories/${id}?draft=true&depth=0`, { headers: auth(baseURL, token) });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function readMediaDocs(request: APIRequestContext, baseURL: string, token: string, ids: number[]): Promise<Array<Record<string, unknown>>> {
  if (!ids.length) return [];
  const response = await request.get(`/api/media?where[id][in]=${ids.join(",")}&depth=0&limit=100`, { headers: auth(baseURL, token) });
  return (await response.json()).docs;
}

const text = (value: string, format = 0) => ({ type: "text", text: value, format, detail: 0, mode: "normal", style: "", version: 1 });
export const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)], direction: "ltr", format: "", indent: 0, textFormat: 0, textStyle: "", version: 1 });
export const lexical = (children: unknown[]) => ({ root: { type: "root", format: "", indent: 0, version: 1, direction: "ltr", children } });

/** The Story screen's own save state: wait until Payload's autosave has written everything. */
export async function waitForSaved(page: Page): Promise<void> {
  const status = page.locator("header [role=status], [role=status]").filter({ hasText: /Saved|Saving|Unsaved/ }).first();
  await expect(status).toHaveText(/Saved/, { timeout: 30_000 });
}

/** The editor's Lexical root (the article body). */
export const body = (page: Page) => page.locator("[data-lexical-editor].article-body");

/** A block's frame by type (the nth one of that type). */
export const block = (page: Page, type: string, nth = 0) => body(page).locator(`:scope > .byline-block-${type}`).nth(nth);

/** Puts the caret at the end of the paragraph containing `text`. */
export async function caretAfter(page: Page, text: string): Promise<void> {
  const target = body(page).locator(":scope > :is(p, ul, ol)", { hasText: text }).first();
  await target.scrollIntoViewIfNeeded();
  // Click just inside the end of the text itself (its last character's box), not the paragraph's edge.
  const point = await target.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.textContent ?? "").trim()) last = node as Text;
    if (!last) return null;
    const range = document.createRange();
    range.setStart(last, Math.max(0, last.length - 1));
    range.setEnd(last, last.length);
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1];
    return rect ? { x: rect.right - 1, y: rect.top + rect.height / 2 } : null;
  });
  if (!point) throw new Error(`no text "${text}"`);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("End");
  // Wait for Lexical's own selection (not just the DOM's), as a person pausing between click and typing would.
  await expect.poll(() => target.evaluate((element) => {
    const editor = (element.closest("[data-lexical-editor]") as unknown as { __lexicalEditor?: { getEditorState: () => { _selection?: { anchor?: { key: string } } }; getElementByKey: (key: string) => HTMLElement | null } }).__lexicalEditor;
    const key = editor?.getEditorState()._selection?.anchor?.key;
    const anchor = key ? editor?.getElementByKey(key) : null;
    return Boolean(anchor && element.contains(anchor));
  }), { message: `Lexical selection in "${text}"` }).toBe(true);
  // A writer's hand leaves the mouse: a pointer resting on the line would hover (and highlight)
  // whichever slash-menu item opens under it, depending on where Payload places the menu.
  const viewport = page.viewportSize();
  await page.mouse.move((viewport?.width ?? 1366) - 4, (viewport?.height ?? 900) - 4);
}

/** Types a slash command and runs the menu item it finds (waiting for Payload's menu, as a writer would). */
export async function slash(page: Page, query: string, item: string | RegExp): Promise<void> {
  await page.keyboard.type(`/${query}`);
  const option = page.locator(".slash-menu-popup__item").filter({ hasText: item }).first();
  await expect(option).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".slash-menu-popup")).toHaveCount(0);
}

/** Chooses files in Byline's Media picker by filename, then confirms. */
export async function pickInMedia(page: Page, names: string[], confirm: RegExp): Promise<void> {
  const dialog = page.locator("[data-media-picker]");
  await expect(dialog).toBeVisible();
  for (const name of names) {
    const search = dialog.getByPlaceholder(/Search filename/);
    await search.fill(name.replace(/\.[a-z]+$/, ""));
    await dialog.getByText(name, { exact: true }).first().click();
  }
  await dialog.getByRole("button", { name: confirm }).click();
  await expect(dialog).toBeHidden();
}

/** Adds a block with the explicit Add menu (Command), typing a search. */
export async function addWithMenu(page: Page, search: string, item: RegExp): Promise<void> {
  await page.getByRole("button", { name: "Add photo, quote, facts…" }).click();
  const input = page.getByRole("combobox", { name: "Find a story tool" });
  await input.fill(search);
  await page.locator("[data-slot=command-item]").filter({ hasText: item }).first().click();
}

/**
 * The selected block's toolbar sits in the room the block reserves above itself, never over
 * the element before it (whatever the toolbar's wrapped height at this width).
 */
export async function expectToolbarClear(frame: Locator): Promise<void> {
  await expect.poll(() => frame.evaluate((element) => {
    const chrome = element.querySelector(":scope .byline-block-chrome");
    const previous = element.previousElementSibling;
    if (!chrome || !previous || getComputedStyle(chrome).opacity === "0") return null;
    return Math.floor(chrome.getBoundingClientRect().top - previous.getBoundingClientRect().bottom);
  }), { message: "toolbar clear of the element above" }).toBeGreaterThanOrEqual(0);
}

/** Horizontal page overflow, the thing a narrow screen must never have. */
export async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
