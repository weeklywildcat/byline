import type { SearchIndexItem } from "@/lib/search";

export const SEARCH_INDEX_SCHEMA_VERSION = 1 as const;
export const SEARCH_INDEX_URL = "/_byline/search-index.json";

export type SearchIndexDocument = {
  schemaVersion: typeof SEARCH_INDEX_SCHEMA_VERSION;
  items: SearchIndexItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFacetOptions(value: unknown): value is Array<{ value: string; label: string }> {
  return Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.value === "string" && typeof entry.label === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isSearchIndexItem(value: unknown): value is SearchIndexItem {
  if (!isRecord(value)) return false;

  return (
    !("searchText" in value) &&
    (typeof value.id === "string" || typeof value.id === "number") &&
    (value.kind === undefined || value.kind === "story" || value.kind === "team" || value.kind === "season" || value.kind === "game") &&
    typeof value.title === "string" &&
    typeof value.excerpt === "string" &&
    typeof value.href === "string" &&
    typeof value.category === "string" &&
    typeof value.author === "string" &&
    typeof value.date === "string" &&
    (value.section === undefined || typeof value.section === "string") &&
    (value.sectionLabel === undefined || typeof value.sectionLabel === "string") &&
    (value.authorKey === undefined || typeof value.authorKey === "string") &&
    (value.authorOptions === undefined || isFacetOptions(value.authorOptions)) &&
    (value.topics === undefined || isStringArray(value.topics)) &&
    (value.topicLabels === undefined || isStringRecord(value.topicLabels)) &&
    (value.sortDate === undefined || typeof value.sortDate === "string") &&
    (value.searchTokens === undefined || isStringArray(value.searchTokens))
  );
}

export function createSearchIndexDocument(items: SearchIndexItem[]): SearchIndexDocument {
  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    items
  };
}

export function parseSearchIndexDocument(value: unknown): SearchIndexDocument {
  if (!isRecord(value) || value.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION || !Array.isArray(value.items)) {
    throw new Error(`Unsupported search index schema. Expected version ${SEARCH_INDEX_SCHEMA_VERSION}.`);
  }

  if (!value.items.every(isSearchIndexItem)) {
    throw new Error("Search index contains an invalid item.");
  }

  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    items: value.items
  };
}
