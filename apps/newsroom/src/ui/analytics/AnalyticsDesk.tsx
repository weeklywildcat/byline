"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { TooltipProvider } from "@byline/newsroom-ui/ui/tooltip";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useNewsroomRoutes } from "../shell/account";
import { searchFor } from "./api";
import { ContentScreen, type ContentFilterState } from "./ContentScreen";
import { OverviewScreen } from "./OverviewScreen";
import { RangeControl } from "./parts";
import { AcquisitionScreen, AudienceScreen, EventsScreen } from "./ReaderScreens";
import { RealtimeScreen } from "./RealtimeScreen";

const TABS = [["overview", "Overview"], ["realtime", "Realtime"], ["content", "Content"], ["acquisition", "Acquisition"], ["audience", "Audience"], ["events", "Events"]] as const;
type Tab = (typeof TABS)[number][0];

/**
 * The Analytics desk (`/admin/analytics`): publication-wide audience reporting for editors. The tab,
 * date range and Content filters live in the address so a link, Back/Forward and a reload land in the
 * same place. Every number comes from `/api/byline/analytics/*`; the browser never talks to Google.
 */
export function AnalyticsDesk() {
  const { admin } = useNewsroomRoutes();
  const params = useSearchParams();
  const tab: Tab = TABS.find(([key]) => key === params?.get("tab"))?.[0] ?? "overview";
  const preset = ["today", "7d", "28d", "90d", "custom"].includes(params?.get("preset") ?? "") ? params!.get("preset")! : "7d";
  const start = params?.get("start") ?? "";
  const end = params?.get("end") ?? "";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const filters: ContentFilterState = { section: params?.get("section") ?? "", author: params?.get("author") ?? "", topic: params?.get("topic") ?? "", story: params?.get("story") ?? "", q: params?.get("q") ?? "" };
  const range = useMemo(() => searchFor({ preset, ...(preset === "custom" ? { start, end } : {}) }), [preset, start, end]);

  const go = useCallback((next: Record<string, string | undefined>, replace = false) => {
    const current = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) value ? current.set(key, value) : current.delete(key);
    const url = `${admin}/analytics${current.toString() ? `?${current}` : ""}`;
    if (replace) window.history.replaceState(null, "", url); else window.history.pushState(null, "", url);
  }, [admin]);

  return (
    <AdminRoot toaster={false}>
      <TooltipProvider>
        <main className="mx-auto grid w-full max-w-6xl min-w-0 gap-4 px-4 py-6 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1"><h1 className="text-2xl font-semibold">Analytics</h1><p className="text-sm text-muted-foreground">How readers find and read the Weekly Wildcat.</p></div>
            {tab !== "realtime" ? <RangeControl preset={preset} start={start} end={end} today={today} onChange={(next) => go({ preset: next.preset === "7d" ? undefined : next.preset, start: next.preset === "custom" ? next.start : undefined, end: next.preset === "custom" ? next.end : undefined })} /> : null}
          </div>
          <Tabs value={tab} onValueChange={(value) => go({ tab: value === "overview" ? undefined : String(value) })}>
            <TabsList className="grid w-full grid-cols-3 gap-1 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit" aria-label="Analytics views">{TABS.map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}</TabsList>
          </Tabs>
          <section aria-label={TABS.find(([key]) => key === tab)?.[1]}>
            {tab === "overview" ? <OverviewScreen search={range} /> : null}
            {tab === "realtime" ? <RealtimeScreen /> : null}
            {tab === "content" ? <ContentScreen search={range} filters={filters} onFilters={(next) => go(Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value || undefined])), true)} /> : null}
            {tab === "acquisition" ? <AcquisitionScreen search={range} /> : null}
            {tab === "audience" ? <AudienceScreen search={range} /> : null}
            {tab === "events" ? <EventsScreen search={range} /> : null}
          </section>
        </main>
      </TooltipProvider>
    </AdminRoot>
  );
}
