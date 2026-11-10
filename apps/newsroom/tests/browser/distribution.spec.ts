import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createStory, ensureMedia, login, pageOverflow, pickInMedia, signIn } from "./helpers";

const featured = "newsroom-panorama.jpg";
const alternate = "newsroom-meeting.jpg";
const permalink = "https://www.instagram.com/p/Greenhouse2026/";
const auth = (baseURL: string, token: string) => ({ Authorization: `JWT ${token}`, Origin: baseURL });
const sheet = (page: Page, destination: string) => page.getByRole("dialog", { name: new RegExp(destination) });
const storyRows = (page: Page) => page.getByRole("region", { name: "Distribution", exact: true });

let editor = "";
let staff = "";
let section = 0;
let sectionName = "";
let media: Record<string, number>;

test.beforeAll(async ({ request, baseURL }) => {
  editor = await login(request, baseURL!, "EDITOR");
  staff = await login(request, baseURL!, "STAFF");
  const admin = await login(request, baseURL!, "ADMIN");
  sectionName = `Campus life ${Date.now()}`;
  const created = await request.post("/api/sections", {
    headers: auth(baseURL!, admin), data: { name: sectionName }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  section = (await created.json()).doc.id;
  media = await ensureMedia(request, baseURL!, editor);
  for (const name of [featured, alternate]) {
    const result = await request.patch(`/api/byline/media/${media[name]}`, {
      headers: auth(baseURL!, editor), data: { copyright: "Weekly Wildcat", credit: "Weekly Wildcat staff", alt: name === featured ? "Students waiting for lunch" : "Students at a council meeting" }
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    await expect.poll(async () => {
      const detail = await request.get(`/api/byline/media/${media[name]}`, { headers: auth(baseURL!, editor) });
      return (await detail.json()).publication?.state;
    }, { timeout: 90_000 }).toBe("ready");
  }
});

async function updateStory(request: APIRequestContext, baseURL: string, id: number, data: Record<string, unknown>) {
  const result = await request.patch(`/api/stories/${id}`, { headers: auth(baseURL, editor), data });
  expect(result.ok(), await result.text()).toBeTruthy();
}

async function story(request: APIRequestContext, baseURL: string, headline: string, token = editor) {
  const id = await createStory(request, baseURL, token, { headline, section, deck: "Student volunteers welcome visitors Friday.", featuredMedia: media[featured] });
  await updateStory(request, baseURL, id, { _status: "published" });
  return id;
}

async function openStory(page: Page, id: number) {
  await page.goto(`/admin/collections/stories/${id}?tab=history`);
  await expect(storyRows(page)).toBeVisible({ timeout: 60_000 });
}

async function openDestination(page: Page, destination: string) {
  await storyRows(page).getByRole("button", { name: new RegExp(` ${destination}$`) }).click();
  const dialog = sheet(page, destination);
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Story copy survives immediate close and switching modes, then freezes when the final link is saved", async ({ page, context, request, baseURL }) => {
  await signIn(context, baseURL!, editor);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const headline = "Greenhouse tours return for the fall";
  const id = await story(request, baseURL!, headline);
  await openStory(page, id);
  await expect(storyRows(page)).toContainText("Also suggested: School TVs.");
  await expect(storyRows(page)).toContainText("Newsletter");

  const dialog = await openDestination(page, "Instagram");
  await expect(dialog).toContainText(headline);
  await expect(dialog.getByRole("img", { name: "Students waiting for lunch" })).toBeVisible();
  const modes = dialog.getByRole("group", { name: "Caption source" });
  await modes.getByRole("button", { name: "Custom" }).click();
  const caption = dialog.getByRole("textbox", { name: "Caption" });
  await caption.fill("Join us Friday for tours of the restored greenhouse.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openDestination(page, "Instagram");
  await expect(caption).toHaveValue("Join us Friday for tours of the restored greenhouse.");
  await caption.fill("Tours are free. Bring a friend!");
  await modes.getByRole("button", { name: "Story" }).click();
  await expect(dialog).toContainText("Follows the Story until you choose Custom.");
  await modes.getByRole("button", { name: "Custom" }).click();
  await expect(caption).toHaveValue("Tours are free. Bring a friend!");
  await dialog.getByRole("group", { name: "Image source" }).getByRole("button", { name: "Custom" }).click();
  await pickInMedia(page, [alternate], /Use this image/);
  await expect(dialog.getByRole("img", { name: "Students at a council meeting" })).toBeVisible();

  await dialog.getByRole("button", { name: /Mark ready/ }).click();
  await expect(dialog.getByText(/Approved by/)).toBeVisible();
  const input = dialog.getByRole("textbox", { name: "After it's posted" });
  const save = dialog.getByRole("button", { name: "Save link" });
  for (const invalid of ["https://www.facebook.com/paper/posts/123456", "https://www.instagram.com/paper/", "not a URL"]) {
    await input.fill(invalid);
    await save.click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("alert")).toBeVisible();
  }
  await input.fill(permalink);
  await save.click();
  await expect(dialog.getByRole("link", { name: "Open Instagram post" }).first()).toHaveAttribute("href", permalink);
  await expect(dialog.getByRole("region", { name: "What went out" })).toContainText("Tours are free. Bring a friend!");
  await expect(dialog.getByRole("button", { name: "Mark posted" })).toHaveCount(0);

  await updateStory(request, baseURL!, id, { headline: "Greenhouse adds a second tour", deck: "Tickets open on Monday.", _status: "published" });
  await openStory(page, id);
  const fb = await openDestination(page, "Facebook");
  await expect(fb).toContainText("Greenhouse adds a second tour");
  await expect(fb).toContainText("Tickets open on Monday.");
  await page.keyboard.press("Escape");
  await openDestination(page, "Instagram");
  await expect(dialog.getByRole("region", { name: "What went out" })).toContainText("Tours are free. Bring a friend!");

  await updateStory(request, baseURL!, id, { _status: "draft" });
  await openStory(page, id);
  await expect(storyRows(page)).toContainText("This Story is unpublished.");
  await expect(storyRows(page).getByRole("button", { name: "View Instagram" })).toBeVisible();
  await openDestination(page, "Facebook");
  await expect(fb.getByRole("textbox", { name: "After it's posted" })).toBeDisabled();
});

test("phone keeps a failed save recoverable and the permalink controls in view", async ({ page, context, request, baseURL }) => {
  await signIn(context, baseURL!, editor);
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await story(request, baseURL!, "Greenhouse phone desk");
  await openStory(page, id);
  const dialog = await openDestination(page, "Instagram");
  await dialog.getByRole("group", { name: "Caption source" }).getByRole("button", { name: "Custom" }).click();
  const caption = dialog.getByRole("textbox", { name: "Caption" });
  await expect(caption).toBeVisible();
  let fail = true;
  await page.route(/\/api\/byline\/distribution\/\d+$/, async (route) => {
    if (fail && route.request().method() === "PATCH") await route.abort("internetdisconnected");
    else await route.continue();
  });
  await caption.fill("Keep these final words when the connection drops.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/could not save.*copy/i)).toBeVisible();
  await expect(caption).toHaveValue("Keep these final words when the connection drops.");
  fail = false;
  await dialog.getByRole("button", { name: "Retry save" }).click();
  await expect(dialog.getByRole("button", { name: "Retry save" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openDestination(page, "Instagram");
  await expect(caption).toHaveValue("Keep these final words when the connection drops.");

  const link = dialog.getByRole("textbox", { name: "After it's posted" });
  await link.focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await link.scrollIntoViewIfNeeded();
  const inputBox = (await link.boundingBox())!;
  const buttonBox = (await dialog.getByRole("button", { name: "Save link" }).boundingBox())!;
  expect(inputBox.x).toBeGreaterThanOrEqual(0);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(390);
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(500);
  expect(await pageOverflow(page)).toBe(0);
});

test("staff can claim their Story work and ask for approval without opening the desk", async ({ page, context, request, baseURL }) => {
  const id = await story(request, baseURL!, "Staff greenhouse distribution", staff);
  await signIn(context, baseURL!, staff);
  await page.goto("/admin/distribution");
  await expect(page.getByRole("heading", { name: "Distribution", exact: true })).toHaveCount(0);
  expect((await request.get("/api/byline/distribution", { headers: auth(baseURL!, staff) })).status()).toBe(403);
  // Distribution is usable while the rest of the Story workspace loads.
  let releaseWorkspace!: () => void;
  const holdWorkspace = new Promise<void>((resolve) => { releaseWorkspace = resolve; });
  const workspacePath = `/api/byline/stories/${id}/workspace`;
  await page.route(`**${workspacePath}`, async (route) => { await holdWorkspace; await route.continue(); });
  await openStory(page, id);
  const dialog = await openDestination(page, "Instagram");
  const workspace = page.waitForResponse((response) => response.url().endsWith(workspacePath));
  releaseWorkspace();
  await workspace;
  await dialog.getByRole("button", { name: "I'll post it" }).click();
  await expect(dialog.getByRole("button", { name: "I'll post it" })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Mark ready/ }).click();
  await expect(dialog.getByText("Waiting for an editor to approve.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "After it's posted" })).toBeDisabled();
});

for (const width of [1440, 820, 390]) {
  test(`desk filters and row actions work at ${width}px`, async ({ page, context, request, baseURL }) => {
    await signIn(context, baseURL!, editor);
    await page.setViewportSize({ width, height: 900 });
    const headline = `Greenhouse operations ${width} ${Date.now()}`;
    await story(request, baseURL!, headline);
    await page.goto("/admin/distribution");
    await expect(page.getByRole("heading", { name: "Distribution", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("tab", { name: /Needs attention/ })).toHaveAttribute("aria-selected", "true");
    const navigation = width >= 1200 ? { name: "Byline", destination: "Distribution" } : { name: "Primary navigation", destination: "More" };
    await expect(page.getByRole("navigation", { name: navigation.name, exact: true }).getByRole("link", { name: navigation.destination, exact: true })).toHaveAttribute("aria-current", "page");
    const search = page.getByRole("searchbox", { name: "Search Stories" });
    await search.fill(headline);
    await expect(page).toHaveURL(/q=Greenhouse\+operations/);
    const choose = async (name: string, option: string) => {
      await page.getByRole("combobox", { name, exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    await choose("Destination", "Facebook");
    await choose("Owner", "Unassigned");
    await choose("Section", sectionName);
    await expect(page).toHaveURL(/destination=facebook.*owner=none.*section=/);
    await choose("When", "Today");
    await expect(page.getByText("Nothing matches.")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: headline, exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByText("Nothing matches.")).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(search).toHaveValue("");
    await expect(page).toHaveURL(/\/admin\/distribution$/);
    await search.fill(headline);
    const next = page.getByRole("button", { name: `Prepare: ${headline}, Facebook` });
    await expect(next).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(3);
    expect(await pageOverflow(page)).toBe(0);
    const viewport = await next.boundingBox();
    expect(viewport!.x + viewport!.width).toBeLessThanOrEqual(width);
    if (process.env.BYLINE_DISTRIBUTION_REVIEW_DIR) await page.screenshot({ path: `${process.env.BYLINE_DISTRIBUTION_REVIEW_DIR}/desk-${width}.png`, animations: "disabled" });
    await next.click();
    const dialog = sheet(page, "Facebook");
    await expect(dialog).toBeVisible();
    if (process.env.BYLINE_DISTRIBUTION_REVIEW_DIR) await page.screenshot({ path: `${process.env.BYLINE_DISTRIBUTION_REVIEW_DIR}/sheet-${width}.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: /Scheduled…/ }).click();
    await expect(dialog.getByText(/Byline records the time/)).toBeVisible();
    await dialog.getByLabel("Scheduled on Facebook for").fill("2026-12-01T20:30");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText(/Scheduled on Facebook for Dec 1/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: /Scheduled/ }).click();
    await expect(page.getByRole("tab", { name: /Scheduled\s*1/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("row", { name: new RegExp(headline) }).getByText("Facebook", { exact: true }).filter({ visible: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    for (const view of ["Drafts", "Ready", "Posted"]) {
      await page.getByRole("tab", { name: new RegExp(view) }).click();
      await expect(page).toHaveURL(new RegExp(`view=${view.toLowerCase()}`));
    }
  });
}
