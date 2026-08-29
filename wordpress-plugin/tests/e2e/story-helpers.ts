import type { Page } from "@playwright/test";

import {
  currentPostId,
  fillEditorTitle,
  saveEditorDraft,
  waitForBylineEditorReady
} from "./editor-helpers";

export function storyTitle(label: string): string {
  return `Byline E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createEditorDraft(
  page: Page,
  registerTestPost: (postId: number) => void,
  label: string
): Promise<{ id: number; title: string }> {
  const title = storyTitle(label);
  await page.goto("/wp-admin/post-new.php?post_type=post", { waitUntil: "domcontentloaded" });
  await waitForBylineEditorReady(page);
  await fillEditorTitle(page, title);

  try {
    const id = await saveEditorDraft(page);
    registerTestPost(id);
    return { id, title };
  } catch (error) {
    // A save can create the post before a later readiness assertion fails.
    // Register that ID too, so the fixture still removes partial test state.
    const id = await currentPostId(page).catch(() => 0);
    if (id > 0) registerTestPost(id);
    throw error;
  }
}
