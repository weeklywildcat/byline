import { describe, expect, it } from "vitest";
import {
  BYLINE_PACKAGE_TYPES,
  BylineDesignSchemaError,
  LEAD_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  migrateDesignDocumentV1ToV2,
  parseBylineDesignDocumentV2,
  parseLeadPackageProps,
  parseStorySource
} from "@byline/design";

function v2(packages: unknown[]) {
  return { schemaVersion: 2, template: "home", theme: "weekly-wildcat", packages };
}

describe("schema v2 parsing", () => {
  it("accepts a well-formed document", () => {
    const document = parseBylineDesignDocumentV2(
      v2([{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }]),
      "home"
    );

    expect(document.schemaVersion).toBe(2);
    expect(document.packages).toHaveLength(1);
    expect(document.packages[0].id).toBe("home-lead");
  });

  it("refuses a v1 document", () => {
    expect(() => parseBylineDesignDocumentV2({ schemaVersion: 1, template: "home" }, "home")).toThrow(
      BylineDesignSchemaError
    );
  });

  it("refuses a mismatched template identity", () => {
    expect(() => parseBylineDesignDocumentV2(v2([]), "section-default")).toThrow(/mismatched template/);
  });

  it("refuses an unknown package type", () => {
    expect(() => parseBylineDesignDocumentV2(v2([{ id: "x", type: "mystery-package", props: {} }]), "home")).toThrow(
      /unknown type/
    );
  });

  it("refuses duplicate package ids so selection stays unambiguous", () => {
    expect(() =>
      parseBylineDesignDocumentV2(
        v2([
          { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: {} },
          { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: {} }
        ]),
        "home"
      )
    ).toThrow(/repeats package id/);
  });

  it("refuses malformed and non-serialisable props", () => {
    expect(() => parseBylineDesignDocumentV2(v2([{ id: "a", type: LEAD_PACKAGE_TYPE, props: [] }]), "home")).toThrow(
      /malformed props/
    );
    expect(() =>
      parseBylineDesignDocumentV2(v2([{ id: "a", type: LEAD_PACKAGE_TYPE, props: { fn: () => 1 } }]), "home")
    ).toThrow(/unsafe props/);
  });

  it("never persists editor internals", () => {
    const document = parseBylineDesignDocumentV2(
      { ...v2([]), editor: { engine: "puck", version: "0.23.0" } },
      "home"
    );

    expect(document).not.toHaveProperty("editor");
    expect(document).not.toHaveProperty("layout");
  });

  it("only advertises package types that are actually implemented", () => {
    expect([...BYLINE_PACKAGE_TYPES]).toEqual([LEAD_PACKAGE_TYPE]);
  });
});

describe("story sources", () => {
  it("accepts each supported source", () => {
    expect(parseStorySource({ type: "latest" })).toEqual({ type: "latest" });
    expect(parseStorySource({ type: "sticky" })).toEqual({ type: "sticky" });
    expect(parseStorySource({ type: "category", categoryId: 3 })).toEqual({ type: "category", categoryId: 3 });
    expect(parseStorySource({ type: "manual", storyIds: [2, 2, 5] })).toEqual({ type: "manual", storyIds: [2, 5] });
  });

  it("rejects unbounded or malformed sources", () => {
    expect(parseStorySource({ type: "category" })).toBeNull();
    expect(parseStorySource({ type: "manual", storyIds: [0] })).toBeNull();
    expect(parseStorySource({ type: "nonsense" })).toBeNull();
  });
});

describe("lead package props", () => {
  it("fills missing settings from the Weekly Wildcat defaults", () => {
    expect(parseLeadPackageProps({})).toEqual(WEEKLY_WILDCAT_LEAD_DEFAULTS);
  });

  it("keeps a valid partial configuration and repairs only what is broken", () => {
    const parsed = parseLeadPackageProps({
      latest: { heading: "Right Now", limit: 2, source: { type: "latest" }, showBylines: false },
      utility: { poll: false, calendar: true, calendarLimit: 5 },
      presentation: { showDeck: false, opinionTreatment: "off" },
      lead: { source: { type: "nonsense" } }
    });

    expect(parsed.latest).toEqual({ heading: "Right Now", limit: 2, source: { type: "latest" }, showBylines: false });
    expect(parsed.utility).toEqual({ poll: false, calendar: true, calendarLimit: 5 });
    expect(parsed.presentation).toEqual({ showDeck: false, opinionTreatment: "off" });
    // The unusable lead source falls back rather than throwing away the page.
    expect(parsed.lead.source).toEqual(WEEKLY_WILDCAT_LEAD_DEFAULTS.lead.source);
  });

  it("bounds the latest count", () => {
    expect(parseLeadPackageProps({ latest: { limit: 9999 } }).latest.limit).toBe(
      WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.limit
    );
  });
});

describe("v1 to v2 migration", () => {
  const v1 = (content: unknown[]) => ({
    schemaVersion: 1,
    template: "home",
    theme: "weekly-wildcat",
    editor: { engine: "puck", version: "0.23.0" },
    layout: { root: { props: {} }, content }
  });

  it("converts story-lead faithfully, without inventing rails it never had", () => {
    const { document, warnings } = migrateDesignDocumentV1ToV2(
      v1([{ type: "story-lead", props: { id: "story-lead-1", query: { type: "sticky", limit: 1 } } }]),
      "home"
    );

    expect(warnings).toEqual([]);
    expect(document.packages).toHaveLength(1);
    expect(document.packages[0]).toMatchObject({ id: "story-lead-1", type: LEAD_PACKAGE_TYPE });

    const props = parseLeadPackageProps(document.packages[0].props);

    expect(props.lead.source).toEqual({ type: "sticky" });
    // v1's lead block rendered a single story: no rail, no utility modules.
    expect(props.latest.limit).toBe(0);
    expect(props.utility).toEqual({ poll: false, calendar: false, calendarLimit: 0 });
  });

  it("preserves unconvertible blocks instead of translating them destructively", () => {
    const { document, warnings } = migrateDesignDocumentV1ToV2(
      v1([
        { type: "story-lead", props: { query: { type: "latest", limit: 1 } } },
        { type: "opinion-package", props: { title: "Opinion" } },
        { type: "sports-scores", props: {} }
      ]),
      "home"
    );

    expect(document.packages).toHaveLength(1);
    expect(document.legacy?.unconvertedBlocks.map((block) => block.type)).toEqual([
      "opinion-package",
      "sports-scores"
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/opinion-package/);
    // The editor is told, rather than finding a section silently missing.
    expect(warnings[0]).toMatch(/will not render/);
  });

  it("is deterministic", () => {
    const input = v1([{ type: "story-lead", props: { query: { type: "latest", limit: 1 } } }, { type: "poll", props: {} }]);

    expect(migrateDesignDocumentV1ToV2(input, "home")).toEqual(migrateDesignDocumentV1ToV2(input, "home"));
  });

  it("produces a document the v2 parser accepts", () => {
    const { document } = migrateDesignDocumentV1ToV2(
      v1([{ type: "story-lead", props: { query: { type: "latest", limit: 1 } } }]),
      "home"
    );

    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
  });

  it("refuses to migrate something that is not a v1 document", () => {
    expect(() => migrateDesignDocumentV1ToV2({ schemaVersion: 2 }, "home")).toThrow(/expected schema 1/);
  });
});
