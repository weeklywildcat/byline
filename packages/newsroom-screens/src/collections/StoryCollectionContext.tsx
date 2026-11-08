import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@byline/newsroom-ui/ui/collapsible";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@byline/newsroom-ui/ui/item";
import { describeEditorialError } from "../editorial/editorial-model";
import {
  collectionListKey,
  collectionsKey,
  storyCollectionsKey,
  type CollectionApi,
} from "./collection-api";
import { edgeChanges } from "./collection-model";
import { useCollectionLinks } from "./collection-links";
import { EntityPicker } from "./collection-ui";
/** The Collections a story can be added to: every one the reader can see, archived ones only when already linked. */
export const STORY_COLLECTION_OPTIONS = { view: "all" as const, limit: 100 };

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
  const links = useCollectionLinks();
  const context = useQuery({
    queryKey: storyCollectionsKey(storyId),
    queryFn: () => api.story(storyId),
  });
  const collections = useQuery({
    queryKey: collectionListKey(STORY_COLLECTION_OPTIONS),
    queryFn: () => api.list(STORY_COLLECTION_OPTIONS),
  });
  const save = useMutation({
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
          await (change.linked
            ? api.addStory(change.target, storyId)
            : api.removeStory(change.target, storyId));
      if (input.interviewIds)
        for (const change of edgeChanges(
          data.interviews.map((i) => i.id),
          input.interviewIds,
        )) {
          const interview = [
            ...data.interviews,
            ...data.availableInterviews,
          ].find((i) => i.id === change.target)!;
          await api.saveInterview(
            interview.collectionId,
            {
              storyIds: change.linked
                ? [...interview.storyIds, storyId]
                : interview.storyIds.filter((id) => id !== storyId),
            },
            interview,
          );
        }
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: storyCollectionsKey(storyId) }),
        client.invalidateQueries({ queryKey: collectionsKey }),
        client.invalidateQueries({ queryKey: ["byline", "planning"] }),
        client.invalidateQueries({ queryKey: ["byline", "collection"] }),
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
        disabled={save.isPending || !data.canManage}
        itemDisabled={(i) => !i.canEdit}
        appearance="value"
        triggerLabel={
          compact ? (data.interviews.length ? "Edit" : "Link") : undefined
        }
        onChange={(next) =>
          save.mutate({ interviewIds: next.map((i) => i.id) })
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
            disabled={save.isPending || !data.canManage}
            itemDisabled={(c) => !c.canEdit}
            appearance="value"
            triggerLabel={
              compact ? (data.collections.length ? "Edit" : "Link") : undefined
            }
            onChange={(next) =>
              save.mutate({ collectionIds: next.map((c) => c.id) })
            }
          >
            {(c) => <>{c.name}</>}
          </EntityPicker>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.collections.map((c) =>
          links.href ? (
            <a key={c.id} href={links.href(c.id)} onClick={(event) => {
              if (!links.open || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              links.open(c.id);
            }} className="underline">
              {c.name} ↗
            </a>
          ) : (
            <span key={c.id}>{c.name}</span>
          ),
        )}
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
                links.href ? (
                  <a
                    href={links.href(i.collectionId, { interviewId: i.id })}
                    onClick={(event) => {
                      if (!links.open || event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      links.open(i.collectionId, { interviewId: i.id });
                    }}
                  />
                ) : (
                  <div />
                )
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
