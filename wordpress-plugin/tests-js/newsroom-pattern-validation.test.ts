// @vitest-environment jsdom

import { createElement } from "@wordpress/element";
import {
  __unstableGetInnerBlocksProps,
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

type Attributes = Record<string, unknown>;

const CORE_BLOCKS = [
  "core/paragraph",
  "core/heading",
  "core/image",
  "core/details",
  "core/group",
  "core/columns",
  "core/column",
  "core/buttons",
  "core/button",
  "core/list",
  "core/list-item",
  "core/quote"
];

const DYNAMIC_NEWSROOM_BLOCKS = [
  "byline/people",
  "byline/stories",
  "byline/sports-schedule",
  "byline/events",
  "byline/game-score",
  "byline/poll"
];

const STATIC_NEWSROOM_BLOCKS = ["byline/correction-notice"];

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function block(name: string, attributes: Attributes = {}, content = "") {
  const serializedName = name.startsWith("core/") ? name.slice(5) : name;
  const json = Object.keys(attributes).length > 0 ? ` ${JSON.stringify(attributes)}` : "";
  return `<!-- wp:${serializedName}${json} -->${content}<!-- /wp:${serializedName} -->`;
}

function paragraph(text: string, attributes: Attributes = {}) {
  return block("core/paragraph", attributes, `<p>${escapeHtml(text)}</p>`);
}

function heading(text: string, level = 2) {
  return block("core/heading", { level }, `<h${level} class="wp-block-heading">${escapeHtml(text)}</h${level}>`);
}

function button(text: string, url = "/") {
  return block("core/button", { url }, `<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${escapeHtml(url)}">${escapeHtml(text)}</a></div>`);
}

function buttons(content: string, attributes: Attributes = {}) {
  const className = ["wp-block-buttons", attributes.className].filter(Boolean).join(" ");
  return block("core/buttons", attributes, `<div class="${className}">${content}</div>`);
}

function image(alt: string, sizeSlug = "") {
  const attributes: Attributes = { alt };
  const classes = ["wp-block-image", sizeSlug ? `size-${sizeSlug}` : ""].filter(Boolean).join(" ");
  if (sizeSlug) attributes.sizeSlug = sizeSlug;
  return block("core/image", attributes, `<figure class="${classes}"><img alt="${escapeHtml(alt)}" /></figure>`);
}

function list(items: string[], attributes: Attributes = {}) {
  const className = ["wp-block-list", attributes.className].filter(Boolean).join(" ");
  const itemBlocks = items.map((item) => block("core/list-item", {}, `<li>${item}</li>`)).join("");
  return block("core/list", attributes, `<ul class="${className}">${itemBlocks}</ul>`);
}

function details(summary: string, answer: string, attributes: Attributes = {}) {
  return block(
    "core/details",
    { summary, ...attributes },
    `<details class="${["wp-block-details", attributes.className].filter(Boolean).join(" ")}"><summary>${escapeHtml(summary)}</summary>${paragraph(answer)}</details>`
  );
}

function group(content: string, attributes: Attributes = {}) {
  return block("core/group", attributes, `<div class="${["wp-block-group", attributes.className].filter(Boolean).join(" ")}">${content}</div>`);
}

function column(content: string) {
  return block("core/column", {}, `<div class="wp-block-column">${content}</div>`);
}

function columns(content: string) {
  return block("core/columns", {}, `<div class="wp-block-columns">${content}</div>`);
}

function quote(text: string, citation: string, className: string) {
  return block("core/quote", { className }, `<blockquote class="wp-block-quote ${className}">${paragraph(text)}<cite>${escapeHtml(citation)}</cite></blockquote>`);
}

function pageSection(headingText: string, content: string, featured = false) {
  return block("byline/page-section", { heading: headingText, ...(featured ? { className: "is-style-featured" } : {}) }, content);
}

function dynamic(name: string, attributes: Attributes = {}) {
  return block(name, attributes);
}

function registerCoreValidationBlocks() {
  for (const name of [...CORE_BLOCKS, ...DYNAMIC_NEWSROOM_BLOCKS, ...STATIC_NEWSROOM_BLOCKS]) {
    if (getBlockType(name)) unregisterBlockType(name);
  }

  registerBlockType("core/paragraph", {
    apiVersion: 3,
    title: "Paragraph",
    category: "text",
    attributes: {
      content: { type: "string", source: "html", selector: "p" },
      metadata: { type: "object" }
    },
    save: ({ attributes }: any) => createElement("p", null, attributes.content || "")
  } as any);

  registerBlockType("core/heading", {
    apiVersion: 3,
    title: "Heading",
    category: "text",
    attributes: {
      content: { type: "string", source: "html", selector: "h1,h2,h3,h4,h5,h6" },
      level: { type: "number", default: 2 }
    },
    save: ({ attributes }: any) => createElement(`h${attributes.level || 2}`, { className: "wp-block-heading" }, attributes.content || "")
  } as any);

  registerBlockType("core/image", {
    apiVersion: 3,
    title: "Image",
    category: "media",
    attributes: {
      url: { type: "string", source: "attribute", selector: "img", attribute: "src" },
      alt: { type: "string", source: "attribute", selector: "img", attribute: "alt" },
      sizeSlug: { type: "string" }
    },
    save: ({ attributes }: any) => createElement(
      "figure",
      { className: ["wp-block-image", attributes.sizeSlug ? `size-${attributes.sizeSlug}` : ""].filter(Boolean).join(" ") },
      createElement("img", { ...(attributes.url ? { src: attributes.url } : {}), alt: attributes.alt || "" })
    )
  } as any);

  registerBlockType("core/details", {
    apiVersion: 3,
    title: "Details",
    category: "text",
    attributes: {
      summary: { type: "string", source: "html", selector: "summary" },
      className: { type: "string" }
    },
    save: ({ attributes }: any) => createElement(
      "details",
      { className: ["wp-block-details", attributes.className].filter(Boolean).join(" ") },
      createElement("summary", null, attributes.summary || ""),
      __unstableGetInnerBlocksProps().children
    )
  } as any);

  registerBlockType("core/group", {
    apiVersion: 3,
    title: "Group",
    category: "design",
    attributes: { className: { type: "string" } },
    save: ({ attributes }: any) => createElement("div", { className: ["wp-block-group", attributes.className].filter(Boolean).join(" ") }, __unstableGetInnerBlocksProps().children)
  } as any);

  registerBlockType("core/columns", {
    apiVersion: 3,
    title: "Columns",
    category: "design",
    save: () => createElement("div", { className: "wp-block-columns" }, __unstableGetInnerBlocksProps().children)
  } as any);

  registerBlockType("core/column", {
    apiVersion: 3,
    title: "Column",
    category: "design",
    save: () => createElement("div", { className: "wp-block-column" }, __unstableGetInnerBlocksProps().children)
  } as any);

  registerBlockType("core/buttons", {
    apiVersion: 3,
    title: "Buttons",
    category: "design",
    attributes: { className: { type: "string" } },
    save: ({ attributes }: any) => createElement("div", { className: ["wp-block-buttons", attributes.className].filter(Boolean).join(" ") }, __unstableGetInnerBlocksProps().children)
  } as any);

  registerBlockType("core/button", {
    apiVersion: 3,
    title: "Button",
    category: "design",
    attributes: {
      url: { type: "string", source: "attribute", selector: "a", attribute: "href" },
      text: { type: "string", source: "html", selector: "a" }
    },
    save: ({ attributes }: any) => createElement(
      "div",
      { className: "wp-block-button" },
      createElement("a", { className: "wp-block-button__link wp-element-button", href: attributes.url || "/" }, attributes.text || "")
    )
  } as any);

  registerBlockType("core/list", {
    apiVersion: 3,
    title: "List",
    category: "text",
    attributes: { className: { type: "string" }, ordered: { type: "boolean", default: false } },
    save: ({ attributes }: any) => createElement(attributes.ordered ? "ol" : "ul", { className: ["wp-block-list", attributes.className].filter(Boolean).join(" ") }, __unstableGetInnerBlocksProps().children)
  } as any);

  registerBlockType("core/list-item", {
    apiVersion: 3,
    title: "List Item",
    category: "text",
    attributes: { content: { type: "string", source: "html", selector: "li" } },
    save: ({ attributes }: any) => createElement("li", { dangerouslySetInnerHTML: { __html: attributes.content || "" } })
  } as any);

  registerBlockType("core/quote", {
    apiVersion: 3,
    title: "Quote",
    category: "text",
    attributes: {
      className: { type: "string" },
      citation: { type: "string", source: "html", selector: "cite" }
    },
    save: ({ attributes }: any) => createElement(
      "blockquote",
      { className: ["wp-block-quote", attributes.className].filter(Boolean).join(" ") },
      __unstableGetInnerBlocksProps().children,
      createElement("cite", null, attributes.citation || "")
    )
  } as any);

  for (const name of DYNAMIC_NEWSROOM_BLOCKS) {
    registerBlockType(name, { apiVersion: 3, title: name, category: "text", save: () => null } as any);
  }

  registerBlockType("byline/correction-notice", {
    apiVersion: 3,
    title: "Correction Notice",
    category: "text",
    attributes: {
      type: { type: "string", default: "correction" },
      date: { type: "string" },
      notice: { type: "string", source: "html", selector: ".byline-correction-notice-body" }
    },
    save: ({ attributes }: any) => createElement(
      "aside",
      {
        className: `wp-block-byline-correction-notice byline-correction-notice byline-correction-notice-${attributes.type || "correction"}`,
        "data-correction-type": attributes.type || "correction"
      },
      createElement("p", { className: "byline-correction-notice-label" }, attributes.type === "clarification" ? "Clarification" : attributes.type === "editors-note" ? "Editor's note" : "Correction"),
      createElement("p", { className: "byline-correction-notice-body", dangerouslySetInnerHTML: { __html: attributes.notice || "" } }),
      attributes.date ? createElement("time", { dateTime: attributes.date }, attributes.date) : null
    )
  } as any);

  // The source module is the production Page Section save contract: only
  // InnerBlocks.Content is persisted, while render.php owns the wrapper.
  if (getBlockType("byline/page-section")) {
    return Promise.resolve();
  }

  return import("../src/blocks/page-section/index").then(() => {
    if (!getBlockType("byline/page-section")) {
      throw new Error("Page Section did not register");
    }
  });
}

const publicationBinding = {
  metadata: {
    bindings: {
      content: {
        source: "byline/publication",
        args: { key: "name" }
      }
    }
  }
};

const patterns: Record<string, string> = {
  "byline/information-page": pageSection("Information", paragraph("Introduce the purpose of this page, then add the details readers need.")) + pageSection("Details", paragraph("Add the dates, process, contacts, or supporting context that belongs here.")) + pageSection("What to expect", paragraph("Describe the next steps or useful background for readers.")) + pageSection("Contact", paragraph("Add a public contact route or invitation for questions.")),
  "byline/about-mission-page": pageSection("About the publication", paragraph("Explain who you are, what you cover, and how your work serves readers.")) + pageSection("Mission", paragraph("Add the principles that guide this publication.")) + pageSection("Values", paragraph("Describe the commitments readers should expect from this newsroom.")) + pageSection("Get involved", paragraph("Invite readers or contributors to take a next step.") + button("Get in touch", "/contact/"), true),
  "byline/policy-standards-page": pageSection("Standards", paragraph("State the policy in plain language.")) + pageSection("Corrections and transparency", paragraph("Explain how the newsroom handles corrections, updates, and questions.")) + pageSection("Questions", paragraph("Explain how readers can ask for clarification or report a concern.")),
  "byline/join-recruiting-page": pageSection("Join the newsroom", paragraph("Describe who can participate, what the work involves, and how to get started.")) + pageSection("Ways to contribute", paragraph("List the roles, projects, or skills that could help this publication.")) + pageSection("What you will learn", paragraph("Describe the experience and support contributors can expect.")) + pageSection("Take the next step", paragraph("Add an invitation or deadline.") + button("Get in touch", "/contact/"), true),
  "byline/contact-feedback-page": pageSection("Contact", paragraph("Publication name", publicationBinding) + paragraph("Contact this publication with a question, tip, correction, or feedback.") + paragraph("Add the appropriate contact details and response expectations.")) + pageSection("Feedback and corrections", paragraph("Tell readers how to report a correction or share feedback.") + button("Send feedback", "/contact/"), true),
  "byline/leadership-page": pageSection("Leadership", paragraph("Introduce the people responsible for this publication.")) + dynamic("byline/people", { source: "selected", layout: "portrait-grid", showBio: true }) + pageSection("Contact leadership", paragraph("Add a public route for questions about the newsroom.") + button("Get in touch", "/contact/"), true),
  "byline/staff-directory": pageSection("Staff", paragraph("Introduce the people who report, edit, photograph, and support this publication.")) + dynamic("byline/people", { source: "all", layout: "portrait-grid", showPhoto: true, showRole: true, showBio: true }),
  "byline/special-coverage": pageSection("Special coverage", paragraph("Add a concise introduction to the reporting project.")) + dynamic("byline/stories", { heading: "Latest coverage", source: "latest", layout: "featured", limit: 6, showExcerpt: true }) + pageSection("Stay informed", paragraph("Add context, related links, or a call to follow this coverage.")),
  "byline/sports-coverage": pageSection("Sports", paragraph("Introduce the team, season, or sports project.")) + dynamic("byline/sports-schedule", { heading: "Schedule and results", display: "both" }) + dynamic("byline/stories", { heading: "Latest sports stories", source: "latest", layout: "list", limit: 6 }),
  "byline/event-campaign": pageSection("Event or campaign", paragraph("Explain the event or campaign and why readers should care.")) + dynamic("byline/events", { heading: "Upcoming dates", limit: 5 }) + dynamic("byline/stories", { heading: "Related coverage", source: "latest", layout: "list", limit: 4 }) + pageSection("Learn more", paragraph("Add a final invitation or public information link.") + button("Learn more", "/"), true),
  "byline/photo-led-page": pageSection("Lead image", image("Add a lead image", "large")) + pageSection("The story behind the image", paragraph("Add context, captions, and reporting below the lead image.")),
  "byline/resource-page": pageSection("Resources", paragraph("Add a short explanation of how to use this resource list.") + list(["Add a resource link", "Add another resource link"], { className: "is-style-byline-resource-list" }) + button("Open a resource", "/")),
  "byline/faq-page": pageSection("Frequently asked questions", paragraph("Introduce the questions this page answers.")) + details("Question", "Add a concise answer.", { className: "is-style-byline-faq" }) + details("Another question", "Add another answer.", { className: "is-style-byline-faq" }),
  "byline/two-column-image-text": pageSection("Image and text", columns(column(image("Add an image")) + column(heading("Add a heading", 3) + paragraph("Add supporting copy.")))),
  "byline/featured-cta": pageSection("Featured invitation", paragraph("Tell readers what to do next and why it matters.") + buttons(button("Take action"), { className: "is-style-byline-standard-cta" }), true),
  "byline/fact-box": group(heading("At a glance", 3) + list(["Add a key fact", "Add a second key fact", "Add a source or date"]), { className: "is-style-byline-soft-callout" }),
  "byline/key-numbers": columns(column(heading("00", 3) + paragraph("Label one")) + column(heading("00", 3) + paragraph("Label two")) + column(heading("00", 3) + paragraph("Label three"))),
  "byline/quote-callout": quote("Add a meaningful quote.", "Source or attribution", "is-style-byline-editorial-quote"),
  "byline/related-resources": heading("Related resources") + list(["<a href=\"/\">Add a related link</a>", "<a href=\"/\">Add another link</a>"], { className: "is-style-byline-link-list" }),
  "byline/corrections-feedback-cta": group(heading("See something we should fix?") + paragraph("Tell readers how to report a correction or share feedback.") + button("Contact the newsroom", "/"), { className: "is-style-byline-soft-callout" }),
  "byline/sports-game-recap": dynamic("byline/game-score", { source: "primary", showDetails: true, showLink: true }) + heading("What happened") + paragraph("Summarize the result, turning points, and voices from the game.") + heading("What is next") + paragraph("Add the next relevant game, practice, or story."),
  "byline/sports-game-preview": dynamic("byline/game-score", { source: "primary", showDetails: true, showLink: true }) + heading("The matchup") + paragraph("Set the scene with what readers should know before the game.") + heading("What to watch") + paragraph("Add players, trends, or context without inventing scores or live status."),
  "byline/correction-notice": block("byline/correction-notice", { type: "correction", date: "", notice: "Explain clearly what changed." }, `<aside class="wp-block-byline-correction-notice byline-correction-notice byline-correction-notice-correction" data-correction-type="correction"><p class="byline-correction-notice-label">Correction</p><p class="byline-correction-notice-body">Explain clearly what changed.</p></aside>`),
  "byline/fact-box-post": group(heading("Key facts", 3) + list(["Add a verified fact", "Add a source or date"]), { className: "is-style-byline-soft-callout" }),
  "byline/quote-callout-post": quote("Add a reported quote.", "Source or attribution", "is-style-byline-source-quote")
};

function assertValidTree(content: string, label = "pattern") {
  const parsed = parse(content);
  expect(parsed.length, label).toBeGreaterThan(0);

  const check = (blocks: any[]) => {
    for (const parsedBlock of blocks) {
      expect(parsedBlock.name).not.toBe("core/missing");
      expect(parsedBlock.isValid).toBe(true);
      expect(validateBlock(parsedBlock)[0]).toBe(true);
      expect(parsedBlock.validationIssues || []).toHaveLength(0);
      check(parsedBlock.innerBlocks || []);
    }
  };

  check(parsed);
  const serialized = serialize(parsed);
  const reparsed = parse(serialized);
  check(reparsed);
  expect(serialize(reparsed)).toBe(serialized);
  return serialized;
}

describe("Newsroom pattern Gutenberg validation", () => {
  it("round-trips every registered newsroom pattern through the real block parser", async () => {
    await registerCoreValidationBlocks();

    for (const [name, content] of Object.entries(patterns)) {
      const serialized = assertValidTree(content, name);
      expect(serialized, name).not.toContain("<section class=\"wp-block-byline-page-section");
    }
  });

  it("uses canonical saved shapes for the risky Core blocks", async () => {
    await registerCoreValidationBlocks();

    const photo = assertValidTree(patterns["byline/photo-led-page"]);
    const faq = assertValidTree(patterns["byline/faq-page"]);
    const twoColumn = assertValidTree(patterns["byline/two-column-image-text"]);
    const quoteCallout = assertValidTree(patterns["byline/quote-callout"]);
    const resource = assertValidTree(patterns["byline/resource-page"]);

    expect(photo).not.toContain("src=\"\"");
    expect(faq).toContain("<!-- wp:paragraph -->");
    expect(faq).not.toMatch(/<summary>Question<\/summary>\s*<p>Add a concise answer\.<\/p>/s);
    expect(twoColumn).toContain("<!-- wp:columns -->");
    expect(twoColumn).toContain("<!-- wp:column -->");
    expect(quoteCallout).toContain("<!-- wp:paragraph -->");
    expect(resource).toContain("<!-- wp:list-item -->");
  });
});
