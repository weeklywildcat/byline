"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { StoryBrief, StoryRecentActivity, StoryToDo, useOpenWorkCount } from "@byline/newsroom-screens/story-context/StoryPlan";
import { useOptionalWorkspace, WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { Smartphone } from "lucide-react";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveCoverage } from "../live/LiveCoverageProvider";
import { SavedQuotes } from "../reporting/ReportingReference";
import { ReportingTab } from "../reporting/ReportingTab";
import { ShellLink } from "../shell/navigation";
import { StoryBylineField, StorySectionField } from "./StoryAssignmentFields";
import { StoryNotes } from "./StoryNotes";
import type { StoryScreenContext } from "./StoryScreen";
import { PLAN_SECTIONS, type PlanSection, type StoryLocation, type StoryPlace } from "./story-view";

const SECTION_TITLES: Record<PlanSection, string> = { brief: "Story brief", reporting: "Reporting", todo: "To do", activity: "Activity" };
export const planSectionId = (section: PlanSection) => `plan-${section}`;

/**
 * Plan (docs/story-screen.md#plan): the working space for preparing,
 * researching and coordinating the Story. Four sections in reading order,
 * each its own Card (the newsroom UI kit's shadcn Card), so a reporter can
 * see at a glance where the brief ends and the reporting begins:
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
  const active = useSectionInView();
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
    <div ref={frame} className="@container/plan mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:gap-6 md:px-8" data-plan-workspace="">
      {/*
        Sticky under the app header, so a reporter can move between sections
        from anywhere in a long Plan (on a phone especially). The section in
        view is marked as the current one.
      */}
      <nav aria-label="Plan sections" className="sticky top-12 z-10 -mx-4 -mt-2 overflow-x-auto overscroll-x-contain border-b border-border/70 bg-background/95 px-4 py-1.5 backdrop-blur-sm [scrollbar-width:none] supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden" data-plan-jump="">
        <div className="flex w-max min-w-full items-center gap-1 text-sm">
          <span className="mr-1 shrink-0 text-xs text-muted-foreground max-sm:sr-only">Jump to</span>
          {PLAN_SECTIONS.map((section) => {
            const current = section === active;
            return (
              <Button key={section} type="button" variant={current ? "secondary" : "ghost"} size="sm" className={cn("h-9 shrink-0 px-2.5", current ? "text-foreground" : "text-muted-foreground")} aria-current={current ? "true" : undefined} onClick={() => jump(section)} data-plan-jump-target={section}>
                {SECTION_TITLES[section]}{section === "todo" ? <WorkspaceCount /> : null}
              </Button>
            );
          })}
        </div>
      </nav>

      <PlanSectionFrame section="brief">
        <WorkspaceGate>
          <WorkspaceStaleNotice />
          <StoryBrief
            writersControl={context.readOnly ? undefined : <StoryBylineField context={context} label="Reporters" />}
            sectionControl={context.readOnly ? undefined : <StorySectionField context={context} />}
          />
        </WorkspaceGate>
      </PlanSectionFrame>

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

      <PlanSectionFrame section="todo" description="Tasks, interviews still to happen and the media this story needs.">
        <WorkspaceGate>
          <StoryToDo leadImage={leadImage} onOpenReporting={() => jump("reporting")} />
        </WorkspaceGate>
      </PlanSectionFrame>

      <PlanSectionFrame section="activity">
        <div className="grid gap-8 @min-[600px]/plan-card:grid-cols-2 @min-[600px]/plan-card:gap-8">
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
    <Card id={id} role="region" aria-labelledby={`${id}-title`} className="scroll-mt-28 gap-4 overflow-visible [--card-spacing:--spacing(3)] sm:gap-5 sm:[--card-spacing:--spacing(4)] md:[--card-spacing:--spacing(6)]" data-plan-section={section}>
      <CardHeader>
        <CardTitle>
          <h2 id={`${id}-title`} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none" data-plan-heading="">{SECTION_TITLES[section]}</h2>
        </CardTitle>
        {description ? <CardDescription className="max-w-prose @max-lg/plan:col-span-2">{description}</CardDescription> : null}
        {actions ? <CardAction className="flex flex-wrap items-center gap-2 @max-lg/plan:[grid-row:1]">{actions}</CardAction> : null}
      </CardHeader>
      <CardContent className="@container/plan-card flex min-w-0 flex-col gap-4">{children}</CardContent>
    </Card>
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

/**
 * Which Plan section the reader is in: the last one whose top has passed
 * just under the sticky jump links (the app header plus the links), or the
 * last section once the page cannot scroll any further.
 */
function useSectionInView(): PlanSection {
  const [active, setActive] = useState<PlanSection>("brief");
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const line = 120;
      let current: PlanSection = PLAN_SECTIONS[0];
      for (const section of PLAN_SECTIONS) {
        const element = document.getElementById(planSectionId(section));
        if (element && element.getBoundingClientRect().top <= line) current = section;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atEnd && window.scrollY > 0) current = PLAN_SECTIONS[PLAN_SECTIONS.length - 1];
      setActive(current);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return active;
}
