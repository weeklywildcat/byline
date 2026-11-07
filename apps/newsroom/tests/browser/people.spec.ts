import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
const fixtures = () =>
  JSON.parse(
    readFileSync("/private/tmp/byline-people-browser.json", "utf8"),
  ) as { people: Record<string, number>; portrait: number };
async function login(page: Page, role = "editor") {
  const res = await page.request.post("/api/users/login", {
    data: { email: `${role}@example.test`, password: "people-browser-123456" },
  });
  expect(res.ok()).toBe(true);
}
const row = (page: Page, name: string) =>
  page.locator("[data-person-row]").filter({ hasText: name });
const save = (page: Page) =>
  page.getByRole("button", { name: "Save", exact: true });
async function changeBio(page: Page, value: string) {
  await page.getByLabel(/^Short bio/).fill(value);
  await expect(save(page)).toBeEnabled();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

test("People views, identity search, New guest and staff creation, and URL navigation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/people");
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Current staff", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Alex Morgan")).toBeVisible();
  await expect(row(page, "Gibson Bell").locator("img")).toBeVisible();
  await expect(row(page, "Alex Morgan")).toContainText("AM");
  await page.getByRole("tab", { name: "Guests", exact: true }).click();
  await expect(row(page, "Jordan Park")).toContainText("Byline only");
  await page.getByRole("tab", { name: "Alumni", exact: true }).click();
  await expect(row(page, "Taylor Lee")).toBeVisible();
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "All", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("textbox", { name: "Search People" })
    .fill("Photographer");
  await expect(row(page, "Jordan Park")).toBeVisible();
  await expect(page.locator("[data-person-row]")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search People" })
    .fill("Nobody here");
  await expect(page.getByText("No matching people")).toBeVisible();
  await page.getByRole("textbox", { name: "Search People" }).fill("");
  await page.getByRole("button", { name: "New person", exact: true }).click();
  await page
    .getByRole("button", { name: "Create person", exact: true })
    .click();
  await expect(page.getByText("Give this person a name.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("One-off Photographer");
  await page
    .getByRole("radio", { name: "Guest contributor", exact: true })
    .check();
  await page.getByLabel(/^Newsroom role/).fill("Photographer");
  await page
    .getByRole("button", { name: "Create person", exact: true })
    .click();
  await expect(page).toHaveURL(/person=\d+/);
  await expect(
    page.getByRole("heading", { name: "One-off Photographer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Show in staff directory" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Has a public profile page" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Back to People" }).click();
  await page.getByRole("button", { name: "New person", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("New Staff Writer");
  await page
    .getByRole("button", { name: "Create person", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Show in staff directory" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Has a public profile page" }),
  ).toBeChecked();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "New Staff Writer" }),
  ).toBeVisible();
});

test("editor saves, cancels, chooses/removes portraits, edits social links and previews the unsaved draft", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/admin/people?person=${fixtures().people["alex-morgan"]}`);
  await changeBio(page, "Unsaved profile preview");
  await page
    .getByLabel(/^Full bio/)
    .fill("A complete biography.\nA second paragraph.");
  await page.getByLabel(/^Public email/).fill("alex-public@example.test");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("Service or label", { exact: true }).fill("Website");
  await page
    .getByLabel("URL", { exact: true })
    .fill("https://example.test/alex");
  await page.getByRole("button", { name: "Choose photo", exact: true }).click();
  const picker = page.locator("[data-media-picker]");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: /editor-portrait\.jpg/ }).click();
  await picker
    .getByRole("button", { name: "Use portrait", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change photo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.locator("[data-person-preview]");
  await expect(preview.locator(".author-card")).toContainText("Alex Morgan");
  await preview.getByRole("tab", { name: "Author profile" }).click();
  await expect(preview.locator(".author-profile")).toContainText(
    "Unsaved profile preview",
  );
  await expect(preview.locator(".author-profile img")).toBeVisible();
  await expect(preview.locator(".author-social-links")).toContainText(
    "Website",
  );
  await expect(preview.locator(".author-bio")).toContainText(
    "A second paragraph.",
  );
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved" }),
  ).toBeAttached();
  await changeBio(page, "Cancelled copy");
  await page.getByRole("button", { name: "Cancel changes" }).click();
  await expect(page.getByLabel(/^Short bio/)).toHaveValue(
    "Unsaved profile preview",
  );
  await page
    .getByRole("button", { name: "Remove Website", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
});

test("dirty state protects Back, Forward, Back to People, sidebar, account-menu navigation and closing a tab", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/people");
  await row(page, "Gibson Bell").click();
  await changeBio(page, "Draft that must not disappear");
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel(/^Short bio/)).toHaveValue(
    "Draft that must not disappear",
  );
  await page.getByRole("button", { name: "Back to People" }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await row(page, "Alex Morgan").click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "People", exact: true }),
  ).toBeVisible();
  await row(page, "Gibson Bell").click(); // make a forward destination, then traverse backwards between two Person entries
  await page.getByRole("button", { name: "Back to People" }).click();
  await row(page, "Alex Morgan").click();
  await page.goBack();
  await page.goBack(); // Gibson editor, with a forward list entry
  await expect(page.getByLabel(/^Short bio/)).toBeVisible();
  await changeBio(page, "Forward-protected draft");
  await page.goForward();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Byline", exact: true })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog", { name: "Leave without saving?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await page
    .getByRole("button", { name: "Account: Gibson Bell", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "My profile", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Leave without saving?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  const dialog = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 3000 }).catch(() => null);
  const unload = await dialog;
  expect(unload.type()).toBe("beforeunload");
  await unload.dismiss();
  await reload;
  await expect(page.getByLabel(/^Short bio/)).toHaveValue(
    "Forward-protected draft",
  );
});

test("concurrent editing returns a conflict and reload discards only after confirmation", async ({
  browser,
}) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await login(a);
  await login(b);
  const path = `/admin/people?person=${fixtures().people["gibson-bell"]}`;
  await a.goto(path);
  await b.goto(path);
  await changeBio(a, "Newer saved biography");
  await changeBio(b, "Stale unsaved biography");
  await save(a).click();
  await expect(save(a)).toBeDisabled();
  await save(b).click();
  await expect(
    b.getByText(
      "Someone else changed this profile. Reload to see the newer version.",
    ),
  ).toBeVisible();
  await expect(b.getByLabel(/^Short bio/)).toHaveValue(
    "Stale unsaved biography",
  );
  await b.getByRole("button", { name: "Reload newer profile" }).click();
  await b.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(b.getByLabel(/^Short bio/)).toHaveValue("Newer saved biography");
  await a.close();
  await b.close();
});

test("staff My profile uses the same editor without editorial or account controls; unlinked accounts get help", async ({
  page,
}) => {
  await login(page, "writer");
  await page.goto("/admin/profile");
  await expect(
    page.getByRole("heading", { name: "My profile", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Byline", exact: true })
      .getByRole("link", { name: "People", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Show in staff directory" }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/^Newsroom role/)).toHaveCount(0);
  await expect(
    page.getByText(
      "Your newsroom role and profile visibility are managed by an editor.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toHaveCount(0);
  await changeBio(page, "My public writer biography");
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await page.goto("/admin/people");
  await expect(
    page.getByText("Only editors manage People.", { exact: false }),
  ).toBeVisible();
  await login(page, "unlinked");
  await page.goto("/admin/profile");
  await expect(
    page.getByText(
      "Your account does not have a public byline profile yet. Ask an editor to link one.",
    ),
  ).toBeVisible();
});

test("sign-out waits for the dirty guard before changing authentication", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/admin/people?person=${fixtures().people["gibson-bell"]}`);
  await changeBio(page, "Unsaved before sign-out");
  let logouts = 0;
  let browserPrompts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/users/logout")) logouts += 1;
  });
  page.on("dialog", async (dialog) => {
    browserPrompts += 1;
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Account: Gibson Bell", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Leave without saving?" }),
  ).toBeVisible();
  expect(logouts).toBe(0);
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByLabel(/^Short bio/)).toHaveValue(
    "Unsaved before sign-out",
  );
  await page
    .getByRole("button", { name: "Account: Gibson Bell", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Leave anyway", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(logouts).toBe(1);
  expect(browserPrompts).toBe(0);
});

test("guest visibility is independent and alumni retain historical bylines", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/admin/people?person=${fixtures().people["jordan-park"]}`);
  await expect(
    page.getByRole("heading", { name: "Jordan Park", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  let preview = page.locator("[data-person-preview]");
  await expect(
    preview.getByText("This person will not appear in the staff directory.", {
      exact: false,
    }),
  ).toBeVisible();
  await preview
    .getByRole("tab", { name: "Author profile", exact: true })
    .click();
  await expect(
    preview.getByText("This person is credited byline-only", { exact: false }),
  ).toBeVisible();
  await expect(preview.locator(".author-profile")).toHaveCount(0);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/admin/people?person=${fixtures().people["sam-rivera"]}`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  preview = page.locator("[data-person-preview]");
  await expect(preview.locator(".author-card")).toContainText("Sam Rivera");
  await preview
    .getByRole("tab", { name: "Author profile", exact: true })
    .click();
  await expect(preview.locator(".author-bio")).toContainText(
    "A community contributor",
  );
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/admin/people?person=${fixtures().people["taylor-lee"]}`);
  await expect(
    page.getByRole("heading", { name: "Taylor Lee", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A year of student voices", { exact: true }),
  ).toBeVisible();
});

for (const width of [1920, 1440, 1366, 1180, 820, 390])
  test(`People list, editor and preview geometry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    await page.goto("/admin/people");
    await expect(row(page, "Gibson Bell")).toBeVisible();
    await noOverflow(page);
    await expect(
      page.getByRole("button", { name: "New person", exact: true }),
    ).toBeInViewport();
    await row(page, "Gibson Bell").click();
    await expect(page.getByLabel(/^Full bio/)).toBeVisible();
    await noOverflow(page);
    await expect(save(page)).toBeInViewport();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.locator("[data-person-preview]");
    await expect(preview).toBeInViewport();
    await preview.getByRole("tab", { name: "Author profile" }).click();
    await expect(preview.locator(".author-profile")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: `/private/tmp/people-preview-${width}.png`,
      fullPage: true,
    });
  });
