// Explicit v1 -> v2 design migration.
//
// The safety requirement is the important part: the v1 designs that exist today
// are experimental generic layouts, and migrating one must never silently become
// a publication's live homepage. Migration therefore only *converts* -- it never
// promotes. The faithful Weekly Wildcat compatibility design is seeded
// separately, and the frontend still requires a published revision before any
// design drives the homepage.
import { LEAD_PACKAGE_TYPE, WEEKLY_WILDCAT_LEAD_DEFAULTS, type LeadPackageProps } from "./lead-package";
import {
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylineLegacyBlock,
  type BylineStorySource
} from "./schema-v2";

export type DesignMigrationResult = {
  document: BylineDesignDocumentV2;
  // Blocks that were carried forward untranslated, with the reason. Surfaced in
  // Studio so an editor can see what did not convert instead of discovering a
  // silently missing section later.
  warnings: string[];
};

// v1 stored a story query as { type, limit, categoryId, ... }. v2 splits the
// "which stories" decision (source) from the "how many" decision (limit), which
// belongs to the package that is displaying them.
function storySourceFromV1Query(value: unknown): BylineStorySource | null {
  if (!value || typeof value !== "object") return null;

  const query = value as Record<string, unknown>;
  const positive = (candidate: unknown): candidate is number =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0;

  if (query.type === "latest") return { type: "latest" };
  if (query.type === "sticky") return { type: "sticky" };
  if (query.type === "category" && positive(query.categoryId)) {
    return { type: "category", categoryId: query.categoryId };
  }
  if (query.type === "tag" && positive(query.tagId)) return { type: "tag", tagId: query.tagId };
  if (query.type === "author" && positive(query.authorId)) return { type: "author", authorId: query.authorId };
  if (query.type === "manual" && Array.isArray(query.postIds) && query.postIds.every(positive)) {
    return { type: "manual", storyIds: [...new Set(query.postIds as number[])] };
  }

  return null;
}

// A v1 `story-lead` block rendered exactly one story: DesignHomepage's "lead"
// layout emitted `.top-stories.top-stories-single` with a single lead story and
// showDeck, and nothing else. Converting it to a lead-package with both rails
// switched off is therefore faithful -- it reproduces what that block actually
// rendered, rather than inventing rails the editor never configured.
function leadPackageFromV1(block: BylineLegacyBlock, index: number): BylineDesignPackage<LeadPackageProps> {
  const source = storySourceFromV1Query(block.props.query) ?? WEEKLY_WILDCAT_LEAD_DEFAULTS.lead.source;

  return {
    id: typeof block.props.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(block.props.id)
      ? block.props.id
      : `lead-package-${index + 1}`,
    type: LEAD_PACKAGE_TYPE,
    props: {
      lead: { source },
      // v1 story-lead had no rail, so the migrated package must not gain one.
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 0 },
      utility: { poll: false, calendar: false, calendarLimit: 0 },
      presentation: { showDeck: true, opinionTreatment: "auto" }
    }
  };
}

export function migrateDesignDocumentV1ToV2(value: unknown, template: string): DesignMigrationResult {
  if (!value || typeof value !== "object") {
    throw new Error(`Cannot migrate design ${template}: the v1 document is missing or malformed.`);
  }

  const document = value as Record<string, unknown>;

  if (document.schemaVersion !== 1) {
    throw new Error(
      `Cannot migrate design ${template}: expected schema 1 but found ${String(document.schemaVersion ?? "unknown")}.`
    );
  }

  const layout = (document.layout ?? {}) as Record<string, unknown>;
  const content = Array.isArray(layout.content) ? (layout.content as BylineLegacyBlock[]) : [];
  const editor = (document.editor ?? {}) as Record<string, unknown>;

  const packages: BylineDesignPackage[] = [];
  const unconvertedBlocks: BylineLegacyBlock[] = [];
  const warnings: string[] = [];

  content.forEach((block, index) => {
    if (!block || typeof block !== "object" || typeof block.type !== "string") {
      warnings.push(`Skipped a malformed block at position ${index + 1}.`);
      return;
    }

    const props = (block.props && typeof block.props === "object" ? block.props : {}) as Record<string, unknown>;

    if (block.type === "story-lead") {
      packages.push(leadPackageFromV1({ type: block.type, props }, index));
      return;
    }

    // Everything else has no faithful v2 package yet. Preserve it verbatim and
    // say so, rather than inventing a translation that would change the page.
    unconvertedBlocks.push({ type: block.type, props });
    warnings.push(
      `"${block.type}" has no schema 2 package yet and was preserved as legacy data; it will not render until it is converted.`
    );
  });

  return {
    document: {
      schemaVersion: 2,
      template,
      theme: typeof document.theme === "string" ? document.theme : "weekly-wildcat",
      packages,
      ...(unconvertedBlocks.length
        ? {
            legacy: {
              schemaVersion: 1 as const,
              editor: {
                engine: typeof editor.engine === "string" ? editor.engine : "unknown",
                version: typeof editor.version === "string" ? editor.version : "unknown"
              },
              unconvertedBlocks
            }
          }
        : {})
    },
    warnings
  };
}
