import { useState } from "react";
import { StoryList } from "../planning/StoryList";
import { useMoveStory, useUpdatePlanningStory } from "../planning/planning-query";
import { DEFAULT_WORKFLOW_STATUSES, sortPlanningStories, type PlanningSort } from "../planning/planning-model";
import type { PlanningFetchers } from "../planning/planning-api";
import { useCollectionHost } from "./collection-host";
import { CollectionEmpty } from "./collection-ui";
import type { CollectionDetail } from "./collection-model";

/**
 * The Collection's stories, in the Stories screen's own list: workflow,
 * deadline, publication state and writers, with Story Peek and the Story
 * workspace a click away. Removing a story only ends its membership. Story
 * changes here are Story changes, allowed by the story's own access, never by
 * being on the Collection's team.
 */
export function CollectionStories({ detail, timezone, onRemove }: { detail: CollectionDetail; timezone: string; onRemove: (storyId: number) => void }) {
  const host = useCollectionHost();
  const fetchers = host.fetchers as PlanningFetchers;
  const [sort, setSort] = useState<PlanningSort>({ key: "deadline", direction: "asc" });
  const move = useMoveStory(fetchers, DEFAULT_WORKFLOW_STATUSES);
  const update = useUpdatePlanningStory(fetchers);
  if (!detail.stories.length)
    return <CollectionEmpty title="No stories yet">Add existing reporting or start a new story for this Collection.</CollectionEmpty>;
  return (
    <StoryList
      stories={sortPlanningStories(detail.stories, sort)}
      statuses={DEFAULT_WORKFLOW_STATUSES}
      sort={sort}
      timezone={timezone}
      now={new Date()}
      workspaceUrl={(storyId) => host.storyHref(storyId)}
      onOpenStory={host.openStory}
      canMoveStories={Boolean(fetchers.moveStory)}
      canAssignStories={Boolean(detail.collection.canDuplicate)}
      canUpdateStories={Boolean(fetchers.updateStory)}
      movingStoryId={move.movingStoryId}
      updatingStoryId={update.updatingStoryId}
      onMoveStory={move.move}
      onUpdateStory={update.update}
      onSortChange={(key) => setSort((s) => ({ key, direction: s.key === key && s.direction === "asc" ? "desc" : "asc" }))}
      additionalActions={
        detail.collection.canEdit
          ? (story) => [{ id: "remove-collection", label: "Remove from Collection", run: () => onRemove(story.id) }]
          : undefined
      }
    />
  );
}
