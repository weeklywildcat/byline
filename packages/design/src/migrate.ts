// Explicit v1 -> v2 design migration.
//
// v1 stored Puck blocks and v2 stores semantic homepage packages. Every v1
// block that has a faithful package mapping is converted here, in its original
// order. Unknown or structural blocks are copied byte-for-byte into `legacy` so
// a migration can never quietly destroy editor data.
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

const MAX_STORIES = 12;

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
  props: Record<string, unknown>,
  fallbackSource: BylineStorySource = { type: "latest" },
  fallbackLimit = 4
): { source: BylineStorySource; limit: number } {
  const query = props.query && typeof props.query === "object" ? props.query as Record<string, unknown> : null;
  const querySource = storySourceFromV1Query(query);

  if (querySource) {
    return {
      source: querySource,
      limit: querySource.type === "manual"
        ? Math.min(MAX_STORIES, querySource.storyIds.length)
        : boundedLimit(query?.limit, fallbackLimit)
    };
  }

  const queryType = props.queryType;
  if (queryType === "manual" && Array.isArray(props.postIds) && props.postIds.every(positiveInteger)) {
    const storyIds = [...new Set(props.postIds as number[])];
    return { source: { type: "manual", storyIds }, limit: Math.min(MAX_STORIES, storyIds.length) };
  }
  if (queryType === "category" && positiveInteger(props.sourceId)) {
    return { source: { type: "category", categoryId: props.sourceId }, limit: boundedLimit(props.limit, fallbackLimit) };
  }
  if (queryType === "tag" && positiveInteger(props.sourceId)) {
    return { source: { type: "tag", tagId: props.sourceId }, limit: boundedLimit(props.limit, fallbackLimit) };
  }
  if (queryType === "author" && positiveInteger(props.sourceId)) {
    return { source: { type: "author", authorId: props.sourceId }, limit: boundedLimit(props.limit, fallbackLimit) };
  }
  if (queryType === "sticky") return { source: { type: "sticky" }, limit: boundedLimit(props.limit, fallbackLimit) };
  if (queryType === "latest") return { source: { type: "latest" }, limit: boundedLimit(props.limit, fallbackLimit) };

  // section-feed used a slug in some editor payloads and a numeric category id
  // in others. Prefer the stable slug when it is available.
  if (typeof props.sectionId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.sectionId)) {
    return { source: { type: "section", slug: props.sectionId }, limit: boundedLimit(props.limit, fallbackLimit) };
  }
  if (positiveInteger(props.sectionId)) {
    return { source: { type: "category", categoryId: props.sectionId }, limit: boundedLimit(props.limit, fallbackLimit) };
  }

  return { source: fallbackSource, limit: boundedLimit(props.limit, fallbackLimit) };
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
  const { source } = sourceAndLimitFromV1Props(block.props, WEEKLY_WILDCAT_LEAD_DEFAULTS.lead.source, 1);

  return {
    id: packageIdFor(block, index, usedIds),
    type: LEAD_PACKAGE_TYPE,
    props: {
      mode: "content",
      lead: { source },
      // v1 story-lead rendered one story and no adjacent modules.
      latest: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS.latest, limit: 0 },
      utility: { poll: false, calendar: false, calendarLimit: 0 },
      presentation: { showDeck: true, opinionTreatment: "auto" }
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
  const fallbackSource = positiveInteger(block.props.storyId)
    ? { type: "manual" as const, storyIds: [block.props.storyId] }
    : { type: "latest" as const };
  const { source } = sourceAndLimitFromV1Props(block.props, fallbackSource, 1);

  return {
    id: packageIdFor(block, index, usedIds),
    type: IN_FOCUS_PACKAGE_TYPE,
    props: { ...WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS, heading: blockTitle(block.props, "Featured"), source }
  };
}

function specialCoveragePackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<SpecialCoveragePackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props, { type: "latest" }, 3);

  return {
    id: packageIdFor(block, index, usedIds),
    type: SPECIAL_COVERAGE_PACKAGE_TYPE,
    props: { ...WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS, heading: blockTitle(block.props, "Special Coverage"), source, limit }
  };
}

function opinionPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<OpinionPackageProps> {
  const { source, limit } = sourceAndLimitFromV1Props(block.props, { type: "section", slug: "opinion" }, 3);

  return {
    id: packageIdFor(block, index, usedIds),
    type: OPINION_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_OPINION_DEFAULTS,
      heading: blockTitle(block.props, "Opinion"),
      description: typeof block.props.description === "string" ? block.props.description : "",
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
  const fallbackSource: BylineStorySource = positiveInteger(block.props.storyId)
    ? { type: "manual", storyIds: [block.props.storyId] }
    : { type: "section", slug: "sports" };
  const { source, limit } = sourceAndLimitFromV1Props(block.props, fallbackSource, 1);

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
        calendarLimit: boundedLimit(block.props.maxVisibleItems, 5)
      },
      presentation: { showDeck: true, opinionTreatment: "off" }
    }
  };
}

function newsletterPackageFromV1(block: BylineLegacyBlock, index: number, usedIds: Set<string>): BylineDesignPackage<NewsletterPackageProps> {
  return {
    id: packageIdFor(block, index, usedIds),
    type: NEWSLETTER_PACKAGE_TYPE,
    props: {
      ...WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS,
      label: typeof block.props.label === "string" ? block.props.label : WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS.label
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
  const usedIds = new Set<string>();
  let sportsSchedulePackage: BylineDesignPackage<SportsPackageProps> | null = null;

  const preserve = (block: BylineLegacyBlock) => {
    // `block` is the original v1 object shape, not a normalised reconstruction;
    // this is intentionally the lossless escape hatch for future migration.
    unconvertedBlocks.push(block);
    warnings.push(
      `"${block.type}" has no faithful schema 2 package and was preserved verbatim in legacy data; it will not render until it is converted.`
    );
  };

  content.forEach((rawBlock, index) => {
    if (!rawBlock || typeof rawBlock !== "object" || typeof rawBlock.type !== "string") {
      warnings.push(`Skipped a malformed block at position ${index + 1}.`);
      return;
    }

    const block = {
      type: rawBlock.type,
      props: rawBlock.props && typeof rawBlock.props === "object" && !Array.isArray(rawBlock.props)
        ? rawBlock.props as Record<string, unknown>
        : {}
    } satisfies BylineLegacyBlock;

    switch (block.type) {
      case "story-lead":
        packages.push(leadPackageFromV1(block, index, usedIds));
        break;
      case "story-list":
      case "latest-stories":
      case "section-feed":
        packages.push(briefPackageFromV1(block, index, usedIds));
        break;
      case "story-grid":
        packages.push(morePackageFromV1(block, index, usedIds));
        break;
      case "featured-story":
      case "photo-feature":
        packages.push(inFocusPackageFromV1(block, index, usedIds));
        break;
      case "special-coverage":
        packages.push(specialCoveragePackageFromV1(block, index, usedIds));
        break;
      case "opinion-package":
        packages.push(opinionPackageFromV1(block, index, usedIds));
        break;
      case "team-feature":
      case "athlete-feature":
        packages.push(sportsStoryPackageFromV1(block, index, usedIds));
        break;
      case "sports-scores":
      case "sports-upcoming":
        // DesignHomepage rendered only the first sports block and that one
        // panel contained both columns. Collapse all legacy schedule blocks to
        // one faithful schedule package in the position of the first block.
        if (!sportsSchedulePackage) {
          sportsSchedulePackage = {
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
          packages.push(sportsSchedulePackage);
        }
        break;
      case "events-list":
        packages.push(utilityPackageFromV1(block, index, usedIds, "calendar"));
        break;
      case "poll":
        packages.push(utilityPackageFromV1(block, index, usedIds, "poll"));
        break;
      case "newsletter":
        packages.push(newsletterPackageFromV1(block, index, usedIds));
        break;
      // Layout-only v1 blocks had no visible semantic content in the legacy
      // homepage renderer. Keep them in the lossless payload until a future
      // package can represent their intent without guessing.
      default:
        preserve(block);
        break;
    }
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
