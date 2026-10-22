import { expect, test } from "./fixtures";
import { createPlanningStory, token } from "./planning-fixture";

/**
 * Notes save the moment they are added, but the anchor that ties a Note to its
 * text lives in the post content. Stories therefore autosave every 30 seconds.
 * Only public editor data (`wp.data`) is used; no editor DOM.
 */
test("the story editor autosaves a draft within 30 seconds", async ({ adminPage: page, adminSession: session }) => {
  test.setTimeout(120_000);
  const id = await createPlanningStory(session, { title: `${token()} Autosave`, status: "writing" });
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  await page.waitForFunction(() => Boolean((window as any).wp?.data?.select("core/editor")?.getCurrentPostId?.()), undefined, { timeout: 60_000 });

  const interval = await page.evaluate(() => (window as any).wp.data.select("core/editor").getEditorSettings().autosaveInterval);
  expect(interval).toBe(30);

  const marker = `Autosaved ${Date.now()}`;
  await page.evaluate((title) => (window as any).wp.data.dispatch("core/editor").editPost({ title }), marker);
  // The browser never pressed Save: WordPress' own autosave has to persist it.
  await expect.poll(async () => (await session.rest<{ title: { raw: string } }>(`/wp/v2/posts/${id}?context=edit`)).payload.title.raw, { timeout: 60_000, intervals: [2_000] }).toBe(marker);
});
