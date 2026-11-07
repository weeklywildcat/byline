import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError } from "../editorial/editorial-model";
import { CollectionDialog } from "./CollectionDialog";
import { CollectionsPage, useArchiveCollection } from "./CollectionsPage";
import { CollectionWorkspace, type AddKind } from "./CollectionWorkspace";
import { collectionKey, collectionsKey } from "./collection-api";
import { CollectionGuardProvider, type CollectionGuard } from "./collection-guard";
import { useCollectionHost } from "./collection-host";
import { useCollectionList } from "./collection-query";
import {
  COLLECTIONS_INDEX,
  DEFAULT_COLLECTION_QUERY,
  type Collection,
  type CollectionAction,
  type CollectionListQuery,
  type CollectionRoute,
} from "./collection-model";

/** People and the newsroom timezone, for screens that open a Collection directly. */
const META_QUERY = { view: "all" as const, limit: 1 };

/**
 * The Collections destination: the index, or one open Collection's workspace,
 * from the host's address (`route`). The host owns the address and moves it
 * (`onNavigate`); every move from inside a Collection passes the workspace's
 * one unsaved-changes guard, which the host also gets (`onGuard`) for the
 * browser's Back and Forward and its own navigation.
 */
export function CollectionsScreen({
  route,
  onNavigate,
  query: controlledQuery,
  onQueryChange,
  switcher,
  onGuard,
}: {
  route: CollectionRoute;
  onNavigate: (route: CollectionRoute, options?: { replace?: boolean }) => void;
  /** The index's view, search, filters and sort, when the host keeps them. */
  query?: CollectionListQuery;
  onQueryChange?: (query: CollectionListQuery) => void;
  /** A host's "Switch collection" control for the open Collection. */
  switcher?: ReactNode;
  onGuard?: (guard: CollectionGuard | null) => void;
}) {
  const host = useCollectionHost();
  const client = useQueryClient();
  const [ownQuery, setOwnQuery] = useState(DEFAULT_COLLECTION_QUERY);
  const query = controlledQuery ?? ownQuery;
  const setQuery = onQueryChange ?? setOwnQuery;
  const [editing, setEditing] = useState<Collection | null>(null);
  const [arrival, setArrival] = useState<{ id: number; add: AddKind } | null>(null);
  const meta = useCollectionList(host.api, META_QUERY);
  const refresh = () => client.invalidateQueries({ queryKey: collectionsKey });
  const archive = useArchiveCollection(() => {
    void refresh();
    if (route.collectionId) void client.invalidateQueries({ queryKey: collectionKey(route.collectionId) });
  });
  const duplicate = useMutation({
    mutationFn: (c: Collection) =>
      host.api.create({ name: `${c.name} (copy)`, brief: c.brief, type: c.type, leadId: c.lead?.id, startDate: c.startDate, endDate: c.endDate }),
    onSuccess: (saved) => {
      void refresh();
      onNavigate({ ...COLLECTIONS_INDEX, collectionId: saved.id });
      toast.success("Collection duplicated. Add the reporting this new effort needs.");
    },
    onError: (e) => toast.error(describeEditorialError(e)),
  });
  const action = (a: CollectionAction, c: Collection) => {
    if (a === "open") onNavigate({ ...COLLECTIONS_INDEX, collectionId: c.id });
    else if (a === "story" || a === "interview") {
      setArrival({ id: c.id, add: a === "story" ? "existing" : "interview" });
      onNavigate({ collectionId: c.id, tab: a === "story" ? "stories" : "reporting", interviewId: null });
    } else if (a === "edit") setEditing(c);
    else if (a === "duplicate") duplicate.mutate(c);
    else archive.mutate(c);
  };
  const people = meta.data?.people ?? [];
  const timezone = meta.data?.timezone ?? "UTC";
  return (
    <CollectionGuardProvider onReady={onGuard}>
      {route.collectionId ? (
        <CollectionWorkspace
          key={route.collectionId}
          route={{ ...route, collectionId: route.collectionId }}
          onNavigate={onNavigate}
          onBack={() => onNavigate(COLLECTIONS_INDEX)}
          onAction={action}
          people={people}
          timezone={timezone}
          switcher={switcher}
          initialAdd={arrival?.id === route.collectionId ? arrival.add : undefined}
        />
      ) : (
        <CollectionsPage query={query} onQueryChange={setQuery} onAction={action} />
      )}
      {editing ? (
        <CollectionDialog
          key={editing.id}
          api={host.api}
          collection={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
            void client.invalidateQueries({ queryKey: collectionKey(editing.id) });
          }}
        />
      ) : null}
    </CollectionGuardProvider>
  );
}
