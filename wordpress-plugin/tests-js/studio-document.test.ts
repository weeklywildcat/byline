import { describe, expect, it } from "vitest";
import {
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  parseBylineDesignDocumentV2
} from "@byline/design";
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

// The migration promises to preserve blocks that have no v2 package yet. That
// promise is only real if the data survives the editor round trip: load,
// autosave, publish. It previously did not -- the load dropped the payload and
// every save rebuilt the document from recognised packages only, so opening a
// migrated design and touching anything destroyed those blocks for good.
describe("legacy migration data survives the editor round trip", () => {
  const v1WithUnconvertible = {
    schemaVersion: 1,
    template: "home",
    theme: "weekly-wildcat",
    editor: { engine: "puck", version: "0.23.0" },
    layout: {
      root: { props: {} },
      content: [
        { type: "story-lead", props: { id: "story-lead-1", query: { type: "sticky", limit: 1 } } },
        {
          type: "sports-scores",
          props: {
            id: "sports-scores-2",
            title: "Scoreboard",
            teamKey: "football-varsity",
            limit: 6,
            allowDuplicates: false
          }
        }
      ]
    }
  };

  const SPORTS_SCORES_PROPS = {
    id: "sports-scores-2",
    title: "Scoreboard",
    teamKey: "football-varsity",
    limit: 6,
    allowDuplicates: false
  };

  it("carries the unconverted block out of load", () => {
    const loaded = loadDesignIntoEditor(v1WithUnconvertible, "home");

    expect(loaded.legacy?.unconvertedBlocks).toEqual([{ type: "sports-scores", props: SPORTS_SCORES_PROPS }]);
    // It must not be exposed to Puck as an editable item.
    expect(loaded.editorState.content.map((item) => item.type)).toEqual([LEAD_PACKAGE_TYPE]);
  });

  it("preserves it byte-for-byte through an edit and save", () => {
    const loaded = loadDesignIntoEditor(v1WithUnconvertible, "home");

    // Edit the lead the way an editor would.
    const edited = {
      ...loaded.editorState,
      content: [
        {
          ...loaded.editorState.content[0],
          props: {
            ...loaded.editorState.content[0].props,
            latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 2 }
          }
        }
      ]
    };

    const saved = editorStateToDesignDocument(edited, "home", "weekly-wildcat", loaded.legacy);

    expect(saved.schemaVersion).toBe(2);
    expect(saved.packages).toHaveLength(1);
    expect(saved.packages[0].type).toBe(LEAD_PACKAGE_TYPE);
    expect((saved.packages[0].props as { latest: { limit: number } }).latest.limit).toBe(2);

    // The exact block, with its exact props.
    expect(saved.legacy?.unconvertedBlocks).toEqual([{ type: "sports-scores", props: SPORTS_SCORES_PROPS }]);
    expect(saved.legacy?.schemaVersion).toBe(1);
  });

  it("produces a document the canonical parser still accepts", () => {
    const loaded = loadDesignIntoEditor(v1WithUnconvertible, "home");
    const saved = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    expect(() => parseBylineDesignDocumentV2(saved, "home")).not.toThrow();
  });

  it("survives repeated autosaves without drift", () => {
    // Autosave and publish use the same conversion, so an autosave loop is the
    // realistic worst case: it runs on every keystroke pause.
    const loaded = loadDesignIntoEditor(v1WithUnconvertible, "home");
    let document = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    for (let pass = 0; pass < 3; pass += 1) {
      const reloaded = loadDesignIntoEditor(document, "home");

      expect(reloaded.migratedFromV1).toBe(false);
      document = editorStateToDesignDocument(reloaded.editorState, "home", "weekly-wildcat", reloaded.legacy);
    }

    expect(document.legacy?.unconvertedBlocks).toEqual([{ type: "sports-scores", props: SPORTS_SCORES_PROPS }]);
  });

  it("omitting the payload is the data loss this guards against", () => {
    const loaded = loadDesignIntoEditor(v1WithUnconvertible, "home");
    const withoutLegacy = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat");

    expect(withoutLegacy.legacy).toBeUndefined();
  });

  it("does not invent a legacy key for designs that never had one", () => {
    const clean = loadDesignIntoEditor(
      {
        schemaVersion: 2,
        template: "home",
        theme: "weekly-wildcat",
        packages: [{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }]
      },
      "home"
    );

    expect(clean.legacy).toBeUndefined();
    expect(editorStateToDesignDocument(clean.editorState, "home", "weekly-wildcat", clean.legacy)).not.toHaveProperty(
      "legacy"
    );
  });
});

describe("loading validates rather than casts", () => {
  it("rejects a stored v2 document that no longer satisfies the schema", () => {
    expect(() =>
      loadDesignIntoEditor(
        {
          schemaVersion: 2,
          template: "home",
          theme: "weekly-wildcat",
          packages: [{ id: "home-lead", type: "not-a-real-package", props: {} }]
        },
        "home"
      )
    ).toThrow(/unknown type/);
  });

  it("rejects a v2 document whose template identity does not match", () => {
    expect(() =>
      loadDesignIntoEditor(
        { schemaVersion: 2, template: "home", theme: "weekly-wildcat", packages: [] },
        "section-default"
      )
    ).toThrow(/mismatched template/);
  });
});

describe("Studio persists the sports package", () => {
  const sportsEditorState = {
    root: { props: {} },
    content: [
      { type: LEAD_PACKAGE_TYPE, props: { id: "home-lead", ...WEEKLY_WILDCAT_LEAD_DEFAULTS } },
      { type: SPORTS_PACKAGE_TYPE, props: { id: "home-sports", ...WEEKLY_WILDCAT_SPORTS_DEFAULTS } }
    ]
  };

  it("writes both packages in editor order", () => {
    const document = editorStateToDesignDocument(sportsEditorState, "home", "weekly-wildcat");

    expect(document.packages.map((entry) => entry.type)).toEqual([LEAD_PACKAGE_TYPE, SPORTS_PACKAGE_TYPE]);
    expect(document.packages.map((entry) => entry.id)).toEqual(["home-lead", "home-sports"]);
    expect(parseBylineDesignDocumentV2(document, "home").packages).toHaveLength(2);
  });

  it("normalises sports settings on the way out of the editor", () => {
    const document = editorStateToDesignDocument(
      {
        root: { props: {} },
        content: [
          {
            type: SPORTS_PACKAGE_TYPE,
            props: { id: "home-sports", scores: { enabled: false, limit: 4 }, upcoming: { limit: 999 } }
          }
        ]
      },
      "home",
      "weekly-wildcat"
    );

    const props = document.packages[0].props as typeof WEEKLY_WILDCAT_SPORTS_DEFAULTS;

    expect(props.scores).toEqual({ enabled: false, limit: 4 });
    // Out of range falls back to the default rather than persisting nonsense.
    expect(props.upcoming.limit).toBe(WEEKLY_WILDCAT_SPORTS_DEFAULTS.upcoming.limit);
    expect(props.heading).toBe("Sports");
  });

  it("round-trips the sports package through the editor without drift", () => {
    const first = editorStateToDesignDocument(sportsEditorState, "home", "weekly-wildcat");
    const reloaded = loadDesignIntoEditor(first, "home");
    const second = editorStateToDesignDocument(reloaded.editorState, "home", "weekly-wildcat", reloaded.legacy);

    expect(second).toEqual(first);
  });

  it("persists no renderer, class or endpoint detail for the sports package", () => {
    const document = editorStateToDesignDocument(sportsEditorState, "home", "weekly-wildcat");
    const persisted = JSON.stringify(document);

    for (const forbidden of ["SportsPackage", "from-field", "field-schedule", "wp-json", "sports-games"]) {
      expect(persisted).not.toContain(forbidden);
    }
  });
});

describe("legacy sports blocks survive the sports extraction", () => {
  const v1WithSports = {
    schemaVersion: 1,
    template: "home",
    theme: "weekly-wildcat",
    editor: { engine: "puck", version: "0.23.0" },
    layout: {
      root: { props: {} },
      content: [
        { type: "story-lead", props: { id: "story-lead-1", query: { type: "sticky" } } },
        {
          type: "sports-scores",
          props: { id: "sports-scores-1", title: "Scoreboard", teamKey: "football-varsity", limit: 6, allowDuplicates: false }
        },
        { type: "athlete-feature", props: { id: "athlete-feature-1", title: "Athlete", teamKey: "golf-varsity" } }
      ]
    }
  };

  it("carries every unconverted sports block out of the load", () => {
    const loaded = loadDesignIntoEditor(v1WithSports, "home");

    expect(loaded.migratedFromV1).toBe(true);
    expect(loaded.legacy?.unconvertedBlocks.map((block) => block.type)).toEqual([
      "sports-scores",
      "athlete-feature"
    ]);
    // Only story-lead converted, so only story-lead is in the editor.
    expect(loaded.editorState.content.map((item) => item.type)).toEqual([LEAD_PACKAGE_TYPE]);
  });

  it("preserves them byte-for-byte through adding a sports package and saving", () => {
    const loaded = loadDesignIntoEditor(v1WithSports, "home");
    const edited = {
      ...loaded.editorState,
      content: [
        ...loaded.editorState.content,
        { type: SPORTS_PACKAGE_TYPE, props: { id: "home-sports", ...WEEKLY_WILDCAT_SPORTS_DEFAULTS } }
      ]
    };

    const saved = editorStateToDesignDocument(edited, "home", "weekly-wildcat", loaded.legacy);

    expect(saved.schemaVersion).toBe(2);
    expect(saved.packages.map((entry) => entry.type)).toEqual([LEAD_PACKAGE_TYPE, SPORTS_PACKAGE_TYPE]);
    // Adding the real package does NOT convert or consume the old blocks: they
    // are different things, and the migration never claimed otherwise.
    expect(saved.legacy?.unconvertedBlocks).toEqual([
      {
        type: "sports-scores",
        props: { id: "sports-scores-1", title: "Scoreboard", teamKey: "football-varsity", limit: 6, allowDuplicates: false }
      },
      { type: "athlete-feature", props: { id: "athlete-feature-1", title: "Athlete", teamKey: "golf-varsity" } }
    ]);
    expect(parseBylineDesignDocumentV2(saved, "home").legacy?.unconvertedBlocks).toHaveLength(2);
  });

  it("does not erode the legacy payload across repeated autosaves", () => {
    const loaded = loadDesignIntoEditor(v1WithSports, "home");
    let state = loaded.editorState;
    let legacy = loaded.legacy;

    for (let pass = 0; pass < 4; pass += 1) {
      const document = editorStateToDesignDocument(state, "home", "weekly-wildcat", legacy);
      const reloaded = loadDesignIntoEditor(document, "home");

      state = reloaded.editorState;
      legacy = reloaded.legacy;
    }

    expect(legacy?.unconvertedBlocks).toEqual(loaded.legacy?.unconvertedBlocks);
  });

  it("never leaves a block both converted and preserved", () => {
    const loaded = loadDesignIntoEditor(v1WithSports, "home");
    const saved = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    expect(saved.legacy?.unconvertedBlocks.map((block) => block.type)).not.toContain("story-lead");
  });
});
