import { Badge } from "@byline/newsroom-ui/ui/badge";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { PHASE_LABELS, type EffectivePhase } from "@byline/newsroom-screens/story/lifecycle";

/**
 * The Story's stage as a colored badge (docs/story-screen.md#header). Color is
 * a second cue, never the only one: the stage is always written out. Pitch
 * through Ready run cool to warm to green, so "how far along" reads at a
 * glance; On Hold is muted and Dropped is red; Published uses the primary
 * color. Light and dark are both set so contrast holds in each.
 */
const TONES: Record<EffectivePhase, string> = {
  pitch: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  reporting: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  drafting: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  review: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  "on-hold": "border-border bg-muted text-muted-foreground",
  dropped: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  published: "bg-primary text-primary-foreground"
};

export function PhaseBadge({ phase, className }: { phase: EffectivePhase; className?: string }) {
  return <Badge variant="secondary" className={cn("tracking-wide uppercase", TONES[phase], className)} data-phase-badge={phase}>{PHASE_LABELS[phase]}</Badge>;
}
