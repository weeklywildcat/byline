"use client";

import { useMemo, useRef, useState } from "react";
import { SiteIcon } from "@/components/SiteIcon";

export type SearchIndexItem = {
  id: number | string;
  kind?: "story" | "team" | "season" | "game";
  title: string;
  excerpt: string;
  href: string;
  category: string;
  author: string;
  date: string;
  searchText: string;
};

type SearchPageClientProps = {
  items: SearchIndexItem[];
};

type SearchItemKind = NonNullable<SearchIndexItem["kind"]>;
type SearchFilter = "all" | SearchItemKind;

function normalizeSearch(value: string) {
  return value.toLowerCase().trim();
}

function scoreResult(item: SearchIndexItem, terms: string[]) {
  const kind = getItemKind(item);
  const kindBoost = kind === "team" ? 12 : kind === "season" ? 6 : kind === "story" ? 3 : 0;

  return terms.reduce((score, term) => {
    if (item.title.toLowerCase().includes(term)) {
      return score + 6;
    }

    if (item.category.toLowerCase().includes(term)) {
      return score + 4;
    }

    if (item.author.toLowerCase().includes(term)) {
      return score + 3;
    }

    if (item.searchText.includes(term)) {
      return score + 1;
    }

    return -1000;
  }, kindBoost);
}

function getItemKind(item: SearchIndexItem): SearchItemKind {
  return item.kind ?? "story";
}

function getResultLabel(kind: SearchItemKind) {
  if (kind === "team") return "Team";
  if (kind === "season") return "Season";
  if (kind === "game") return "Game";

  return "Story";
}

function limitMixedResults(results: SearchIndexItem[]) {
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

export function SearchPageClient({ items }: SearchPageClientProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    const filteredItems = filter === "all" ? items : items.filter((item) => getItemKind(item) === filter);

    if (terms.length === 0) {
      return filteredItems.filter((item) => getItemKind(item) !== "game").slice(0, 8);
    }

    const scoredResults = filteredItems
      .map((item) => ({
        item,
        score: scoreResult(item, terms)
      }))
      .filter((result) => result.score > -1000)
      .sort((left, right) => right.score - left.score || right.item.date.localeCompare(left.item.date) || left.item.title.localeCompare(right.item.title))
      .map((result) => result.item);

    return filter === "all" ? limitMixedResults(scoredResults) : scoredResults.slice(0, 24);
  }, [filter, items, terms]);
  const hasQuery = terms.length > 0;
  const resultLabel = results.length === 1 ? "result" : "results";
  const resultHeading = hasQuery ? "Search Results" : filter === "story" || filter === "all" ? "Latest Stories and Hubs" : "Browse";

  return (
    <section className="search-page" aria-labelledby="search-page-heading">
      <header className="search-page-header">
        <p>Search</p>
        <h1 id="search-page-heading">Find Weekly Wildcat Stories</h1>
      </header>

      <div className="search-control">
        <SiteIcon name="ph:magnifying-glass" width={20} height={20} />
        <input
          ref={inputRef}
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by headline, author, section, or topic"
          aria-label="Search Weekly Wildcat stories"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="search-kind-filter" aria-label="Search result type">
        {[
          { label: "All", value: "all" },
          { label: "Stories", value: "story" },
          { label: "Teams", value: "team" },
          { label: "Seasons", value: "season" },
          { label: "Games", value: "game" }
        ].map((option) => (
          <button
            aria-pressed={filter === option.value}
            key={option.value}
            onClick={() => setFilter(option.value as SearchFilter)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="search-results-header" aria-live="polite">
        <h2>{resultHeading}</h2>
        <span>{results.length === 1 ? `1 ${resultLabel}` : `${results.length} ${resultLabel}`}</span>
      </div>

      {results.length > 0 ? (
        <div className="search-result-list">
          {results.map((item) => (
            <article className="search-result" key={item.id}>
              <div className="search-result-meta">
                <span>{getResultLabel(getItemKind(item))}</span>
                {item.category ? <span>{item.category}</span> : null}
                {item.author ? <span>{item.author}</span> : null}
                <time>{item.date}</time>
              </div>
              <h3>
                <a href={item.href}>{item.title}</a>
              </h3>
              {item.excerpt ? <p>{item.excerpt}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state search-empty">No stories matched that search.</p>
      )}
    </section>
  );
}
