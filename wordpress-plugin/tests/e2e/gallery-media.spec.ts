import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";
import { saveEditorDraft, waitForBylineEditorReady, waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

const repoRoot = path.resolve(__dirname, "../../..");

type Media = { id: number; source_url: string; media_details: { width: number; height: number; sizes: Record<string, { source_url: string; width: number }> } };

/**
 * Real 2400x1600 JPEGs, so WordPress generates its genuine derivative set
 * (300, 768, 1024, 1536 and 2048px). SVG fixtures cannot exercise any of that.
 */
async function uploadPhoto(page: import("@playwright/test").Page, addCleanup: (callback: () => Promise<void>) => void, rest: Function, name: string) {
  const nonce = await page.evaluate(() => (window as any).wpApiSettings.nonce as string);
  const filename = `byline-gallery-${Date.now()}-${name}.jpg`;
  const uploaded = await page.request.post("/wp-json/wp/v2/media", {
    headers: { "X-WP-Nonce": nonce, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${filename}"` },
    data: await readFile(path.join(repoRoot, `tests/fixtures/story-media/photos/field-${name}.jpg`))
  });
  expect(uploaded.ok()).toBe(true);
  const media = await uploaded.json() as Media;
  addCleanup(async () => { await rest(`/wp/v2/media/${media.id}?force=true`, "DELETE"); });
  return media;
}

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const images = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

test("a newly inserted Photo Gallery renders responsive images and links the full original", async ({ adminPage: page, adminSession }) => {
  test.setTimeout(150_000);
  const first = await uploadPhoto(page, adminSession.addCleanup, adminSession.rest, "a");
  const second = await uploadPhoto(page, adminSession.addCleanup, adminSession.rest, "b");
  expect(first.media_details).toMatchObject({ width: 2400, height: 1600 });
  const story = await createEditorDraft(page, adminSession.registerTestPost, "gallery media");
  await page.reload({ waitUntil: "domcontentloaded" });
  const editor = await waitForEditorReady(page);

  await page.evaluate(() => {
    const wp = (window as any).wp;
    const variation = wp.blocks.getBlockVariations("core/gallery").find((candidate: any) => candidate.name === "byline-photo-gallery");
    wp.data.dispatch("core/block-editor").insertBlocks(wp.blocks.createBlock("core/gallery", { ...variation.attributes }));
  });
  // The real Gutenberg path: choose photographs in the media library, then create the gallery.
  await editor.canvas.getByRole("button", { name: "Media Library" }).click();
  const modal = page.locator(".media-modal");
  await modal.locator(`li.attachment[data-id="${first.id}"]`).click();
  // The two photographs were uploaded back to back, so a Shift range selects exactly them.
  await modal.locator(`li.attachment[data-id="${second.id}"]`).click({ modifiers: ["Shift"] });
  await modal.getByRole("button", { name: /Create a new gallery/ }).click();
  await modal.getByRole("button", { name: /Insert gallery/ }).click();
  await expect(editor.canvas.locator(".is-style-byline-photo-gallery figure.wp-block-image")).toHaveCount(2);

  // Saved content is untouched Core markup and reopens without block-validation errors.
  const saved = await page.evaluate(() => {
    const wp = (window as any).wp;
    const serialized = wp.blocks.serialize(wp.data.select("core/block-editor").getBlocks());
    const invalid = wp.blocks.parse(serialized).flatMap(function walk(block: any): string[] { return [...(!block.isValid ? [block.name] : []), ...block.innerBlocks.flatMap(walk)]; });
    return { serialized, invalid };
  });
  expect(saved.invalid).toEqual([]);
  expect(saved.serialized).toContain('"linkTo":"media"');
  expect(saved.serialized).not.toContain("data-byline-full-url");
  await saveEditorDraft(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorReady(page);
  await expect(page.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);

  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${story.id}`);
  const rendered = response.payload.content.rendered;
  const tags = images(rendered);
  expect(tags).toHaveLength(2);

  for (const [tag, media] of [[tags.find((candidate) => attribute(candidate, "class")?.includes(`wp-image-${first.id}`))!, first], [tags.find((candidate) => attribute(candidate, "class")?.includes(`wp-image-${second.id}`))!, second]] as const) {
    const large = media.media_details.sizes.large;
    // Attachment identity, dimensions and the inline derivative are preserved.
    expect(attribute(tag, "data-id")).toBe(String(media.id));
    expect(attribute(tag, "src")).toBe(large.source_url);
    expect([attribute(tag, "width"), attribute(tag, "height")]).toEqual(["1024", "683"]);
    // The full original is exposed to the lightbox and is the ordinary media link.
    expect(attribute(tag, "data-byline-full-url")).toBe(media.source_url);
    expect(rendered).toContain(`<a href="${media.source_url}"><img`);
    // Responsive candidates cover high-DPI use without downloading the original.
    const widths = attribute(tag, "srcset")!.split(",").map((candidate) => parseInt(candidate.trim().split(/\s+/)[1], 10)).sort((a, b) => a - b);
    expect(widths).toEqual(expect.arrayContaining([300, 768, 1024, 1536]));
    expect(Math.max(...widths)).toBeLessThanOrEqual(2048);
    expect(attribute(tag, "srcset")).not.toContain(`${media.source_url} `);
    // A three-column gallery cell, not the generic 1024px slot.
    const sizes = attribute(tag, "sizes")!;
    expect(sizes).toContain("(max-width: 540px) calc(100vw - 32px)");
    expect(sizes).toContain("(max-width: 900px) calc((100vw - 32px - 18px) / 2)");
    expect(sizes).toContain("335px");
  }
});

test("existing galleries render the same delivery metadata without being rewritten", async ({ adminPage: page, adminSession }) => {
  test.setTimeout(120_000);
  const photo = await uploadPhoto(page, adminSession.addCleanup, adminSession.rest, "c");
  const large = photo.media_details.sizes.large.source_url;
  const image = (link: string) => `<!-- wp:image {"id":${photo.id},"sizeSlug":"large"${link ? ',"linkDestination":"media"' : ""}} -->\n<figure class="wp-block-image size-large">${link ? `<a href="${link}">` : ""}<img src="${large}" alt="Legacy photograph" class="wp-image-${photo.id}"/>${link ? "</a>" : ""}<figcaption class="wp-element-caption">Caption. Photo: Staff</figcaption></figure>\n<!-- /wp:image -->`;
  const gallery = (className: string, inner: string[]) => `<!-- wp:gallery {"columns":3,"linkTo":"media","className":"${className}"} -->\n<figure class="wp-block-gallery has-nested-images columns-3 ${className}">${inner.join("\n\n")}</figure>\n<!-- /wp:gallery -->`;
  const content = [
    // Photo Gallery with an unlinked image, an image linked to the 1024px derivative, a custom link, and an attachment-page link.
    gallery("is-style-byline-photo-gallery", [image(""), image(large), image("https://example.org/story/"), image(`http://localhost:8888/?attachment_id=${photo.id}`)]),
    // Photo Pair gets responsive sizes only; other galleries are left alone.
    gallery("is-style-byline-photo-pair", [image(large), image(large)]),
    gallery("is-style-byline-news-grid", [image(large)]),
    image("")
  ].join("\n\n");
  const created = await adminSession.rest<{ id: number }>("/wp/v2/posts", "POST", { title: `Legacy gallery media ${Date.now()}`, status: "draft", content });
  expect(created.ok).toBe(true);
  adminSession.registerTestPost(created.payload.id);

  const raw = await adminSession.rest<{ content: { raw: string } }>(`/wp/v2/posts/${created.payload.id}?context=edit`);
  expect(raw.payload.content.raw).toBe(content);

  const response = await adminSession.rest<{ content: { rendered: string } }>(`/wp/v2/posts/${created.payload.id}`);
  const rendered = response.payload.content.rendered;
  const galleries = rendered.split("<figure class=\"wp-block-gallery").slice(1);
  const [photoGallery, pair, newsGrid] = galleries;

  // Photo Gallery: every image knows its original; unlinked images stay unlinked.
  expect(images(photoGallery).every((tag) => attribute(tag, "data-byline-full-url") === photo.source_url)).toBe(true);
  expect(photoGallery.match(/<a /g)).toHaveLength(3);
  expect(photoGallery).toContain(`<a href="${photo.source_url}"><img`);
  expect(photoGallery).not.toContain(`<a href="${large}"`);
  expect(photoGallery).toContain('<a href="https://example.org/story/">');
  expect(photoGallery).toContain(`attachment_id=${photo.id}"><img`);
  // The inline image is still a derivative with its own matching dimensions.
  expect(images(photoGallery).every((tag) => attribute(tag, "src") === large && attribute(tag, "width") === "1024" && attribute(tag, "srcset")?.includes("1536w"))).toBe(true);

  // Photo Pair: two columns of sizes, no rewritten links.
  expect(images(pair).every((tag) => attribute(tag, "sizes")?.includes("calc((100vw - 32px - 18px) / 2)") && attribute(tag, "sizes")?.endsWith("(max-width: 1072px) calc((100vw - 32px - 18px) / 2), 511px"))).toBe(true);
  expect(pair).toContain(`<a href="${large}"`);
  // Other galleries keep Core's output apart from the neutral full-size metadata.
  expect(newsGrid).toContain(`<a href="${large}"`);
  expect(attribute(images(newsGrid)[0], "sizes")).not.toContain("335px");

  // A standalone image still advertises its original, and keeps its width/height/srcset.
  const standalone = images(rendered.slice(rendered.lastIndexOf("<figure class=\"wp-block-image")))[0];
  expect(attribute(standalone, "data-byline-full-url")).toBe(photo.source_url);
  expect(attribute(standalone, "width")).toBe("1024");

  // The editor reads the untouched legacy content without validation errors.
  await page.goto(`/wp-admin/post.php?post=${created.payload.id}&action=edit`, { waitUntil: "domcontentloaded" });
  await waitForBylineEditorReady(page);
  await expect(page.getByText(/This block contains unexpected or invalid content/)).toHaveCount(0);
});
