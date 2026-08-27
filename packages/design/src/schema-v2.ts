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

export const BYLINE_DESIGN_SCHEMA_VERSION_V2 = 2;

// Semantic package identifiers. Only the packages that are actually implemented
// end-to-end belong here -- an id in this list is a promise that a resolver and
// a renderer exist for it.
export const BYLINE_PACKAGE_TYPES = ["lead-package"] as const;

export type BylinePackageType = (typeof BYLINE_PACKAGE_TYPES)[number];

// How a package chooses its stories. Deliberately editorial: an editor picks
// "the newest story in Opinion", not a REST query string.
export type BylineStorySource =
  | { type: "latest" }
  | { type: "sticky" }
  | { type: "category"; categoryId: number }
  | { type: "tag"; tagId: number }
  | { type: "author"; authorId: number }
  | { type: "manual"; storyIds: number[] };

export type BylineDesignPackage<Props = Record<string, unknown>> = {
  // Stable instance id. Survives reordering and retitling so drafts, revisions
  // and preview selection can all refer to the same package.
  id: string;
  type: BylinePackageType;
  props: Props;
};

// v1 blocks that have no faithful v2 package are preserved here verbatim rather
// than being force-translated into something that would render differently.
// They are never rendered; they exist so a migration is not lossy and so a later
// phase can convert them once the matching package exists.
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
  };
  baseRevisionId?: number;
  modifiedAt?: string;
};

export class BylineDesignSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignSchemaError";
  }
}

const MAX_PACKAGES = 60;
const MAX_STORY_IDS = 50;
const PACKAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THEME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isBylinePackageType(value: unknown): value is BylinePackageType {
  return typeof value === "string" && (BYLINE_PACKAGE_TYPES as readonly string[]).includes(value);
}

export function parseStorySource(value: unknown): BylineStorySource | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;

  if (source.type === "latest" || source.type === "sticky") return { type: source.type };
  if (source.type === "category" && isPositiveInteger(source.categoryId)) {
    return { type: "category", categoryId: source.categoryId };
  }
  if (source.type === "tag" && isPositiveInteger(source.tagId)) return { type: "tag", tagId: source.tagId };
  if (source.type === "author" && isPositiveInteger(source.authorId)) {
    return { type: "author", authorId: source.authorId };
  }
  if (source.type === "manual") {
    if (!Array.isArray(source.storyIds) || !source.storyIds.every(isPositiveInteger)) return null;
    const storyIds = [...new Set(source.storyIds as number[])];

    return storyIds.length <= MAX_STORY_IDS ? { type: "manual", storyIds } : null;
  }

  return null;
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

    return {
      id: designPackage.id,
      type: designPackage.type,
      props: designPackage.props as Record<string, unknown>
    };
  });

  const legacy = document.legacy as Record<string, unknown> | undefined;

  return {
    schemaVersion: 2,
    template,
    theme: document.theme,
    packages,
    ...(legacy && Array.isArray(legacy.unconvertedBlocks)
      ? {
          legacy: {
            schemaVersion: 1 as const,
            editor: {
              engine: String((legacy.editor as Record<string, unknown>)?.engine ?? "unknown"),
              version: String((legacy.editor as Record<string, unknown>)?.version ?? "unknown")
            },
            unconvertedBlocks: legacy.unconvertedBlocks as BylineLegacyBlock[]
          }
        }
      : {}),
    ...(typeof document.baseRevisionId === "number" ? { baseRevisionId: document.baseRevisionId } : {}),
    ...(typeof document.modifiedAt === "string" ? { modifiedAt: document.modifiedAt } : {})
  };
}
