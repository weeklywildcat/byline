// Explicit v1 -> v2 design migration.
//
// v1 stored Puck blocks and v2 stores semantic homepage packages. Every v1
// block that has a faithful package mapping is converted here, in its original
// order. Unknown or structural blocks are copied byte-for-byte into `legacy` so
// a migration can never quietly destroy editor data.
//
// There is exactly one conversion implementation: `convertLegacyBlock`. Both
// the v1 -> v2 migration and the in-place v2 legacy upgrade go through it, so a
// block type can never be convertible on one path and unsupported on the other.
import {
  LEAD_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  type LeadPackageProps
} from "./lead-package";
import {
  BRIEF_PACKAGE_TYPE,
  WEEKLY_WILDCAT_BRIEF_DEFAULTS,
  type BriefPackageProps
} from "./brief-package";
import {
  IN_FOCUS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS,
  type InFocusPackageProps
} from "./in-focus-package";
import {
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS,
  type SpecialCoveragePackageProps
} from "./special-coverage-package";
import {
  OPINION_PACKAGE_TYPE,
  WEEKLY_WILDCAT_OPINION_DEFAULTS,
  type OpinionPackageProps
} from "./opinion-package";
import {
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  type SportsPackageProps
} from "./sports-package";
import {
  MORE_PACKAGE_TYPE,
  WEEKLY_WILDCAT_MORE_DEFAULTS,
  type MorePackageProps
} from "./more-package";
import {
  NEWSLETTER_PACKAGE_TYPE,
  WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS,
  type NewsletterPackageProps
} from "./newsletter-package";
import {
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylineLegacyBlock,
  type BylineStorySource
} from "./schema-v2";

export type DesignMigrationResult = {
  document: BylineDesignDocumentV2;
  // Blocks that were carried forward untranslated, with the reason. Surfaced
  // in Studio so an editor can see what did not convert instead of discovering
  // a silently missing section later.
  warnings: string[];
};

// v1 StoryQuery accepted up to 50 stories. The v2 package renderer can keep
// that full result, so migration must not replace a larger legacy query with a
// smaller semantic default.
const MAX_STORIES = 50;
const DEFAULT_V1_LIMIT = 5;

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function blockTitle(props: Record<string, unknown>, fallback: string) {
  return typeof props.title === "string" && props.title.trim() ? props.title.trim().slice(0, 80) : fallback;
}

function boundedLimit(value: unknown, fallback: number) {
  return positiveInteger(value) ? Math.min(MAX_STORIES, value) : fallback;
}

// v1 stored a story query as `{ type, limit, categoryId, ... }`; some early
// drafts used the flatter `{ queryType, sourceId, postIds }` shape. v2 splits
// the source from the package's visible count, so both forms are normalised at
// this boundary.
function storySourceFromV1Query(value: unknown): BylineStorySource | null {
  if (!value || typeof value !== "object") return null;

  const query = value as Record<string, unknown>;
  const type = query.type;

  if (type === "latest") return { type: "latest" };
  if (type === "sticky") return { type: "sticky" };
  if (type === "category" && positiveInteger(query.categoryId)) {
    return { type: "category", categoryId: query.categoryId };
  }
  if (type === "tag" && positiveInteger(query.tagId)) return { type: "tag", tagId: query.tagId };
  if (type === "author" && positiveInteger(query.authorId)) return { type: "author", authorId: query.authorId };
  if (type === "manual") {
    const ids = Array.isArray(query.postIds) ? query.postIds : query.storyIds;
    if (Array.isArray(ids) && ids.every(positiveInteger)) {
      return { type: "manual", storyIds: [...new Set(ids as number[])] };
    }
  }

  return null;
}

function sourceAndLimitFromV1Props(
  props: Record<string, unknown>
): { source: BylineStorySource; limit: number } {
  const query = props.query && typeof props.query === "object" ? props.query as Record<string, unknown> : null;
  const querySource = storySourceFromV1Query(query);

  if (props.query && typeof props.query === "object") {
    if (!querySource) return { source: { type: "manual", storyIds: [] }, limit: 0 };

    return {
      source: querySource,
      limit: querySource.type === "manual"
        ? Math.min(MAX_STORIES, querySource.storyIds.length)
        : boundedLimit(query?.limit, 0)
    };
  }

  const queryType = props.queryType;
  if (queryType === "manual" && Array.isArray(props.postIds) && props.postIds.every(positiveInteger)) {
    const storyIds = [...new Set(props.postIds as number[])];
    return { source: { type: "manual", storyIds }, limit: Math.min(MAX_STORIES, storyIds.length) };
  }
  if (queryType === "category" && positiveInteger(props.sourceId)) {
    return { source: { type: "category", categoryId: props.sourceId }, limit: boundedLimit(props.limit, 0) };
  }
  if (queryType === "tag" && positiveInteger(props.sourceId)) {
    return { source: { type: "tag", tagId: props.sourceId }, limit: boundedLimit(props.limit, 0) };
  }
  if (queryType === "author" && positiveInteger(props.sourceId)) {
    return { source: { type: "author", authorId: props.sourceId }, limit: boundedLimit(props.limit, 0) };
  }
  if (queryType === "manual" || queryType === "category" || queryType === "tag" || queryType === "author") {
    return { source: { type: "manual", storyIds: [] }, limit: 0 };
  }

  // This is the exact fallback used by packages/content's v1 resolver:
  // unknown or absent queryType means latest, and only this fallback supplies
  // the default limit of five.
  return {
    source: queryType === "sticky" ? { type: "sticky" } : { type: "latest" },
    limit: boundedLimit(props.limit ?? DEFAULT_V1_LIMIT, 0)
  };
}

function packageIdFor(block: BylineLegacyBlock, index: number, usedIds: Set<string>) {
  const requested = typeof block.props.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(block.props.id)
    ? block.props.id
    : `${block.type}-${index + 1}`;
  let id = requested;
  let suffix = 2;

  while (usedIds.has(id)) id = `${requested}-${suffix++}`;
  usedIds.add(id);

  return id;
}

function leadPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<LeadPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: LEAD_PACKAGE_TYPE,
    props: {
      mode: "single-story",
      heading: blockTitle(block.props, "Top story"),
      lead: { source: limit > 0 ? source : { type: "manual", storyIds: [] } },
      // v1 story-lead rendered one story and no adjacent modules.
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 0 },
      utility: { poll: false, calendar: false, calendarLimit: 0 },
      presentation: { showDeck: true }
    }
  };
}

function briefPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<BriefPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: BRIEF_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_BRIEF_DEFAULTS,
      heading: blockTitle(block.props, "Latest stories"),
      source,
      limit
    }
  };
}

function inFocusPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<InFocusPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: IN_FOCUS_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS,
      heading: blockTitle(block.props, block.type === "photo-feature" ? "In Focus" : "Featured"),
      source: limit > 0 ? source : { type: "manual", storyIds: [] }
    }
  };
}

function specialCoveragePackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<SpecialCoveragePackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: SPECIAL_COVERAGE_PACKAGE_TYPE,
    props: { ...WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS, heading: blockTitle(block.props, "Special Coverage"), source, limit }
  };
}

function opinionPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<OpinionPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: OPINION_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_OPINION_DEFAULTS,
      heading: blockTitle(block.props, "Opinion"),
      // The old DesignHomepage rendered only the h2 inside this wrapper. Its
      // v1 block props may carry a description, but that value was not visible.
      description: "",
      source,
      limit,
      archiveLink: { enabled: false, href: "/category/opinion/", label: "All Opinion →" }
    }
  };
}

function morePackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<MorePackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: MORE_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_MORE_DEFAULTS,
      heading: blockTitle(block.props, "Stories"),
      source,
      limit,
      archiveLink: { enabled: false, href: "/stories/", label: "View All Stories →" },
      utility: {
        enabled: false,
        joinStaff: { ...WEEKLY_WILDCAT_MORE_DEFAULTS.utility.joinStaff, enabled: false },
        stayConnected: { ...WEEKLY_WILDCAT_MORE_DEFAULTS.utility.stayConnected, enabled: false }
      },
      presentation: { showDeck: true, cleanDeck: false }
    }
  };
}

function sportsStoryPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<SportsPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props);

  return {
    id: packageIdFor(block, index, usedIds),
    type: SPORTS_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_SPORTS_DEFAULTS,
      heading: blockTitle(block.props, block.type === "athlete-feature" ? "Athlete Feature" : "Team Feature"),
      stories: { source, limit: Math.min(1, limit) },
      athleteSpotlight: { enabled: false, source: { type: "athlete-spotlight" } },
      scores: { enabled: false, limit: 0 },
      upcoming: { enabled: false, limit: 0 },
      content: "story",
      archiveLink: { enabled: false, href: "/sports/", label: "All Sports →" },
      presentation: { showDeck: true, showBylines: true, showReadLink: false, cleanDeck: false }
    }
  };
}

function utilityPackageFromV1(
  block: BylineLegacyBlock,
  index: number,
  usedIds: Set<string>,
  mode: "poll" | "calendar"
): BylineDesignPackage<LeadPackageProps> {
  return {
    id: packageIdFor(block, index, usedIds),
    type: LEAD_PACKAGE_TYPE,
    props: {
      mode,
      lead: { source: { type: "latest" } },
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 0 },
      utility: {
        poll: mode === "poll",
        calendar: mode === "calendar",
        // DesignHomepage always passed maxVisibleItems={5}; the v1 block prop
        // was not read by that renderer.
        calendarLimit: 5
      },
      presentation: { showDeck: true }
    }
  };
}

// The single panel every v1 schedule block collapsed into. It carries both the
// scores and the upcoming columns, which is why several legacy blocks map onto
// one package rather than one each.
function sportsSchedulePackageFromV1(
  block: BylineLegacyBlock,
  index: number,
  usedIds: Set<string>
): BylineDesignPackage<SportsPackageProps> {
  return {
    id: packageIdFor(block, index, usedIds),
    type: SPORTS_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_SPORTS_DEFAULTS,
      heading: blockTitle(block.props, "Sports"),
      stories: { source: { type: "section", slug: "sports" }, limit: 0 },
      athleteSpotlight: { enabled: false, source: { type: "athlete-spotlight" } },
      content: "schedule",
      archiveLink: { enabled: false, href: "/sports/", label: "All Sports →" }
    }
  };
}

function newsletterPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<NewsletterPackageProps> {
  return {
    id: packageIdFor(block, index, usedIds),
    type: NEWSLETTER_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS,
      // DesignHomepage mounted the shared signup form without reading v1
      // label/title/page settings. Keep the visible form contract unchanged.
      label: WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS.label
    }
  };
}

// ---------------------------------------------------------------------------
// The canonical legacy-block conversion.
//
// A legacy block is converted in the context of the blocks around it, because
// one mapping is not one-to-one: every v1 schedule block collapses into a
// single sports schedule package. The context also owns id allocation so a
// recovered package can never collide with a package that already exists.
// ---------------------------------------------------------------------------

export type LegacyConversionContext = {
  usedIds: Set<string>;
  // The collapsed schedule package, once a schedule block has produced one.
  sportsSchedule: BylineDesignPackage<SportsPackageProps> | null;
};

export type LegacyBlockConversion =
  // A new package was produced and the caller must place it.
  | { status: "converted"; package: BylineDesignPackage }
  // The block was absorbed by a package an earlier block already produced.
  // Nothing to place, and nothing was lost.
  | { status: "collapsed"; package: BylineDesignPackage }
  // No faithful package exists; the caller preserves the block verbatim.
  | { status: "unsupported"; warning: string };

export function createLegacyConversionContext(reservedIds: Iterable<string> = []): LegacyConversionContext {
  return { usedIds: new Set(reservedIds), sportsSchedule: null };
}

// v1 block records reach this code from stored JSON, so the shape is checked
// rather than trusted. Returns null for anything that is not a block at all.
export function normaliseLegacyBlock(value: unknown): BylineLegacyBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const block = value as Record<string, unknown>;
  if (typeof block.type !== "string" || !block.type.trim()) return null;

  return {
    type: block.type,
    props:
      block.props && typeof block.props === "object" && !Array.isArray(block.props)
        ? (block.props as Record<string, unknown>)
        : {}
  };
}

const LEGACY_BLOCK_LABELS: Record<string, string> = {
  divider: "Divider",
  section: "Section",
  columns: "Columns"
};

// What an editor is shown when a block still has no package. Falls back to a
// readable form of the stored type rather than the raw identifier.
export function legacyBlockLabel(type: string): string {
  if (LEGACY_BLOCK_LABELS[type]) return LEGACY_BLOCK_LABELS[type];

  const words = type.split("-").filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : type;
}

/**
 * Converts one v1 block using the current package mappings.
 *
 * `index` only seeds a fallback id for a block that carries none; the block's
 * own `props.id` wins whenever it is a valid package id.
 */
export function convertLegacyBlock(
  value: unknown,
  index: number,
  context: LegacyConversionContext
): LegacyBlockConversion {
  const block = normaliseLegacyBlock(value);

  if (!block) {
    return { status: "unsupported", warning: `Skipped a malformed block at position ${index + 1}.` };
  }

  const { usedIds } = context;

  switch (block.type) {
    case "story-lead":
      return { status: "converted", package: leadPackageFromV1(block, index, usedIds) };
    case "story-list":
    case "latest-stories":
    case "section-feed":
      return { status: "converted", package: briefPackageFromV1(block, index, usedIds) };
    case "story-grid":
      return { status: "converted", package: morePackageFromV1(block, index, usedIds) };
    case "featured-story":
    case "photo-feature":
      return { status: "converted", package: inFocusPackageFromV1(block, index, usedIds) };
    case "special-coverage":
      return { status: "converted", package: specialCoveragePackageFromV1(block, index, usedIds) };
    case "opinion-package":
      return { status: "converted", package: opinionPackageFromV1(block, index, usedIds) };
    case "team-feature":
    case "athlete-feature":
      return { status: "converted", package: sportsStoryPackageFromV1(block, index, usedIds) };
    case "sports-scores":
    case "sports-upcoming": {
      // DesignHomepage rendered only the first sports block and that one panel
      // contained both columns. Collapse all legacy schedule blocks to one
      // faithful schedule package in the position of the first block.
      if (context.sportsSchedule) return { status: "collapsed", package: context.sportsSchedule };

      const sportsSchedule = sportsSchedulePackageFromV1(block, index, usedIds);
      context.sportsSchedule = sportsSchedule;

      return { status: "converted", package: sportsSchedule };
    }
    case "events-list":
      return { status: "converted", package: utilityPackageFromV1(block, index, usedIds, "calendar") };
    case "poll":
      return { status: "converted", package: utilityPackageFromV1(block, index, usedIds, "poll") };
    case "newsletter":
      return { status: "converted", package: newsletterPackageFromV1(block, index, usedIds) };
    // Section and columns are structural-only in the v1 homepage renderer.
    // Divider is intentionally also preserved here because it does render a
    // visible <hr>; the live schema-v1 fallback must remain until a semantic
    // divider package exists.
    default:
      return {
        status: "unsupported",
        warning: `"${block.type}" has no faithful schema 2 package and was preserved verbatim in legacy data; the live schema-v1 fallback remains responsible for its rendering.`
      };
  }
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
  const content = Array.isArray(layout.content) ? (layout.content as unknown[]) : [];
  const editor = (document.editor ?? {}) as Record<string, unknown>;
  const packages: BylineDesignPackage[] = [];
  const unconvertedBlocks: BylineLegacyBlock[] = [];
  // Where each preserved block belonged in `packages`. Recorded now because it
  // cannot be reconstructed later: the block's neighbours are gone from the v2
  // document, and package count and block count are not the same number.
  const packageIndexes: number[] = [];
  const warnings: string[] = [];
  const context = createLegacyConversionContext();

  content.forEach((rawBlock, index) => {
    const conversion = convertLegacyBlock(rawBlock, index, context);

    if (conversion.status === "converted") {
      packages.push(conversion.package);
      return;
    }
    if (conversion.status === "collapsed") return;

    const block = normaliseLegacyBlock(rawBlock);

    warnings.push(conversion.warning);
    if (!block) return;

    // The block is copied across untranslated; this is intentionally the
    // lossless escape hatch for future migration.
    unconvertedBlocks.push(block);
    packageIndexes.push(packages.length);
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
              unconvertedBlocks,
              packageIndexes
            }
          }
        : {})
    },
    warnings
  };
}

// ---------------------------------------------------------------------------
// Re-migrating legacy data that is already inside a schema 2 document.
//
// A v2 document written by an older Byline can carry blocks that were
// unsupported *then* and are supported *now*. Without this pass they stay in
// `legacy` forever, and the publish guard that exists to stop half-migrated
// designs going live becomes a permanent block instead of a temporary one.
// ---------------------------------------------------------------------------

export type DesignLegacyUpgradeResult = {
  document: BylineDesignDocumentV2;
  // True when the pass produced a different document. False means the caller
  // may keep using the input, and that a repeated load changes nothing.
  changed: boolean;
  // Legacy blocks that the current mappings understood, including the ones that
  // collapsed into a package an earlier block created.
  recoveredBlocks: number;
  // Packages added to the document. Lower than `recoveredBlocks` whenever a
  // collapse happened.
  recoveredPackages: number;
  // Human-readable types of the blocks that still have no package.
  unsupportedTypes: string[];
  warnings: string[];
};

// Historical compatibility aid, not the ordering model.
//
// Documents written before `legacy.packageIndexes` existed carry no ordering
// metadata at all. Those v1 editors happened to mint block ids as
// `<type>-<original 1-based position>`, so the suffix can reconstruct the
// original layout order for that data and only that data. Anything written
// from here on records its position explicitly and never reaches this path.
function legacyIdPosition(block: BylineLegacyBlock): number | null {
  const id = block.props.id;
  if (typeof id !== "string") return null;

  const match = /-(\d+)$/.exec(id);
  if (!match) return null;

  const position = Number.parseInt(match[1], 10);
  return Number.isInteger(position) && position > 0 ? position : null;
}

// Turns original layout positions into package-list indexes by discounting the
// preserved blocks that sat in front of each one -- those never became packages.
function compatibilityPackageIndexes(blocks: BylineLegacyBlock[]): (number | null)[] {
  const positions = blocks.map(legacyIdPosition);

  return positions.map((position, index) => {
    if (position === null) return null;

    const earlier = positions.filter(
      (other, otherIndex) =>
        other !== null && (other < position || (other === position && otherIndex < index))
    ).length;

    return Math.max(0, position - 1 - earlier);
  });
}

/**
 * Re-runs the current conversion over the legacy blocks of a schema 2 document.
 *
 * Recovered packages are spliced back into the position they came from, so a
 * design regains its original reading order rather than growing a tail of
 * recovered sections. Blocks that are still unsupported stay in `legacy`
 * verbatim, with their positions updated for the packages inserted before them.
 * When nothing unsupported remains, `legacy` is omitted entirely.
 *
 * The pass is idempotent: its own output has no legacy blocks left to convert,
 * so loading a recovered document again produces the same document.
 */
export function upgradeLegacyBlocksInV2Document(
  document: BylineDesignDocumentV2
): DesignLegacyUpgradeResult {
  const legacy = document.legacy;
  const unchanged: DesignLegacyUpgradeResult = {
    document,
    changed: false,
    recoveredBlocks: 0,
    recoveredPackages: 0,
    unsupportedTypes: legacy ? [...new Set(legacy.unconvertedBlocks.map((block) => legacyBlockLabel(block.type)))] : [],
    warnings: []
  };

  if (!legacy || legacy.unconvertedBlocks.length === 0) return unchanged;

  const blocks = legacy.unconvertedBlocks;
  const declared = legacy.packageIndexes;
  const compatibility = compatibilityPackageIndexes(blocks);
  const packageCount = document.packages.length;
  const positions = blocks.map((_block, index) => {
    const explicit = declared?.[index];
    const position = Number.isInteger(explicit) && (explicit as number) >= 0
      ? (explicit as number)
      : compatibility[index] ?? packageCount;

    // Stale metadata must not throw or reorder anything else; the worst case is
    // a recovered package landing at the end of the design.
    return Math.min(Math.max(position, 0), packageCount);
  });

  // Ascending by recorded position, ties broken by stored order, so the pass is
  // deterministic no matter how the blocks happen to be listed.
  const order = blocks
    .map((_block, index) => index)
    .sort((left, right) => positions[left] - positions[right] || left - right);

  const context = createLegacyConversionContext(document.packages.map((entry) => entry.id));
  const packages = [...document.packages];
  const remainingPositions = new Map<number, number>();
  const warnings: string[] = [];
  let recoveredBlocks = 0;
  let recoveredPackages = 0;

  for (const index of order) {
    const conversion = convertLegacyBlock(blocks[index], index, context);

    if (conversion.status === "unsupported") {
      // Its target index shifts by whatever was inserted ahead of it, so the
      // next upgrade still places a future package in the right spot.
      remainingPositions.set(index, positions[index] + recoveredPackages);
      warnings.push(conversion.warning);
      continue;
    }

    recoveredBlocks += 1;
    if (conversion.status !== "converted") continue;

    packages.splice(Math.min(positions[index] + recoveredPackages, packages.length), 0, conversion.package);
    recoveredPackages += 1;
  }

  if (recoveredBlocks === 0) return unchanged;

  // Rebuilt in stored order, not in processing order, so preserved blocks keep
  // the byte-for-byte listing the migration promised.
  const remaining = blocks.filter((_block, index) => remainingPositions.has(index));
  const remainingIndexes = blocks
    .map((_block, index) => index)
    .filter((index) => remainingPositions.has(index))
    .map((index) => remainingPositions.get(index) as number);

  // Destructured out rather than overwritten: an emptied `legacy` key must
  // disappear from the document, not persist as an empty record.
  const { legacy: _legacy, ...rest } = document;

  return {
    document: {
      ...rest,
      packages,
      ...(remaining.length
        ? { legacy: { ...legacy, unconvertedBlocks: remaining, packageIndexes: remainingIndexes } }
        : {})
    },
    changed: true,
    recoveredBlocks,
    recoveredPackages,
    unsupportedTypes: [...new Set(remaining.map((block) => legacyBlockLabel(block.type)))],
    warnings
  };
}
