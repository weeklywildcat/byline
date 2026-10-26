import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../planning/PlanningPage";
import type { PlanningAppFetchers } from "../planning/PlanningApp";
import { Button } from "../admin-ui/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../admin-ui/ui/input-group";
import { ItemGroup } from "../admin-ui/ui/item";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { RowSkeletons } from "../story/rows";
import { useStoryPeek } from "../story/StoryPeekHost";
import { describeEditorialError } from "../editorial/editorial-model";
import { CollectionDialog } from "./CollectionDialog";
import { CollectionWorkspace, type AddKind } from "./CollectionWorkspace";
import { Choice, CollectionEmpty, CollectionRow } from "./collection-ui";
import { collectionsKey, collectionKey } from "./collection-api";
import {
  collectionStatuses,
  collectionUrl,
  visibleCollections,
  type Collection,
  type CollectionAction,
  type CollectionFilters,
} from "./collection-model";
export function CollectionsPage({
  fetchers,
  currentUserId,
  workspaceUrl,
}: {
  fetchers: PlanningAppFetchers;
  currentUserId: number | null;
  workspaceUrl: (id: number) => string;
}) {
  const api = fetchers.collections!;
  const client = useQueryClient();
  const { openStory } = useStoryPeek();
  const list = useQuery({
    queryKey: collectionsKey,
    queryFn: () => api.list(),
  });
  const [id, setId] = useState(
    () =>
      Number(new URLSearchParams(window.location.search).get("collection")) ||
      0,
  );
  const [dialog, setDialog] = useState<Collection | "new" | null>(null);
  const [add, setAdd] = useState<AddKind | undefined>();
  const [filters, setFilters] = useState<CollectionFilters>({
    search: "",
    status: "",
    person: "",
    archive: "active",
    sort: "updated",
  });
  useEffect(() => {
    const pop = () => {
      setId(
        Number(new URLSearchParams(window.location.search).get("collection")) ||
          0,
      );
      setAdd(undefined);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: number, nextAdd?: AddKind) {
    window.history.pushState({}, "", collectionUrl(next || undefined));
    setAdd(nextAdd);
    setId(next);
  }
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: collectionsKey }),
      client.invalidateQueries({ queryKey: collectionKey(id) }),
      client.invalidateQueries({ queryKey: ["byline", "story-collections"] }),
    ]);
  const change = useMutation({
    mutationFn: (input: { collection: Collection; duplicate: boolean }) => {
      const c = input.collection;
      return input.duplicate
        ? api.save({
            name: `${c.name} (copy)`,
            brief: c.brief,
            type: c.type,
            leadId: c.lead?.id || currentUserId || 0,
            startDate: c.startDate,
            endDate: c.endDate,
          })
        : api.save({ status: c.archived ? "planning" : "archived" }, c.id);
    },
    onSuccess: (saved, input) => {
      if (input.duplicate) {
        navigate(saved.id);
        toast.success(
          "Collection duplicated. Add the reporting this new effort needs.",
        );
      } else
        toast.success(
          saved.archived ? "Collection archived." : "Collection restored.",
          {
            action: {
              label: "Undo",
              onClick: () => {
                void api
                  .save({ status: input.collection.status }, saved.id)
                  .then(refresh)
                  .catch((e) => toast.error(describeEditorialError(e)));
              },
            },
          },
        );
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: refresh,
  });
  function action(a: CollectionAction, c: Collection) {
    if (a === "open") navigate(c.id);
    else if (a === "story" || a === "interview")
      navigate(c.id, a === "story" ? "existing" : "interview");
    else if (a === "edit") setDialog(c);
    else change.mutate({ collection: c, duplicate: a === "duplicate" });
  }
  const filter = (key: keyof CollectionFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  if (list.isPending) return <RowSkeletons count={6} />;
  if (list.isError || !list.data)
    return (
      <InlineAlert onAction={() => void list.refetch()}>
        Collections could not be loaded.
      </InlineAlert>
    );
  const data = list.data;
  const rows = visibleCollections(data.collections, filters);
  return (
    <>
      {id ? (
        <CollectionWorkspace
          key={`${id}-${add || ""}`}
          id={id}
          api={api}
          fetchers={fetchers}
          people={data.people}
          timezone={data.timezone}
          currentUserId={currentUserId || 0}
          workspaceUrl={workspaceUrl}
          onStory={openStory}
          onBack={() => navigate(0)}
          onAction={action}
          initialAdd={add}
        />
      ) : (
        <>
          <PageHeader
            title="Collections"
            description="Coordinate related stories and shared reporting."
            actions={
              data.canCreate ? (
                <Button
                  onClick={() => setDialog("new")}
                  className="pointer-coarse:min-h-11"
                >
                  <Plus data-icon="inline-start" />
                  New collection
                </Button>
              ) : undefined
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="min-w-40 flex-1">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search collections"
                placeholder="Search collections…"
                value={filters.search}
                onChange={(e) => filter("search", e.target.value)}
              />
            </InputGroup>
            <div className="w-40">
              <Choice
                label="Filter status"
                value={filters.status}
                options={{ "": "All statuses", ...collectionStatuses }}
                onChange={(v) => filter("status", v)}
              />
            </div>
            <div className="w-40">
              <Choice
                label="Filter lead or member"
                value={filters.person}
                options={{
                  "": "All people",
                  ...Object.fromEntries(
                    data.people.map((p) => [String(p.id), p.name]),
                  ),
                }}
                onChange={(v) => filter("person", v)}
              />
            </div>
            <div className="w-44">
              <Choice
                label="Active or archived"
                value={filters.archive}
                options={{
                  active: "Active collections",
                  archived: "Archived collections",
                  all: "All collections",
                }}
                onChange={(v) => filter("archive", v)}
              />
            </div>
            <div className="w-40">
              <Choice
                label="Sort collections"
                value={filters.sort}
                options={{
                  updated: "Recently updated",
                  name: "Name",
                  date: "Start date",
                }}
                onChange={(v) => filter("sort", v)}
              />
            </div>
          </div>
          {rows.length ? (
            <ItemGroup
              className="gap-0 rounded-xl border"
              aria-label="Collections"
            >
              {rows.map((c) => (
                <CollectionRow
                  key={c.id}
                  collection={c}
                  timezone={data.timezone}
                  onAction={action}
                />
              ))}
            </ItemGroup>
          ) : (
            <CollectionEmpty
              title={
                data.collections.length
                  ? "No matching collections"
                  : "Your next reporting effort starts here"
              }
            >
              {data.collections.length
                ? "Try a different search or filter."
                : "Create a Collection to coordinate stories, interviews, tasks, and shared resources."}
            </CollectionEmpty>
          )}
        </>
      )}
      {dialog ? (
        <CollectionDialog
          key={dialog === "new" ? "new" : dialog.id}
          api={api}
          people={data.people}
          currentUserId={currentUserId || 0}
          collection={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={(c) => {
            const isNew = dialog === "new";
            setDialog(null);
            void refresh();
            if (isNew) navigate(c.id);
          }}
        />
      ) : null}
    </>
  );
}
