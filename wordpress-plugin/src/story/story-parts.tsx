/**
 * Small story presentation pieces composed differently by Home, the Stories
 * board and list, Media and Coverage. Each answers one question about a story;
 * none is a configurable "universal story row".
 */
import type { ComponentProps } from "react";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { cn } from "../admin-ui/lib/utils";
import { decodeEntities } from "../admin-ui/lib/text";
import { dateLabel, dayDistance, exactDate, mediaStatusLabels, mediaTypeLabels, siteDay } from "../home/newsroom-model";
import { isPlannedDayOnly, type PlanningStory, type PlanningWorkflowStatus } from "../planning/planning-model";

/** The headline, as a button that opens Story Peek. Never a link into the editor: inspect first. */
export function StoryTitleButton({ story, onOpen, className, ...props }: { story: Pick<PlanningStory, "id" | "title">; onOpen: (storyId: number) => void } & Omit<ComponentProps<"button">, "onClick" | "children">) {
  return <button type="button" className={cn("min-w-0 text-left font-medium [overflow-wrap:anywhere] hover:underline focus-visible:underline focus-visible:outline-none", className)} onClick={() => onOpen(story.id)} {...props}>{decodeEntities(story.title) || "Untitled story"}</button>;
}

/** "Due tomorrow", "2d overdue", or a quiet fallback. Overdue is the one warning. */
export function StoryDueLabel({ value, timezone, now, prefix = "", empty = "No deadline", className }: { value: string | null | undefined; timezone: string; now: Date; prefix?: string; empty?: string; className?: string }) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>{empty}</span>;
  const overdue = dayDistance(value, timezone, now) < 0;
  const label = dateLabel(value, timezone, now);
  return <time dateTime={value} title={exactDate(value, timezone)} className={cn(overdue ? "text-warning" : "text-muted-foreground", className)}>{prefix}{prefix ? label.charAt(0).toLowerCase() + label.slice(1) : label}</time>;
}

/**
 * Workflow colors distinguish production stages without treating routine work
 * as an alert. Darker amber is reserved for a review handoff, and on-hold
 * gets muted rust. Text always names the stage; color is supplementary.
 *
 * Both light and dark themes use a paired surface/foreground/border palette.
 * The generic status badge remains responsible for actual attention signals.
 */
export const workflowBadgeColors: Record<string, string> = {
  pitch: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  assigned: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  reporting: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
  writing: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  editing: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  ready: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  "on-hold": "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200",
  dropped: "border-zinc-300 bg-zinc-200 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
  published: "border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
};

export function WorkflowBadge({ workflow, className }: { workflow: Pick<PlanningWorkflowStatus, "id" | "label" | "group">; className?: string }) {
  return <StatusBadge tone="neutral" className={cn("max-w-36 truncate font-medium", workflowBadgeColors[workflow.id] ?? "border-border bg-muted text-foreground", className)}>{workflow.label}</StatusBadge>;
}

/** A planned publication as a day when only a day was planned ("Oct 24"), and with its time when a real time was. */
export function plannedLabel(value: string, timezone: string): string {
  if (!isPlannedDayOnly(value, timezone)) return exactDate(value, timezone);
  const day = siteDay(value, timezone);
  return day ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "";
}

/** WordPress's publication state in words, quietly. The editorial workflow is what the newsroom steers by. */
export function wordpressStateText(story: Pick<PlanningStory, "wordpressState">, timezone: string): string {
  const state = story.wordpressState;
  if (state.isPublished) return state.publishedAt ? `Published ${exactDate(state.publishedAt, timezone)}` : state.label || "Published";
  if (state.isScheduled) return state.scheduledAt ? `Scheduled ${exactDate(state.scheduledAt, timezone)}` : state.label || "Scheduled";
  return state.label || "Draft";
}

export type StorySignal = { key: string; label: string; tone: "neutral" | "attention" };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The production work behind a story in one phrase ("Photo assigned", "Photo needed"), or null when there is none. */
export function productionSignal(story: Pick<PlanningStory, "visual" | "mediaSummary">): StorySignal | null {
  const visual = story.visual;
  if (!visual || visual.type === "none") return story.mediaSummary?.open ? { key: "media", label: plural(story.mediaSummary.open, "visual task"), tone: "neutral" } : null;
  const kind = mediaTypeLabels[visual.type as keyof typeof mediaTypeLabels] || "Visual";
  const status = mediaStatusLabels[visual.status as keyof typeof mediaStatusLabels] || "";
  return { key: "media", label: `${kind} ${status.toLowerCase()}`.trim(), tone: visual.status === "needed" ? "attention" : "neutral" };
}

/**
 * What is decision-useful beyond workflow and people: needs review, reporting
 * that still needs scheduling, open tasks, and production.
 */
export function storySignals(story: PlanningStory): StorySignal[] {
  const signals: StorySignal[] = [];
  if (story.needsReview) signals.push({ key: "review", label: "Needs review", tone: "attention" });
  if (story.reporting?.needsScheduling) signals.push({ key: "scheduling", label: `${story.reporting.needsScheduling} to schedule`, tone: "attention" });
  if (story.openTaskCount > 0) signals.push({ key: "tasks", label: plural(story.openTaskCount, "task"), tone: "neutral" });
  const production = productionSignal(story);
  if (production) signals.push(production);
  return signals;
}

/** The signals as one quiet line; anything that needs a person takes the warning colour. */
export function StorySignals({ story, className }: { story: PlanningStory; className?: string }) {
  const signals = storySignals(story);
  if (!signals.length) return null;
  return <ul aria-label="Story signals" className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", className)}>
    {signals.map((signal, index) => <li key={signal.key} className={cn("flex items-center gap-2", signal.tone === "attention" ? "font-medium text-warning" : "text-muted-foreground")}>{index ? <span aria-hidden="true" className="text-muted-foreground/60">·</span> : null}{signal.label}</li>)}
  </ul>;
}

/** Tasks plus production for a list row's "Work" column. */
export function ProductionSummary({ story, className, empty = "—" }: { story: PlanningStory; className?: string; /** What to show when there is no work; null leaves nothing, for rows that list it inline. */ empty?: string | null }) {
  const parts = [story.openTaskCount > 0 ? plural(story.openTaskCount, "task") : "", productionSignal(story)?.label || ""].filter(Boolean);
  const attention = story.visual?.status === "needed" && story.visual.type !== "none";
  return parts.length
    ? <span className={cn("flex flex-col text-xs", attention ? "text-warning" : "text-muted-foreground", className)}>{parts.map((part) => <span key={part}>{part}</span>)}</span>
    : empty === null ? null : <span className={cn("text-xs text-muted-foreground", className)}>{empty}</span>;
}
