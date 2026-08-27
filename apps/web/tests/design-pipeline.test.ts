import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BYLINE_DESIGN_READ_SCHEMA_VERSIONS,
  BYLINE_DESIGN_WRITE_SCHEMA_VERSION,
  BylineDesignCompatibilityError,
  LEAD_PACKAGE_TYPE,
  parsePublishedBylineDesign,
  resolvePublishedDesignToV2
} from "@byline/design";

// The full publish pipeline, exercised the way a real publish travels:
//
//   Studio editor state
//     -> schema 2 document
//       -> WordPress design envelope (/byline/v1/design/home)
//         -> BYLINE_DESIGNS_JSON (written by next-with-publication)
//           -> lib/designs parser
//             -> homepage design selection
//               -> lead package resolver
//
// The assertions are chosen so the test fails if the frontend quietly falls back
// to its code seed instead of honouring what was published.

function envelope(document: unknown, revision = 5) {
  return { document, revision, modifiedAt: "2026-08-26T12:00:00Z" };
}

function v2Document(leadProps: Record<string, unknown>) {
  return {
    schemaVersion: 2,
    template: "home",
    theme: "weekly-wildcat",
    packages: [{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: leadProps }]
  };
}

// Loads the frontend modules with a specific BYLINE_DESIGNS_JSON in place.
// lib/designs reads the environment once at module scope, so the registry has to
// be reset for each scenario.
async function loadFrontend(designsJson: string | undefined, publicationFixture?: string) {
  vi.resetModules();

  if (designsJson === undefined) delete process.env.BYLINE_DESIGNS_JSON;
  else process.env.BYLINE_DESIGNS_JSON = designsJson;

  // The build wrapper resolves BYLINE_PUBLICATION_FILE into BYLINE_PUBLICATION_JSON
  // before Next starts, so the runtime only ever sees the serialised form.
  if (publicationFixture) {
    process.env.BYLINE_PUBLICATION_JSON = readFileSync(
      fileURLToPath(new URL(publicationFixture, import.meta.url)),
      "utf8"
    );
  } else {
    delete process.env.BYLINE_PUBLICATION_JSON;
  }

  const [design, packages] = await Promise.all([
    import("@/lib/homepage-design"),
    import("@/lib/homepage-packages")
  ]);

  return { ...design, ...packages };
}

afterEach(() => {
  delete process.env.BYLINE_DESIGNS_JSON;
  delete process.env.BYLINE_PUBLICATION_JSON;
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("schema capability model", () => {
  it("writes v2 and reads both versions", () => {
    expect(BYLINE_DESIGN_WRITE_SCHEMA_VERSION).toBe(2);
    expect([...BYLINE_DESIGN_READ_SCHEMA_VERSIONS]).toEqual([1, 2]);
  });
});

describe("published design envelope", () => {
  it("parses a v2 document and reports its version", () => {
    const published = parsePublishedBylineDesign(envelope(v2Document({})), "home");

    expect(published.schemaVersion).toBe(2);
    expect(published.document).not.toHaveProperty("layout");
    expect(published.document).not.toHaveProperty("editor");
  });

  it("still reads a v1 document and migrates it rather than rendering it", () => {
    const v1 = {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: {
        root: { props: {} },
        content: [
          { type: "story-lead", props: { id: "story-lead-1" } },
          { type: "opinion-package", props: {} }
        ]
      }
    };

    const published = parsePublishedBylineDesign(envelope(v1), "home");

    expect(published.schemaVersion).toBe(1);

    const resolved = resolvePublishedDesignToV2(published, "home");

    expect(resolved.document.schemaVersion).toBe(2);
    expect(resolved.document.packages[0].type).toBe(LEAD_PACKAGE_TYPE);
    // The unconvertible block is preserved and reported, not silently dropped.
    expect(resolved.migrationWarnings.some((warning) => warning.includes("opinion-package"))).toBe(true);
  });

  it("fails loudly on a malformed v2 document instead of falling back", () => {
    expect(() =>
      parsePublishedBylineDesign(envelope({ ...v2Document({}), packages: [{ id: "x", type: "not-a-package", props: {} }] }), "home")
    ).toThrow(BylineDesignCompatibilityError);

    expect(() => parsePublishedBylineDesign(envelope(v2Document({}), -1), "home")).toThrow(/invalid revision/);
  });

  it("rejects a schema the frontend cannot read", () => {
    expect(() => parsePublishedBylineDesign(envelope({ ...v2Document({}), schemaVersion: 9 }), "home")).toThrow(
      /unsupported schema 9/
    );
  });
});

describe("published design reaches the homepage", () => {
  it("honours a published v2 design over the compatibility seed", async () => {
    // latest.limit: 0 is the proof. The Weekly Wildcat seed renders a four-story
    // Latest rail, so if the frontend ignored this document the rail would be
    // populated and this assertion would fail.
    const published = v2Document({
      lead: { source: { type: "latest" } },
      latest: { heading: "The Latest", source: { type: "latest" }, limit: 0, showBylines: true },
      utility: { poll: false, calendar: false, calendarLimit: 0 },
      presentation: { showDeck: true, opinionTreatment: "auto" }
    });

    const frontend = await loadFrontend(JSON.stringify({ home: envelope(published) }));
    const document = frontend.getHomeDesignDocument();
    const leadPackage = frontend.findLeadPackage(document);

    expect(document.schemaVersion).toBe(2);
    expect(leadPackage?.id).toBe("home-lead");

    const seed = frontend.getWeeklyWildcatCompatibilityDesign("weekly-wildcat");

    // The published document, not the seed.
    expect(leadPackage?.props).not.toEqual(seed.packages[0].props);
    expect((leadPackage?.props as { latest: { limit: number } }).latest.limit).toBe(0);
  });

  it("ignores the unpublished revision 0 placeholder", async () => {
    const frontend = await loadFrontend(
      JSON.stringify({ home: envelope(v2Document({ latest: { limit: 0 } }), 0) })
    );
    const leadPackage = frontend.findLeadPackage(frontend.getHomeDesignDocument());

    // Falls back to the compatibility seed, which keeps its rail.
    expect((leadPackage?.props as { latest: { limit: number } }).latest.limit).toBe(4);
  });

  it("builds a published v1 design through migration", async () => {
    const v1 = {
      schemaVersion: 1,
      template: "home",
      theme: "weekly-wildcat",
      editor: { engine: "puck", version: "0.23.0" },
      layout: { root: { props: {} }, content: [{ type: "story-lead", props: { id: "story-lead-1" } }] }
    };

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const frontend = await loadFrontend(JSON.stringify({ home: envelope(v1) }));
    const document = frontend.getHomeDesignDocument();

    expect(document.schemaVersion).toBe(2);
    expect(frontend.findLeadPackage(document)?.id).toBe("story-lead-1");
    warn.mockRestore();
  });
});

describe("publication-aware fallback", () => {
  it("gives Weekly Wildcat its compatibility seed", async () => {
    const frontend = await loadFrontend(undefined);
    const props = frontend.findLeadPackage(frontend.getHomeDesignDocument())?.props as {
      lead: { source: { type: string } };
      utility: { poll: boolean };
    };

    expect(props.lead.source.type).toBe("sticky");
    expect(props.utility.poll).toBe(true);
  });

  it("does not give another publication Weekly Wildcat's homepage semantics", async () => {
    const frontend = await loadFrontend(undefined, "./fixtures/north-star-publication.json");
    const document = frontend.getHomeDesignDocument();
    const props = frontend.findLeadPackage(document)?.props as {
      lead: { source: { type: string } };
      utility: { poll: boolean; calendar: boolean };
      latest: { heading: string };
    };

    expect(document.theme).not.toBe("weekly-wildcat");
    // The Weekly Wildcat seed is sticky-first with both utility modules on.
    expect(props.lead.source.type).toBe("latest");
    expect(props.utility.poll).toBe(false);
    expect(props.utility.calendar).toBe(false);
    expect(props.latest.heading).toBe("Latest");
  });
});
