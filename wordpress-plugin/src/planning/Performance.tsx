import { ArrowDown, ArrowUp } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { decodeEntities } from "../admin-ui/lib/text";
import { Alert, AlertDescription, AlertTitle } from "../admin-ui/ui/alert";
import { Button } from "../admin-ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { performanceKey } from "../story/story-query";
import type { PlanningFetchers } from "./planning-api";
import type { PerformanceMetric, PerformanceResponse } from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

function metricValue(metric: PerformanceMetric): string {
  if (metric.formatted) return metric.formatted;
  if (metric.value === null || metric.value === undefined || metric.value === "") return __("No data yet", "weekly-wildcat-headless");
  return String(metric.value);
}

/** A titled list section. These are plain figures from the analytics provider; there is no time series here, so there is no chart. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card size="sm" role="region" aria-label={title}><CardHeader><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</CardHeader><CardContent className="px-0">{children}</CardContent></Card>;
}

export function Performance({ fetchers, onOpenStory }: { fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
  const query = useOptionalQuery<PerformanceResponse>(performanceKey, fetchers.getPerformance ? () => fetchers.getPerformance!() : undefined, __("Performance", "weekly-wildcat-headless"));
  return <>
    <PageHeader title={__("Performance", "weekly-wildcat-headless")} description={__("What your analytics provider reports, so you can see what is taking off.", "weekly-wildcat-headless")} actions={<Button variant="outline" disabled={query.isLoading} onClick={query.refetch}>{__("Refresh", "weekly-wildcat-headless")}</Button>} />
    <ResourceGate query={query} label={__("Performance", "weekly-wildcat-headless")}>{(data) => {
      const supported = data.metrics.filter((metric) => metric.supported);
      return <div className="flex flex-col gap-3">
        {!data.provider?.configured
          ? <Alert><AlertTitle>{__("No analytics provider is configured", "weekly-wildcat-headless")}</AlertTitle><AlertDescription>{__("Configure one in Byline Settings → Analytics to see newsroom metrics. Editorial work is unaffected.", "weekly-wildcat-headless")}</AlertDescription></Alert>
          : <p className="text-sm text-muted-foreground">{data.provider.label} — {__("only metrics the provider supplies are shown.", "weekly-wildcat-headless")}</p>}
        {supported.length
          ? <div className="grid grid-cols-2 gap-3 @3xl/planning:grid-cols-4" aria-label={__("Metrics", "weekly-wildcat-headless")}>{supported.map((metric) => <Card key={metric.id} size="sm"><CardHeader><CardDescription>{metric.label}</CardDescription><CardTitle className="text-2xl tabular-nums">{metricValue(metric)}</CardTitle>{metric.description ? <CardDescription>{metric.description}</CardDescription> : null}</CardHeader></Card>)}</div>
          : data.provider?.configured ? <NothingHere title={__("No metrics yet", "weekly-wildcat-headless")} description={__("This provider has not returned any supported metrics for the selected range.", "weekly-wildcat-headless")} /> : null}
        <div className="grid gap-3 @3xl/planning:grid-cols-2">
          {data.topStories?.length ? <Section title={__("Top stories", "weekly-wildcat-headless")}><ItemGroup className="gap-0">{data.topStories.map((entry) => <Item key={entry.story.id} size="sm"><ItemContent><ItemTitle><button type="button" className="text-left hover:underline" onClick={() => onOpenStory(entry.story.id)}>{decodeEntities(entry.story.title)}</button></ItemTitle></ItemContent><ItemActions className="text-sm tabular-nums">{typeof entry.views === "number" ? <span>{entry.views.toLocaleString()} {__("views", "weekly-wildcat-headless")}</span> : null}{typeof entry.trend === "number" ? <span className="flex items-center text-muted-foreground">{entry.trend >= 0 ? <ArrowUp className="size-3" aria-label={__("up", "weekly-wildcat-headless")} /> : <ArrowDown className="size-3" aria-label={__("down", "weekly-wildcat-headless")} />}{Math.abs(entry.trend)}%</span> : null}</ItemActions></Item>)}</ItemGroup></Section> : null}
          {data.sources?.length ? <Section title={__("Top sources", "weekly-wildcat-headless")}><ItemGroup className="gap-0">{data.sources.map((source) => <Item key={source.label} size="sm"><ItemContent><ItemTitle>{source.label}</ItemTitle></ItemContent><ItemActions className="text-sm tabular-nums text-muted-foreground">{source.value.toLocaleString()}{typeof source.percentage === "number" ? ` · ${source.percentage}%` : ""}</ItemActions></Item>)}</ItemGroup></Section> : null}
          {data.newsletter?.length ? <Section title={__("Newsletter", "weekly-wildcat-headless")}><ItemGroup className="gap-0">{data.newsletter.map((metric) => <Item key={metric.label} size="sm"><ItemContent><ItemTitle>{metric.label}</ItemTitle></ItemContent><ItemActions className="text-sm tabular-nums text-muted-foreground">{metric.supported ? String(metric.value ?? __("No data", "weekly-wildcat-headless")) : __("Unavailable", "weekly-wildcat-headless")}</ItemActions></Item>)}</ItemGroup></Section> : null}
          {data.searchGaps?.length ? <Section title={__("Search gaps", "weekly-wildcat-headless")} description={__("Searches that found nothing, counted together. No reader is identified.", "weekly-wildcat-headless")}><ItemGroup className="gap-0">{data.searchGaps.map((gap) => <Item key={gap.query} size="sm"><ItemContent><ItemTitle>{gap.query}</ItemTitle></ItemContent><ItemActions className="text-sm tabular-nums text-muted-foreground">{gap.count.toLocaleString()}</ItemActions></Item>)}</ItemGroup></Section> : null}
        </div>
      </div>;
    }}</ResourceGate>
  </>;
}
