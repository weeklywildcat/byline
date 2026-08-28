export const SEARCH_ITEM_KINDS = ["story", "team", "season", "game"] as const;

export type SearchItemKind = (typeof SEARCH_ITEM_KINDS)[number];
export type SearchFilter = "all" | SearchItemKind;

export type SearchIndexItem = {
  id: number | string;
  kind?: SearchItemKind;
  title: string;
  excerpt: string;
  href: string;
  category: string;
  /** URL-safe section/category value used by the shareable filter. */
  section?: string;
  /** Human-readable section/category label. */
  sectionLabel?: string;
  author: string;
  /** URL-safe author value used by the shareable filter. */
  authorKey?: string;
  /** Individual contributor values when a story has multiple bylines. */
  authorOptions?: SearchFacetOption[];
  /** URL-safe topic/tag values used by the shareable filter. */
  topics?: string[];
  /** Optional human-readable labels for topic/tag values. */
  topicLabels?: Record<string, string>;
  date: string;
  /** ISO-like value used for stable sorting and the recency nudge. */
  sortDate?: string;
  searchText: string;
};

export type SearchUrlState = {
  query: string;
  type: SearchFilter;
  section: string;
  author: string;
  topic: string;
};

export type SearchFacetOption = {
  value: string;
  label: string;
};

export type SearchFacets = {
  sections: SearchFacetOption[];
  authors: SearchFacetOption[];
  topics: SearchFacetOption[];
};

export const DEFAULT_SEARCH_STATE: SearchUrlState = {
  query: "",
  type: "all",
  section: "",
  author: "",
  topic: ""
};

export const SEARCH_URL_KEYS = ["q", "type", "section", "author", "topic"] as const;

export function normalizeSearch(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getSearchTerms(value: string) {
  return normalizeSearch(value).split(/[^a-z0-9]+/).filter(Boolean);
}

export function toSearchFacetValue(value: string) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getItemKind(item: SearchIndexItem): SearchItemKind {
  return item.kind ?? "story";
}

export function getResultLabel(kind: SearchItemKind) {
  if (kind === "team") return "Team";
  if (kind === "season") return "Season";
  if (kind === "game") return "Game";

  return "Story";
}

function getSectionKey(item: SearchIndexItem) {
  return item.section?.trim() || toSearchFacetValue(item.category);
}

function getSectionLabel(item: SearchIndexItem) {
  return item.sectionLabel?.trim() || item.category.trim();
}

function getAuthorKey(item: SearchIndexItem) {
  return item.authorKey?.trim() || toSearchFacetValue(item.author);
}

function getAuthorEntries(item: SearchIndexItem): SearchFacetOption[] {
  if (item.authorOptions?.length) {
    return item.authorOptions
      .map((option) => ({ value: option.value.trim(), label: option.label.trim() }))
      .filter((option) => option.value && option.label);
  }

  const keys = (item.authorKey ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const labels = item.author.split(/\s*,\s*/).map((value) => value.trim()).filter(Boolean);

  if (keys.length > 1 && keys.length === labels.length) {
    return keys.map((value, index) => ({ value, label: labels[index] }));
  }

  return [{ value: getAuthorKey(item), label: item.author.trim() }].filter((option) => option.value && option.label);
}

function getTopicEntries(item: SearchIndexItem) {
  return (item.topics ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({
      value,
      label: item.topicLabels?.[value]?.trim() || value.replace(/[-_]+/g, " ")
    }));
}

function addFacetOption(options: Map<string, SearchFacetOption>, value: string, label: string) {
  const normalizedValue = value.trim();
  const normalizedLabel = label.trim();

  if (!normalizedValue || !normalizedLabel || options.has(normalizedValue)) {
    return;
  }

  options.set(normalizedValue, { value: normalizedValue, label: normalizedLabel });
}

function sortFacetOptions(options: Map<string, SearchFacetOption>) {
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export function buildSearchFacets(items: SearchIndexItem[]): SearchFacets {
  const sections = new Map<string, SearchFacetOption>();
  const authors = new Map<string, SearchFacetOption>();
  const topics = new Map<string, SearchFacetOption>();

  items.forEach((item) => {
    addFacetOption(sections, getSectionKey(item), getSectionLabel(item));
    getAuthorEntries(item).forEach((author) => addFacetOption(authors, author.value, author.label));

    getTopicEntries(item).forEach((topic) => addFacetOption(topics, topic.value, topic.label));
  });

  return {
    sections: sortFacetOptions(sections),
    authors: sortFacetOptions(authors),
    topics: sortFacetOptions(topics)
  };
}

function getSearchParams(search: string | URLSearchParams) {
  if (search instanceof URLSearchParams) {
    return search;
  }

  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function getAllowedFacetValue(value: string | null, options: SearchFacetOption[] | undefined) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue || !options) {
    return normalizedValue;
  }

  return options.some((option) => option.value === normalizedValue) ? normalizedValue : "";
}

export function parseSearchUrlState(search: string | URLSearchParams, facets?: SearchFacets): SearchUrlState {
  const params = getSearchParams(search);
  const requestedType = params.get("type");
  const type = SEARCH_ITEM_KINDS.includes(requestedType as SearchItemKind) ? (requestedType as SearchItemKind) : "all";

  return {
    query: normalizeSearch(params.get("q") ?? ""),
    type,
    section: getAllowedFacetValue(params.get("section"), facets?.sections),
    author: getAllowedFacetValue(params.get("author"), facets?.authors),
    topic: getAllowedFacetValue(params.get("topic"), facets?.topics)
  };
}

export function serializeSearchUrlState(state: SearchUrlState) {
  const params = new URLSearchParams();
  const query = normalizeSearch(state.query);

  if (query) params.set("q", query);
  if (state.type !== "all") params.set("type", state.type);
  if (state.section) params.set("section", state.section);
  if (state.author) params.set("author", state.author);
  if (state.topic) params.set("topic", state.topic);

  return params.toString();
}

/** Apply search state while retaining unrelated query parameters and the hash. */
export function getSearchUrl(urlValue: string, state: SearchUrlState) {
  const url = new URL(urlValue, "https://byline.invalid");

  SEARCH_URL_KEYS.forEach((key) => url.searchParams.delete(key));
  const serialized = new URLSearchParams(serializeSearchUrlState(state));

  serialized.forEach((value, key) => url.searchParams.set(key, value));

  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

function levenshteinDistance(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    let rowMinimum = current[0];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      const value = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + cost
      );

      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[right.length];
}

function typoDistanceForTerm(term: string) {
  if (term.length < 4) return 0;
  if (term.length < 7) return 1;

  return 2;
}

function tokenise(value: string) {
  return normalizeSearch(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function hasTypoMatch(term: string, values: string[]) {
  const maxDistance = typoDistanceForTerm(term);

  if (maxDistance === 0) {
    return false;
  }

  return values.some((value) =>
    tokenise(value).some((token) => levenshteinDistance(term, token, maxDistance) <= maxDistance)
  );
}

type SearchTermMatch = {
  matched: boolean;
  fuzzy: boolean;
  title: boolean;
  titlePrefix: boolean;
  section: boolean;
  author: boolean;
  topic: boolean;
  broad: boolean;
};

function matchSearchTerm(item: SearchIndexItem, term: string): SearchTermMatch {
  const title = normalizeSearch(item.title);
  const section = normalizeSearch(`${item.category} ${item.sectionLabel ?? ""} ${item.section ?? ""}`);
  const author = normalizeSearch(`${item.author} ${item.authorKey ?? ""}`);
  const topics = getTopicEntries(item).flatMap((topic) => [topic.value, topic.label]);
  const broad = normalizeSearch(`${item.searchText} ${section} ${author} ${topics.join(" ")}`);
  const titleMatch = title.includes(term);
  const sectionMatch = section.includes(term);
  const authorMatch = author.includes(term);
  const topicMatch = topics.some((topic) => normalizeSearch(topic).includes(term));
  const broadMatch = broad.includes(term);
  const fuzzy = !broadMatch && hasTypoMatch(term, [title, section, author, ...topics, item.searchText]);

  return {
    matched: broadMatch || fuzzy,
    fuzzy,
    title: titleMatch,
    titlePrefix: title.startsWith(term),
    section: sectionMatch,
    author: authorMatch,
    topic: topicMatch,
    broad: broadMatch
  };
}

function getKindBoost(item: SearchIndexItem) {
  const kind = getItemKind(item);

  return kind === "team" ? 12 : kind === "season" ? 6 : kind === "story" ? 3 : 0;
}

function getRecencyBoost(item: SearchIndexItem) {
  const timestamp = Date.parse(item.sortDate ?? item.date);

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageInDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);

  return Math.max(0, Math.min(2, 2 - ageInDays / 30));
}

/**
 * Score a result only after every required term has matched. Returning
 * -Infinity makes the inclusion invariant explicit and prevents a later term
 * from resurrecting a result that an earlier term rejected.
 */
export function scoreSearchResult(item: SearchIndexItem, terms: string[]) {
  const normalizedTerms = terms.map(normalizeSearch).filter(Boolean);

  if (normalizedTerms.length === 0) {
    return getKindBoost(item);
  }

  const matches = normalizedTerms.map((term) => matchSearchTerm(item, term));

  if (matches.some((match) => !match.matched)) {
    return Number.NEGATIVE_INFINITY;
  }

  const title = normalizeSearch(item.title);
  const phrase = normalizedTerms.join(" ");
  let score = getKindBoost(item) + getRecencyBoost(item);

  matches.forEach((match) => {
    if (match.title) score += 6;
    if (match.titlePrefix) score += 2;
    if (match.section) score += 4;
    if (match.author) score += 3;
    if (match.topic) score += 2;
    if (match.broad) score += 1;
    if (match.fuzzy) score -= 1;
  });

  if (title.includes(phrase)) {
    score += 12;
  }

  return score;
}

export function matchesSearchFilters(item: SearchIndexItem, state: SearchUrlState) {
  if (state.type !== "all" && getItemKind(item) !== state.type) {
    return false;
  }

  if (state.section && getSectionKey(item) !== state.section) {
    return false;
  }

  if (state.author && !getAuthorEntries(item).some((author) => author.value === state.author)) {
    return false;
  }

  if (state.topic && !getTopicEntries(item).some((topic) => topic.value === state.topic)) {
    return false;
  }

  return true;
}

export function limitMixedResults(results: SearchIndexItem[]) {
  const counts: Record<SearchItemKind, number> = {
    story: 0,
    team: 0,
    season: 0,
    game: 0
  };
  const caps: Record<SearchItemKind, number> = {
    story: 12,
    team: 8,
    season: 8,
    game: 4
  };
  const limited: SearchIndexItem[] = [];

  results.forEach((item) => {
    const kind = getItemKind(item);

    if (limited.length >= 24 || counts[kind] >= caps[kind]) {
      return;
    }

    counts[kind] += 1;
    limited.push(item);
  });

  return limited;
}

export function searchIndex(items: SearchIndexItem[], state: SearchUrlState) {
  const filteredItems = items.filter((item) => matchesSearchFilters(item, state));
  const terms = getSearchTerms(state.query);

  if (terms.length === 0) {
    const browseItems = state.type === "all" ? filteredItems.filter((item) => getItemKind(item) !== "game") : filteredItems;

    return browseItems.slice(0, 8);
  }

  const scoredResults = filteredItems
    .map((item) => ({ item, score: scoreSearchResult(item, terms) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.item.sortDate ?? right.item.date).localeCompare(left.item.sortDate ?? left.item.date) ||
        left.item.title.localeCompare(right.item.title)
    )
    .map(({ item }) => item);

  return state.type === "all" ? limitMixedResults(scoredResults) : scoredResults.slice(0, 24);
}

export type SearchHighlightPart = {
  text: string;
  matched: boolean;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split plain text into safe React-renderable pieces without injecting HTML. */
export function highlightText(value: string, terms: string[]): SearchHighlightPart[] {
  const normalizedTerms = [...new Set(terms.map(normalizeSearch).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );

  if (!value || normalizedTerms.length === 0) {
    return [{ text: value, matched: false }];
  }

  const pattern = new RegExp(`(${normalizedTerms.map(escapeRegExp).join("|")})`, "gi");
  const parts: SearchHighlightPart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, index), matched: false });
    }

    parts.push({ text: match[0], matched: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), matched: false });
  }

  return parts.length > 0 ? parts : [{ text: value, matched: false }];
}
