import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../admin-ui/ui/collapsible";
import { Separator } from "../admin-ui/ui/separator";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "../admin-ui/ui/item";
import { describeEditorialError } from "../editorial/editorial-model";
import {
  collectionsKey,
  storyCollectionsKey,
  type CollectionApi,
} from "./collection-api";
import { collectionUrl, edgeChanges } from "./collection-model";
import { EntityPicker } from "./collection-ui";
export function StoryCollectionContext({
  storyId,
  api,
  compact = false,
}: {
  storyId: number;
  api: CollectionApi;
  compact?: boolean;
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
      <p
        className={`text-xs text-muted-foreground${
          compact ? " border-t py-3" : ""
        }`}
        role="status"
      >
        Loading Collections…
      </p>
    );
  if (context.isError || collections.isError)
    return (
      <InlineAlert
        className={compact ? "my-3" : undefined}
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
  if (
    compact &&
    !data.canManage &&
    !data.collections.length &&
    !data.interviews.length &&
    !data.resources.length
  )
    return null;
  const interviewPicker =
    !compact || data.canManage ? (
      <EntityPicker
        label="Add from Collection"
        items={interviews}
        selected={data.interviews}
        itemLabel={(i) => i.interviewee}
        disabled={links.isPending || !data.canManage}
        itemDisabled={(i) => !i.canEdit}
        appearance="value"
        triggerLabel={
          compact ? (data.interviews.length ? "Edit" : "Link") : undefined
        }
        onChange={(next) =>
          links.mutate({ interviewIds: next.map((i) => i.id) })
        }
      >
        {(i) => <>{i.interviewee}</>}
      </EntityPicker>
    ) : null;
  const details = (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={
          compact
            ? "flex items-center justify-between gap-2"
            : "flex flex-col gap-3"
        }
      >
        <h3 className="text-sm font-semibold">Collections</h3>
        {!compact || data.canManage ? (
          <EntityPicker
            label="Story collections"
            items={options}
            selected={data.collections}
            itemLabel={(c) => c.name}
            disabled={links.isPending || !data.canManage}
            itemDisabled={(c) => !c.canEdit}
            appearance="value"
            triggerLabel={
              compact ? (data.collections.length ? "Edit" : "Link") : undefined
            }
            onChange={(next) =>
              links.mutate({ collectionIds: next.map((c) => c.id) })
            }
          >
            {(c) => <>{c.name}</>}
          </EntityPicker>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.collections.map((c) => (
          <a key={c.id} href={collectionUrl(c.id)} className="underline">
            {c.name} ↗
          </a>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Shared interviews</h3>
        {compact ? interviewPicker : null}
      </div>
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
      ) : !compact ? (
        <p className="text-xs text-muted-foreground">
          No interviews explicitly linked to this story.
        </p>
      ) : null}
      {!compact ? interviewPicker : null}
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
    </div>
  );
  if (!compact)
    return <section aria-label="Story Collections">{details}</section>;
  const summary = [
    data.interviews.length
      ? `${data.interviews.length} shared interview${
          data.interviews.length === 1 ? "" : "s"
        }`
      : "",
    data.resources.length
      ? `${data.resources.length} shared resource${
          data.resources.length === 1 ? "" : "s"
        }`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Separator />
      <Collapsible
        key={storyId}
        render={<section aria-label="Story Collections" />}
        className="py-3"
      >
        <h3>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium">
                Collections &amp; interviews
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {data.collections.map((c) => c.name).join(", ") ||
                  "No linked collections"}
              </span>
              {summary ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {summary}
                </span>
              ) : null}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground group-data-[panel-open]:rotate-90"
            />
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent className="pt-3">{details}</CollapsibleContent>
      </Collapsible>
    </>
  );
}
