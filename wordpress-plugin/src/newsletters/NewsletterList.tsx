import { Button, Notice, SearchControl, SelectControl, Spinner } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";

import type { NewsletterFetchers } from "./api";
import {
  NEWSLETTER_STATUSES,
  newsletterStatusLabel,
  type Newsletter,
  type NewsletterListFilters,
  type NewsletterProvider
} from "./models";
import { describeNewsletterError } from "./models";
import { ErrorState, formatNewsletterDate, NewsletterStatusBadge, OptionalUnavailable, ProviderStatus } from "./ui";

export type NewsletterListProps = {
  fetchers: NewsletterFetchers;
  initialFilters?: NewsletterListFilters;
  onOpen?: (newsletterId: number) => void;
  onCreate?: () => void;
  title?: string;
};

function providerFor(newsletter: Newsletter, providers: NewsletterProvider[]): NewsletterProvider | null {
  if (!newsletter.providerId) return null;
  return providers.find((provider) => provider.id === newsletter.providerId) || null;
}
export function NewsletterList({ fetchers, initialFilters = {}, onOpen, onCreate, title }: NewsletterListProps) {
  const [items, setItems] = useState<Newsletter[]>([]);
  const [providers, setProviders] = useState<NewsletterProvider[]>([]);
  const [filters, setFilters] = useState<NewsletterListFilters>({ status: "all", ...initialFilters });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchers.list(filters);
      setItems(result.items);
      if (result.providers?.length) {
        setProviders(result.providers);
        setProviderUnavailable(false);
      } else {
        try {
          const providerResult = await fetchers.providers();
          setProviders(providerResult.providers);
          setProviderUnavailable(false);
        } catch {
          // Providers are optional for the list; rows can still be managed.
          setProviders([]);
          setProviderUnavailable(true);
        }
      }
    } catch (loadError: unknown) {
      setItems([]);
      setError(describeNewsletterError(loadError, __("Newsletters could not be loaded.", "weekly-wildcat-headless")));
    } finally {
      setIsLoading(false);
    }
  }, [fetchers, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(() => [
    { label: __("All statuses", "weekly-wildcat-headless"), value: "all" },
    ...NEWSLETTER_STATUSES.map((status) => ({ label: newsletterStatusLabel(status), value: status }))
  ], []);

  return (
    <section className="byline-newsletter-screen byline-newsletter-list" aria-labelledby="byline-newsletter-list-title">
      <header className="byline-newsletter-screen-header">
        <div>
          <h1 id="byline-newsletter-list-title">{title || __("Newsletters", "weekly-wildcat-headless")}</h1>
          <p>{__("Prepare, review, and send publication newsletters without exposing provider credentials.", "weekly-wildcat-headless")}</p>
        </div>
        <div className="byline-newsletter-header-actions">
          <Button variant="secondary" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? <Spinner /> : __("Refresh", "weekly-wildcat-headless")}
          </Button>
          {onCreate ? <Button variant="primary" onClick={onCreate}>{__("New newsletter", "weekly-wildcat-headless")}</Button> : null}
        </div>
      </header>

      <div className="byline-newsletter-filters" role="search" aria-label={__("Filter newsletters", "weekly-wildcat-headless")}>
        <SearchControl
          label={__("Search newsletters", "weekly-wildcat-headless")}
          value={filters.search || ""}
          onChange={(search: string) => setFilters((current) => ({ ...current, search }))}
          placeholder={__("Search by title or subject", "weekly-wildcat-headless")}
        />
        <SelectControl
          __nextHasNoMarginBottom
          label={__("Status", "weekly-wildcat-headless")}
          value={filters.status || "all"}
          options={statusOptions}
          onChange={(status: string) => setFilters((current) => ({ ...current, status: status as NewsletterListFilters["status"] }))}
        />
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {providerUnavailable ? (
        <OptionalUnavailable>
          {__("Provider status is unavailable. You can still open drafts; sending actions will remain hidden until provider capabilities are loaded.", "weekly-wildcat-headless")}
        </OptionalUnavailable>
      ) : null}

      {isLoading && !items.length ? (
        <div className="byline-newsletter-loading" role="status" aria-live="polite">
          <Spinner /> <span>{__("Loading newsletters…", "weekly-wildcat-headless")}</span>
        </div>
      ) : items.length ? (
        <div className="byline-newsletter-table-wrap">
          <table className="widefat striped byline-newsletter-table">
            <caption className="screen-reader-text">{__("Newsletter issues", "weekly-wildcat-headless")}</caption>
            <thead>
              <tr>
                <th scope="col">{__("Issue", "weekly-wildcat-headless")}</th>
                <th scope="col">{__("Status", "weekly-wildcat-headless")}</th>
                <th scope="col">{__("Audience", "weekly-wildcat-headless")}</th>
                <th scope="col">{__("Provider", "weekly-wildcat-headless")}</th>
                <th scope="col">{__("Scheduled / sent", "weekly-wildcat-headless")}</th>
                <th scope="col"><span className="screen-reader-text">{__("Actions", "weekly-wildcat-headless")}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((newsletter) => {
                const provider = providerFor(newsletter, providers);
                const date = newsletter.sentAt || newsletter.scheduledAt;
                return (
                  <tr key={newsletter.id}>
                    <th scope="row">
                      {onOpen ? (
                        <Button variant="link" onClick={() => onOpen(newsletter.id)}>{newsletter.title || __("Untitled newsletter", "weekly-wildcat-headless")}</Button>
                      ) : (
                        newsletter.title || __("Untitled newsletter", "weekly-wildcat-headless")
                      )}
                      {newsletter.subject ? <span className="byline-newsletter-secondary-text">{newsletter.subject}</span> : null}
                    </th>
                    <td><NewsletterStatusBadge status={newsletter.status} /></td>
                    <td>{newsletter.audience || <span className="byline-newsletter-muted">{__("Not selected", "weekly-wildcat-headless")}</span>}</td>
                    <td>
                      {provider ? (
                        <>
                          <span>{provider.label}</span>{" "}<ProviderStatus status={provider.connectionStatus} configured={provider.configured} />
                        </>
                      ) : newsletter.providerId ? (
                        <span className="byline-newsletter-muted">{newsletter.providerId}</span>
                      ) : (
                        <span className="byline-newsletter-muted">{__("Not selected", "weekly-wildcat-headless")}</span>
                      )}
                    </td>
                    <td>{date ? <time dateTime={date} title={formatNewsletterDate(date)}>{formatNewsletterDate(date)}</time> : <span className="byline-newsletter-muted">—</span>}</td>
                    <td>{onOpen ? <Button variant="secondary" onClick={() => onOpen(newsletter.id)}>{__("Open", "weekly-wildcat-headless")}</Button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <Notice status="info" isDismissible={false}>
          <p>{filters.search || filters.status !== "all" ? __("No newsletters match these filters.", "weekly-wildcat-headless") : __("No newsletter issues yet. Create a draft to start an edition.", "weekly-wildcat-headless")}</p>
          {!filters.search && filters.status === "all" && onCreate ? <Button variant="primary" onClick={onCreate}>{__("Create a newsletter", "weekly-wildcat-headless")}</Button> : null}
        </Notice>
      ) : null}
    </section>
  );
}
