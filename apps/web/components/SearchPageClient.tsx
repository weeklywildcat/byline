"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SiteIcon } from "@/components/SiteIcon";
import { reportZeroResultSearch } from "@/lib/search-gap";
import {
  buildSearchFacets,
  DEFAULT_SEARCH_STATE,
  getItemKind,
  getResultLabel,
  getSearchTerms,
  getSearchUrl,
  highlightText,
  parseSearchUrlState,
  searchIndex,
  type SearchFacetOption,
  type SearchFilter,
  type SearchIndexItem,
  type SearchUrlState
} from "@/lib/search";

export type { SearchIndexItem } from "@/lib/search";
export {
  scoreSearchResult,
  scoreSearchResult as scoreResult,
  searchIndex,
  highlightText,
  parseSearchUrlState,
  serializeSearchUrlState
} from "@/lib/search";

type SearchPageClientProps = {
  items: SearchIndexItem[];
  publicationName: string;
  searchGapEndpoint?: string;
};

type SearchFacetKey = "section" | "author" | "topic";

function syncSearchUrl(state: SearchUrlState, mode: "push" | "replace") {
  const nextUrl = getSearchUrl(window.location.href, state);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) {
    return;
  }

  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
}

function HighlightedText({ value, terms }: { value: string; terms: string[] }) {
  return (
    <>
      {highlightText(value, terms).map((part, index) =>
        part.matched ? (
          <mark key={`${part.text}-${index}`}>{part.text}</mark>
        ) : (
          <Fragment key={`${part.text}-${index}`}>{part.text}</Fragment>
        )
      )}
    </>
  );
}

function FacetSelect({
  id,
  label,
  value,
  options,
  emptyLabel,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  options: SearchFacetOption[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search-facet-filter">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={options.length === 0} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchPageClient({ items, publicationName, searchGapEndpoint }: SearchPageClientProps) {
  const [searchState, setSearchState] = useState<SearchUrlState>(DEFAULT_SEARCH_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const facets = useMemo(() => buildSearchFacets(items), [items]);
  const terms = useMemo(() => getSearchTerms(searchState.query), [searchState.query]);
  const results = useMemo(() => searchIndex(items, searchState), [items, searchState]);
  const hasQuery = terms.length > 0;

  useEffect(() => {
    const applyUrlState = () => {
      setSearchState(parseSearchUrlState(window.location.search, facets));
    };

    applyUrlState();
    hydratedRef.current = true;
    window.addEventListener("popstate", applyUrlState);

    return () => window.removeEventListener("popstate", applyUrlState);
  }, [facets]);

  useEffect(() => {
    if (!hasQuery || results.length > 0) {
      return;
    }

    // A short delay avoids reporting every intermediate keystroke while still
    // recording a zero-result query when the reader pauses on it.
    const timer = window.setTimeout(() => reportZeroResultSearch(searchState.query, { endpoint: searchGapEndpoint }), 350);

    return () => window.clearTimeout(timer);
  }, [hasQuery, results.length, searchGapEndpoint, searchState.author, searchState.query, searchState.section, searchState.topic, searchState.type]);

  function updateSearchState(patch: Partial<SearchUrlState>, mode: "push" | "replace" = "replace") {
    const nextState = { ...searchState, ...patch };

    setSearchState(nextState);

    if (hydratedRef.current) {
      syncSearchUrl(nextState, mode);
    }
  }

  function updateFacet(key: SearchFacetKey, value: string) {
    updateSearchState({ [key]: value } as Partial<SearchUrlState>, "push");
  }

  const resultLabel = results.length === 1 ? "result" : "results";
  const resultHeading = hasQuery
    ? "Search Results"
    : searchState.type === "story" || searchState.type === "all"
      ? "Latest Stories and Hubs"
      : "Browse";
  const resultStatus = `${results.length} ${resultLabel}`;

  return (
    <section className="search-page" aria-labelledby="search-page-heading">
      <header className="search-page-header">
        <p>Search</p>
        <h1 id="search-page-heading">Find {publicationName} Stories</h1>
      </header>

      <form
        className="search-control"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <SiteIcon name="ph:magnifying-glass" width={20} height={20} />
        <label className="search-visually-hidden" htmlFor="search-query">
          Search {publicationName} stories
        </label>
        <input
          ref={inputRef}
          id="search-query"
          autoFocus
          type="search"
          value={searchState.query}
          onChange={(event) => updateSearchState({ query: event.target.value }, "replace")}
          onKeyDown={(event) => {
            if (event.key === "Escape" && searchState.query) {
              event.preventDefault();
              updateSearchState({ query: "" }, "replace");
            }
          }}
          placeholder="Search by headline, author, section, or topic"
          aria-label={`Search ${publicationName} stories`}
          aria-controls="search-results"
        />
        {searchState.query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              updateSearchState({ query: "" }, "replace");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      <fieldset className="search-kind-filter">
        <legend className="search-visually-hidden">Filter by result type</legend>
        {[
          { label: "All", value: "all" },
          { label: "Stories", value: "story" },
          { label: "Teams", value: "team" },
          { label: "Seasons", value: "season" },
          { label: "Games", value: "game" }
        ].map((option) => (
          <button
            aria-pressed={searchState.type === option.value}
            aria-controls="search-results"
            key={option.value}
            onClick={() => updateSearchState({ type: option.value as SearchFilter }, "push")}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <div className="search-facet-filters" aria-label="Filter search results">
        <FacetSelect
          id="search-section-filter"
          label="Section"
          value={searchState.section}
          options={facets.sections}
          emptyLabel="All sections"
          onChange={(value) => updateFacet("section", value)}
        />
        <FacetSelect
          id="search-author-filter"
          label="Author"
          value={searchState.author}
          options={facets.authors}
          emptyLabel="All authors"
          onChange={(value) => updateFacet("author", value)}
        />
        <FacetSelect
          id="search-topic-filter"
          label="Topic"
          value={searchState.topic}
          options={facets.topics}
          emptyLabel="All topics"
          onChange={(value) => updateFacet("topic", value)}
        />
      </div>

      <div className="search-results-header">
        <h2 id="search-results-heading">{resultHeading}</h2>
        <span id="search-results-status" role="status" aria-live="polite">
          {resultStatus}
        </span>
      </div>

      <div id="search-results" aria-describedby="search-results-status">
        {results.length > 0 ? (
          <div className="search-result-list">
            {results.map((item) => (
              <article className="search-result" key={item.id}>
                <div className="search-result-meta">
                  <span>{getResultLabel(getItemKind(item))}</span>
                  {item.category ? <span><HighlightedText value={item.category} terms={terms} /></span> : null}
                  {item.author ? <span><HighlightedText value={item.author} terms={terms} /></span> : null}
                  <time dateTime={item.sortDate}>{item.date}</time>
                </div>
                <h3>
                  <a href={item.href}><HighlightedText value={item.title} terms={terms} /></a>
                </h3>
                {item.excerpt ? <p><HighlightedText value={item.excerpt} terms={terms} /></p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state search-empty">
            {hasQuery ? (
              <>
                No results matched <q>{searchState.query}</q>. Try a broader search or clear a filter.
              </>
            ) : (
              "No published stories are available for this filter yet."
            )}
          </p>
        )}
      </div>
    </section>
  );
}
