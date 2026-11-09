"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ActivitySection } from "@byline/newsroom-screens/workspace/ActivitySection";
import { BriefSection } from "@byline/newsroom-screens/workspace/BriefSection";
import { DetailsSection } from "@byline/newsroom-screens/workspace/DetailsSection";
import { MediaSection } from "@byline/newsroom-screens/workspace/MediaSection";
import { ReportingPlan } from "@byline/newsroom-screens/workspace/ReportingPlan";
import { ReportingSummaryStrip } from "@byline/newsroom-screens/workspace/ReportingSummary";
import { ResourcesSection } from "@byline/newsroom-screens/workspace/ResourcesSection";
import { WorkspaceGate, WorkspaceStaleNotice } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { TasksSection } from "@byline/newsroom-screens/workspace/TasksSection";
import type { ReactNode } from "react";
import { HistoryTab } from "./HistoryTab";
import { StoryNotes } from "./StoryNotes";
import type { StoryScreenContext } from "./StoryScreen";
import { STORY_TABS, type StoryTab } from "./story-view";

const TAB_LABELS: Record<StoryTab, string> = { write: "Write", plan: "Plan", production: "Production", history: "History" };

/**
 * The legacy Story layout's tab bar and its Plan, Production and History
 * panels (docs/story-screen.md#legacy-layout). The Write panel is not here:
 * the article stays where the Story screen mounts it in every layout, and is
 * only hidden while another tab is open, so switching layout or tab never
 * remounts the editor. The panels are the same shared sections the Story
 * Context rail and Reporting are built from; nothing here writes anything the
 * focused layout does not.
 */
export function LegacyStoryTabs({ context, tab, onTab }: { context: StoryScreenContext; tab: StoryTab; onTab: (tab: StoryTab) => void }) {
  return (
    <Tabs value={tab} onValueChange={(next) => onTab(next as StoryTab)} className="gap-4" data-legacy-story-tabs="">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <TabsList>
          {STORY_TABS.map((value) => <TabsTrigger key={value} value={value}>{TAB_LABELS[value]}</TabsTrigger>)}
        </TabsList>
      </div>
      <TabsContent value="plan" className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <Workspace>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-start lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4">
              <BriefSection />
              <ReportingSummaryStrip />
              <ReportingPlan />
              <TasksSection />
            </div>
            <aside aria-label="Story context" className="flex min-w-0 flex-col gap-4">
              <DetailsSection />
              <ResourcesSection />
              <StoryNotes context={context} />
              <ActivitySection />
            </aside>
          </div>
        </Workspace>
      </TabsContent>
      <TabsContent value="production" className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <Workspace>
          <MediaSection />
        </Workspace>
      </TabsContent>
      <TabsContent value="history" className="mx-auto w-full max-w-5xl px-4 md:px-8">
        <HistoryTab context={context} />
      </TabsContent>
    </Tabs>
  );
}

/** A tab of workspace sections: loading and error states, and the stale-refresh notice. */
function Workspace({ children }: { children: ReactNode }) {
  return (
    <WorkspaceGate>
      <div className="flex flex-col gap-4">
        <WorkspaceStaleNotice />
        {children}
      </div>
    </WorkspaceGate>
  );
}
