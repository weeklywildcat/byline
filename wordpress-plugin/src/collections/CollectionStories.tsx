import { useState } from "react";
import { StoryList } from "../planning/StoryList";
import {
  useMoveStory,
  useUpdatePlanningStory,
} from "../planning/planning-query";
import {
  DEFAULT_WORKFLOW_STATUSES,
  sortPlanningStories,
  type PlanningSort,
} from "../planning/planning-model";
import type { PlanningAppFetchers } from "../planning/PlanningApp";
import type { CollectionDetail } from "./collection-model";
export function CollectionStories({
  detail,
  fetchers,
  timezone,
  workspaceUrl,
  onOpenStory,
  onRemove,
}: {
  detail: CollectionDetail;
  fetchers: PlanningAppFetchers;
  timezone: string;
  workspaceUrl: (id: number) => string;
  onOpenStory: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [sort, setSort] = useState<PlanningSort>({
    key: "modified",
    direction: "desc",
  });
  const move = useMoveStory(fetchers, DEFAULT_WORKFLOW_STATUSES);
  const update = useUpdatePlanningStory(fetchers);
  return (
    <StoryList
      stories={sortPlanningStories(detail.stories, sort)}
      statuses={DEFAULT_WORKFLOW_STATUSES}
      sort={sort}
      timezone={timezone}
      now={new Date()}
      workspaceUrl={workspaceUrl}
      onOpenStory={onOpenStory}
      canMoveStories
      canAssignStories={Boolean(detail.collection.canDuplicate)}
      canUpdateStories
      movingStoryId={move.movingStoryId}
      updatingStoryId={update.updatingStoryId}
      onMoveStory={move.move}
      onUpdateStory={update.update}
      onSortChange={(key) =>
        setSort((s) => ({
          key,
          direction: s.key === key && s.direction === "asc" ? "desc" : "asc",
        }))
      }
      additionalActions={
        detail.collection.canEdit
          ? (story) => [
              {
                id: "remove-collection",
                label: "Remove from Collection",
                run: () => onRemove(story.id),
              },
            ]
          : undefined
      }
    />
  );
}
