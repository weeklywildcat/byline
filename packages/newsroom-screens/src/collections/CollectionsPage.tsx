import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ListFilter, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card } from "@byline/newsroom-ui/ui/card";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { ItemGroup } from "@byline/newsroom-ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useDebouncedValue } from "@byline/newsroom-ui/lib/hooks";
import { PageHeader } from "../planning/PlanningPage";
import { RowSkeletons } from "../story/rows";
import { describeEditorialError } from "../editorial/editorial-model";
import { Choice, CollectionEmpty, CollectionRow } from "./collection-ui";
import { useCollectionHost } from "./collection-host";
import { useCollectionList } from "./collection-query";
import {
  activeCollectionFilterCount,
  collectionSorts,
  collectionStatuses,
  collectionTypes,
  collectionViews,
  type Collection,
  type CollectionAction,
  type CollectionListQuery,
  type CollectionSort,
  type CollectionView,
} from "./collection-model";

/** Rows per page of the index. */
export const COLLECTIONS_PAGE_SIZE = 50;

/**
 * The Collections index: a dense, operational list, not a card dashboard.
 * Built-in views (Active, Mine, All, Archived), a search, one Filters popover
 * (type, status, lead or team member) and a sort. Rows open the Collection;
 * their visible menu and context menu share the same actions.
 */
export function CollectionsPage({
  query,
  onQueryChange,
  onAction,
}: {
  query: CollectionListQuery;
  onQueryChange: (next: CollectionListQuery) => void;
  onAction: (action: CollectionAction, collection: Collection) => void;
}) {
  const host = useCollectionHost();
  const [search, setSearch] = useState(query.search);
  const debounced = useDebouncedValue(search, 250);
  const applied = { ...query, search: debounced.trim(), limit: COLLECTIONS_PAGE_SIZE };
  const list = useCollectionList(host.api, applied);
  const data = list.data;
  // The typed search becomes the list's query once the reader pauses.
  const latest = useRef({ query, onQueryChange });
  latest.current = { query, onQueryChange };
  useEffect(() => {
    const { query: current, onQueryChange: change } = latest.current;
    if (debounced.trim() !== current.search) change({ ...current, search: debounced.trim(), page: 1 });
  }, [debounced]);
  const set = (patch: Partial<CollectionListQuery>) => onQueryChange({ ...query, page: 1, ...patch });
  const filters = activeCollectionFilterCount(query);
  const canCreate = Boolean(data?.canCreate && host.createCollection);
  return (
    <>
      <PageHeader
        title="Collections"
        description="Reporting projects: related stories, shared interviews, tasks and resources."
        actions={
          canCreate ? (
            <Button onClick={host.createCollection} className="pointer-coarse:min-h-11">
              <Plus data-icon="inline-start" />
              New collection
            </Button>
          ) : undefined
        }
      />
      <div className="flex min-w-0 flex-col gap-3">
        <Tabs value={query.view} onValueChange={(view) => set({ view: view as CollectionView })}>
          <TabsList aria-label="Collection views" className="max-w-full justify-start overflow-x-auto">
            {Object.entries(collectionViews).map(([id, label]) => (
              <TabsTrigger key={id} value={id} className="min-h-9 px-3 pointer-coarse:min-h-11">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-48 flex-1">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search collections"
              placeholder="Search collections…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-xs" aria-label="Clear collection search" onClick={() => setSearch("")}><X /></InputGroupButton></InputGroupAddon> : null}
          </InputGroup>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" className="pointer-coarse:min-h-11" aria-label={filters ? `Filters, ${filters} on` : "Filters"} />}>
              <ListFilter data-icon="inline-start" aria-hidden="true" />
              Filters
              {filters ? <Badge variant="secondary">{filters}</Badge> : null}
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-72 flex-col gap-3">
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Choice label="Filter by type" value={query.type} options={{ "": "Any type", ...collectionTypes }} onChange={(type) => set({ type })} />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Choice label="Filter by status" value={query.status} options={{ "": "Any status", ...collectionStatuses }} onChange={(status) => set({ status })} />
              </Field>
              <Field>
                <FieldLabel>Lead or team member</FieldLabel>
                <Choice
                  label="Filter by lead or team member"
                  value={query.person ? String(query.person) : ""}
                  options={{ "": "Anyone", ...Object.fromEntries((data?.people ?? []).filter((p) => p.kind !== "guest").map((p) => [String(p.id), p.name])) }}
                  onChange={(person) => set({ person: Number(person) || null })}
                />
              </Field>
              <Button variant="ghost" size="sm" disabled={!filters} onClick={() => set({ type: "", status: "", person: null })}>
                Clear filters
              </Button>
            </PopoverContent>
          </Popover>
          <div className="w-44">
            <Choice label="Sort collections" value={query.sort} options={collectionSorts} onChange={(sort) => set({ sort: sort as CollectionSort })} />
          </div>
        </div>
        {list.isPending && !data ? (
          <RowSkeletons count={6} />
        ) : list.isError && !data ? (
          <InlineAlert onAction={() => void list.refetch()}>{describeEditorialError(list.error, "Collections could not be loaded.")}</InlineAlert>
        ) : data && data.collections.length ? (
          <>
            <Card className="gap-0 py-0">
              <ItemGroup className="gap-0" aria-label={`${collectionViews[query.view]} collections`} aria-busy={list.isFetching || undefined}>
                {data.collections.map((c) => (
                  <CollectionRow key={c.id} collection={c} timezone={data.timezone} onAction={onAction} />
                ))}
              </ItemGroup>
            </Card>
            {data.pages > 1 ? (
              <nav aria-label="Collection pages" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {data.total} collections · page {query.page} of {data.pages}
                </span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => onQueryChange({ ...query, page: query.page - 1 })}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={query.page >= data.pages} onClick={() => onQueryChange({ ...query, page: query.page + 1 })}>Next</Button>
                </span>
              </nav>
            ) : null}
          </>
        ) : (
          <CollectionEmpty
            title={query.search || filters || query.view !== "active" ? "No matching collections" : "Your next reporting effort starts here"}
            actions={canCreate && !query.search && !filters ? <Button onClick={host.createCollection}>New collection</Button> : undefined}
          >
            {query.search || filters || query.view !== "active"
              ? "Try another view, search or filter."
              : "A Collection coordinates related stories, shared interviews, tasks and resources."}
          </CollectionEmpty>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {data ? `${data.total} ${data.total === 1 ? "collection" : "collections"}` : ""}
        </p>
      </div>
    </>
  );
}

/** Archive or restore from a row or the workspace menu, with Undo. Editors only (the server decides). */
export function useArchiveCollection(onDone?: () => void) {
  const host = useCollectionHost();
  return useMutation({
    mutationFn: (collection: Collection) =>
      host.api.update(collection.id, { status: collection.archived ? "planning" : "archived" }),
    onSuccess: (saved, before) => {
      toast.success(saved.archived ? "Collection archived." : "Collection restored.", {
        action: {
          label: "Undo",
          onClick: () => {
            void host.api.update(saved.id, { status: before.status }).then(onDone).catch((e) => toast.error(describeEditorialError(e)));
          },
        },
      });
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: onDone,
  });
}
