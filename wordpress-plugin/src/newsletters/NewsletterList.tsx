import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";
import { RefreshCw } from "lucide-react";
import { Button, SearchControl, SelectControl, Spinner } from "../admin-ui/components/legacy-control-adapters";
import { useDebouncedValue, useElementWidth } from "../admin-ui/lib/hooks";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "../admin-ui/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../admin-ui/ui/table";
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

const TABLE_MIN_WIDTH = 760;
const DEFAULT_PER_PAGE = 25;

function providerFor(newsletter: Newsletter, providers: NewsletterProvider[]): NewsletterProvider | null {
  if (!newsletter.providerId) return null;
  return providers.find((provider) => provider.id === newsletter.providerId) || null;
}

export function NewsletterList({ fetchers, initialFilters = {}, onOpen, onCreate, title }: NewsletterListProps) {
  const [items, setItems] = useState<Newsletter[]>([]);
  const [providers, setProviders] = useState<NewsletterProvider[]>([]);
  const [filters, setFilters] = useState<NewsletterListFilters>({ status: "all", page: 1, perPage: DEFAULT_PER_PAGE, ...initialFilters });
  const [total, setTotal] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [tableRef, width] = useElementWidth<HTMLDivElement>();
  const debouncedSearch = useDebouncedValue(filters.search || "", 250);
  const { status, audience, page: filterPage, perPage: filterPerPage } = filters;
  const requestFilters = useMemo(() => ({ status, audience, page: filterPage, perPage: filterPerPage, search: debouncedSearch }), [audience, debouncedSearch, filterPage, filterPerPage, status]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchers.list(requestFilters);
      setItems(result.items);
      setTotal(result.total);
      if (result.providers?.length) {
        setProviders(result.providers);
        setProviderUnavailable(false);
      } else {
        try {
          const providerResult = await fetchers.providers();
          setProviders(providerResult.providers);
          setProviderUnavailable(false);
        } catch {
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
  }, [fetchers, requestFilters]);

  useEffect(() => { void load(); }, [load]);

  const statusOptions = useMemo(() => [
    { label: __("All statuses", "weekly-wildcat-headless"), value: "all" },
    ...NEWSLETTER_STATUSES.map((status) => ({ label: newsletterStatusLabel(status), value: status }))
  ], []);

  const page = filters.page || 1;
  const perPage = filters.perPage || DEFAULT_PER_PAGE;
  const pages = total ? Math.max(1, Math.ceil(total / perPage)) : 1;
  const setPage = (next: number) => setFilters((current) => ({ ...current, page: Math.min(pages, Math.max(1, next)) }));
  const showTable = width === 0 || width >= TABLE_MIN_WIDTH;

  const row = (newsletter: Newsletter) => {
    const provider = providerFor(newsletter, providers);
    const date = newsletter.sentAt || newsletter.scheduledAt;
    return { provider, date };
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="byline-newsletter-list-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="byline-newsletter-list-title" className="text-2xl font-semibold tracking-tight">{title || __("Newsletters", "weekly-wildcat-headless")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{__("Prepare, review, and send publication newsletters without exposing provider credentials.", "weekly-wildcat-headless")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={isLoading}>{isLoading ? <Spinner /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />}{__("Refresh", "weekly-wildcat-headless")}</Button>
          {onCreate ? <Button variant="primary" onClick={onCreate}>{__("New newsletter", "weekly-wildcat-headless")}</Button> : null}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2" role="search" aria-label={__("Filter newsletters", "weekly-wildcat-headless")}>
        <SearchControl
          className="min-w-64 flex-1 sm:max-w-md"
          label={__("Search newsletters", "weekly-wildcat-headless")}
          value={filters.search || ""}
          onChange={(search: string) => setFilters((current) => ({ ...current, search, page: 1 }))}
          placeholder={__("Search by title or subject", "weekly-wildcat-headless")}
        />
        <SelectControl
          className="w-44"
          label={__("Status", "weekly-wildcat-headless")}
          value={filters.status || "all"}
          options={statusOptions}
          onChange={(status: string) => setFilters((current) => ({ ...current, status: status as NewsletterListFilters["status"], page: 1 }))}
        />
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {providerUnavailable ? <OptionalUnavailable>{__("Provider status is unavailable. You can still open drafts; sending actions remain hidden until provider capabilities load.", "weekly-wildcat-headless")}</OptionalUnavailable> : null}

      {isLoading && !items.length ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status" aria-live="polite"><Spinner /><span>{__("Loading newsletters…", "weekly-wildcat-headless")}</span></div>
      ) : items.length ? (
        <>
          <div ref={tableRef} className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {showTable ? <Table aria-label={__("Newsletter issues", "weekly-wildcat-headless")}>
              <TableHeader className="bg-muted/20"><TableRow className="hover:bg-transparent">
                <TableHead>{__("Issue", "weekly-wildcat-headless")}</TableHead>
                <TableHead>{__("Status", "weekly-wildcat-headless")}</TableHead>
                <TableHead>{__("Audience", "weekly-wildcat-headless")}</TableHead>
                <TableHead>{__("Provider", "weekly-wildcat-headless")}</TableHead>
                <TableHead>{__("Scheduled / sent", "weekly-wildcat-headless")}</TableHead>
                <TableHead className="w-20"><span className="sr-only">{__("Actions", "weekly-wildcat-headless")}</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>{items.map((newsletter) => {
                const { provider, date } = row(newsletter);
                return <TableRow key={newsletter.id} className="h-16">
                  <TableCell className="max-w-md whitespace-normal"><button type="button" className="text-left font-semibold hover:underline" disabled={!onOpen} onClick={() => onOpen?.(newsletter.id)}>{newsletter.title || __("Untitled newsletter", "weekly-wildcat-headless")}</button>{newsletter.subject ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{newsletter.subject}</span> : null}</TableCell>
                  <TableCell><NewsletterStatusBadge status={newsletter.status} /></TableCell>
                  <TableCell>{newsletter.audience || <span className="text-muted-foreground">{__("Not selected", "weekly-wildcat-headless")}</span>}</TableCell>
                  <TableCell>{provider ? <span className="flex flex-wrap items-center gap-1.5"><span>{provider.label}</span><ProviderStatus status={provider.connectionStatus} configured={provider.configured} /></span> : <span className="text-muted-foreground">{newsletter.providerId || __("Not selected", "weekly-wildcat-headless")}</span>}</TableCell>
                  <TableCell>{date ? <time dateTime={date} title={formatNewsletterDate(date)}>{formatNewsletterDate(date)}</time> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">{onOpen ? <Button variant="secondary" onClick={() => onOpen(newsletter.id)}>{__("Open", "weekly-wildcat-headless")}</Button> : null}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table> : <ItemGroup className="gap-0">{items.map((newsletter) => {
              const { provider, date } = row(newsletter);
              return <Item key={newsletter.id} size="sm" className="rounded-none border-0 border-b px-3 py-3 last:border-b-0" render={onOpen ? <button type="button" onClick={() => onOpen(newsletter.id)} /> : undefined}>
                <ItemContent><ItemTitle>{newsletter.title || __("Untitled newsletter", "weekly-wildcat-headless")}</ItemTitle><ItemDescription>{[newsletter.subject, newsletter.audience, provider?.label, date ? formatNewsletterDate(date) : ""].filter(Boolean).join(" · ")}</ItemDescription></ItemContent>
                <ItemActions><NewsletterStatusBadge status={newsletter.status} /></ItemActions>
              </Item>;
            })}</ItemGroup>}
          </div>

          {total && total > perPage ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{`${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}</span>
            <Pagination className="mx-0 w-auto"><PaginationContent>
              <PaginationItem><PaginationPrevious disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)} /></PaginationItem>
              <PaginationItem><span className="px-2 tabular-nums">{`Page ${page} of ${pages}`}</span></PaginationItem>
              <PaginationItem><PaginationNext disabled={page >= pages || isLoading} onClick={() => setPage(page + 1)} /></PaginationItem>
            </PaginationContent></Pagination>
          </div> : null}
        </>
      ) : !error ? (
        <Empty className="border">
          <EmptyHeader><EmptyTitle>{filters.search || filters.status !== "all" ? __("No newsletters match", "weekly-wildcat-headless") : __("No newsletter issues yet", "weekly-wildcat-headless")}</EmptyTitle><EmptyDescription>{filters.search || filters.status !== "all" ? __("Try changing the search or status filter.", "weekly-wildcat-headless") : __("Create a draft to start an edition.", "weekly-wildcat-headless")}</EmptyDescription></EmptyHeader>
          {!filters.search && filters.status === "all" && onCreate ? <EmptyContent><Button variant="primary" onClick={onCreate}>{__("Create a newsletter", "weekly-wildcat-headless")}</Button></EmptyContent> : null}
        </Empty>
      ) : null}
    </section>
  );
}
