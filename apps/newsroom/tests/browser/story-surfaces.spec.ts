import { expect, test, type Page } from "@playwright/test";
import { createStory, login, signIn, type Account } from "./helpers";

/**
 * The lighter Story surfaces around the Story screen (docs/story-screen.md):
 * the Board's lifecycle columns and its non-drag Move menu, Peek, and the
 * minimal New story dialog. Staff never move a Story to Review or Ready.
 */

const stamp = Date.now();
let token = "";
let headers: Record<string, string> = {};

test.beforeAll(async ({ request, baseURL }) => {
  token = await login(request, baseURL!, "EDITOR");
  headers = { Authorization: `JWT ${token}`, Origin: baseURL! };
});

async function as(page: Page, who: Account, baseURL: string, request: Parameters<typeof login>[0]) {
  const own = who === "EDITOR" ? token : await login(request, baseURL, who);
  await page.context().clearCookies();
  await signIn(page.context(), baseURL, own);
  await page.goto("/admin/stories");
  await expect(page.getByRole("heading", { name: "Stories", level: 1 })).toBeVisible();
}

const column = (page: Page, name: string) => page.getByRole("list", { name: new RegExp(`^${name} \\d+ stor`) });
const moveTargets = async (page: Page, headline: string) => {
  await page.getByRole("button", { name: `Actions for ${headline}` }).click();
  await page.getByRole("menuitem", { name: "Move to" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitemradio").first()).toBeVisible();
  return (await page.getByRole("menuitemradio").allInnerTexts()).map((text) => text.trim());
};

test("the Board has a column for each lifecycle stage, and every card has one clear signal", async ({ page, baseURL, request }) => {
  await as(page, "EDITOR", baseURL!, request);
  for (const stage of ["Pitch", "Reporting", "Drafting", "Review", "Ready"]) await expect(column(page, stage).or(page.getByRole("button", { name: new RegExp(`^${stage}`) })).first()).toBeVisible();
  // Cards are list items with a name, a Move menu and at most two needs; the stage is also written, never colour alone.
  const card = column(page, "Drafting").getByRole("listitem").first();
  await expect(card.getByRole("button", { name: /^Actions for / })).toBeVisible();
  expect(await card.getByRole("list", { name: "Needs" }).getByRole("listitem").count()).toBeLessThanOrEqual(2);
});

test("a Story moves between stages from the keyboard-reachable menu, no dragging, and only staff-allowed stages are offered to staff", async ({ page, baseURL, request }) => {
  const headline = `Board move ${stamp}`;
  const { docs } = await (await request.get("/api/sections?depth=0&limit=1", { headers })).json();
  const id = await createStory(request, baseURL!, token, { headline, section: docs[0]?.id });
  await as(page, "EDITOR", baseURL!, request);
  await page.getByPlaceholder("Search stories…").fill(headline);
  await expect(column(page, "Pitch").getByRole("button", { name: headline, exact: true })).toBeVisible();
  // The editor reaches the menu with the keyboard alone.
  await page.getByRole("button", { name: `Actions for ${headline}` }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Move to" }).focus();
  await page.keyboard.press("ArrowRight");
  const targets = (await page.getByRole("menuitemradio").allInnerTexts()).map((text) => text.trim());
  // The stage it is in is marked, and an editor may choose any other, including the exceptional ones.
  expect(targets).toEqual(["Pitch", "Reporting", "Drafting", "Review", "Ready", "On Hold", "Dropped"]);
  await expect(page.getByRole("menuitemradio", { name: "Pitch" })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("menuitemradio", { name: "Reporting", exact: true }).click();
  await expect(column(page, "Reporting").getByRole("button", { name: headline, exact: true })).toBeVisible();
  const stage = (await (await request.get(`/api/stories/${id}?draft=true&depth=1`, { headers })).json());
  expect(stage.id).toBe(id);

  // Staff: the same menu, never Review or Ready.
  await as(page, "STAFF", baseURL!, request);
  await page.getByPlaceholder("Search stories…").fill("Sidewalk");
  const staffTargets = await moveTargets(page, "Sidewalk project");
  expect(staffTargets.join("|")).not.toMatch(/Review|Ready/);
  expect(staffTargets.length).toBeGreaterThan(0);
});

test("Peek is light: who, when, what's next and the way into the Story, with no mini workspace", async ({ page, baseURL, request }) => {
  await as(page, "EDITOR", baseURL!, request);
  await page.getByRole("button", { name: "Patriot Games" }).first().click();
  const peek = page.getByRole("dialog", { name: "Patriot Games" });
  await expect(peek).toBeVisible();
  await expect(peek.getByRole("combobox", { name: /^Writers/ })).toBeVisible();
  await expect(peek.getByRole("combobox", { name: /^Editor/ })).toBeVisible();
  await expect(peek.getByRole("button", { name: "Change deadline" })).toBeVisible();
  await expect(peek.getByRole("region", { name: "Next" })).toBeVisible();
  await expect(peek.getByRole("link", { name: "Open story" })).toHaveAttribute("href", /\/admin\/collections\/stories\/\d+$/);
  for (const gone of ["Tasks", "Production", "Files", "Activity", "Reporting"]) await expect(peek.getByRole("heading", { name: gone })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
  // Focus goes back to the card that opened it.
  await expect(page.getByRole("button", { name: "Patriot Games" }).first()).toBeFocused();
});

test("New story is a title and Create pitch; details are optional, and staff don't get editor-only fields", async ({ page, baseURL, request }) => {
  await as(page, "EDITOR", baseURL!, request);
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("menuitem", { name: "Story" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New story" });
  await expect(dialog.getByRole("button", { name: "Add details" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Section" })).toHaveCount(0);
  const title = `Pitch from the dialog ${stamp}`;
  await dialog.getByRole("textbox", { name: "What's the story?" }).fill(title);
  await dialog.getByRole("button", { name: "Add details" }).click();
  for (const field of ["Section", "Template"]) await expect(dialog.getByRole("combobox", { name: field })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /^Writers/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Change deadline" })).toBeVisible();
  await dialog.getByRole("button", { name: "Hide details" }).click();
  await dialog.getByRole("button", { name: "Create pitch" }).click();
  await expect(page).toHaveURL(/\/admin\/collections\/stories\/\d+/);
  // A new pitch has no words yet, so it opens Plan, where its assignment is.
  await expect(page.locator("[data-story-view]")).toHaveAttribute("data-story-view", "plan");
  await expect(page.getByText("Pitch", { exact: true }).first()).toBeVisible();

  await as(page, "STAFF", baseURL!, request);
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("menuitem", { name: "Story" }).first().click();
  const staff = page.getByRole("dialog", { name: "New story" });
  await staff.getByRole("button", { name: "Add details" }).click();
  await expect(staff.getByRole("combobox", { name: "Section" })).toBeVisible();
  await expect(staff.getByRole("combobox", { name: /^Writers/ })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: "Change deadline" })).toHaveCount(0);
});

for (const width of [1440, 1024, 820, 390]) {
  test.describe(`Story surfaces at ${width}px`, () => {
    const touch = width <= 820;
    test.use({ viewport: { width, height: 900 }, hasTouch: touch });

    test("the Board, Peek and New story fit", async ({ page, baseURL, request }) => {
      await as(page, "EDITOR", baseURL!, request);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Patriot Games" }).first().click();
      await expect(page.getByRole("dialog", { name: "Patriot Games" })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Patriot Games" })).toBeHidden();
      await page.getByRole("button", { name: "Create" }).first().click();
      if (width === 390) {
        await page.getByRole("dialog", { name: "Create", exact: true }).getByRole("button", { name: "New story" }).click();
      } else {
        await page.getByRole("menuitem", { name: "Story" }).first().click();
      }
      const create = page.getByRole("dialog", { name: "New story" });
      await expect(create).toHaveAttribute("data-slot", touch ? "drawer-content" : "dialog-content");
      await create.getByRole("button", { name: "Add details" }).click();
      await expect(create.getByRole("button", { name: "Create pitch" })).toBeInViewport();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  });
}
