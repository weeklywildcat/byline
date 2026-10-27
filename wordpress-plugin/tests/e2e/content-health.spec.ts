import { expect, test } from "./fixtures";
import { createPlanningStory, token } from "./planning-fixture";

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`Content Health triage, recheck, ignore, Story Peek and geometry at ${width}px`, async ({
    adminPage: page,
    adminSession: session,
  }) => {
    const unique = token();
    const title = `${unique} Published health fixture`;
    const id = await createPlanningStory(session, { title, published: true });
    expect(
      (
        await session.rest(
          `/byline/v1/admin/content-health/story/${id}/recheck`,
          "POST",
        )
      ).ok,
    ).toBe(true);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `/wp-admin/admin.php?page=byline-planning&tab=content-health&health-search=${unique}`,
    );
    await expect(
      page.getByRole("heading", { name: "Content Health", exact: true }),
    ).toBeVisible();
    const issues = page.getByRole("tabpanel", { name: "Issues", exact: true });
    const group = issues.getByRole("button", {
      name: /Featured image missing/,
    });
    await group.focus();
    await page.keyboard.press("Enter");
    await expect(group).toHaveAttribute("aria-expanded", "true");
    await expect(
      issues.getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      issues.getByRole("link", { name: "Fix", exact: true }),
    ).toHaveAttribute("href", /byline_content_health_target/);
    const rechecked = page.waitForResponse(
      (response) =>
        response.url().includes(`/content-health/story/${id}/recheck`) &&
        response.request().method() === "POST",
    );
    await issues.getByRole("button", { name: "Recheck", exact: true }).click();
    expect((await rechecked).ok()).toBe(true);
    await expect(
      page.getByText("Story rechecked", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    await expect(
      page
        .getByRole("list", { name: "Stories with issues" })
        .getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Issues", exact: true }).click();
    await issues
      .getByRole("button", { name: /Featured image missing/ })
      .click();
    await issues
      .getByRole("button", {
        name: `Actions for ${title}: featured-image`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Ignore for this story", exact: true })
      .click();
    await expect(
      page.getByText("No issues match", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Ignored", exact: true }).click();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("tab", { name: "Issues", exact: true }).click();
    await issues
      .getByRole("button", { name: /Featured image missing/ })
      .click();
    await issues.getByRole("button", { name: title, exact: true }).click();
    const peek = page.getByRole("dialog", { name: title, exact: true });
    await expect(peek).toBeVisible();
    await expect(
      peek.getByRole("link", { name: "Open workspace", exact: true }),
    ).toBeVisible();
    await peek.getByRole("button", { name: "Close", exact: true }).click();
    await expect(peek).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("searchbox", { name: "Search content health" }),
    ).toHaveValue(unique);
    expect(errors).toEqual([]);
  });
}
