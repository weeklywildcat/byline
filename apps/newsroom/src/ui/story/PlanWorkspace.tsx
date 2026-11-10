"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { StoryBrief, StoryRecentActivity, StoryToDo, useOpenWorkCount } from "@byline/newsroom-screens/story-context/StoryPlan";
import { useOptionalWorkspace, WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { Smartphone } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useLiveCoverage } from "../live/LiveCoverageProvider";
import { SavedQuotes } from "../reporting/ReportingReference";
import { ReportingTab } from "../reporting/ReportingTab";
import { ShellLink } from "../shell/navigation";
import { StoryNotes } from "./StoryNotes";
import type { StoryScreenContext } from "./StoryScreen";
import { PLAN_SECTIONS, type PlanSection, type StoryLocation, type StoryPlace } from "./story-view";

const SECTION_TITLES: Record<PlanSection, string> = { brief: "Story brief", reporting: "Reporting", todo: "To do", activity: "Activity" };
export const planSectionId = (section: PlanSection) => `plan-${section}`;

/**
 * Plan (docs/story-screen.md#plan): the working space for preparing,
 * researching and coordinating the Story. Four sections in reading order,
 * each a heading and its content on the page, never a stack of Cards:
 *
 * - **Story brief**: the angle and assignment, who, by when, what is expected;
 * - **Reporting**: the Story's reporting notebook (the same one Field Mode feeds);
 * - **To do**: tasks, interviews still to happen, media assignments;
 * - **Activity**: questions and notes, recent changes, a way to History.
 *
 * Jump links at the top move between them; there is no second tab bar.
 * Plan never changes the article or the Story's stage.
 */
export function PlanWorkspace({ context, location, go, leadImage }: { context: StoryScreenContext; location: StoryLocation; go: (place: StoryPlace) => void; leadImage: { url: string | null; alt: string | null } | null }) {
  const live = useLiveCoverage();
  const frame = useRef<HTMLDivElement | null>(null);
  const jump = (section: PlanSection) => {
    const target = document.getElementById(planSectionId(section));
    if (!target) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // The heading takes focus so a keyboard or screen reader user continues from the section.
    target.querySelector<HTMLElement>("[data-plan-heading]")?.focus({ preventScroll: true });
  };
  // A link that names a section (old Reporting links, `?section=`) lands on it once.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !location.section || location.section === "brief") return;
    landed.current = true;
    const section = location.section;
    // After the workspace has painted, so the section is at its final position.
    const timer = window.setTimeout(() => jump(section), 120);
    return () => window.clearTimeout(timer);
  }, [location.section]);

  return (
    <div ref={frame} className="@container/plan mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 md:px-8" data-plan-workspace="">
      <nav aria-label="Plan sections" className="-mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm" data-plan-jump="">
        <span className="mr-1 text-xs text-muted-foreground max-sm:sr-only">Jump to</span>
        {PLAN_SECTIONS.map((section) => (
          <Button key={section} type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => jump(section)}>
            {SECTION_TITLES[section]}{section === "todo" ? <WorkspaceCount /> : null}
          </Button>
        ))}
      </nav>

      <PlanSectionFrame section="brief">
        <WorkspaceGate>
          <WorkspaceStaleNotice />
          <StoryBrief writersHint="add them as the byline in Write" />
        </WorkspaceGate>
      </PlanSectionFrame>

      <Separator />
      <PlanSectionFrame
        section="reporting"
        description="Notes, recordings, transcripts, photos, documents and links for this story, newest first. Field Mode captures land here too."
        actions={live ? <Button type="button" size="sm" variant="outline" nativeButton={false} render={<ShellLink href={live.fieldHref} role="link" />}><Smartphone data-icon="inline-start" aria-hidden="true" />Open in Field Mode</Button> : null}
      >
        <ReportingTab
          context={context}
          capture={location.capture}
          appointmentId={location.appointment}
          transcriptId={null}
          onTranscript={(transcript) => { if (transcript) go({ mode: "transcript", transcript, workspace: "plan", section: "reporting" }); }}
        />
        <SavedQuotes context={context} />
      </PlanSectionFrame>

      <Separator />
      <PlanSectionFrame section="todo" description="Tasks, interviews still to happen and the media this story needs.">
        <WorkspaceGate>
          <StoryToDo leadImage={leadImage} onOpenReporting={() => jump("reporting")} />
        </WorkspaceGate>
      </PlanSectionFrame>

      <Separator />
      <PlanSectionFrame section="activity">
        <div className="grid gap-8 @3xl/plan:grid-cols-2 @3xl/plan:gap-10">
          <StoryNotes context={context} plain />
          <WorkspaceGate>
            <StoryRecentActivity onOpenHistory={() => go({ mode: "history" })} />
          </WorkspaceGate>
        </div>
      </PlanSectionFrame>
    </div>
  );
}

function PlanSectionFrame({ section, description, actions, children }: { section: PlanSection; description?: string; actions?: ReactNode; children: ReactNode }) {
  const id = planSectionId(section);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4" data-plan-section={section}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-title`} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none" data-plan-heading="">{SECTION_TITLES[section]}</h2>
          {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** "To do 3": the open count beside its jump link, once the workspace has loaded. */
function WorkspaceCount() {
  return useOptionalWorkspace() ? <OpenCount /> : null;
}

function OpenCount() {
  const count = useOpenWorkCount();
  return count ? <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums text-foreground">{count}<span className="sr-only"> open</span></span> : null;
}
