/**
 * The Post editor canvas must lay a story out like the published page: prose in
 * the 760px column, wide blocks centred at 1040px, full-width blocks breaking out
 * to the canvas, whatever width class the active theme gives the root block list.
 */
import { expect, test } from "./fixtures";
import { waitForEditorReady } from "./editor-helpers";
import { createEditorDraft } from "./story-helpers";

test("prose is 760px and wide / full-width blocks centre on it in the editor canvas", async ({ adminPage: page, adminSession }) => {
  await createEditorDraft(page, adminSession.registerTestPost, "canvas geometry");
  await page.evaluate(() => {
    const wp = (window as any).wp;
    const photo = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700"><rect width="1600" height="700" fill="#789"/></svg>');
    wp.data.dispatch("core/block-editor").resetBlocks([
      wp.blocks.createBlock("core/paragraph", { content: "Prose sits in the reading column." }),
      wp.blocks.createBlock("core/image", { url: photo, alt: "Wide", align: "wide" }),
      wp.blocks.createBlock("core/image", { url: photo, alt: "Full", align: "full" }),
      wp.blocks.createBlock("core/paragraph", { content: "More prose." })
    ]);
  });
  const editor = await waitForEditorReady(page);
  const canvas = editor.canvas;
  for (const width of [1440, 1100, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await canvas.locator(".is-root-container").evaluate((root) => {
      const rect = (element: Element | null) => { const box = element!.getBoundingClientRect(); return { left: box.left, width: box.width }; };
      const blocks = Array.from(root.children).filter((child) => child.classList.contains("wp-block"));
      const wrapper = root.closest(".editor-styles-wrapper")!;
      const padding = parseFloat(getComputedStyle(wrapper).paddingInline);
      return { prose: rect(blocks[0]), wide: rect(blocks[1]), full: rect(blocks[2]), canvas: wrapper.clientWidth - padding * 2 };
    });
    expect(boxes.prose.width, `prose at ${width}px`).toBeLessThanOrEqual(760.5);
    const proseCentre = boxes.prose.left + boxes.prose.width / 2;
    expect(boxes.wide.width, `wide at ${width}px`).toBeCloseTo(Math.min(1040, boxes.canvas), -1);
    expect(boxes.wide.left + boxes.wide.width / 2, `wide centre at ${width}px`).toBeCloseTo(proseCentre, 0);
    expect(boxes.full.width, `full at ${width}px`).toBeCloseTo(Math.min(1440, boxes.canvas), -1);
    expect(boxes.full.left + boxes.full.width / 2, `full centre at ${width}px`).toBeCloseTo(proseCentre, 0);
  }
});
