import { waitForBylineEditorReady } from "./editor-helpers";
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

test("Content Health Fix targets still focus Gutenberg blocks, featured image and Story tasks", async ({
  adminPage: page,
  adminSession: session,
}) => {
  const id = await createPlanningStory(session, {
    title: `${token()} Fix navigation`,
    published: true,
  });
  const saved = await session.rest(`/wp/v2/posts/${id}`, "POST", {
    content:
      "<!-- wp:paragraph --><p>First block.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Focused health block.</p><!-- /wp:paragraph -->",
  });
  expect(saved.ok).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fix = (target: Record<string, unknown>) =>
    `/wp-admin/post.php?post=${id}&action=edit&byline_content_health_target=${encodeURIComponent(
      JSON.stringify(target),
    )}`;
  await page.goto(
    fix({ kind: "block", blockPath: [1], blockName: "core/paragraph" }),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = (window as any).wp?.data?.select("core/block-editor");
        return store?.getSelectedBlock()?.attributes?.content;
      }),
    )
    .toContain("Focused health block");
  await page.goto(fix({ kind: "featured-image" }));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).wp?.data
            ?.select("core/edit-post")
            ?.getActiveGeneralSidebarName(),
      ),
    )
    .toBe("edit-post/document");
  await page.goto(fix({ kind: "story-sidebar", panel: "tasks" }));
  await waitForBylineEditorReady(page);
  await expect(
    page
      .locator(".byline-editorial-sidebar")
      .getByRole("button", { name: /^Tasks(?:\s+·\s+\d+\s+open)?$/i })
      .first(),
  ).toHaveAttribute("aria-expanded", "true");
  expect(errors).toEqual([]);
});
