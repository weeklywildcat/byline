import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { LEAD_PACKAGE_TYPE } from "@byline/design";
import { LeadPackage, EditorialLeadPackage, getLeadPackageRenderer, themeHasLeadPackageVariant } from "@byline/ui";

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const studioPreview = readSource("../../../wordpress-plugin/src/studio-preview.tsx");
const studioConfig = readSource("../../../wordpress-plugin/src/studio.tsx");
const homepage = readSource("../app/page.tsx");

// The invariant this whole phase exists to prove: one renderer, two hosts.
describe("shared rendering contract", () => {
  it("production renders the lead package through the shared renderer", () => {
    expect(homepage).toMatch(/import \{[^}]*LeadPackage[^}]*\} from "@byline\/ui"/);
    expect(homepage).toContain("<LeadPackage");
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
