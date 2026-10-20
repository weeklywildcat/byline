import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { decodeEntities } from "../admin-ui/lib/text";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { Button } from "../admin-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Spinner } from "../admin-ui/ui/spinner";
import { describeEditorialError } from "../editorial/editorial-model";
import { feedbackKey } from "../story/story-query";
import { StoryTitleButton } from "../story/story-parts";
import type { PlanningFetchers } from "./planning-api";
import { exactPlanningDate, type FeedbackItem, type FeedbackResponse, type FeedbackStatus } from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

const STATUSES: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "new", label: __("New", "weekly-wildcat-headless") },
  { value: "reviewed", label: __("Reviewed", "weekly-wildcat-headless") },
  { value: "closed", label: __("Closed", "weekly-wildcat-headless") },
  { value: "spam", label: __("Spam", "weekly-wildcat-headless") }
];
const FILTER_ITEMS = [...STATUSES, { value: "all" as const, label: __("All feedback", "weekly-wildcat-headless") }];

function FeedbackRow({ item, fetchers, onOpenStory }: { item: FeedbackItem; fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: feedbackKey });
  const status = useMutation({
    mutationFn: (next: FeedbackStatus) => fetchers.updateFeedback!(item.id, next),
    onSuccess: () => { toast.success(__("Feedback status updated.", "weekly-wildcat-headless")); },
    onError: (error) => toast.error(describeEditorialError(error, __("Feedback status could not be updated.", "weekly-wildcat-headless"))),
    onSettled: refresh
  });
  const correction = useMutation({
    mutationFn: () => fetchers.createCorrectionFromFeedback!(item.id, { text: item.message, type: "correction" }),
    onSuccess: () => { toast.success(__("Draft correction created. Review it before publishing.", "weekly-wildcat-headless")); },
    onError: (error) => toast.error(describeEditorialError(error, __("A draft correction could not be created.", "weekly-wildcat-headless"))),
    onSettled: refresh
  });
  const busy = status.isPending || correction.isPending;
  const statusLabel = STATUSES.find((candidate) => candidate.value === item.status)?.label || item.status;
  const byline = item.name || item.email
    ? <>{item.name || __("Reader", "weekly-wildcat-headless")}{item.email ? <> · <a className="underline-offset-2 hover:underline" href={`mailto:${item.email}`}>{item.email}</a></> : null}</>
    : __("Anonymous reader", "weekly-wildcat-headless");

  return <Item size="sm" className="rounded-none border-0 border-b px-3 py-3.5 last:border-b-0" aria-busy={busy || undefined}>
    <ItemMedia variant="icon" className="text-muted-foreground"><MessageSquareText aria-hidden="true" /></ItemMedia>
    <ItemContent className="min-w-0 gap-1.5">
      <ItemTitle className="line-clamp-none capitalize">{item.type}<StatusBadge tone={item.status === "new" ? "attention" : item.status === "closed" ? "done" : "neutral"}>{statusLabel}</StatusBadge></ItemTitle>
      <ItemDescription className="line-clamp-none text-xs">
        <time dateTime={item.createdAt} title={exactPlanningDate(item.createdAt)}>{exactPlanningDate(item.createdAt) || __("Unknown date", "weekly-wildcat-headless")}</time> · {byline}
      </ItemDescription>
      <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">{item.message}</p>
      <ItemDescription className="line-clamp-none text-xs">
        {item.story
          ? <>{__("Story", "weekly-wildcat-headless")}: <StoryTitleButton story={item.story} onOpen={onOpenStory} className="font-medium text-foreground underline-offset-2" /></>
          : __("Not linked to a story", "weekly-wildcat-headless")}
      </ItemDescription>
    </ItemContent>
    <ItemActions className="self-start">
      <Select items={STATUSES} value={item.status} disabled={!fetchers.updateFeedback || busy} onValueChange={(next) => { if (next && next !== item.status) status.mutate(next as FeedbackStatus); }}>
        <SelectTrigger aria-label={__("Feedback status", "weekly-wildcat-headless")} className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>{STATUSES.map((candidate) => <SelectItem key={candidate.value} value={candidate.value}>{candidate.label}</SelectItem>)}</SelectContent>
      </Select>
    </ItemActions>
    {item.type === "correction" && item.story && fetchers.createCorrectionFromFeedback
      ? <ItemFooter className="justify-end pt-1"><Button variant="outline" size="sm" disabled={busy} onClick={() => correction.mutate()}>{correction.isPending ? <Spinner data-icon="inline-start" /> : null}{correction.isPending ? __("Creating…", "weekly-wildcat-headless") : __("Create draft correction", "weekly-wildcat-headless")}</Button></ItemFooter>
      : null}
  </Item>;
}

export function Feedback({ fetchers, onOpenStory }: { fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const query = useOptionalQuery<FeedbackResponse>(feedbackKey, fetchers.getFeedback ? () => fetchers.getFeedback!() : undefined, __("Feedback", "weekly-wildcat-headless"));
  const visible = useMemo(() => (query.data?.feedback || []).filter((item) => filter === "all" || item.status === filter), [filter, query.data]);

  return <>
    <PageHeader title={__("Feedback", "weekly-wildcat-headless")} description={__("Reader notes, kept private. Converting one makes a draft correction for an editor to verify; reader wording is never published automatically.", "weekly-wildcat-headless")} />
    <div className="flex items-center">
      <Select items={FILTER_ITEMS} value={filter} onValueChange={(next) => { if (next) setFilter(next as FeedbackStatus | "all"); }}>
        <SelectTrigger aria-label={__("Show feedback", "weekly-wildcat-headless")} className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{FILTER_ITEMS.map((candidate) => <SelectItem key={candidate.value} value={candidate.value}>{candidate.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <ResourceGate query={query} label={__("Feedback", "weekly-wildcat-headless")}>{(data) => visible.length
      ? <ItemGroup className="gap-0 overflow-hidden rounded-xl border bg-card shadow-xs" aria-label={__("Reader feedback", "weekly-wildcat-headless")}>{visible.map((item) => <FeedbackRow key={item.id} item={item} fetchers={fetchers} onOpenStory={onOpenStory} />)}</ItemGroup>
      : <NothingHere title={data.feedback.length ? __("Nothing in this view", "weekly-wildcat-headless") : __("No feedback yet", "weekly-wildcat-headless")} description={data.feedback.length ? __("No feedback matches this status.", "weekly-wildcat-headless") : __("Reader feedback appears here when someone sends it.", "weekly-wildcat-headless")} />}</ResourceGate>
  </>;
}
