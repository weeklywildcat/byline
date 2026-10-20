import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { decodeEntities } from "../admin-ui/lib/text";
import { StoryTitleButton } from "../story/story-parts";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { Alert, AlertDescription } from "../admin-ui/ui/alert";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Spinner } from "../admin-ui/ui/spinner";
import { describeEditorialError } from "../editorial/editorial-model";
import { contentHealthKey } from "../story/story-query";
import { contentHealthFixHref } from "./content-health-navigation";
import type { PlanningFetchers } from "./planning-api";
import type { ContentHealthResponse, ContentHealthSeverity } from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

const ALL = "all";
const SEVERITIES = [
  { value: ALL, label: __("All severities", "weekly-wildcat-headless") },
  { value: "error", label: __("Errors", "weekly-wildcat-headless") },
  { value: "warning", label: __("Warnings", "weekly-wildcat-headless") },
  { value: "info", label: __("Info", "weekly-wildcat-headless") }
];

export function ContentHealth({ fetchers, onOpenStory }: { fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
  const client = useQueryClient();
  const [severity, setSeverity] = useState<ContentHealthSeverity | typeof ALL>(ALL);
  const [type, setType] = useState(ALL);
  const query = useOptionalQuery<ContentHealthResponse>(contentHealthKey, fetchers.getContentHealth ? () => fetchers.getContentHealth!() : undefined, __("Content Health", "weekly-wildcat-headless"));
  const recheck = useMutation({
    mutationFn: (issueId?: string) => fetchers.recheckContentHealth!(issueId),
    onSuccess: () => { void client.invalidateQueries({ queryKey: contentHealthKey }); },
    onError: (error) => toast.error(describeEditorialError(error, __("The health check could not be started.", "weekly-wildcat-headless")))
  });
  const busyId = recheck.isPending ? recheck.variables ?? ALL : null;
  const types = useMemo(() => Array.from(new Set((query.data?.issues || []).map((issue) => issue.type).filter(Boolean))).sort(), [query.data]);
  const typeItems = [{ value: ALL, label: __("All issue types", "weekly-wildcat-headless") }, ...types.map((item) => ({ value: item, label: item }))];
  const issues = useMemo(() => (query.data?.issues || []).filter((issue) => (severity === ALL || issue.severity === severity) && (type === ALL || issue.type === type)), [query.data, severity, type]);
  return <>
    <PageHeader title={__("Content Health", "weekly-wildcat-headless")} description={__("Cached checks on published and draft content. Nothing is crawled while this page loads.", "weekly-wildcat-headless")} actions={<Button variant="outline" disabled={!fetchers.recheckContentHealth || busyId !== null} onClick={() => recheck.mutate(undefined)}>{busyId === ALL ? <><Spinner data-icon="inline-start" />{__("Checking…", "weekly-wildcat-headless")}</> : __("Run checks", "weekly-wildcat-headless")}</Button>} />
    <ResourceGate query={query} label={__("Content Health", "weekly-wildcat-headless")}>{(data) => <div className="flex flex-col gap-3">
      {data.scannerAvailable === false ? <Alert><AlertDescription>{__("The background scanner is not available, so results may be out of date. Publishing does not depend on Content Health.", "weekly-wildcat-headless")}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select items={SEVERITIES} value={severity} onValueChange={(next) => { if (next) setSeverity(next as ContentHealthSeverity | typeof ALL); }}><SelectTrigger aria-label={__("Severity", "weekly-wildcat-headless")} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
        <Select items={typeItems} value={type} onValueChange={(next) => { if (next) setType(String(next)); }}><SelectTrigger aria-label={__("Issue type", "weekly-wildcat-headless")} className="w-48"><SelectValue /></SelectTrigger><SelectContent>{typeItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
        {data.lastRunAt ? <span className="ml-auto text-xs text-muted-foreground">{__("Last checked", "weekly-wildcat-headless")} <time dateTime={data.lastRunAt}>{new Date(data.lastRunAt).toLocaleString()}</time></span> : null}
      </div>
      {issues.length
        ? <ItemGroup className="gap-0 overflow-hidden rounded-xl border bg-card shadow-xs" aria-label={__("Content health issues", "weekly-wildcat-headless")}>{issues.map((issue) => {
          const fix = contentHealthFixHref(issue);
          return <Item key={issue.id} size="sm" className="rounded-none border-0 border-b px-3 py-3 last:border-b-0">
            <ItemMedia><StatusBadge tone={issue.severity === "info" ? "neutral" : "attention"}>{issue.severity}</StatusBadge></ItemMedia>
            <ItemContent>
              <ItemTitle className="line-clamp-none">{issue.problem.trim() || issue.type || __("Content issue", "weekly-wildcat-headless")}</ItemTitle>
              <ItemDescription className="line-clamp-none">{issue.story ? <StoryTitleButton story={issue.story} onOpen={onOpenStory} className="font-normal" /> : null}{issue.story && issue.lastCheckedAt ? " · " : ""}{issue.lastCheckedAt ? <time dateTime={issue.lastCheckedAt}>{new Date(issue.lastCheckedAt).toLocaleString()}</time> : null}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="outline">{issue.type}</Badge>
              {fix ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={fix}>{__("Fix", "weekly-wildcat-headless")}</a> : null}
              {fetchers.recheckContentHealth ? <Button variant="ghost" size="sm" disabled={busyId !== null} onClick={() => recheck.mutate(issue.id)}>{busyId === issue.id ? <><Spinner data-icon="inline-start" />{__("Checking…", "weekly-wildcat-headless")}</> : __("Recheck", "weekly-wildcat-headless")}</Button> : null}
            </ItemActions>
          </Item>;
        })}</ItemGroup>
        : <NothingHere title={data.issues.length ? __("No issues match", "weekly-wildcat-headless") : __("Nothing to fix", "weekly-wildcat-headless")} description={data.issues.length ? __("Try another filter.", "weekly-wildcat-headless") : __("No cached content health issues were returned.", "weekly-wildcat-headless")} />}
    </div>}</ResourceGate>
  </>;
}
