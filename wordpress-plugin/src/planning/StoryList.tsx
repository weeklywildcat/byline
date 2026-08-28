import { Button } from "@wordpress/components";
import { __ } from "@wordpress/i18n";

import {
  type PlanningSort,
  type PlanningSortKey,
  type PlanningStory,
  type PlanningWorkflowStatus,
  storyDateSemantics
} from "./planning-model";
import {
  PlanningDateValue,
  PlanningEmpty,
  PlanningStatusBadge,
  StoryLink,
  StoryMoveControl,
  StorySignalLine,
  WordPressState
} from "./planning-ui";

export type StoryListProps = {
  stories: PlanningStory[];
  statuses: PlanningWorkflowStatus[];
  sort: PlanningSort;
  canMoveStories: boolean;
  movingStoryId?: number | null;
  onSortChange: (key: PlanningSortKey) => void;
  onMoveStory: (story: PlanningStory, status: string) => void;
  onOpenStory?: (story: PlanningStory) => void;
};

const columns: Array<{ key: PlanningSortKey; label: string }> = [
  { key: "story", label: "Story" },
  { key: "workflow", label: "Workflow" },
  { key: "writer", label: "Writer" },
  { key: "deadline", label: "Deadline" },
  { key: "planned", label: "Planned" },
  { key: "modified", label: "Modified" }
];

function SortButton({
  column,
  sort,
  onSortChange
}: {
  column: { key: PlanningSortKey; label: string };
  sort: PlanningSort;
  onSortChange: (key: PlanningSortKey) => void;
}) {
  const isCurrent = sort.key === column.key;
  const marker = isCurrent ? (sort.direction === "asc" ? " ↑" : " ↓") : "";
  return (
    <Button
      variant="tertiary"
      className="byline-planning-sort-button"
      onClick={() => onSortChange(column.key)}
      aria-label={`${column.label}${isCurrent ? `, ${sort.direction === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      {column.label}{marker}
    </Button>
  );
}
function WorkflowCell({
  story,
  statuses,
  canMoveStories,
  movingStoryId,
  onMoveStory
}: {
  story: PlanningStory;
  statuses: PlanningWorkflowStatus[];
  canMoveStories: boolean;
  movingStoryId?: number | null;
  onMoveStory: (story: PlanningStory, status: string) => void;
}) {
  return (
    <div className="byline-planning-list-workflow">
      <PlanningStatusBadge label={story.workflow.label} tone={story.workflow.group === "sidelined" ? "warning" : "neutral"} />
      <StoryMoveControl
        story={story}
        statuses={statuses}
        disabled={!canMoveStories || movingStoryId === story.id}
        onMove={(status) => onMoveStory(story, status)}
      />
    </div>
  );
}

export function StoryList({
  stories,
  statuses,
  sort,
  canMoveStories,
  movingStoryId,
  onSortChange,
  onMoveStory,
  onOpenStory
}: StoryListProps) {
  if (!stories.length) {
    return <PlanningEmpty label={__("Planning list", "weekly-wildcat-headless")} instructions={__("No stories match these filters. Try clearing a filter or choosing a different saved view.", "weekly-wildcat-headless")} />;
  }

  return (
    <div className="byline-planning-list-wrap">
      <table className="byline-planning-list">
        <caption className="byline-planning-sr-only">{__("Sortable newsroom story list", "weekly-wildcat-headless")}</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={sort.key === "story" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[0]} sort={sort} onSortChange={onSortChange} />
            </th>
            <th scope="col" aria-sort={sort.key === "workflow" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[1]} sort={sort} onSortChange={onSortChange} />
            </th>
            <th scope="col" aria-sort={sort.key === "writer" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[2]} sort={sort} onSortChange={onSortChange} />
            </th>
            <th scope="col" aria-sort={sort.key === "deadline" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[3]} sort={sort} onSortChange={onSortChange} />
            </th>
            <th scope="col" aria-sort={sort.key === "planned" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[4]} sort={sort} onSortChange={onSortChange} />
            </th>
            <th scope="col"><span>{__("WordPress", "weekly-wildcat-headless")}</span></th>
            <th scope="col"><span>{__("Visuals", "weekly-wildcat-headless")}</span></th>
            <th scope="col"><span>{__("Tasks", "weekly-wildcat-headless")}</span></th>
            <th scope="col"><span>{__("Coverage", "weekly-wildcat-headless")}</span></th>
            <th scope="col" aria-sort={sort.key === "modified" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortButton column={columns[5]} sort={sort} onSortChange={onSortChange} />
            </th>
          </tr>
        </thead>
        <tbody>
          {stories.map((story) => {
            const dates = storyDateSemantics(story);
            return (
              <tr key={story.id}>
                <th scope="row" className="byline-planning-list-story">
                  <StoryLink story={story} onOpenStory={onOpenStory} className="byline-planning-story-title" />
                  <span className="byline-planning-list-story-meta">{story.editor ? `${__("Editor", "weekly-wildcat-headless")}: ${story.editor.name}` : __("No editor assigned", "weekly-wildcat-headless")}</span>
                </th>
                <td>
                  <WorkflowCell
                    story={story}
                    statuses={statuses}
                    canMoveStories={canMoveStories}
                    movingStoryId={movingStoryId}
                    onMoveStory={onMoveStory}
                  />
                </td>
                <td>{story.writer?.name || <span className="byline-planning-muted">{__("Unassigned", "weekly-wildcat-headless")}</span>}</td>
                <td>
                  <PlanningDateValue value={dates.deadline.value} relative empty={__("No deadline", "weekly-wildcat-headless")} />
                </td>
                <td>
                  <PlanningDateValue value={dates.plannedPublication.value} empty={__("Not planned", "weekly-wildcat-headless")} />
                  {dates.plannedPublication.value && dates.scheduled.value ? <span className="byline-planning-list-date-note">{__("Scheduled separately", "weekly-wildcat-headless")}</span> : null}
                </td>
                <td>
                  <WordPressState story={story} />
                  {dates.scheduled.value ? <span className="byline-planning-list-date-note" title={dates.scheduled.exact}>{__("At", "weekly-wildcat-headless")} {dates.scheduled.exact}</span> : null}
                  {dates.published.value ? <span className="byline-planning-list-date-note" title={dates.published.exact}>{__("Published", "weekly-wildcat-headless")} {dates.published.exact}</span> : null}
                </td>
                <td><StorySignalLine story={story} /></td>
                <td><span aria-label={`${story.openTaskCount} ${__("open tasks", "weekly-wildcat-headless")}`}>{story.openTaskCount}</span></td>
                <td>{story.coverage.length ? story.coverage.map((item) => item.title).join(", ") : <span className="byline-planning-muted">{__("None", "weekly-wildcat-headless")}</span>}</td>
                <td><PlanningDateValue value={story.modifiedAt} empty={__("Unknown", "weekly-wildcat-headless")} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
