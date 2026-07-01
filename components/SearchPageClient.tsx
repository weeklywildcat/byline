"use client";

import { useMemo, useRef, useState } from "react";
import { SiteIcon } from "@/components/SiteIcon";

export type SearchIndexItem = {
  id: number;
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

function normalizeSearch(value: string) {
  return value.toLowerCase().trim();
}

function scoreResult(item: SearchIndexItem, terms: string[]) {
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
  }, 0);
}

export function SearchPageClient({ items }: SearchPageClientProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    if (terms.length === 0) {
      return items.slice(0, 8);
    }

    return items
      .map((item) => ({
        item,
        score: scoreResult(item, terms)
      }))
      .filter((result) => result.score > -1000)
      .sort((left, right) => right.score - left.score || right.item.id - left.item.id)
      .slice(0, 24)
      .map((result) => result.item);
  }, [items, terms]);
  const hasQuery = terms.length > 0;

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

      <div className="search-results-header" aria-live="polite">
        <h2>{hasQuery ? "Search Results" : "Latest Stories"}</h2>
        <span>{results.length === 1 ? "1 story" : `${results.length} stories`}</span>
      </div>

      {results.length > 0 ? (
        <div className="search-result-list">
          {results.map((item) => (
            <article className="search-result" key={item.id}>
              <div className="search-result-meta">
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
