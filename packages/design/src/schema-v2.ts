// Internal homepage package types and bounded prop parsers.
import { BylineDesignCompatibilityError } from "./errors";

export const BYLINE_DESIGN_SCHEMA_VERSION_V2 = 2;

// Semantic package identifiers. Only the packages that are actually implemented
// end-to-end belong here -- an id in this list is a promise that a resolver and
// a renderer exist for it.
export const BYLINE_PACKAGE_TYPES = [
  "lead-package",
  "brief-package",
  "in-focus-package",
  "special-coverage-package",
  "opinion-package",
  "sports-package",
  "more-package",
  "newsletter-package"
] as const;

export type BylinePackageType = (typeof BYLINE_PACKAGE_TYPES)[number];

// How a package chooses its stories. Deliberately editorial: an editor picks
// "the newest story in Opinion", not a REST query string.
export type BylineStorySource =
  | { type: "latest" }
  | { type: "sticky" }
  // A newsroom section addressed by its stable slug. `category` addresses the
  // same taxonomy by numeric id; a section is the editorial name for it, and is
  // what an editor actually says ("the Sports section"), so it survives an
  // export/import that renumbers term ids.
  | { type: "section"; slug: string }
  | { type: "category"; categoryId: number }
  | { type: "tag"; tagId: number }
  | { type: "author"; authorId: number }
  // Coverage is a first-class WordPress object. The numeric id is the
  // canonical source identity at the CMS boundary; a missing/deleted object
  // is resolved as empty by the host resolver, never as `latest`.
  | { type: "coverage"; coverageId: number }
  | { type: "manual"; storyIds: number[] }
  // Compatibility sources are semantic names for the historical Weekly
  // Wildcat selection slots. They keep the old ordered selection pass behind
  // the public design contract without persisting resolver or CMS details.
  | {
      type:
        | "compatibility-lead"
        | "compatibility-latest"
        | "compatibility-brief"
        | "compatibility-in-focus"
        | "compatibility-special-coverage"
        | "compatibility-opinion"
        | "compatibility-sports"
        | "compatibility-athlete"
        | "compatibility-more";
    };

export type BylineDesignPackage<Props = Record<string, unknown>> = {
  // Stable instance id for package slots and DOM headings.
  id: string;
  type: BylinePackageType;
  props: Props;
};

/** Internal code-owned homepage composition, never read from WordPress. */
export type BylineDesignDocumentV2 = {
  schemaVersion: 2;
  template: string;
  theme: string;
  packages: BylineDesignPackage[];
};

export class BylineDesignSchemaError extends BylineDesignCompatibilityError {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignSchemaError";
  }
}

const MAX_STORY_IDS = 50;
const SECTION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPATIBILITY_SOURCE_TYPES = new Set([
  "compatibility-lead",
  "compatibility-latest",
  "compatibility-brief",
  "compatibility-in-focus",
  "compatibility-special-coverage",
  "compatibility-opinion",
  "compatibility-sports",
  "compatibility-athlete",
  "compatibility-more"
]);
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isBylinePackageType(value: unknown): value is BylinePackageType {
  return typeof value === "string" && (BYLINE_PACKAGE_TYPES as readonly string[]).includes(value);
}

export function parseStorySource(value: unknown): BylineStorySource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;

  if (
    source.type === "latest" ||
    source.type === "sticky" ||
    (typeof source.type === "string" && COMPATIBILITY_SOURCE_TYPES.has(source.type))
  ) {
    return { type: source.type } as BylineStorySource;
  }
  if (source.type === "section" && typeof source.slug === "string" && SECTION_SLUG_PATTERN.exec(source.slug) !== null) {
    return { type: "section", slug: source.slug };
  }
  if (source.type === "category" && isPositiveInteger(source.categoryId)) {
    return { type: "category", categoryId: source.categoryId };
  }
  if (source.type === "tag" && isPositiveInteger(source.tagId)) return { type: "tag", tagId: source.tagId };
  if (source.type === "author" && isPositiveInteger(source.authorId)) {
    return { type: "author", authorId: source.authorId };
  }
  if (
    source.type === "coverage"
    && hasOnlyKeys(source, ["type", "coverageId"])
    && isPositiveInteger(source.coverageId)
  ) {
    return { type: "coverage", coverageId: source.coverageId };
  }
  if (source.type === "manual") {
    if (!Array.isArray(source.storyIds) || !source.storyIds.every(isPositiveInteger)) return null;
    const storyIds = [...new Set(source.storyIds as number[])];

    return storyIds.length <= MAX_STORY_IDS ? { type: "manual", storyIds } : null;
  }

  return null;
}

/**
 * Package prop parsers intentionally repair ordinary malformed settings so a
 * damaged field does not blank a publication. Coverage is different: it is a
 * named editorial object, and silently repairing an invalid Coverage source to
 * a generic feed would publish the wrong stories. Callers use this helper when
 * they need the normal fallback behaviour for all other source kinds.
 */
export function parseStorySourceOrFallback(
  value: unknown,
  fallback: BylineStorySource
): BylineStorySource {
  const parsed = parseStorySource(value);
  if (parsed) return parsed;

  if (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).type === "coverage"
  ) {
    throw new BylineDesignSchemaError(
      "A Coverage source must contain a positive numeric coverageId and no unsupported fields."
    );
  }

  return fallback;
}
