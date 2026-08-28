import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BYLINE_PACKAGE_TYPES,
  BylineDesignSchemaError,
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  migrateDesignDocumentV1ToV2,
  parseBylineDesignDocumentV2,
  parseAthleteSpotlightSource,
  parseLeadPackageProps,
  parseSportsPackageProps,
  parseStorySource,
  upgradeLegacyBlocksInV2Document
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
    // An id in this list is a promise that a resolver and a renderer exist for
    // it end to end. Adding one without them is what this guards against.
    expect([...BYLINE_PACKAGE_TYPES]).toEqual([
      LEAD_PACKAGE_TYPE,
      BRIEF_PACKAGE_TYPE,
      IN_FOCUS_PACKAGE_TYPE,
      SPECIAL_COVERAGE_PACKAGE_TYPE,
      OPINION_PACKAGE_TYPE,
      SPORTS_PACKAGE_TYPE,
      MORE_PACKAGE_TYPE,
      NEWSLETTER_PACKAGE_TYPE
    ]);
  });

  it("rejects a story manually pinned in two packages", () => {
    expect(() =>
      parseBylineDesignDocumentV2(
        v2([
          { id: "home-brief", type: BRIEF_PACKAGE_TYPE, props: { source: { type: "manual", storyIds: [7] } } },
          { id: "home-more", type: MORE_PACKAGE_TYPE, props: { source: { type: "manual", storyIds: [7] } } }
        ]),
        "home"
      )
    ).toThrow(/manually more than once/);
  });

  it("shares the PHP legacy envelope contract", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/design-v2-legacy-parity.json", import.meta.url), "utf8")) as {
      valid: unknown;
      invalidMissingMetadata: unknown;
    };

    expect(() => parseBylineDesignDocumentV2(fixture.valid, "home")).not.toThrow();
    expect(() => parseBylineDesignDocumentV2(fixture.invalidMissingMetadata, "home")).toThrow(
      /legacy metadata/
    );
  });

  it("enforces the legacy block type and props records", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/design-v2-legacy-parity.json", import.meta.url), "utf8")) as {
      valid: Record<string, unknown>;
    };
    const legacy = fixture.valid.legacy as Record<string, unknown>;

    expect(() => parseBylineDesignDocumentV2({
      ...fixture.valid,
      legacy: { ...legacy, unconvertedBlocks: [{ type: "divider" }] }
    }, "home")).toThrow(/legacy block/);
    expect(() => parseBylineDesignDocumentV2({
      ...fixture.valid,
      legacy: { ...legacy, unconvertedBlocks: [{ type: "divider", props: [] }] }
    }, "home")).toThrow(/legacy block/);
  });
});

describe("story sources", () => {
  it("accepts each supported source", () => {
    expect(parseStorySource({ type: "latest" })).toEqual({ type: "latest" });
    expect(parseStorySource({ type: "sticky" })).toEqual({ type: "sticky" });
    expect(parseStorySource({ type: "category", categoryId: 3 })).toEqual({ type: "category", categoryId: 3 });
    expect(parseStorySource({ type: "manual", storyIds: [2, 2, 5] })).toEqual({ type: "manual", storyIds: [2, 5] });
    expect(parseStorySource({ type: "compatibility-brief" })).toEqual({ type: "compatibility-brief" });
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
      presentation: { showDeck: false },
      lead: { source: { type: "nonsense" } }
    });

    expect(parsed.latest).toEqual({ heading: "Right Now", limit: 2, source: { type: "latest" }, showBylines: false });
    expect(parsed.utility).toEqual({ poll: false, calendar: true, calendarLimit: 5 });
    expect(parsed.presentation).toEqual({ showDeck: false });
    // The unusable lead source falls back rather than throwing away the page.
    expect(parsed.lead.source).toEqual(WEEKLY_WILDCAT_LEAD_DEFAULTS.lead.source);
  });

  // The per-post opinion lead treatment was retired. Designs saved while it
  // existed still persist `presentation.opinionTreatment`, and they must keep
  // loading: this is an intentionally removed presentation option, not schema
  // corruption, so it never justifies a schema version bump or a failed publish.
  it("drops the retired opinion treatment without invalidating an existing design", () => {
    for (const retired of ["auto", "off"]) {
      const parsed = parseLeadPackageProps({
        lead: { source: { type: "sticky" } },
        presentation: { showDeck: true, opinionTreatment: retired }
      });

      expect(parsed.presentation).toEqual({ showDeck: true });
      expect(parsed.presentation).not.toHaveProperty("opinionTreatment");
      // Re-serialising the parsed props normalises the obsolete field away.
      expect(JSON.stringify(parsed)).not.toContain("opinionTreatment");
    }
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

  it("converts every supported block and preserves only unknown blocks", () => {
    const { document, warnings } = migrateDesignDocumentV1ToV2(
      v1([
        { type: "story-lead", props: { query: { type: "latest", limit: 1 } } },
        { type: "opinion-package", props: { title: "Opinion" } },
        { type: "sports-scores", props: {} }
      ]),
      "home"
    );

    expect(document.packages.map((entry) => entry.type)).toEqual([
      LEAD_PACKAGE_TYPE,
      OPINION_PACKAGE_TYPE,
      SPORTS_PACKAGE_TYPE
    ]);
    expect(document.legacy).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("preserves unknown blocks byte-for-byte", () => {
    const unknown = { type: "custom-extension", props: { id: "custom-1", nested: { enabled: true } } };
    const { document, warnings } = migrateDesignDocumentV1ToV2(v1([unknown]), "home");

    expect(document.packages).toEqual([]);
    expect(document.legacy?.unconvertedBlocks).toEqual([unknown]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/custom-extension/);
  });

  it("keeps a visible v1 divider in the live-fallback payload", () => {
    const divider = { type: "divider", props: { id: "divider-1" } };
    const { document, warnings } = migrateDesignDocumentV1ToV2(v1([divider]), "home");

    expect(document.packages).toEqual([]);
    expect(document.legacy?.unconvertedBlocks).toEqual([divider]);
    expect(warnings[0]).toMatch(/divider/);
    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
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

describe("sports package schema", () => {
  it("accepts a well-formed sports package", () => {
    const document = parseBylineDesignDocumentV2(
      v2([
        {
          id: "home-sports",
          type: SPORTS_PACKAGE_TYPE,
          props: WEEKLY_WILDCAT_SPORTS_DEFAULTS as unknown as Record<string, unknown>
        }
      ]),
      "home"
    );

    expect(document.packages[0].type).toBe(SPORTS_PACKAGE_TYPE);
  });

  it("stays editor-independent: no component names, classes or endpoints persist", () => {
    const persisted = JSON.stringify(WEEKLY_WILDCAT_SPORTS_DEFAULTS);

    for (const forbidden of [
      "SportsPackage",
      "SportsSchedulePanel",
      "from-field",
      "field-schedule",
      "field-rail",
      "wp-json",
      "weekly-wildcat/v1",
      "Puck",
      "zone"
    ]) {
      expect(persisted).not.toContain(forbidden);
    }
  });

  it("rejects unsafe props on a sports package the same way as any other", () => {
    const unsafe = { ...WEEKLY_WILDCAT_SPORTS_DEFAULTS, note: { html: "<script>x</script>" } };

    expect(() =>
      parseBylineDesignDocumentV2(
        v2([{ id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: Object.assign(Object.create({ leaked: 1 }), unsafe) }]),
        "home"
      )
    ).toThrow(BylineDesignSchemaError);
  });

  it("repairs malformed sports props rather than dropping the package", () => {
    expect(parseSportsPackageProps({ scores: { enabled: "yes", limit: 999 } })).toEqual(
      WEEKLY_WILDCAT_SPORTS_DEFAULTS
    );
    expect(parseSportsPackageProps({ heading: "   " }).heading).toBe("Sports");
    expect(parseSportsPackageProps({ upcoming: { enabled: false, limit: 5 } }).upcoming).toEqual({
      enabled: false,
      limit: 5
    });
  });

  it("accepts a section source and rejects a malformed slug", () => {
    expect(parseStorySource({ type: "section", slug: "sports" })).toEqual({ type: "section", slug: "sports" });
    expect(parseStorySource({ type: "section", slug: "Sports Desk" })).toBeNull();
    expect(parseStorySource({ type: "section" })).toBeNull();
  });

  it("narrows the athlete spotlight source to what the treatment can render", () => {
    expect(parseAthleteSpotlightSource({ type: "athlete-spotlight" })).toEqual({ type: "athlete-spotlight" });
    expect(parseAthleteSpotlightSource({ type: "manual", storyIds: [4, 4, 9] })).toEqual({
      type: "manual",
      storyIds: [4, 9]
    });
    // A general story source is not a spotlight source.
    expect(parseAthleteSpotlightSource({ type: "latest" })).toBeNull();
    expect(parseAthleteSpotlightSource({ type: "category", categoryId: 3 })).toBeNull();
  });
});

describe("v1 sports blocks migrate to semantic sports packages", () => {
  function v1(content: Array<{ type: string; props: Record<string, unknown> }>) {
    return {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: { root: { props: {} }, content }
    };
  }

  // Schedule blocks collapse to the one composite schedule surface that the
  // legacy homepage rendered; story/athlete blocks become stories-only sports
  // packages so migration does not invent a scoreboard beside them.
  const SPORTS_BLOCKS = [
    { type: "sports-scores", props: { id: "sports-scores-1", title: "Scoreboard", teamKey: "football-varsity" } },
    { type: "sports-upcoming", props: { id: "sports-upcoming-1", title: "Next up", teamKey: "soccer-varsity" } },
    { type: "team-feature", props: { id: "team-feature-1", title: "Team", query: { type: "latest", limit: 1 } } },
    { type: "athlete-feature", props: { id: "athlete-feature-1", title: "Athlete", teamKey: "golf-varsity" } }
  ];

  it("converts every supported sports block without a legacy remainder", () => {
    const { document, warnings } = migrateDesignDocumentV1ToV2(v1(SPORTS_BLOCKS), "home");

    expect(document.packages.map((entry) => entry.type)).toEqual([
      SPORTS_PACKAGE_TYPE,
      SPORTS_PACKAGE_TYPE,
      SPORTS_PACKAGE_TYPE
    ]);
    expect(document.legacy).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(document.packages[0].props).toMatchObject({ content: "schedule" });
    expect(document.packages.slice(1).map((entry) => entry.props)).toEqual([
      expect.objectContaining({ content: "story" }),
      expect.objectContaining({ content: "story" })
    ]);
  });

  it("creates one schedule package from a scores block", () => {
    const { document } = migrateDesignDocumentV1ToV2(v1([SPORTS_BLOCKS[0]]), "home");

    expect(document.packages.map((entry) => entry.type)).toEqual([SPORTS_PACKAGE_TYPE]);
    expect(document.packages[0].props).toMatchObject({ content: "schedule" });
  });

  it("never leaves a converted sports block behind in legacy data", () => {
    const { document } = migrateDesignDocumentV1ToV2(
      v1([{ type: "story-lead", props: { id: "story-lead-1" } }, SPORTS_BLOCKS[0]]),
      "home"
    );

    expect(document.packages.map((entry) => entry.type)).toEqual([LEAD_PACKAGE_TYPE, SPORTS_PACKAGE_TYPE]);
    expect(document.legacy).toBeUndefined();
  });
});

// The bug this guards against is structural, not a missing mapping: the v1 -> v2
// migration and the in-place v2 upgrade used to be two pieces of code, so a
// block type could be convertible on one path and unsupported on the other.
// They now share `convertLegacyBlock`, and these hold them to that.
describe("one canonical legacy-block conversion", () => {
  const v1 = (content: unknown[]) => ({
    schemaVersion: 1,
    template: "home",
    theme: "weekly-wildcat",
    editor: { engine: "puck", version: "0.23.0" },
    layout: { root: { props: {} }, content }
  });

  const SUPPORTED_BLOCKS = [
    "story-lead",
    "story-list",
    "latest-stories",
    "section-feed",
    "story-grid",
    "featured-story",
    "photo-feature",
    "special-coverage",
    "opinion-package",
    "team-feature",
    "athlete-feature",
    "sports-scores",
    "sports-upcoming",
    "events-list",
    "poll",
    "newsletter"
  ];

  it("converts a block identically whichever path reaches it", () => {
    for (const type of SUPPORTED_BLOCKS) {
      const block = { type, props: { id: `${type}-1`, title: "Section" } };

      const throughV1 = migrateDesignDocumentV1ToV2(v1([block]), "home").document;
      const throughUpgrade = upgradeLegacyBlocksInV2Document({
        schemaVersion: 2,
        template: "home",
        theme: "weekly-wildcat",
        packages: [],
        legacy: { schemaVersion: 1, editor: { engine: "puck", version: "0.23.0" }, unconvertedBlocks: [block] }
      }).document;

      expect(throughUpgrade.packages).toEqual(throughV1.packages);
      expect(throughUpgrade.legacy).toBeUndefined();
    }
  });

  it("collapses schedule blocks the same way on both paths", () => {
    const blocks = [
      { type: "sports-scores", props: { id: "sports-scores-1" } },
      { type: "sports-upcoming", props: { id: "sports-upcoming-2" } }
    ];

    const throughV1 = migrateDesignDocumentV1ToV2(v1(blocks), "home").document;
    const throughUpgrade = upgradeLegacyBlocksInV2Document({
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [],
      legacy: { schemaVersion: 1, editor: { engine: "puck", version: "0.23.0" }, unconvertedBlocks: blocks }
    }).document;

    expect(throughV1.packages).toHaveLength(1);
    expect(throughUpgrade.packages).toEqual(throughV1.packages);
  });

  it("records where each preserved block belonged when it preserves one", () => {
    const { document } = migrateDesignDocumentV1ToV2(
      v1([
        { type: "divider", props: { id: "divider-1" } },
        { type: "story-lead", props: { id: "story-lead-2" } },
        { type: "divider", props: { id: "divider-3" } }
      ]),
      "home"
    );

    // Before the lead package, and after it.
    expect(document.legacy?.packageIndexes).toEqual([0, 1]);
    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
  });

  it("gives a recovered package an id that cannot collide with an existing one", () => {
    const { document } = upgradeLegacyBlocksInV2Document({
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [{ id: "poll-9", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }],
      legacy: {
        schemaVersion: 1,
        editor: { engine: "puck", version: "0.23.0" },
        unconvertedBlocks: [{ type: "poll", props: { id: "poll-9" } }]
      }
    });

    expect(document.packages.map((entry) => entry.id)).toEqual(["poll-9", "poll-9-2"]);
    expect(() => parseBylineDesignDocumentV2(document, "home")).not.toThrow();
  });

  it("places a recovered package by its recorded index, not by appending", () => {
    const { document } = upgradeLegacyBlocksInV2Document({
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [
        { id: "first", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS },
        { id: "second", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }
      ],
      legacy: {
        schemaVersion: 1,
        editor: { engine: "puck", version: "0.23.0" },
        unconvertedBlocks: [{ type: "newsletter", props: {} }],
        // Explicit metadata beats the id-suffix compatibility aid.
        packageIndexes: [1]
      }
    });

    expect(document.packages.map((entry) => entry.id)).toEqual(["first", "newsletter-1", "second"]);
  });

  it("appends rather than throwing when the recorded index is stale", () => {
    const { document } = upgradeLegacyBlocksInV2Document({
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [{ id: "only", type: LEAD_PACKAGE_TYPE, props: WEEKLY_WILDCAT_LEAD_DEFAULTS }],
      legacy: {
        schemaVersion: 1,
        editor: { engine: "puck", version: "0.23.0" },
        unconvertedBlocks: [{ type: "newsletter", props: {} }],
        packageIndexes: [97]
      }
    });

    expect(document.packages.map((entry) => entry.id)).toEqual(["only", "newsletter-1"]);
  });

  it("leaves a document with nothing convertible exactly as it was", () => {
    const document = {
      schemaVersion: 2 as const,
      template: "home",
      theme: "weekly-wildcat",
      packages: [],
      legacy: {
        schemaVersion: 1 as const,
        editor: { engine: "puck", version: "0.23.0" },
        unconvertedBlocks: [{ type: "divider", props: { id: "divider-1" } }]
      }
    };
    const upgrade = upgradeLegacyBlocksInV2Document(document);

    expect(upgrade.changed).toBe(false);
    expect(upgrade.document).toBe(document);
    expect(upgrade.unsupportedTypes).toEqual(["Divider"]);
  });
});
