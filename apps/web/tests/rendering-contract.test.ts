import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { LEAD_PACKAGE_TYPE, SPORTS_PACKAGE_TYPE } from "@byline/design";
import {
  EditorialLeadPackage,
  EditorialSportsPackage,
  LeadPackage,
  SportsPackage,
  getLeadPackageRenderer,
  getSportsPackageRenderer,
  themeHasLeadPackageVariant,
  themeHasSportsPackageVariant
} from "@byline/ui";

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const studioPreview = readSource("../../../wordpress-plugin/src/studio-preview.tsx");
const studioConfig = readSource("../../../wordpress-plugin/src/studio.tsx");
const homepage = readSource("../app/page.tsx");

// The invariant this whole phase exists to prove: one renderer, two hosts.
describe("shared rendering contract", () => {
  it("production renders the lead package through the shared renderer", () => {
    expect(homepage).toMatch(/import \{[^}]*HomepagePackages[^}]*\} from "@byline\/ui"/);
    expect(homepage).toContain("<HomepagePackages");
    expect(homepage).not.toContain("<LeadPackage");
  });

  it("Studio renders the shared renderer rather than its own implementation", () => {
    expect(studioPreview).toMatch(/from "@byline\/ui"/);
    expect(studioPreview).toContain("getLeadPackageRenderer");
    // The preview must not hand-roll the package's markup.
    expect(studioPreview).not.toContain("top-stories-layout");
    expect(studioPreview).not.toContain("right-now-list");
  });

  it("has no placeholder preview left for the lead package", () => {
    // The generic placeholder card still serves the v1 blocks that later phases
    // will extract, so its text is expected to remain in the file. What must be
    // true is that the lead package no longer routes through it: it is absent
    // from the generic palette that builds those cards, and its own preview
    // contains no placeholder copy.
    const paletteBlocks = /const blockGroups = studioBlockGroups;/.test(studioConfig);

    expect(paletteBlocks).toBe(true);
    expect(studioPreview).not.toContain("Preview resolves");
    expect(studioPreview).not.toContain("Preview uses the configured publication module");

    // The lead package is registered outside the generic block groups.
    const groups = readSource("../../../packages/studio-contract/src/index.ts");

    expect(groups).not.toContain("lead-package");
  });

  it("registers the lead package as a real Studio component", () => {
    expect(studioConfig).toContain("LeadPackagePreview");
    expect(studioConfig).toContain("LEAD_PACKAGE_TYPE");
  });

  it("resolves both hosts to the same component for a given theme", () => {
    expect(getLeadPackageRenderer("weekly-wildcat")).toBe(LeadPackage);
    expect(getLeadPackageRenderer("editorial")).toBe(EditorialLeadPackage);
  });

  it("falls back rather than dropping the package on an unknown theme", () => {
    expect(themeHasLeadPackageVariant("magazine")).toBe(false);
    expect(getLeadPackageRenderer("magazine")).toBe(LeadPackage);
  });

  it("keeps the persisted package type stable", () => {
    expect(LEAD_PACKAGE_TYPE).toBe("lead-package");
  });
});

// Persisted design data must not carry rendering implementation details.
describe("storage contract", () => {
  it("never persists component names or CSS classes", () => {
    const design = readSource("../lib/homepage-design.ts");
    const seeded = /packages:\s*\[([\s\S]*?)\]\s*\};/.exec(design)?.[1] ?? "";

    expect(seeded).not.toMatch(/className|home-story|top-stories/);
    expect(seeded).not.toMatch(/LeadPackage|StoryCard/);
  });
});

// Studio's adapter tests pass the legacy payload explicitly, so they cannot
// catch Studio simply forgetting to thread it. This pins the call site, which is
// the actual data-loss risk: a migrated design that loses its preserved blocks
// on the first edit.
describe("Studio threads preserved legacy data into every write", () => {
  const studio = readSource("../../../wordpress-plugin/src/studio.tsx");

  it("passes the loaded legacy payload when building the document", () => {
    expect(studio).toMatch(/editorStateToDesignDocument\([^)]*loaded\.legacy\)/s);
  });

  it("uses one conversion for both autosave and publish", () => {
    expect(studio.match(/documentFor\(data\)/g)).toHaveLength(2);
  });

  it("does not put legacy blocks into the editor as pseudo-packages", () => {
    const adapter = readSource("../../../wordpress-plugin/src/studio-document.ts");
    const toEditorState = /export function designDocumentToEditorState[\s\S]*?\n}/.exec(adapter)?.[0] ?? "";

    expect(toEditorState).not.toContain("legacy");
    expect(toEditorState).toContain("document.packages");
  });
});

describe("shared rendering contract: sports package", () => {
  const homepageResolver = readSource("../lib/homepage-resolution.ts");
  const sportsResolver = readSource("../lib/sports-packages.ts");
  const renderer = readSource("../../../packages/ui/src/SportsPackage.tsx");

  it("production renders the sports package through the shared renderer", () => {
    expect(homepage).toMatch(/import \{[^}]*HomepagePackages[^}]*\} from "@byline\/ui"/);
    expect(homepage).toContain("<HomepagePackages");
    expect(homepage).not.toContain("<SportsPackage");
    // The hand-written section is gone, not merely bypassed.
    expect(homepage).not.toContain('className="from-field"');
    expect(homepage).not.toContain("SportsSchedulePanel");
    expect(homepage).not.toContain("SportsAthleteFeature");
  });

  it("Studio renders the shared renderer rather than its own markup", () => {
    expect(studioPreview).toContain("getSportsPackageRenderer");
    for (const className of ["from-field", "field-schedule", "field-rail", "sports-athlete-feature"]) {
      expect(studioPreview).not.toContain(className);
    }
  });

  it("registers the sports package as a real Studio component, not a placeholder", () => {
    expect(studioConfig).toContain("SportsPackagePreview");
    expect(studioConfig).toContain("SPORTS_PACKAGE_TYPE");

    // It is registered outside the generic v1 block palette that builds the
    // placeholder cards.
    const groups = readSource("../../../packages/studio-contract/src/index.ts");

    expect(groups).not.toContain("sports-package");
  });

  it("resolves both hosts to the same component for a given theme", () => {
    expect(getSportsPackageRenderer("weekly-wildcat")).toBe(SportsPackage);
    expect(getSportsPackageRenderer("editorial")).toBe(EditorialSportsPackage);
    expect(themeHasSportsPackageVariant("magazine")).toBe(false);
    expect(getSportsPackageRenderer("magazine")).toBe(SportsPackage);
  });

  it("keeps the persisted package type stable", () => {
    expect(SPORTS_PACKAGE_TYPE).toBe("sports-package");
  });

  it("keeps fetching, selection and capability decisions out of the renderer", () => {
    // The renderer receives a finished model. If any of these appear in it, the
    // boundary the phase exists to establish has leaked.
    for (const forbidden of [
      "apiFetch",
      "getRecentSportsGames",
      "getUpcomingSportsGames",
      "WordPressPost",
      "SportsGame",
      "features",
      "usedPostIds",
      "publication"
    ]) {
      expect(renderer).not.toContain(forbidden);
    }
  });

  it("keeps those decisions in the resolver, where they belong", () => {
    expect(homepageResolver).toContain("resolveSportsPackage");
    expect(homepageResolver).toContain("usedStoryIds");
    expect(sportsResolver).toContain("features.sports");
    expect(sportsResolver).toContain("sourceCandidates");
    expect(sportsResolver).toContain("getPublicationConfig");
  });
});
