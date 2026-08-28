import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import {
  boardWorkflowStatuses,
  type PlanningStory,
  type PlanningWorkflowStatus
} from "./planning-model";
import {
  PlanningDateValue,
  PlanningEmpty,
  PlanningNotice,
  PlanningStatusBadge,
  StoryLink,
  StoryMoveControl,
  StorySignalLine,
  WordPressState
} from "./planning-ui";

export type StoryBoardProps = {
  stories: PlanningStory[];
  statuses: PlanningWorkflowStatus[];
  canMoveStories: boolean;
  movingStoryId?: number | null;
  error?: string | null;
  onMoveStory: (story: PlanningStory, status: string) => void;
  onOpenStory?: (story: PlanningStory) => void;
};

function BoardCard({
  story,
  statuses,
  canMoveStories,
  movingStoryId,
  onMoveStory,
  onOpenStory,
  onDragStart,
  onDragEnd
}: {
  story: PlanningStory;
  statuses: PlanningWorkflowStatus[];
  canMoveStories: boolean;
  movingStoryId?: number | null;
  onMoveStory: (story: PlanningStory, status: string) => void;
  onOpenStory?: (story: PlanningStory) => void;
  onDragStart: (story: PlanningStory) => void;
  onDragEnd: () => void;
}) {
  const canDrag = canMoveStories && !story.wordpressState.isPublished;
  const writer = story.writer?.name || __("Unassigned writer", "weekly-wildcat-headless");

  return (
    <article
      className={`byline-planning-story-card${story.needsReview ? " byline-planning-story-card-needs-review" : ""}`}
      draggable={canDrag}
      onDragStart={() => onDragStart(story)}
      onDragEnd={onDragEnd}
      aria-busy={movingStoryId === story.id}
    >
        <div className="byline-planning-card-heading">
          <StoryLink story={story} onOpenStory={onOpenStory} className="byline-planning-story-title" />
          {story.needsReview ? <PlanningStatusBadge label={__("Needs review", "weekly-wildcat-headless")} tone="warning" /> : null}
        </div>

        <p className="byline-planning-card-byline">
          <span>{__("Writer", "weekly-wildcat-headless")}: {writer}</span>
          {story.editor ? <span>{__("Editor", "weekly-wildcat-headless")}: {story.editor.name}</span> : null}
        </p>

        <dl className="byline-planning-card-dates">
          <div>
            <dt>{__("Deadline", "weekly-wildcat-headless")}</dt>
            <dd><PlanningDateValue value={story.deadline} relative empty={__("No deadline", "weekly-wildcat-headless")} /></dd>
          </div>
          <div>
            <dt>{__("Planned publication", "weekly-wildcat-headless")}</dt>
            <dd><PlanningDateValue value={story.plannedPublication} empty={__("Not planned", "weekly-wildcat-headless")} /></dd>
          </div>
        </dl>

        <div className="byline-planning-card-statuses">
          <WordPressState story={story} />
          {story.wordpressState.isScheduled ? (
            <span className="byline-planning-signal-text">
              {__("Scheduled", "weekly-wildcat-headless")} <PlanningDateValue value={story.wordpressState.scheduledAt} empty="" />
            </span>
          ) : null}
        </div>
        <StorySignalLine story={story} />

        <div className="byline-planning-card-actions">
          <StoryMoveControl
            story={story}
            statuses={statuses}
            disabled={!canMoveStories || movingStoryId === story.id}
            onMove={(status) => onMoveStory(story, status)}
          />
          {canDrag ? <span className="byline-planning-drag-help">{__("Drag or use Move to…", "weekly-wildcat-headless")}</span> : null}
        </div>
    </article>
  );
}

function BoardColumn({
  status,
  stories,
  allStatuses,
  canMoveStories,
  movingStoryId,
  onMoveStory,
  onOpenStory,
  onDropStory
}: {
  status: PlanningWorkflowStatus;
  stories: PlanningStory[];
  allStatuses: PlanningWorkflowStatus[];
  canMoveStories: boolean;
  movingStoryId?: number | null;
  onMoveStory: (story: PlanningStory, status: string) => void;
  onOpenStory?: (story: PlanningStory) => void;
  onDropStory: (status: string) => void;
}) {
  return (
    <section
      className="byline-planning-board-column"
      aria-labelledby={`byline-planning-column-${status.id}`}
      onDragOver={(event) => {
        if (canMoveStories) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropStory(status.id);
      }}
    >
      <div className="byline-planning-column-heading">
        <h3 id={`byline-planning-column-${status.id}`}>{status.label}</h3>
        <span className="byline-planning-count" aria-label={`${stories.length} ${__("stories", "weekly-wildcat-headless")}`}>{stories.length}</span>
      </div>
      {stories.length ? (
        <ul className="byline-planning-card-list">
          {stories.map((story) => (
            <li key={story.id}>
              <BoardCard
                story={story}
                statuses={allStatuses}
                canMoveStories={canMoveStories}
                movingStoryId={movingStoryId}
                onMoveStory={onMoveStory}
                onOpenStory={onOpenStory}
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="byline-planning-column-empty">{__("No stories here.", "weekly-wildcat-headless")}</p>
      )}
    </section>
  );
}

export function StoryBoard({
  stories,
  statuses,
  canMoveStories,
  movingStoryId,
  error,
  onMoveStory,
  onOpenStory
}: StoryBoardProps) {
  const [draggedStory, setDraggedStory] = useState<PlanningStory | null>(null);
  const mainStatuses = boardWorkflowStatuses(statuses);
  const sidelinedStatuses = statuses.filter((status) => status.group === "sidelined");

  if (!stories.length && !mainStatuses.length) {
    return <PlanningEmpty label={__("Planning board", "weekly-wildcat-headless")} instructions={__("No workflow stages are available from the protected Planning API.", "weekly-wildcat-headless")} />;
  }

  const storiesFor = (status: PlanningWorkflowStatus) => stories.filter((story) => story.workflow.id === status.id);
  const dropStory = (status: string) => {
    if (draggedStory) onMoveStory(draggedStory, status);
    setDraggedStory(null);
  };

  return (
    <div className="byline-planning-board" aria-label={__("Stories by workflow stage", "weekly-wildcat-headless")}>
      {error ? <PlanningNotice>{error}</PlanningNotice> : null}
      <div className="byline-planning-board-columns">
        {mainStatuses.map((status) => (
          <section
            key={status.id}
            className="byline-planning-board-column"
            aria-labelledby={`byline-planning-column-${status.id}`}
            onDragOver={(event) => {
              if (canMoveStories) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              dropStory(status.id);
            }}
          >
            <div className="byline-planning-column-heading">
              <h3 id={`byline-planning-column-${status.id}`}>{status.label}</h3>
              <span className="byline-planning-count" aria-label={`${storiesFor(status).length} ${__("stories", "weekly-wildcat-headless")}`}>{storiesFor(status).length}</span>
            </div>
            {storiesFor(status).length ? (
              <ul className="byline-planning-card-list">
                {storiesFor(status).map((story) => (
                  <li key={story.id}>
                    <BoardCard
                      story={story}
                      statuses={statuses}
                      canMoveStories={canMoveStories}
                      movingStoryId={movingStoryId}
                      onMoveStory={onMoveStory}
                      onOpenStory={onOpenStory}
                      onDragStart={setDraggedStory}
                      onDragEnd={() => setDraggedStory(null)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="byline-planning-column-empty">{__("No stories here.", "weekly-wildcat-headless")}</p>
            )}
          </section>
        ))}
      </div>

      {sidelinedStatuses.length ? (
        <section className="byline-planning-sidelined" aria-labelledby="byline-planning-sidelined-heading">
          <div className="byline-planning-sidelined-heading">
            <h3 id="byline-planning-sidelined-heading">{__("Sidelined", "weekly-wildcat-headless")}</h3>
            <p>{__("On hold and dropped stories stay visible without being presented as forward progress.", "weekly-wildcat-headless")}</p>
          </div>
          <div className="byline-planning-board-columns">
            {sidelinedStatuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                stories={storiesFor(status)}
                allStatuses={statuses}
                canMoveStories={canMoveStories}
                movingStoryId={movingStoryId}
                onMoveStory={onMoveStory}
                onOpenStory={onOpenStory}
                onDropStory={dropStory}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!canMoveStories ? (
        <p className="byline-planning-help">{__("Your account can view this board, but the protected API does not allow workflow moves.", "weekly-wildcat-headless")}</p>
      ) : null}
    </div>
  );
}
