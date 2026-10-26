import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "../admin-ui/ui/item";
import { ResourceIcon } from "../admin-ui/components/resource-icon";
import { describeEditorialError } from "../editorial/editorial-model";
import {
  collectionsKey,
  storyCollectionsKey,
  type CollectionApi,
} from "./collection-api";
import { collectionUrl, edgeChanges } from "./collection-model";
import { CollectionEmpty, EntityPicker } from "./collection-ui";
export function StoryCollectionContext({
  storyId,
  api,
}: {
  storyId: number;
  api: CollectionApi;
}) {
  const client = useQueryClient();
  const context = useQuery({
    queryKey: storyCollectionsKey(storyId),
    queryFn: () => api.story(storyId),
  });
  const collections = useQuery({
    queryKey: collectionsKey,
    queryFn: () => api.list(),
  });
  const links = useMutation({
    mutationFn: async (input: {
      collectionIds?: number[];
      interviewIds?: number[];
    }) => {
      const data = context.data;
      if (!data) return;
      if (input.collectionIds)
        for (const change of edgeChanges(
          data.collections.map((c) => c.id),
          input.collectionIds,
        ))
          await api.link(change.target, "story", storyId, change.linked);
      if (input.interviewIds)
        for (const change of edgeChanges(
          data.interviews.map((i) => i.id),
          input.interviewIds,
        )) {
          const interview = [
            ...data.interviews,
            ...data.availableInterviews,
          ].find((i) => i.id === change.target)!;
          await api.link(
            interview.collectionId,
            "interview-story",
            storyId,
            change.linked,
            interview.id,
          );
        }
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: storyCollectionsKey(storyId) }),
        client.invalidateQueries({ queryKey: collectionsKey }),
        client.invalidateQueries({ queryKey: ["byline", "planning"] }),
      ]),
  });
  if (context.isPending || collections.isPending)
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Loading Collections…
      </p>
    );
  if (context.isError || collections.isError)
    return (
      <InlineAlert
        onAction={() => {
          void context.refetch();
          void collections.refetch();
        }}
      >
        Collections could not be loaded.
      </InlineAlert>
    );
  const data = context.data!;
  const options = collections.data!.collections.filter(
    (c) => !c.archived || data.collections.some((m) => m.id === c.id),
  );
  const interviews = [...data.interviews, ...data.availableInterviews];
  return (
    <section aria-label="Story Collections" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Collections</h3>
      <EntityPicker
        label="Story collections"
        items={options}
        selected={data.collections}
        itemLabel={(c) => c.name}
        disabled={links.isPending || !data.canManage}
        itemDisabled={(c) => !c.canEdit}
        appearance="value"
        onChange={(next) =>
          links.mutate({ collectionIds: next.map((c) => c.id) })
        }
      >
        {(c) => <>{c.name}</>}
      </EntityPicker>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.collections.map((c) => (
          <a key={c.id} href={collectionUrl(c.id)} className="underline">
            {c.name} ↗
          </a>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Shared interviews</h3>
      {data.interviews.length ? (
        <ItemGroup className="gap-0">
          {data.interviews.map((i) => (
            <Item
              key={i.id}
              size="xs"
              render={
                <a
                  href={`${collectionUrl(i.collectionId)}&interview=${i.id}`}
                />
              }
            >
              <ItemContent>
                <ItemTitle>{i.interviewee} ↗</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-xs text-muted-foreground">
          No interviews explicitly linked to this story.
        </p>
      )}
      <EntityPicker
        label="Add from Collection"
        items={interviews}
        selected={data.interviews}
        itemLabel={(i) => i.interviewee}
        disabled={links.isPending || !data.canManage}
        itemDisabled={(i) => !i.canEdit}
        appearance="value"
        onChange={(next) =>
          links.mutate({ interviewIds: next.map((i) => i.id) })
        }
      >
        {(i) => <>{i.interviewee}</>}
      </EntityPicker>
      {data.resources?.length ? (
        <>
          <h3 className="text-sm font-semibold">Shared resources</h3>
          <ItemGroup className="gap-0">
            {data.resources.map((r) => (
              <Item
                key={r.id}
                size="xs"
                render={
                  <a href={r.url} target="_blank" rel="noopener noreferrer" />
                }
              >
                <ItemContent>
                  <ItemTitle>{r.label} ↗</ItemTitle>
                  <ItemDescription>{r.kind}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </>
      ) : null}
    </section>
  );
}
