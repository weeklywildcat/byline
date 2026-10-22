/**
 * Small story presentation pieces composed differently by Home, the Stories
 * board and list, Media and Coverage. Each answers one question about a story;
 * none is a configurable "universal story row".
 */
import type { ComponentProps } from "react";
import { MessageSquareText } from "lucide-react";
import { WorkStatusBadge, mediaIntensity, type WorkIntensity, type WorkKind } from "../admin-ui/components/work-status-badge";
import { cn } from "../admin-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../admin-ui/ui/tooltip";
import { decodeEntities } from "../admin-ui/lib/text";
import { dateLabel, dayDistance, exactDate, mediaStatusLabels, mediaTypeLabels, siteDay } from "../home/newsroom-model";
import { isPlannedDayOnly, type PlanningStory, type PlanningWorkflowStatus } from "../planning/planning-model";
import { openArticleNotesLabel, openNotesSignal } from "./notes-model";

/** The headline, as a button that opens Story Peek. Never a link into the editor: inspect first. */
export function StoryTitleButton({ story, onOpen, className, ...props }: { story: Pick<PlanningStory, "id" | "title">; onOpen: (storyId: number) => void } & Omit<ComponentProps<"button">, "onClick" | "children">) {
  // A StoryHoverCard wraps this button and, while its preview is open, passes an onClick of its own.
  // Spreading that after ours replaced it, so clicking a title the cursor had rested on did nothing.
  // Run it first, then always open Peek.
  const { onClick: injected, ...rest } = props as ComponentProps<"button">;
  return <button type="button" className={cn("min-w-0 text-left font-medium [overflow-wrap:anywhere] hover:underline focus-visible:underline focus-visible:outline-none", className)} {...rest} onClick={(event) => { injected?.(event); onOpen(story.id); }}>{decodeEntities(story.title) || "Untitled story"}</button>;
}

/** "Due tomorrow", "2d overdue", or a quiet fallback. Overdue is the one warning. */
export function StoryDueLabel({ value, timezone, now, prefix = "", empty = "No deadline", className }: { value: string | null | undefined; timezone: string; now: Date; prefix?: string; empty?: string; className?: string }) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>{empty}</span>;
  const overdue = dayDistance(value, timezone, now) < 0;
  const label = dateLabel(value, timezone, now);
  return <time dateTime={value} title={exactDate(value, timezone)} className={cn(overdue ? "text-warning" : "text-muted-foreground", className)}>{prefix}{prefix ? label.charAt(0).toLowerCase() + label.slice(1) : label}</time>;
}

/** Workflow is a phase, not a warning. The same hues are used for work inside it. */
export const workflowBadgeSpec: Record<string, { kind: WorkKind; intensity: WorkIntensity }> = {
  pitch: { kind: "neutral", intensity: "settled" },
  assigned: { kind: "neutral", intensity: "active" },
  reporting: { kind: "reporting", intensity: "active" },
  writing: { kind: "editorial", intensity: "active" },
  editing: { kind: "editorial", intensity: "active" },
  ready: { kind: "editorial", intensity: "action" },
  "on-hold": { kind: "neutral", intensity: "action" },
  dropped: { kind: "neutral", intensity: "settled" },
  published: { kind: "publication", intensity: "settled" }
};

export function WorkflowBadge({ workflow, className }: { workflow: Pick<PlanningWorkflowStatus, "id" | "label" | "group">; className?: string }) {
  const { kind, intensity } = workflowBadgeSpec[workflow.id] ?? { kind: "neutral", intensity: "settled" };
  return <WorkStatusBadge kind={kind} intensity={intensity} className={cn("max-w-36", className)}>{workflow.label}</WorkStatusBadge>;
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

export type StorySignal = { key: string; label: string; tone: "neutral" | "attention"; kind: WorkKind; intensity: WorkIntensity };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The production work behind a story in one phrase ("Photo assigned", "Photo needed"), or null when there is none. */
export function productionSignal(story: Pick<PlanningStory, "visual" | "mediaSummary">): StorySignal | null {
  const visual = story.visual;
  if (!visual || visual.type === "none") return story.mediaSummary?.open ? { key: "media", label: plural(story.mediaSummary.open, "visual task"), tone: "neutral", kind: "production", intensity: "active" } : null;
  const kind = mediaTypeLabels[visual.type as keyof typeof mediaTypeLabels] || "Visual";
  const status = mediaStatusLabels[visual.status as keyof typeof mediaStatusLabels] || "";
  return { key: "media", label: `${kind} ${status.toLowerCase()}`.trim(), tone: visual.status === "needed" ? "attention" : "neutral", kind: "production", intensity: mediaIntensity(visual.status) };
}

/**
 * What is decision-useful beyond workflow and people: needs review, reporting
 * that still needs scheduling, open tasks, and production.
 */
export function storySignals(story: PlanningStory): StorySignal[] {
  const signals: StorySignal[] = [];
  if (story.needsReview) signals.push({ key: "review", label: "Needs review", tone: "attention", kind: "editorial", intensity: "action" });
  if (story.reporting?.needsScheduling) signals.push({ key: "scheduling", label: `${story.reporting.needsScheduling} to schedule`, tone: "attention", kind: "reporting", intensity: "action" });
  if (story.openTaskCount > 0) signals.push({ key: "tasks", label: plural(story.openTaskCount, "task"), tone: "neutral", kind: "task", intensity: "active" });
  const production = productionSignal(story);
  if (production) signals.push(production);
  return signals;
}

/**
 * Unresolved WordPress Notes as a quiet icon and count. It is deliberately not a
 * WorkStatusBadge: it must never compete with an overdue deadline or a workflow
 * attention state. Nothing renders unless the viewer may edit the story, Core
 * Notes exist, and at least one thread is open. The count is real text and is
 * read in full by assistive tech; the Tooltip only repeats it.
 */
export function StoryNotesIndicator({ story, className }: { story: Pick<PlanningStory, "notes">; className?: string }) {
  const open = openNotesSignal(story.notes);
  if (!open) return null;
  const label = openArticleNotesLabel(open);
  return <Tooltip>
    <TooltipTrigger render={<span data-story-notes={open} className={cn("relative inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums", className)} />}>
      <MessageSquareText className="size-3.5" aria-hidden="true" /><span aria-hidden="true">{open}</span><span className="sr-only">{label}</span>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

/** Category is encoded by hue; action intensity is encoded by filled strength. */
export function StorySignals({ story, className }: { story: PlanningStory; className?: string }) {
  const signals = storySignals(story);
  const hasNotes = openNotesSignal(story.notes) > 0;
  if (!signals.length && !hasNotes) return null;
  return <ul aria-label="Story signals" className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
    {signals.map((signal) => <li key={signal.key}><WorkStatusBadge kind={signal.kind} intensity={signal.intensity}>{signal.label}</WorkStatusBadge></li>)}
    {hasNotes ? <li><StoryNotesIndicator story={story} /></li> : null}
  </ul>;
}

/** Tasks, scheduling and production use the same color vocabulary in the List. */
export function ProductionSummary({ story, className, empty = "—" }: { story: PlanningStory; className?: string; /** Null hides the empty state in compact rows. */ empty?: string | null }) {
  const signals = storySignals(story);
  const hasNotes = openNotesSignal(story.notes) > 0;
  return signals.length || hasNotes
    ? <span className={cn("flex flex-wrap items-center gap-1.5", className)}>{signals.map((signal) => <WorkStatusBadge key={signal.key} kind={signal.kind} intensity={signal.intensity}>{signal.label}</WorkStatusBadge>)}<StoryNotesIndicator story={story} /></span>
    : empty === null ? null : <span className={cn("text-xs text-muted-foreground", className)}>{empty}</span>;
}
