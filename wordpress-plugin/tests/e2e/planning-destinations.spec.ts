import { expect, test } from "./fixtures";
import {
  createPlanningStory,
  currentUserId,
  siteToday,
  addDays,
  token,
} from "./planning-fixture";

const planning = (tab: string) =>
  `/wp-admin/admin.php?page=byline-planning&tab=${tab}`;

test.describe("Planning destinations are one design system", () => {
  for (const [tab, heading] of [
    ["collections", "Collections"],
    ["media", "Media Desk"],
    ["content-health", "Content Health"],
    ["feedback", "Feedback"],
  ] as const) {
    test(`${heading} renders in the shared Nova root without errors and without WordPress controls`, async ({
      adminPage: page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(planning(tab));
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("#byline-admin-root .byline-ui-root"),
      ).toBeVisible();
      expect(
        await page.locator("#byline-admin-root [class*='components-']").count(),
      ).toBe(0);
      expect(await page.locator(".nav-tab-wrapper").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("Media Desk edits an assignment in place and opens the same Story Peek", async ({
    adminPage: page,
    adminSession: session,
  }) => {
    const unique = token();
    const { day } = await siteToday(session);
    const me = await currentUserId(session);
    const title = `${unique} Media story`;
    const id = await createPlanningStory(session, {
      title,
      status: "reporting",
      writers: [me],
    });
    const created = await session.rest<{ assignmentId: string }>(
      `/byline/v1/editorial/stories/${id}/media-assignments`,
      "POST",
      {
        title: `${unique} Photos`,
        type: "photo",
        assigneeId: me,
        dueAt: `${addDays(day, 2)}T17:00`,
      },
    );
    expect(created.ok).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(planning("media"));
    await page
      .getByRole("searchbox", { name: "Find a story or assignment" })
      .fill(unique);
    const row = page.getByRole("row", { name: new RegExp(`${unique} Photos`) });
    await expect(row).toBeVisible();
    await row
      .getByRole("combobox", { name: `Status: ${unique} Photos` })
      .click();
    await page.getByRole("option", { name: "In progress" }).click();
    await expect
      .poll(
        async () =>
          (
            await session.rest<{ mediaAssignments: Array<{ status: string }> }>(
              `/byline/v1/editorial/stories/${id}/workspace`,
            )
          ).payload.mediaAssignments[0]?.status,
      )
      .toBe("in-progress");
    await row
      .getByRole("button", { name: `Actions for ${unique} Photos` })
      .click();
    // The domain rule is the server's: no file linked, no completion. The desk says so and changes nothing.
    await page.getByRole("menuitem", { name: "Mark complete" }).click();
    await expect(
      page.getByText(/needs a linked attachment/i).first(),
    ).toBeVisible();
    expect(
      (
        await session.rest<{ mediaAssignments: Array<{ status: string }> }>(
          `/byline/v1/editorial/stories/${id}/workspace`,
        )
      ).payload.mediaAssignments[0]?.status,
    ).toBe("in-progress");
    await row.getByRole("button", { name: title }).click();
    await expect(
      page
        .getByRole("dialog", { name: title, exact: true })
        .getByRole("link", { name: "Open workspace" }),
    ).toBeVisible();
  });

  for (const width of [1440, 700]) {
    test(`Media Desk right-click opens actions and Story Peek at ${width}px`, async ({
      adminPage: page,
      adminSession: session,
    }) => {
      const unique = token();
      const title = `${unique} Context story`;
      const id = await createPlanningStory(session, {
        title,
        status: "reporting",
      });
      const assignmentTitle = `${unique} Photos`;
      const created = await session.rest(
        `/byline/v1/editorial/stories/${id}/media-assignments`,
        "POST",
        { title: assignmentTitle, type: "photo" },
      );
      expect(created.ok).toBe(true);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const url = planning("media");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page
        .getByRole("searchbox", { name: "Find a story or assignment" })
        .fill(unique);
      await page
        .getByRole("button", { name: title, exact: true })
        .click({ button: "right" });
      const menu = page.locator('[data-slot="context-menu-content"]');
      await expect(menu).toBeVisible();
      await expect(
        menu.getByRole("group", { name: assignmentTitle, exact: true }),
      ).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: "Open story workspace" }),
      ).toHaveAttribute("href", new RegExp(`story=${id}(?:&|$)`));
      await menu.getByRole("menuitem", { name: "Status", exact: true }).hover();
      await expect(
        page.getByRole("menuitemradio", { name: "Needed", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await menu.getByRole("menuitem", { name: "Quick view story" }).click();
      await expect(
        page.getByRole("dialog", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Planning couldn't be displayed.", { exact: true }),
      ).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
        url,
      );
      expect(errors).toEqual([]);
    });
  }

  test("retired Planning bookmarks lead to Collections and Today", async ({
    adminPage: page,
  }) => {
    for (const [legacy, target] of [
      ["coverage", "collections"],
      ["performance", "today"],
    ]) {
      await page.goto(planning(legacy));
      await expect(page).toHaveURL(new RegExp(`tab=${target}`));
      await expect(
        page.locator(
          '#adminmenu a[href="admin.php?page=byline-planning&tab=coverage"]',
        ),
      ).toHaveCount(0);
      await expect(
        page.locator(
          '#adminmenu a[href="admin.php?page=byline-planning&tab=performance"]',
        ),
      ).toHaveCount(0);
      await page.goto(`/wp-admin/admin.php?page=byline#/planning/${legacy}`);
      await expect(page).toHaveURL(new RegExp(`tab=${target}`));
    }
  });

  test("Collection public presentation keeps newsroom wording private and persists public ordering", async ({
    adminPage: page,
    adminSession: session,
  }) => {
    const unique = token();
    const first = await createPlanningStory(session, {
      title: `${unique} Published first`,
      published: true,
    });
    const lead = await createPlanningStory(session, {
      title: `${unique} Published lead`,
      published: true,
    });
    const draft = await createPlanningStory(session, {
      title: `${unique} Private draft`,
    });
    const created = await session.rest<{ id: number }>(
      "/byline/v1/editorial/collections",
      "POST",
      { name: `${unique} Operational project`, brief: "INTERNAL BRIEF" },
    );
    expect(created.ok).toBe(true);
    const id = created.payload.id;
    session.registerTestPost(id);
    for (const storyId of [first, lead, draft])
      expect(
        (
          await session.rest(
            `/byline/v1/editorial/collections/${id}/links/story/${storyId}`,
            "POST",
          )
        ).ok,
      ).toBe(true);
    await page.goto(`${planning("collections")}&collection=${id}`);
    await page.getByRole("button", { name: "Publish as coverage" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Public coverage",
      exact: true,
    });
    await dialog
      .getByLabel("Public title", { exact: true })
      .fill(`${unique} Reader guide`);
    const slug = `${unique.toLowerCase()}-guide`;
    await dialog.getByLabel("URL slug", { exact: true }).fill(slug);
    await dialog
      .getByLabel("Short description / dek")
      .fill("A reader-facing introduction.");
    await dialog
      .getByLabel("Public overview", { exact: true })
      .fill("Public context.");
    await dialog.getByLabel("Featured / lead story").click();
    await page
      .getByRole("option", { name: `${unique} Published lead`, exact: true })
      .click();
    await dialog.getByRole("button", { name: "Save public coverage" }).click();
    await expect(dialog).not.toBeVisible();
    const publicResponse = await session.rest<{
      title: string;
      stories: { id: number }[];
    }>(`/byline/v1/coverage/${slug}`);
    expect(publicResponse.payload.title).toBe(`${unique} Reader guide`);
    expect(publicResponse.payload.stories.map((story) => story.id)).toEqual([
      lead,
      first,
    ]);
    expect(JSON.stringify(publicResponse.payload)).not.toContain(
      "INTERNAL BRIEF",
    );
    expect(JSON.stringify(publicResponse.payload)).not.toContain(
      "Private draft",
    );
    await expect(
      page.getByRole("link", { name: "View coverage" }),
    ).toHaveAttribute("href", new RegExp(`/coverage/${slug}/`));
    await page.getByRole("button", { name: "Edit public coverage" }).click();
    await dialog.getByLabel("Visibility").click();
    await page
      .getByRole("option", { name: "Newsroom only", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Save public coverage" }).click();
    await expect(dialog).not.toBeVisible();
    expect((await session.rest(`/byline/v1/coverage/${slug}`)).status).toBe(
      404,
    );
  });
});
