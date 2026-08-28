import { Button, Notice, Placeholder, SelectControl, Spinner } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import type { ReactNode } from "react";

import {
  exactPlanningDate,
  relativePlanningDate,
  type PlanningStory,
  type PlanningWorkflowStatus
} from "./planning-model";

export function PlanningLoading({ label = __("Loading Planning…", "weekly-wildcat-headless") }: { label?: string }) {
  return (
    <Placeholder label={label} className="byline-planning-placeholder">
      <Spinner />
    </Placeholder>
  );
}

export function PlanningUnavailable({
  label,
  message,
  onRetry
}: {
  label: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Placeholder label={label} instructions={message} className="byline-planning-placeholder">
      {onRetry ? <Button variant="secondary" onClick={onRetry}>{__("Try again", "weekly-wildcat-headless")}</Button> : null}
    </Placeholder>
  );
}

export function PlanningEmpty({ label, instructions }: { label: string; instructions: string }) {
  return <Placeholder label={label} instructions={instructions} className="byline-planning-placeholder" />;
}

export function PlanningNotice({
  status = "error",
  children,
  onRemove
}: {
  status?: "error" | "warning" | "success" | "info";
  children: ReactNode;
  onRemove?: () => void;
}) {
  return (
    <Notice status={status} isDismissible={Boolean(onRemove)} onRemove={onRemove} spokenMessage={typeof children === "string" ? children : undefined}>
      {children}
    </Notice>
  );
}

export function StoryLink({
  story,
  onOpenStory,
  className
}: {
  story: PlanningStory;
  onOpenStory?: (story: PlanningStory) => void;
  className?: string;
}) {
  const handleClick = onOpenStory
    ? (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onOpenStory(story);
      }
    : undefined;

  return (
    <a className={className} href={story.editUrl} onClick={handleClick}>
      {story.title || __("Untitled story", "weekly-wildcat-headless")}
    </a>
  );
}

export function PlanningDateValue({
  value,
  relative = false,
  empty = "—"
}: {
  value: string | null | undefined;
  relative?: boolean;
  empty?: string;
}) {
  const exact = exactPlanningDate(value);
  const display = relative ? relativePlanningDate(value) : exact;
  if (!display) return <span className="byline-planning-muted">{empty}</span>;

  return (
    <time dateTime={value || undefined} title={exact} className="byline-planning-date">
      {display}
      <span className="byline-planning-sr-only">{exact ? ` (${exact})` : ""}</span>
    </time>
  );
}

export function PlanningStatusBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error" | "info";
}) {
  return <span className={`byline-planning-status byline-planning-status-${tone}`}>{label}</span>;
}

function visualTone(story: PlanningStory): "neutral" | "success" | "warning" {
  if (story.visual.status === "done" || story.visual.status === "selected") return "success";
  if (story.visual.status === "needed" || story.visual.type === "none") return "warning";
  return "neutral";
}

export function StorySignalLine({ story }: { story: PlanningStory }) {
  const visuals = story.visual.label || story.visual.status || __("No visual brief", "weekly-wildcat-headless");
  const coverage = story.coverage.length
    ? story.coverage.map((item) => item.title).join(", ")
    : __("No coverage", "weekly-wildcat-headless");

  return (
    <div className="byline-planning-signal-line">
      <PlanningStatusBadge label={`${__("Visuals", "weekly-wildcat-headless")}: ${visuals}`} tone={visualTone(story)} />
      <span className="byline-planning-signal-text">
        {story.openTaskCount > 0
          ? `${story.openTaskCount} ${story.openTaskCount === 1 ? __("open task", "weekly-wildcat-headless") : __("open tasks", "weekly-wildcat-headless")}`
          : __("No open tasks", "weekly-wildcat-headless")}
      </span>
      <span className="byline-planning-signal-text">{coverage}</span>
    </div>
  );
}

export function WordPressState({ story }: { story: PlanningStory }) {
  const state = story.wordpressState;
  const tone = state.isPublished ? "success" : state.isScheduled ? "info" : "neutral";
  const label = state.isPublished
    ? state.label || __("Published", "weekly-wildcat-headless")
    : state.isScheduled
      ? state.label || __("Scheduled", "weekly-wildcat-headless")
      : state.label || __("Draft", "weekly-wildcat-headless");

  return <PlanningStatusBadge label={label} tone={tone} />;
}

export function StoryMoveControl({
  story,
  statuses,
  disabled,
  onMove
}: {
  story: PlanningStory;
  statuses: PlanningWorkflowStatus[];
  disabled?: boolean;
  onMove: (status: string) => void;
}) {
  const options = statuses
    .filter((status) => status.group !== "derived" && status.selectable)
    .map((status) => ({ label: status.label, value: status.id }));

  if (!options.length || story.wordpressState.isPublished) {
    return (
      <span className="byline-planning-muted" title={__("Published is derived from WordPress.", "weekly-wildcat-headless")}>
        {story.wordpressState.isPublished ? __("Published", "weekly-wildcat-headless") : __("No moves available", "weekly-wildcat-headless")}
      </span>
    );
  }

  return (
    <SelectControl
      __nextHasNoMarginBottom
      label={__("Move to…", "weekly-wildcat-headless")}
      hideLabelFromVision
      value=""
      options={[{ label: __("Move to…", "weekly-wildcat-headless"), value: "" }, ...options]}
      disabled={disabled}
      onChange={(value: string) => {
        if (value) onMove(value);
      }}
    />
  );
}

export function ViewHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="byline-planning-view-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="byline-planning-view-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="byline-planning-section-heading">
      {children}
      {typeof count === "number" ? <span className="byline-planning-count">{count}</span> : null}
    </h3>
  );
}
