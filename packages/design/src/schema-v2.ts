// Byline design schema v2.
//
// v1 persisted Puck's own `layout: { root, content }` structure, which made an
// editor library's internal format the public storage contract. v2 persists
// semantic publication packages instead: the newsroom concepts an editor thinks
// in ("the lead package"), not the components that happen to render them today.
//
// Rules this schema is meant to enforce:
//   - package `type` values are the persisted contract, and are stable
//   - Puck is an editor implementation detail and never appears in storage
//   - ordering belongs to the document, configuration belongs to the package
//   - theme is identity only; it never carries content or layout
//   - no React component names and no CSS class names are ever persisted

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
  // Stable instance id. Survives reordering and retitling so drafts, revisions
  // and preview selection can all refer to the same package.
  id: string;
  type: BylinePackageType;
  props: Props;
};

// v1 blocks that have no faithful v2 package are preserved here verbatim rather
// than being force-translated into something that would render differently.
// They are inert inside a v2 package document; a published schema-v1 document
// remains on the old whole-page fallback until its visible blocks are converted.
export type BylineLegacyBlock = {
  type: string;
  props: Record<string, unknown>;
};

export type BylineDesignDocumentV2 = {
  schemaVersion: 2;
  template: string;
  theme: string;
  packages: BylineDesignPackage[];
  legacy?: {
    schemaVersion: 1;
    editor: { engine: string; version: string };
    unconvertedBlocks: BylineLegacyBlock[];
    // The ordering contract for preserved blocks, aligned by index with
    // `unconvertedBlocks`: the index in `packages` each block belonged at.
    //
    // Ordering cannot be recovered from the blocks themselves once their v1
    // neighbours have become packages, so it is recorded when the block is
    // preserved and updated whenever a later migration converts one of its
    // siblings. Optional only because documents written before this field
    // existed do not carry it.
    packageIndexes?: number[];
  };
  baseRevisionId?: number;
  modifiedAt?: string;
};

export class BylineDesignSchemaError extends BylineDesignCompatibilityError {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignSchemaError";
  }
}

const MAX_PACKAGES = 60;
const MAX_STORY_IDS = 50;
const PACKAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
const MAX_LEGACY_BLOCKS = 200;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function assertNoDuplicateManualPins(
  value: unknown,
  packageId: string,
  path: string,
  owners: Map<number, string>
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDuplicateManualPins(entry, packageId, `${path}[${index}]`, owners));
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;

  if (record.type === "manual" && Array.isArray(record.storyIds)) {
    const sourceOwner = `${packageId}:${path}`;
    const sourceIds = new Set<number>();

    for (const id of record.storyIds) {
      if (!isPositiveInteger(id) || sourceIds.has(id)) continue;
      sourceIds.add(id);

      const previousOwner = owners.get(id);
      if (previousOwner && previousOwner !== sourceOwner) {
        throw new BylineDesignSchemaError(
          `Package "${packageId}" places story ${id} manually more than once (${previousOwner} and ${sourceOwner}).`
        );
      }
      owners.set(id, sourceOwner);
    }
  }

  for (const [key, child] of Object.entries(record)) {
    assertNoDuplicateManualPins(child, packageId, `${path}.${key}`, owners);
  }
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

function parsePackageStorySource(value: unknown, path: string, allowAthleteSpotlight = false) {
  if (
    allowAthleteSpotlight
    && value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).type === "athlete-spotlight"
  ) {
    return;
  }

  if (!parseStorySource(value)) {
    throw new BylineDesignSchemaError(`Design contains an invalid story source at ${path}.`);
  }
}

function assertPackageStorySources(props: Record<string, unknown>, packageId: string) {
  for (const slot of ["lead", "latest", "stories", "athleteSpotlight"]) {
    const config = props[slot];
    if (!isPlainRecord(config) || !Object.prototype.hasOwnProperty.call(config, "source")) continue;

    parsePackageStorySource(
      config.source,
      `package "${packageId}" props.${slot}.source`,
      slot === "athleteSpotlight"
    );
  }

  if (Object.prototype.hasOwnProperty.call(props, "source")) {
    parsePackageStorySource(props.source, `package "${packageId}" props.source`);
  }
}

// Rejects anything that is not a plain JSON tree. Persisted design props must
// stay serialisable and inert -- no functions, no prototypes, no cycles.
export function isSerialisableProps(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null) return true;

  const type = typeof value;

  if (type === "string" || type === "boolean") return true;
  if (type === "number") return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every((entry) => isSerialisableProps(entry, depth + 1));
  if (type !== "object") return false;

  const record = value as Record<string, unknown>;

  if (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null) return false;

  return Object.values(record).every((entry) => isSerialisableProps(entry, depth + 1));
}

export function parseBylineDesignDocumentV2(value: unknown, template: string): BylineDesignDocumentV2 {
  if (!value || typeof value !== "object") {
    throw new BylineDesignSchemaError(`Design ${template} is missing or malformed.`);
  }

  const document = value as Record<string, unknown>;

  if (document.schemaVersion !== BYLINE_DESIGN_SCHEMA_VERSION_V2) {
    throw new BylineDesignSchemaError(
      `Design ${template} uses schema ${String(document.schemaVersion ?? "unknown")}; this runtime reads schema 2.`
    );
  }
  if (document.template !== template) {
    throw new BylineDesignSchemaError(`Design ${template} has a mismatched template identity.`);
  }
  if (typeof document.theme !== "string" || THEME_ID_PATTERN.exec(document.theme) === null) {
    throw new BylineDesignSchemaError(`Design ${template} has an invalid theme identity.`);
  }
  if (!Array.isArray(document.packages)) {
    throw new BylineDesignSchemaError(`Design ${template} has no package list.`);
  }
  if (document.packages.length > MAX_PACKAGES) {
    throw new BylineDesignSchemaError(`Design ${template} exceeds the ${MAX_PACKAGES} package limit.`);
  }

  const seenIds = new Set<string>();
  const manualPinOwners = new Map<number, string>();
  const packages = document.packages.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new BylineDesignSchemaError(`Design ${template} package ${index} is malformed.`);
    }

    const designPackage = entry as Record<string, unknown>;

    if (typeof designPackage.id !== "string" || PACKAGE_ID_PATTERN.exec(designPackage.id) === null) {
      throw new BylineDesignSchemaError(`Design ${template} package ${index} has an invalid id.`);
    }
    if (seenIds.has(designPackage.id)) {
      throw new BylineDesignSchemaError(`Design ${template} repeats package id "${designPackage.id}".`);
    }
    seenIds.add(designPackage.id);

    if (!isBylinePackageType(designPackage.type)) {
      throw new BylineDesignSchemaError(
        `Design ${template} package "${designPackage.id}" uses unknown type "${String(designPackage.type)}".`
      );
    }
    if (!designPackage.props || typeof designPackage.props !== "object" || Array.isArray(designPackage.props)) {
      throw new BylineDesignSchemaError(`Design ${template} package "${designPackage.id}" has malformed props.`);
    }
    if (!isSerialisableProps(designPackage.props)) {
      throw new BylineDesignSchemaError(`Design ${template} package "${designPackage.id}" has unsafe props.`);
    }

    assertPackageStorySources(designPackage.props as Record<string, unknown>, designPackage.id);

    assertNoDuplicateManualPins(designPackage.props, designPackage.id, "props", manualPinOwners);

    return {
      id: designPackage.id,
      type: designPackage.type,
      props: designPackage.props as Record<string, unknown>
    };
  });

  let legacy: BylineDesignDocumentV2["legacy"] | undefined;

  if (document.legacy !== undefined) {
    if (!isPlainRecord(document.legacy) || document.legacy.schemaVersion !== 1) {
      throw new BylineDesignSchemaError(`Design ${template} has malformed legacy metadata.`);
    }

    const legacyValue = document.legacy;
    const editor = legacyValue.editor;
    const blocks = legacyValue.unconvertedBlocks;

    if (
      !isPlainRecord(editor) ||
      typeof editor.engine !== "string" ||
      typeof editor.version !== "string" ||
      !Array.isArray(blocks) ||
      blocks.length > MAX_LEGACY_BLOCKS ||
      !isSerialisableProps(legacyValue)
    ) {
      throw new BylineDesignSchemaError(`Design ${template} has unsafe or malformed legacy data.`);
    }

    for (const [index, block] of blocks.entries()) {
      if (
        !isPlainRecord(block) ||
        typeof block.type !== "string" ||
        !block.type.trim() ||
        !isPlainRecord(block.props) ||
        !isSerialisableProps(block.props)
      ) {
        throw new BylineDesignSchemaError(`Design ${template} legacy block ${index} is malformed.`);
      }
    }

    const packageIndexes = legacyValue.packageIndexes;

    if (packageIndexes !== undefined) {
      if (
        !Array.isArray(packageIndexes) ||
        packageIndexes.length !== blocks.length ||
        !packageIndexes.every((index) => typeof index === "number" && Number.isInteger(index) && index >= 0)
      ) {
        throw new BylineDesignSchemaError(`Design ${template} has malformed legacy ordering metadata.`);
      }
    }

    legacy = {
      schemaVersion: 1,
      editor: { engine: editor.engine, version: editor.version },
      unconvertedBlocks: blocks as BylineLegacyBlock[],
      ...(packageIndexes ? { packageIndexes: packageIndexes as number[] } : {})
    };
  }

  return {
    schemaVersion: 2,
    template,
    theme: document.theme,
    packages,
    ...(legacy ? { legacy } : {}),
    ...(typeof document.baseRevisionId === "number" ? { baseRevisionId: document.baseRevisionId } : {}),
    ...(typeof document.modifiedAt === "string" ? { modifiedAt: document.modifiedAt } : {})
  };
}
