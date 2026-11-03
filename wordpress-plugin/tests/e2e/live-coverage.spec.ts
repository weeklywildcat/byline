import { expect, test } from "./fixtures";
import { openStorySidebar } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

test("editors post, pin, edit, preview, and end a permanent live archive", async ({ adminPage: page, adminSession }) => {
  const { id } = await createEditorDraft(page, adminSession.registerTestPost, "live coverage");
  await openStorySidebar(page);
  await page.getByRole('button', { name: 'Live coverage', exact: true }).click();
  await page.getByRole('button', { name: 'Start live coverage', exact: true }).click();
  const panel = page.locator('.byline-live-panel');
  await expect(panel).toContainText('Live now');
  await panel.getByLabel('Headline (optional)').fill('From the field');
  await panel.getByLabel('Update', { exact: true }).fill('First report.\n\n- One fact\n- Another fact');
  await panel.getByLabel('Pin as key points').check();
  await panel.getByRole('button', { name: 'Post update', exact: true }).click();
  await expect(panel.locator('ol li')).toHaveCount(1);
  const stored = await adminSession.rest<{ updates: Array<{ id: number }> }>(`/byline/v1/editorial/stories/${id}/live`);
  for (const update of stored.payload.updates) {
    adminSession.addCleanup(async () => { await adminSession.rest(`/byline/v1/editorial/stories/${id}/live/updates/${update.id}`, 'DELETE'); });
  }
  await expect(panel.locator('ol li')).toContainText('Key points');
  await panel.locator('ol li').getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.getByLabel('Edit update', { exact: true }).fill('A corrected report.');
  await panel.getByRole('button', { name: 'Save update', exact: true }).click();
  await expect(panel.locator('ol li')).toContainText('A corrected report.');
  const draftFeed = await page.request.get(`/wp-json/byline/v1/live/${id}`);
  expect(draftFeed.status()).toBe(404);
  // The private preview uses the same ArticleView, including the pinned timeline record.
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Preview as Byline', exact: true }).click();
  const preview = await popup;
  try {
    await preview.waitForURL(/page=byline-article-preview/);
    const frame = preview.frameLocator('iframe[title="Byline article preview"]');
    await expect(frame.locator('.article-live-key-points')).toContainText('A corrected report.');
    await expect(frame.locator('.article-live-updates [data-update-id]')).toHaveCount(1);
  } finally { await preview.close(); }
  // Public publication is exercised through Core REST using the authenticated session nonce.
  expect((await adminSession.rest(`/wp/v2/posts/${id}`, 'POST', { status: 'publish' })).ok).toBe(true);
  const live = await (await page.request.get(`/wp-json/byline/v1/live/${id}`)).json();
  expect(live.updates).toHaveLength(1);
  expect(live.updates[0].pinned).toBe(true);
  expect(live.updates[0].html).toContain('A corrected report.');
  page.once('dialog', (dialog) => dialog.accept());
  await panel.getByRole('button', { name: 'End live coverage', exact: true }).click();
  await expect(panel).toContainText('Every update stays on the story.');
  const ended = await (await page.request.get(`/wp-json/byline/v1/live/${id}`)).json();
  expect(ended.status).toBe('ended');
  expect(ended.updates).toHaveLength(1);
  const rejected = await page.request.post(`/wp-json/byline/v1/editorial/stories/${id}/live/updates`, {
    headers: { 'X-WP-Nonce': 'invalid' }, data: { text: 'Must not be published' }
  });
  expect(rejected.status()).toBe(403);
});
