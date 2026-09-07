import {
  ARCHIVE_RENDER_VERSION,
  ARTICLE_RENDER_VERSION,
  BUILD_CACHE_SCHEMA,
  GLOBAL_LAYOUT_VERSION,
  SPORTS_RENDER_VERSION
} from "./versions";

function canonicalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Cannot digest a cyclic value.");
    seen.add(value);
    try {
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, seen));
      if (value instanceof Map) {
        return [...value.entries()]
          .map(([key, entry]) => [canonicalize(key, seen), canonicalize(entry, seen)] as const)
          .sort(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      }
      if (value instanceof Set) {
        return [...value].map((entry) => canonicalize(entry, seen)).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined && typeof entry !== "function")
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonicalize(entry, seen)])
      );
    } finally {
      seen.delete(value);
    }
  }
  return String(value);
}

export function stableSerialize(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

/** A deterministic 64-bit FNV-1a digest. Cache keys are identities, not signatures. */
export function stableDigest(value: unknown) {
  const input = stableSerialize(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function articleRouteDigest(dependencies: unknown) {
  return stableDigest([BUILD_CACHE_SCHEMA, ARTICLE_RENDER_VERSION, GLOBAL_LAYOUT_VERSION, dependencies]);
}

export function archiveRouteDigest(dependencies: unknown) {
  return stableDigest([BUILD_CACHE_SCHEMA, ARCHIVE_RENDER_VERSION, GLOBAL_LAYOUT_VERSION, dependencies]);
}

export function sportsRouteDigest(dependencies: unknown) {
  return stableDigest([BUILD_CACHE_SCHEMA, SPORTS_RENDER_VERSION, GLOBAL_LAYOUT_VERSION, dependencies]);
}
