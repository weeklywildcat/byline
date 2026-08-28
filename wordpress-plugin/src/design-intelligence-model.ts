import type { BylineDesignDocumentV2, BylineDesignPackage } from "@byline/design";

export type DesignDiffOperation = {
  type: "added" | "removed" | "moved" | "changed";
  scope?: "document" | "package";
  packageId: string;
  packageType: string;
  fromPackageType?: string;
  fromIndex?: number;
  toIndex?: number;
  changedPaths?: string[];
  description: string;
};

export type DesignDiff = {
  changed: boolean;
  operations: DesignDiffOperation[];
};

export type DesignIntelligenceIssue = {
  code:
    | "duplicate-story"
    | "story-missing-image"
    | "story-not-public"
    | "empty-package"
    | "coverage-missing"
    | "coverage-empty"
    | "manual-story-unresolved";
  severity: "info" | "warning";
  packageId: string;
  storyId?: number;
  storyIds?: number[];
  coverageId?: number;
  message: string;
};

export type DesignIntelligence = {
  issues: DesignIntelligenceIssue[];
  storyIds: number[];
  duplicateStoryIds: number[];
};

/**
 * Public-safe Coverage state supplied by the host loader. The intelligence
 * model intentionally accepts only relationship/status signals; it never
 * needs a Coverage title, notes, staff list, or other private planning data.
 */
export type ResolvedCoverageState = {
  id: number;
  exists?: boolean;
  isPublic?: boolean;
  storyCount?: number;
  storyIds?: readonly number[];
  status?: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function packageLabel(type: string) {
  const labels: Record<string, string> = {
    "lead-package": "Lead",
    "brief-package": "Brief",
    "in-focus-package": "In Focus",
    "special-coverage-package": "Special Coverage",
    "opinion-package": "Opinion",
    "sports-package": "Sports",
    "more-package": "More",
    "newsletter-package": "Newsletter"
  };
  return labels[type] ?? type.replace(/-package$/, "").replace(/-/g, " ");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const candidate = record(value);
  if (!candidate) return value;

  return Object.fromEntries(
    Object.keys(candidate)
      .sort()
      .map((key) => [key, canonical(candidate[key])])
  );
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function humanPath(path: string) {
  return path
    .replace(/^props\.?/, "")
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceDescription(value: unknown): string {
  const source = record(value);
  if (!source || typeof source.type !== "string") return JSON.stringify(canonical(value));

  switch (source.type) {
    case "latest": return "Latest stories";
    case "sticky": return "Sticky stories";
    case "section": return `Section ${String(source.slug)}`;
    case "category": return `Category #${String(source.categoryId)}`;
    case "tag": return `Tag #${String(source.tagId)}`;
    case "author": return `Author #${String(source.authorId)}`;
    case "coverage": return `Coverage #${String(source.coverageId)}`;
    case "manual": return `Manually selected stories (${Array.isArray(source.storyIds) ? source.storyIds.join(", ") : ""})`;
    default: return source.type;
  }
}

function changedLeafPaths(left: unknown, right: unknown, path = "props"): string[] {
  if (equal(left, right)) return [];
  const leftRecord = record(left);
  const rightRecord = record(right);
  if (!leftRecord || !rightRecord || Array.isArray(left) || Array.isArray(right)) return [path];

  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  return keys.flatMap((key) => changedLeafPaths(leftRecord[key], rightRecord[key], `${path}.${key}`));
}

function packageChangedDescription(
  before: BylineDesignPackage,
  after: BylineDesignPackage,
  paths: string[]
) {
  const label = packageLabel(after.type);
  const sourcePath = paths.find((path) => path.endsWith("source"));
  if (sourcePath) {
    const beforeValue = sourcePath.split(".").slice(1).reduce<unknown>((value, key) => record(value)?.[key], before.props);
    const afterValue = sourcePath.split(".").slice(1).reduce<unknown>((value, key) => record(value)?.[key], after.props);
    return `${label} source changed from ${sourceDescription(beforeValue)} to ${sourceDescription(afterValue)}`;
  }
  return `${label} settings changed (${paths.map(humanPath).join(", ")})`;
}

/**
 * Produces an editor-facing diff from draft to live without exposing a JSON
 * patch. Package ids are the identity, so reordering the same package is a
 * move rather than a misleading remove/add pair; object key order is ignored.
 */
export function semanticDesignDiff(
  draft: BylineDesignDocumentV2,
  live: BylineDesignDocumentV2
): DesignDiff {
  const liveById = new Map(live.packages.map((entry, index) => [entry.id, { entry, index }]));
  const draftById = new Map(draft.packages.map((entry, index) => [entry.id, { entry, index }]));
  const operations: DesignDiffOperation[] = [];

  const documentChanges: string[] = [];
  if (draft.template !== live.template) documentChanges.push("template");
  if (draft.theme !== live.theme) documentChanges.push("theme");
  // Revision/timestamp fields are storage metadata, not editorial meaning.
  // Preserved legacy blocks are semantic because publishing still guards on
  // them and an editor needs to know when the safe migration payload changed.
  if (!equal(draft.legacy, live.legacy)) documentChanges.push("legacy");
  if (documentChanges.length > 0) {
    const description = documentChanges.length === 1 && documentChanges[0] === "theme"
      ? `Theme changed from ${live.theme} to ${draft.theme}`
      : `Design document changed (${documentChanges.join(", ")})`;
    operations.push({
      type: "changed",
      scope: "document",
      packageId: "__document__",
      packageType: "document",
      changedPaths: documentChanges,
      description
    });
  }

  draft.packages.forEach((entry, index) => {
    if (!liveById.has(entry.id)) {
      operations.push({
        type: "added",
        packageId: entry.id,
        packageType: entry.type,
        toIndex: index,
        description: `${packageLabel(entry.type)} package added`
      });
    }
  });

  live.packages.forEach((entry, index) => {
    if (!draftById.has(entry.id)) {
      operations.push({
        type: "removed",
        packageId: entry.id,
        packageType: entry.type,
        fromIndex: index,
        description: `${packageLabel(entry.type)} package removed`
      });
    }
  });

  draft.packages.forEach((entry, draftIndex) => {
    const before = liveById.get(entry.id);
    if (!before) return;

    if (before.index !== draftIndex) {
      operations.push({
        type: "moved",
        packageId: entry.id,
        packageType: entry.type,
        fromIndex: before.index,
        toIndex: draftIndex,
        description: `${packageLabel(entry.type)} package moved from position ${before.index + 1} to ${draftIndex + 1}`
      });
    }

    const paths = changedLeafPaths(before.entry.props, entry.props);
    if (before.entry.type !== entry.type || paths.length > 0) {
      operations.push({
        type: "changed",
        packageId: entry.id,
        packageType: entry.type,
        fromPackageType: before.entry.type !== entry.type ? before.entry.type : undefined,
        changedPaths: [
          ...(before.entry.type !== entry.type ? ["package type"] : []),
          ...paths
        ],
        description: before.entry.type !== entry.type
          ? `${packageLabel(before.entry.type)} package changed to ${packageLabel(entry.type)}`
          : packageChangedDescription(before.entry, entry, paths)
      });
    }
  });

  return { changed: operations.length > 0, operations };
}

export const getSemanticDesignDiff = semanticDesignDiff;

type StoryInsight = {
  packageId: string;
  id: number;
  hasImage: boolean | null;
  isPublic: boolean | null;
};

function storyInsight(value: unknown, packageId: string): StoryInsight | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== "number" || !Number.isInteger(candidate.id) || candidate.id <= 0) return null;

  const hasImage = typeof candidate.hasFeaturedImage === "boolean"
    ? candidate.hasFeaturedImage
    : Object.prototype.hasOwnProperty.call(candidate, "image")
      ? candidate.image !== null && candidate.image !== undefined
      : null;
  const status = typeof candidate.status === "string" ? candidate.status.toLowerCase() : "";
  const isPublic = typeof candidate.isPublic === "boolean"
    ? candidate.isPublic
    : typeof candidate.public === "boolean"
      ? candidate.public
      : ["draft", "pending", "future", "private", "trash"].includes(status)
        ? false
        : null;

  return { packageId, id: candidate.id, hasImage, isPublic };
}

function unwrapResolvedPackage(value: unknown, index: number) {
  const wrapper = record(value) ?? {};
  const candidate = record(wrapper.package) ?? wrapper;
  const packageId = typeof wrapper.packageId === "string"
    ? wrapper.packageId
    : typeof candidate.packageId === "string" ? candidate.packageId : `package-${index + 1}`;
  const type = typeof wrapper.type === "string"
    ? wrapper.type
    : typeof candidate.type === "string" ? candidate.type : "unknown-package";
  return { candidate, packageId, type };
}

function resolvedStories(candidate: UnknownRecord, packageId: string): StoryInsight[] {
  const stories: StoryInsight[] = [];
  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const insight = storyInsight(value, packageId);
    if (insight) stories.push(insight);
  };

  for (const key of ["lead", "story", "stories", "rail", "supporting", "items", "athleteSpotlight"]) {
    if (Object.prototype.hasOwnProperty.call(candidate, key)) add(candidate[key]);
  }
  const latest = record(candidate.latest);
  if (latest && Object.prototype.hasOwnProperty.call(latest, "stories")) add(latest.stories);
  if (Array.isArray(candidate.storyIds)) {
    candidate.storyIds.forEach((id) => add({ id }));
  }
  return stories;
}

function coverageSources(props: unknown): Array<{ coverageId: number }> {
  const found: Array<{ coverageId: number }> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const candidate = record(value);
    if (!candidate) return;
    if (candidate.type === "coverage" && typeof candidate.coverageId === "number" && Number.isInteger(candidate.coverageId)) {
      found.push({ coverageId: candidate.coverageId });
      return;
    }
    Object.values(candidate).forEach(visit);
  };
  visit(props);
  return found;
}

function manualStoryIds(props: unknown): number[] {
  const ids: number[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const candidate = record(value);
    if (!candidate) return;
    if (candidate.type === "manual" && Array.isArray(candidate.storyIds)) {
      candidate.storyIds.forEach((id) => {
        if (typeof id === "number" && Number.isInteger(id) && id > 0) ids.push(id);
      });
    }
    Object.values(candidate).forEach(visit);
  };
  visit(props);
  return [...new Set(ids)];
}

function storyPackage(type: string) {
  return type !== "newsletter-package" && type !== "unknown-package";
}

/**
 * Analyses the already-resolved document model. It never reads raw REST
 * payloads or private post metadata: only safe package/story ids and the
 * resolved public image/status signals are returned.
 */
export function analyzeResolvedDesign(input: {
  document?: BylineDesignDocumentV2;
  packages: readonly unknown[];
  /** When supplied, absence of a referenced Coverage is an explicit missing state. */
  coverages?: readonly ResolvedCoverageState[];
}): DesignIntelligence {
  const issues: DesignIntelligenceIssue[] = [];
  const storyOccurrences = new Map<number, Map<string, number>>();
  const resolvedStoryIds = new Set<number>();
  const coverageById = new Map((input.coverages ?? []).map((coverage) => [coverage.id, coverage]));

  input.packages.forEach((value, index) => {
    const { candidate, packageId, type } = unwrapResolvedPackage(value, index);
    const stories = resolvedStories(candidate, packageId);
    if (storyPackage(type) && stories.length === 0) {
      issues.push({
        code: "empty-package",
        severity: "info",
        packageId,
        message: `${packageLabel(type)} package resolves to no stories`
      });
    }

    stories.forEach((story) => {
      resolvedStoryIds.add(story.id);
      const packages = storyOccurrences.get(story.id) ?? new Map<string, number>();
      packages.set(packageId, (packages.get(packageId) ?? 0) + 1);
      storyOccurrences.set(story.id, packages);
      if (story.hasImage === false) {
        issues.push({
          code: "story-missing-image",
          severity: "warning",
          packageId,
          storyId: story.id,
          message: `Story ${story.id} in ${packageLabel(type)} has no featured image`
        });
      }
      if (story.isPublic === false) {
        issues.push({
          code: "story-not-public",
          severity: "warning",
          packageId,
          storyId: story.id,
          message: `Story ${story.id} in ${packageLabel(type)} is no longer public`
        });
      }
    });

    const designPackage = input.document?.packages.find((entry) => entry.id === packageId);
    const sources = coverageSources(designPackage?.props);
    sources.forEach(({ coverageId }) => {
      const packageCoverage = record(candidate.coverage ?? candidate.coverageRecord ?? candidate.coverageStatus);
      const loadedCoverage = coverageById.get(coverageId);
      const coverage = packageCoverage ?? loadedCoverage ?? null;
      const coverageRecord = record(coverage);
      const coverageStatus = typeof coverageRecord?.status === "string" ? coverageRecord.status.toLowerCase() : "";
      const missing = candidate.coverage === null
        || candidate.coverage === false
        || packageCoverage?.exists === false
        || packageCoverage?.found === false
        || loadedCoverage?.exists === false
        || loadedCoverage?.isPublic === false
        || ["missing", "deleted", "private", "draft", "pending", "trash"].includes(coverageStatus)
        || (input.coverages !== undefined && !loadedCoverage)
        // A Coverage source without any resolver/catalog signal is unresolved,
        // not a generic latest feed. Keep the warning explicit so the host can
        // fix its loader instead of presenting a misleading successful preview.
        || (input.coverages === undefined && !packageCoverage && !loadedCoverage);
      if (missing) {
        issues.push({
          code: "coverage-missing",
          severity: "warning",
          packageId,
          coverageId,
          message: `Coverage ${coverageId} is unavailable to the ${packageLabel(type)} package`
        });
      } else if (coverageRecord && (coverageRecord.empty === true
        || coverageRecord.storyCount === 0
        || (Array.isArray(coverageRecord.stories) && coverageRecord.stories.length === 0)
        || (Array.isArray(coverageRecord.storyIds) && coverageRecord.storyIds.length === 0))) {
        issues.push({
          code: "coverage-empty",
          severity: "info",
          packageId,
          coverageId,
          message: `Coverage ${coverageId} currently resolves to no public stories`
        });
      }
    });
  });

  const duplicateStoryIds = [...storyOccurrences.entries()]
    .filter(([, packages]) => [...packages.values()].reduce((total, count) => total + count, 0) > 1)
    .map(([id]) => id)
    .sort((left, right) => left - right);
  duplicateStoryIds.forEach((storyId) => {
    const occurrences = storyOccurrences.get(storyId) ?? new Map<string, number>();
    const packageIds = [...occurrences.keys()].sort();
    const location = packageIds.length > 1
      ? `multiple packages: ${packageIds.join(", ")}`
      : `multiple times in ${packageIds[0] ?? "the resolved design"}`;
    issues.push({
      code: "duplicate-story",
      severity: "warning",
      packageId: packageIds[0] ?? "unknown-package",
      storyId,
      storyIds: [storyId],
      message: `Story ${storyId} appears in ${location}`
    });
  });

  input.document?.packages.forEach((entry) => {
    manualStoryIds(entry.props).forEach((storyId) => {
      if (!resolvedStoryIds.has(storyId)) {
        issues.push({
          code: "manual-story-unresolved",
          severity: "warning",
          packageId: entry.id,
          storyId,
          message: `Manually pinned story ${storyId} is no longer available in the resolved public stories`
        });
      }
    });
  });

  return {
    issues,
    storyIds: [...resolvedStoryIds].sort((left, right) => left - right),
    duplicateStoryIds
  };
}

export const getDesignIntelligence = analyzeResolvedDesign;
