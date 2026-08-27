import { describe, expect, it } from "vitest";
import { LEAD_PACKAGE_TYPE, WEEKLY_WILDCAT_LEAD_DEFAULTS, parseBylineDesignDocumentV2 } from "@byline/design";
import {
  designDocumentToEditorState,
  editorStateToDesignDocument,
  loadDesignIntoEditor
} from "../src/studio-document";

// What Studio actually persists. The review found it was still writing Puck's
// schema 1 shape, so these pin the boundary: Puck stays inside the editor.
describe("Studio persists schema 2", () => {
  const editorState = {
    root: { props: {} },
    content: [
      {
        type: LEAD_PACKAGE_TYPE,
        props: { id: "home-lead", ...WEEKLY_WILDCAT_LEAD_DEFAULTS }
      }
    ]
  };

  it("writes a semantic document with no editor internals", () => {
    const document = editorStateToDesignDocument(editorState, "home", "weekly-wildcat");

    expect(document.schemaVersion).toBe(2);
    expect(document.template).toBe("home");
    expect(document.theme).toBe("weekly-wildcat");

    // The three keys that must never reach WordPress again.
    expect(document).not.toHaveProperty("editor");
    expect(document).not.toHaveProperty("layout");
    expect(document).not.toHaveProperty("root");

    // Nor may Puck's structure hide inside a package.
    expect(JSON.stringify(document)).not.toMatch(/"(zones|editor|layout)"/);
  });

  it("produces a document the canonical parser accepts", () => {
    const document = editorStateToDesignDocument(editorState, "home", "weekly-wildcat");

    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
  });

  it("keeps the package id as identity, not as a setting", () => {
    const document = editorStateToDesignDocument(editorState, "home", "weekly-wildcat");

    expect(document.packages[0].id).toBe("home-lead");
    expect(document.packages[0].props).not.toHaveProperty("id");
  });

  it("does not persist unknown editor items as packages", () => {
    const document = editorStateToDesignDocument(
      { root: { props: {} }, content: [...editorState.content, { type: "opinion-package", props: {} }] },
      "home",
      "weekly-wildcat"
    );

    expect(document.packages).toHaveLength(1);
    expect(document.packages[0].type).toBe(LEAD_PACKAGE_TYPE);
  });

  it("gives duplicated packages distinct ids so configuration cannot collide", () => {
    const duplicated = {
      root: { props: {} },
      content: [editorState.content[0], { ...editorState.content[0] }]
    };
    const document = editorStateToDesignDocument(duplicated, "home", "weekly-wildcat");

    expect(document.packages).toHaveLength(2);
    expect(document.packages[0].id).not.toBe(document.packages[1].id);
    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
  });

  it("round-trips without drift", () => {
    const document = editorStateToDesignDocument(editorState, "home", "weekly-wildcat");
    const reloaded = editorStateToDesignDocument(
      designDocumentToEditorState(document),
      "home",
      "weekly-wildcat"
    );

    expect(reloaded).toEqual(document);
  });
});

describe("Studio loads either stored schema", () => {
  it("loads a v2 document straight into editor state", () => {
    const document = {
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }]
    };
    const loaded = loadDesignIntoEditor(document, "home");

    expect(loaded.migratedFromV1).toBe(false);
    expect(loaded.migrationWarnings).toEqual([]);
    expect(loaded.editorState.content[0].props.id).toBe("home-lead");
  });

  it("migrates a stored v1 document explicitly and reports what did not convert", () => {
    const v1 = {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: {
        root: { props: {} },
        content: [
          { type: "story-lead", props: { id: "story-lead-1" } },
          { type: "sports-scores", props: {} }
        ]
      }
    };
    const loaded = loadDesignIntoEditor(v1, "home");

    expect(loaded.migratedFromV1).toBe(true);
    expect(loaded.editorState.content).toHaveLength(1);
    expect(loaded.editorState.content[0].type).toBe(LEAD_PACKAGE_TYPE);
    expect(loaded.migrationWarnings.some((warning) => warning.includes("sports-scores"))).toBe(true);
  });

  it("saving a migrated v1 design writes v2", () => {
    const v1 = {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: { root: { props: {} }, content: [{ type: "story-lead", props: { id: "story-lead-1" } }] }
    };
    const saved = editorStateToDesignDocument(loadDesignIntoEditor(v1, "home").editorState, "home", "weekly-wildcat");

    expect(saved.schemaVersion).toBe(2);
    expect(saved).not.toHaveProperty("layout");
    // v1's lead block had no rail, and migration must not invent one.
    expect((saved.packages[0].props as { latest: { limit: number } }).latest.limit).toBe(0);
  });
});
