import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import type {
  Collection,
  CollectionDetail,
  Interview,
  SharedResource,
} from "../../src/collections/collection-model";
const url = "/wp-admin/admin.php?page=byline-planning&tab=collections";

test("Collections coordinates independent reporting with equivalent touch/context actions", async ({
  adminPage: page,
  adminSession: session,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stamp = Date.now();
  const name = `SCBDA reporting ${stamp}`;
  const existingTitle = `Championship existing ${stamp}`;
  const newTitle = `Championship new ${stamp}`;
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Collections", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "New collection",
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const id = Number(new URL(page.url()).searchParams.get("collection"));
  expect(id).toBeGreaterThan(0);
  await page.getByLabel("Collection status", { exact: true }).click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await session.rest<CollectionDetail>(
            `/byline/v1/editorial/collections/${id}`,
          )
        ).payload.collection.status,
    )
    .toBe("active");
  const existing = await session.rest<{ story: { id: number } }>(
    "/byline/v1/editorial/stories",
    "POST",
    { title: existingTitle },
  );
  expect(existing.status).toBe(201);
  session.registerTestPost(existing.payload.story.id);
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await page.getByRole("button", { name: "Add story", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Add existing story",
    exact: true,
  });
  await picker.getByLabel("Stories", { exact: true }).click();
  await page.getByLabel("Search stories", { exact: true }).fill(existingTitle);
  await page.getByRole("option", { name: new RegExp(existingTitle) }).click();
  await page.keyboard.press("Escape");
  await picker.getByRole("button", { name: "Save story links" }).click();
  await expect(picker).not.toBeVisible();
  await page.getByRole("button", { name: "New story", exact: true }).click();
  const createStory = page.getByRole("dialog", {
    name: "New story",
    exact: true,
  });
  await createStory.getByLabel("Story title", { exact: true }).fill(newTitle);
  await createStory
    .getByRole("button", { name: "Create story", exact: true })
    .click();
  await expect(page).toHaveURL(/story=\d+/);
  await expect(
    page.getByRole("heading", { name: newTitle, exact: true }),
  ).toBeVisible();
  const detail = (
    await session.rest<CollectionDetail>(
      `/byline/v1/editorial/collections/${id}`,
    )
  ).payload;
  const created = detail.stories.find((s) => s.title === newTitle)!;
  expect(created).toBeTruthy();
  session.registerTestPost(created.id);
  await expect(
    page.getByRole("region", { name: "Story Collections" }),
  ).toContainText(name);
  await page.goto(`${url}&collection=${id}`);
  await page.getByRole("tab", { name: "Interviews", exact: true }).click();
  await page
    .getByRole("button", { name: "Add interview", exact: true })
    .click();
  const interviewCreate = page.getByRole("dialog", {
    name: "New interview",
    exact: true,
  });
  const interviewTitle = `Band director ${stamp}`;
  await interviewCreate.getByLabel("Interviewee / source").fill(interviewTitle);
  await interviewCreate
    .getByRole("button", { name: "New interview", exact: true })
    .click();
  const interview = page.getByRole("dialog", {
    name: interviewTitle,
    exact: true,
  });
  await expect(interview).toBeVisible();
  for (const title of [existingTitle, newTitle]) {
    await interview.getByLabel("Linked stories", { exact: true }).click();
    await page.getByLabel("Search linked stories", { exact: true }).fill(title);
    const option = page.getByRole("option", { name: new RegExp(title) });
    await expect(option).toBeVisible();
    await option.click({ timeout: 10000 });
    await page.keyboard.press("Escape");
  }
  await interview
    .getByRole("button", { name: "Save interview", exact: true })
    .click();
  await expect(interview).not.toBeVisible();
  expect(
    (
      await session.rest<CollectionDetail>(
        `/byline/v1/editorial/collections/${id}`,
      )
    ).payload.interviews[0].storyIds,
  ).toHaveLength(2);
  const additional = await session.rest<Interview>(
    `/byline/v1/editorial/collections/${id}/interviews`,
    "POST",
    { interviewee: `Student leader ${stamp}` },
  );
  expect(additional.status).toBe(200);
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await page.getByRole("button", { name: existingTitle, exact: true }).click();
  const storyPeek = page.getByRole("dialog", {
    name: existingTitle,
    exact: true,
  });
  await expect(storyPeek).toBeVisible();
  await storyPeek.getByRole("button", { name: /Collections & interviews/ }).click();
  await storyPeek.getByLabel("Add from Collection", { exact: true }).click();
  await page
    .getByLabel("Search add from collection", { exact: true })
    .fill(`Student leader ${stamp}`);
  await page
    .getByRole("option", { name: new RegExp(`Student leader ${stamp}`) })
    .click();
  await expect
    .poll(
      async () =>
        (
          await session.rest<{ interviews: Interview[] }>(
            `/byline/v1/editorial/stories/${existing.payload.story.id}/collections`,
          )
        ).payload.interviews.length,
    )
    .toBe(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(storyPeek).not.toBeVisible();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const taskDialog = page.getByRole("dialog", {
    name: "New task",
    exact: true,
  });
  await taskDialog
    .getByLabel("Task title", { exact: true })
    .fill("Verify final scores");
  await taskDialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(taskDialog).not.toBeVisible();
  await page
    .getByRole("checkbox", { name: /Complete Verify final scores/ })
    .click();
  await expect
    .poll(
      async () =>
        (
          await session.rest<CollectionDetail>(
            `/byline/v1/editorial/collections/${id}`,
          )
        ).payload.tasks[0].state,
    )
    .toBe("completed");
  await page.goto(url);
  await page.getByLabel("Search collections").fill(name);
  const row = page.locator(`[data-collection-id="${id}"]`);
  await expect(row).toBeVisible();
  await page.getByLabel("Filter status", { exact: true }).click();
  await page.getByRole("option", { name: "Planning", exact: true }).click();
  await expect(row).not.toBeVisible();
  await page.getByLabel("Filter status", { exact: true }).click();
  await page.getByRole("option", { name: "All statuses", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Actions for ${name}` }).click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  const overflow = await menu.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  await row.click({ button: "right" });
  const contextMenu = page.locator('[data-slot="context-menu-content"]');
  await expect(contextMenu).toBeVisible();
  expect(await contextMenu.getByRole("menuitem").allTextContents()).toEqual(overflow);
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(row).not.toBeVisible();
  await page.getByLabel("Active or archived").click();
  await page
    .getByRole("option", { name: "Archived collections", exact: true })
    .click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Restore collection" }).click();
  await expect(row).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("realistic Collection remains usable at desktop, iPad, and narrow touch widths", async ({
  adminPage: page,
  adminSession: session,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = await session.rest<Collection>(
    "/byline/v1/editorial/collections",
    "POST",
    {
      name: "2026 SCBDA State Championships",
      type: "event",
      status: "active",
      startDate: "2026-10-24",
      endDate: "2026-10-27",
      brief:
        "Follow the road to the state title and the students behind the performance.\n\nKey angles\n• Championship recap and official results\n• A new director’s first season\n• The community behind the band\n\nStill missing: verify division standings and speak with student leaders.",
    },
  );
  expect(c.status).toBe(200);
  const id = c.payload.id;
  const members: number[] = [];
  for (const name of [
    "Caroline Elrod",
    "Alex Rivera",
    "Maya Bennett",
    "Jordan Lee",
  ]) {
    const username = `collection-${randomUUID()}`;
    const user = await session.rest<{ id: number }>("/wp/v2/users", "POST", {
      username,
      password: randomUUID(),
      email: `${username}@example.test`,
      name,
      roles: ["author"],
    });
    expect(user.status).toBe(201);
    members.push(user.payload.id);
    session.addCleanup(async () => {
      await session.rest(
        `/wp/v2/users/${user.payload.id}?force=true&reassign=1`,
        "DELETE",
      );
    });
    expect(
      (
        await session.rest(
          `/byline/v1/editorial/collections/${id}/links/member/${user.payload.id}`,
          "POST",
        )
      ).status,
    ).toBe(200);
  }
  const stories: number[] = [];
  for (const [index, title] of [
    "Wildcats earn a place on the state podium",
    "A new director, a season of firsts",
    "Inside the championship performance",
    "The families behind the band",
    "What comes after the final note",
  ].entries()) {
    const story = await session.rest<{ story: { id: number } }>(
      `/byline/v1/editorial/collections/${id}/stories`,
      "POST",
      { title },
    );
    expect(story.status).toBe(201);
    stories.push(story.payload.story.id);
    session.registerTestPost(story.payload.story.id);
    await session.rest(
      `/byline/v1/editorial/stories/${story.payload.story.id}`,
      "POST",
      {
        status: ["reporting", "writing", "editing", "reporting", "reporting"][
          index
        ],
        deadline: `2026-10-${26 + index}`,
      },
    );
    await session.rest(
      `/byline/v1/editorial/stories/${story.payload.story.id}/contributors`,
      "POST",
      {
        contributors: [
          {
            id: members[index % 4],
            kind: "user",
            type: "user",
            name: [
              "Caroline Elrod",
              "Alex Rivera",
              "Maya Bennett",
              "Jordan Lee",
            ][index % 4],
          },
        ],
      },
    );
    if (index < 2)
      await session.rest(`/wp/v2/posts/${story.payload.story.id}`, "POST", {
        status: "publish",
      });
  }
  const resources: number[] = [];
  for (const [label, link] of [
    ["Official results", "https://example.org/scbda/results"],
    ["Event schedule", "https://example.org/scbda/schedule.pdf"],
    [
      "Shared interview notes",
      "https://docs.google.com/document/d/scbda-notes/edit",
    ],
  ]) {
    const resource = await session.rest<SharedResource>(
      `/byline/v1/editorial/collections/${id}/resources`,
      "POST",
      { label, url: link },
    );
    expect(resource.status).toBe(200);
    resources.push(resource.payload.id);
  }
  const interviews: number[] = [];
  for (const [i, name] of [
    "Band director · season reflection",
    "Drum majors · leading the performance",
    "Senior musicians · the final show",
    "SCBDA official · results and divisions",
    "Band families · behind the scenes",
    "Student leaders · next season",
  ].entries()) {
    const interview = await session.rest<Interview>(
      `/byline/v1/editorial/collections/${id}/interviews`,
      "POST",
      {
        interviewee: name,
        status: i < 3 ? "completed" : "scheduled",
        scheduledAt: `2026-10-${24 + Math.floor(i / 2)}T${10 + i}:00`,
        notes:
          i < 3
            ? "Reporting complete. Check names against the program before publication."
            : "Ask about preparation, the performance, and what comes next.",
        privateContact: "Internal contact details",
        followUps: "Confirm spelling and obtain permission for direct quotes.",
      },
    );
    expect(interview.status).toBe(200);
    interviews.push(interview.payload.id);
    await session.rest(
      `/byline/v1/editorial/collections/${id}/interviews/${
        interview.payload.id
      }/links/interviewer/${members[i % 4]}`,
      "POST",
    );
    if (i < 4)
      await session.rest(
        `/byline/v1/editorial/collections/${id}/interviews/${
          interview.payload.id
        }/links/interview-story/${stories[i % 5]}`,
        "POST",
      );
    if (i === 0)
      await session.rest(
        `/byline/v1/editorial/collections/${id}/interviews/${interview.payload.id}/links/recording/${resources[2]}`,
        "POST",
      );
  }
  for (const title of [
    "Verify final scores",
    "Select championship photos",
    "Confirm spelling of all band directors",
  ]) {
    const task = await session.rest<{ id: number }>(
      "/byline/v1/editorial/tasks",
      "POST",
      {
        title,
        collectionId: id,
        assigneeId: members[0],
        dueAt: "2026-10-27",
        priority: "high",
      },
    );
    expect(task.status).toBe(200);
    session.addCleanup(async () => {
      await session.rest(
        `/byline/v1/editorial/tasks/${task.payload.id}`,
        "DELETE",
      );
    });
  }
  await fs.mkdir("/tmp/byline-collections-qa", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [1280, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${url}&collection=${id}`);
    await expect(
      page.getByRole("heading", {
        name: "2026 SCBDA State Championships",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Reporting brief", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/byline-collections-qa/overview-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("tab", { name: "Interviews", exact: true }).click();
    await page
      .getByRole("button", { name: /Band director · season reflection/ })
      .click();
    const peek = page.getByRole("dialog", {
      name: "Band director · season reflection",
      exact: true,
    });
    await expect(peek).toBeVisible();
    const box = (await peek.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBe(0);
    expect(
      await peek.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await expect(
      peek.getByLabel("Linked stories", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/byline-collections-qa/interview-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(peek).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});
