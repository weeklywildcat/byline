import { describe, expect, it } from "vitest";
import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  parseBylineDesignDocumentV2,
  upgradeLegacyBlocksInV2Document,
  type BylineDesignDocumentV2,
  type LeadPackageProps
} from "@byline/design";
import { editorStateToDesignDocument, loadDesignIntoEditor } from "../src/studio-document";
import productionFixture from "../../apps/web/tests/fixtures/design-v2-legacy-recovery.json";

// The homepage autosave that could not be published in production.
//
// It is schema 2 with one converted package and nine preserved blocks, every
// one of which the current mappings understand. Studio used to carry `legacy`
// forward untouched on a v2 load, so those nine blocks were never retried and
// the publish guard stayed on forever. This fixture is the exact stored shape,
// ordering metadata included -- which is to say, absent.
const PRODUCTION_AUTOSAVE = productionFixture as unknown as {
  autosave: { document: BylineDesignDocumentV2; baseRevisionId: number };
  // The exact document recovery is expected to write. The PHP suite validates
  // this same value against storage validation and the publish guard, so the
  // two languages agree on one artefact rather than two descriptions of one.
  recovered: BylineDesignDocumentV2;
};

// Studio reads `design.autosave?.document ?? design.document`, so recovery has
// to reach the autosave, not only a published revision.
const storedAutosave = () => JSON.parse(JSON.stringify(PRODUCTION_AUTOSAVE.autosave.document)) as BylineDesignDocumentV2;

// The homepage as an editor reads it, top to bottom.
const EXPECTED_ORDER = [
  LEAD_PACKAGE_TYPE, // story-lead-1, already converted before this fixture was stored
  BRIEF_PACKAGE_TYPE, // latest-stories-2
  OPINION_PACKAGE_TYPE, // opinion-package-3
  IN_FOCUS_PACKAGE_TYPE, // photo-feature-4
  SPECIAL_COVERAGE_PACKAGE_TYPE, // special-coverage-5
  SPORTS_PACKAGE_TYPE, // sports-scores-6 + sports-upcoming-7, collapsed
  LEAD_PACKAGE_TYPE, // events-list-8, a calendar-only utility package
  LEAD_PACKAGE_TYPE, // poll-9, a poll-only utility package
  NEWSLETTER_PACKAGE_TYPE // newsletter-10
];

describe("the production homepage autosave recovers on load", () => {
  it("has the shape the bug report describes before anything runs", () => {
    const stored = storedAutosave();

    expect(stored.schemaVersion).toBe(2);
    expect(PRODUCTION_AUTOSAVE.autosave.baseRevisionId).toBe(0);
    expect(stored.packages).toHaveLength(1);
    expect(stored.legacy?.unconvertedBlocks.map((block) => block.type)).toEqual([
      "latest-stories",
      "opinion-package",
      "photo-feature",
      "special-coverage",
      "sports-scores",
      "sports-upcoming",
      "events-list",
      "poll",
      "newsletter"
    ]);
    // The whole point: it was written before ordering metadata existed.
    expect(stored.legacy?.packageIndexes).toBeUndefined();
  });

  it("converts all nine preserved blocks into nine semantic packages", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");

    expect(loaded.recoveredLegacyBlocks).toBe(9);
    expect(loaded.editorState.content).toHaveLength(9);
    expect(loaded.editorState.content.map((item) => item.type)).toEqual(EXPECTED_ORDER);
  });

  it("recovers them in the original homepage order", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");

    expect(loaded.editorState.content.map((item) => item.props.id)).toEqual([
      "story-lead-1",
      "latest-stories-2",
      "opinion-package-3",
      "photo-feature-4",
      "special-coverage-5",
      "sports-scores-6",
      "events-list-8",
      "poll-9",
      "newsletter-10"
    ]);
  });

  it("collapses the two schedule blocks into one sports package", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const sports = loaded.editorState.content.filter((item) => item.type === SPORTS_PACKAGE_TYPE);

    expect(sports).toHaveLength(1);
    expect(sports[0].props.content).toBe("schedule");
    // sports-upcoming-7 was absorbed, not dropped and not duplicated.
    expect(loaded.editorState.content.some((item) => item.props.id === "sports-upcoming-7")).toBe(false);
  });

  it("recovers the calendar and poll blocks as distinct utility packages", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const utility = loaded.editorState.content.filter(
      (item) => item.type === LEAD_PACKAGE_TYPE && item.props.id !== "story-lead-1"
    );

    expect(utility.map((item) => (item.props as unknown as LeadPackageProps).mode)).toEqual(["calendar", "poll"]);
  });

  it("keeps the already-converted lead exactly once and unedited", () => {
    const stored = storedAutosave();
    const loaded = loadDesignIntoEditor(stored, "home");
    const leads = loaded.editorState.content.filter((item) => item.props.id === "story-lead-1");

    expect(leads).toHaveLength(1);
    expect(leads[0].props).toEqual({ ...stored.packages[0].props, id: "story-lead-1" });
  });

  it("leaves no legacy data behind and no duplicate ids", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const ids = loaded.editorState.content.map((item) => item.props.id);

    expect(loaded.legacy).toBeUndefined();
    expect(loaded.unsupportedLegacyTypes).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes a normalised schema 2 document on the next autosave", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const saved = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    expect(saved.schemaVersion).toBe(2);
    expect(saved).not.toHaveProperty("legacy");
    expect(saved.packages).toHaveLength(9);
    expect(saved.packages.map((entry) => entry.type)).toEqual(EXPECTED_ORDER);
    expect(() => parseBylineDesignDocumentV2(saved, "home")).not.toThrow();
  });

  it("produces the nine semantic packages the recovery contract names", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const counts = loaded.editorState.content.reduce<Record<string, number>>((totals, item) => {
      const key = item.type === LEAD_PACKAGE_TYPE ? `${item.type}:${String(item.props.mode ?? "content")}` : item.type;
      return { ...totals, [key]: (totals[key] ?? 0) + 1 };
    }, {});

    expect(counts).toEqual({
      [`${LEAD_PACKAGE_TYPE}:single-story`]: 1,
      [BRIEF_PACKAGE_TYPE]: 1,
      [OPINION_PACKAGE_TYPE]: 1,
      [IN_FOCUS_PACKAGE_TYPE]: 1,
      [SPECIAL_COVERAGE_PACKAGE_TYPE]: 1,
      [SPORTS_PACKAGE_TYPE]: 1,
      [`${LEAD_PACKAGE_TYPE}:calendar`]: 1,
      [`${LEAD_PACKAGE_TYPE}:poll`]: 1,
      [NEWSLETTER_PACKAGE_TYPE]: 1
    });
  });

  it("writes the document the server-side regression validates", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");
    const saved = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    expect(saved).toEqual(PRODUCTION_AUTOSAVE.recovered);
  });

  it("enables publishing, which the old load path made impossible", () => {
    const loaded = loadDesignIntoEditor(storedAutosave(), "home");

    // Studio's guard, and the server's, are both "does any legacy block remain".
    expect(Boolean(loaded.legacy?.unconvertedBlocks.length)).toBe(false);
  });
});

// Recovery runs on every load, so it has to be a fixed point after the first
// pass. If it were not, an editor would gain nine more packages every time they
// opened Studio.
describe("recovery is idempotent", () => {
  it("adds nothing on a second load of the recovered document", () => {
    const first = loadDesignIntoEditor(storedAutosave(), "home");
    const firstSaved = editorStateToDesignDocument(first.editorState, "home", "weekly-wildcat", first.legacy);

    const second = loadDesignIntoEditor(firstSaved, "home");
    const secondSaved = editorStateToDesignDocument(second.editorState, "home", "weekly-wildcat", second.legacy);

    expect(second.recoveredLegacyBlocks).toBe(0);
    expect(secondSaved).toEqual(firstSaved);
  });

  it("stays at nine packages across repeated autosave round trips", () => {
    let document = storedAutosave() as BylineDesignDocumentV2;
    const seen: string[][] = [];

    for (let pass = 0; pass < 5; pass += 1) {
      const loaded = loadDesignIntoEditor(document, "home");
      document = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);
      seen.push(document.packages.map((entry) => entry.id));
    }

    for (const ids of seen) {
      expect(ids).toEqual(seen[0]);
      expect(ids).toHaveLength(9);
    }
    // No package type may accumulate copies.
    expect(document.packages.filter((entry) => entry.type === SPORTS_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === BRIEF_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === OPINION_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === IN_FOCUS_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === SPECIAL_COVERAGE_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === NEWSLETTER_PACKAGE_TYPE)).toHaveLength(1);
    expect(document.packages.filter((entry) => entry.type === LEAD_PACKAGE_TYPE)).toHaveLength(3);
  });

  it("reports no change when the pass has nothing left to do", () => {
    const recovered = upgradeLegacyBlocksInV2Document(parseBylineDesignDocumentV2(storedAutosave(), "home"));
    const again = upgradeLegacyBlocksInV2Document(recovered.document);

    expect(recovered.changed).toBe(true);
    expect(recovered.recoveredBlocks).toBe(9);
    expect(recovered.recoveredPackages).toBe(8);
    expect(again.changed).toBe(false);
    expect(again.document).toBe(recovered.document);
  });
});

describe("blocks that are still unsupported keep their place", () => {
  const withDivider = (): BylineDesignDocumentV2 => {
    const stored = storedAutosave();
    const blocks = stored.legacy?.unconvertedBlocks ?? [];

    return {
      ...stored,
      legacy: {
        schemaVersion: 1,
        editor: { engine: "puck", version: "0.23.0" },
        // Sits between opinion-package-3 and photo-feature-4 in the original
        // layout, so every id after it shifts by one.
        unconvertedBlocks: [
          blocks[0],
          blocks[1],
          { type: "divider", props: { id: "divider-4" } },
          { type: "photo-feature", props: { id: "photo-feature-5", title: "In Focus", limit: 1 } },
          { type: "newsletter", props: { id: "newsletter-6", title: "Newsletter" } }
        ]
      }
    };
  };

  it("recovers around it and preserves it verbatim", () => {
    const loaded = loadDesignIntoEditor(withDivider(), "home");

    expect(loaded.recoveredLegacyBlocks).toBe(4);
    expect(loaded.legacy?.unconvertedBlocks).toEqual([{ type: "divider", props: { id: "divider-4" } }]);
    expect(loaded.unsupportedLegacyTypes).toEqual(["Divider"]);
    expect(loaded.editorState.content.map((item) => item.props.id)).toEqual([
      "story-lead-1",
      "latest-stories-2",
      "opinion-package-3",
      "photo-feature-5",
      "newsletter-6"
    ]);
  });

  it("records where the survivor belongs so a later upgrade can place its package", () => {
    const loaded = loadDesignIntoEditor(withDivider(), "home");
    const saved = editorStateToDesignDocument(loaded.editorState, "home", "weekly-wildcat", loaded.legacy);

    // The divider sat after the lead, brief and opinion packages.
    expect(saved.legacy?.packageIndexes).toEqual([3]);
    expect(() => parseBylineDesignDocumentV2(saved, "home")).not.toThrow();

    // And that recorded position survives another round trip untouched.
    const reloaded = loadDesignIntoEditor(saved, "home");

    expect(reloaded.recoveredLegacyBlocks).toBe(0);
    expect(reloaded.legacy?.packageIndexes).toEqual([3]);
    expect(editorStateToDesignDocument(reloaded.editorState, "home", "weekly-wildcat", reloaded.legacy)).toEqual(saved);
  });
});
