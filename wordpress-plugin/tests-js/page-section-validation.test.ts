// @vitest-environment jsdom

import { createElement } from "@wordpress/element";
import {
  __unstableGetInnerBlocksProps,
  createBlock,
  getBlockType,
  parse,
  registerBlockType,
  serialize,
  unregisterBlockType,
  validateBlock
} from "@wordpress/blocks";
import { describe, expect, it, vi } from "vitest";

vi.mock("@wordpress/components", () => ({
  PanelBody: () => null,
  SelectControl: () => null
}));

function registerValidationBlocks() {
  for (const name of ["core/paragraph", "core/button", "core/buttons"]) {
    if (getBlockType(name)) unregisterBlockType(name);
  }

  registerBlockType("core/paragraph", {
    apiVersion: 3,
    title: "Paragraph",
    category: "text",
    attributes: {
      content: { type: "string", source: "html", selector: "p" }
    },
    save: ({ attributes }: any) => createElement("p", null, attributes.content || "")
  } as any);

  registerBlockType("core/button", {
    apiVersion: 3,
    title: "Button",
    category: "design",
    attributes: {
      url: { type: "string" },
      text: { type: "string", source: "html", selector: "a" }
    },
    save: ({ attributes }: any) => createElement(
      "div",
      { className: "wp-block-button" },
      createElement(
        "a",
        {
          className: "wp-block-button__link wp-element-button",
          href: attributes.url || ""
        },
        attributes.text || ""
      )
    )
  } as any);

  registerBlockType("core/buttons", {
    apiVersion: 3,
    title: "Buttons",
    category: "design",
    attributes: {
      className: { type: "string" }
    },
    save: ({ attributes }: any) => {
      const className = ["wp-block-buttons", attributes.className].filter(Boolean).join(" ");
      return createElement("div", { className }, __unstableGetInnerBlocksProps().children);
    }
  } as any);

  // Importing the source registers this block with the exact save function
  // shipped by the plugin. The block-editor import above is only a test seam.
  return import("../src/blocks/page-section/index");
}

async function getValidationApi() {
  await registerValidationBlocks();
  const pageSection = getBlockType("byline/page-section");
  expect(pageSection).toBeDefined();
  return pageSection!;
}

function assertValid(content: string) {
  const parsed = parse(content);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].name).toBe("byline/page-section");
  expect(parsed[0].isValid).toBe(true);
  expect(validateBlock(parsed[0])[0]).toBe(true);

  const roundTrip = serialize(parsed);
  const reparsed = parse(roundTrip);
  expect(reparsed[0].isValid).toBe(true);
  expect(validateBlock(reparsed[0])[0]).toBe(true);
  return reparsed[0];
}

function assertDocumentValid(content: string) {
  const parsed = parse(content);
  expect(parsed.length).toBeGreaterThan(0);
  const checkTree = (blocks: any[]) => {
    for (const block of blocks) {
      expect(block.isValid).toBe(true);
      checkTree(block.innerBlocks || []);
    }
  };
  checkTree(parsed);
  const reparsed = parse(serialize(parsed));
  checkTree(reparsed);
}

describe("Page Section Gutenberg validation", () => {
  it("validates migrated content through the real parser and save contract", async () => {
    await getValidationApi();
    const migrated = `<!-- wp:byline/page-section {"heading":"Accessibility"} -->
<!-- wp:paragraph -->
<p>Editor-authored paragraph.</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph -->
<p>A second paragraph.</p>
<!-- /wp:paragraph -->
<!-- /wp:byline/page-section -->`;

    assertValid(migrated);
  });

  it("stays valid when headings, styles, paragraphs, and buttons change", async () => {
    await getValidationApi();
    let section = createBlock("byline/page-section", {
      heading: "Accessibility",
      headingLevel: 2,
      align: "wide",
      anchor: "accessibility"
    }, [createBlock("core/paragraph", { content: "First paragraph." })]);

    let content = serialize([section]);
    const parsedHeading = assertValid(content);
    parsedHeading.attributes.heading = "Updated heading";
    content = serialize([parsedHeading]);
    const parsedStyle = assertValid(content);
    parsedStyle.attributes.className = "is-style-featured";
    content = serialize([parsedStyle]);
    const parsedParagraph = assertValid(content);
    parsedParagraph.innerBlocks.push(createBlock("core/paragraph", { content: "Added paragraph." }));
    content = serialize([parsedParagraph]);
    const parsedButton = assertValid(content);
    parsedButton.innerBlocks.push(createBlock("core/buttons", {}, [
      createBlock("core/button", { url: "/feedback/", text: "Share Feedback" })
    ]));
    content = serialize([parsedButton]);
    const withButtons = assertValid(content);
    withButtons.innerBlocks = withButtons.innerBlocks.filter((block: any) => block.name !== "core/buttons");
    assertValid(serialize([withButtons]));

    // Keep this assertion tied to the canonical persistence model rather than
    // merely checking that a comment exists in the output.
    expect(content).toContain("<!-- wp:byline/page-section");
    expect(content).not.toContain("<section");
    expect(getBlockType("byline/page-section")?.save).toBeTypeOf("function");
  });

  it("validates every shipped Page pattern shape", async () => {
    await getValidationApi();
    const paragraph = (content: string) => createBlock("core/paragraph", { content });
    const buttons = createBlock("core/buttons", {}, [
      createBlock("core/button", { url: "/", text: "Learn more" })
    ]);
    const section = (heading: string, featured = false, children: any[] = [paragraph("Add the main point for this section.")]) => createBlock(
      "byline/page-section",
      { heading, ...(featured ? { className: "is-style-featured" } : {}) },
      children
    );
    const patterns = [
      [section("Section heading", false, [paragraph("One."), paragraph("Two.")])],
      [section("Featured callout", true, [paragraph("Copy."), buttons])],
      [section("First callout", true, [paragraph("First."), buttons]), section("Second callout", true, [paragraph("Second."), buttons])],
      [section("Introduction"), section("Details"), section("What to expect"), section("Next steps")],
      [section("Effective date"), section("Policy"), section("Questions")]
    ];

    for (const pattern of patterns) {
      const content = serialize(pattern);
      assertDocumentValid(content);
      expect(content).not.toContain("<section");
    }
  });
});
