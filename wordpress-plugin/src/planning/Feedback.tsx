import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { decodeEntities } from "../admin-ui/lib/text";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { Button } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { describeEditorialError } from "../editorial/editorial-model";
import { feedbackKey } from "../story/story-query";
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

function FeedbackCard({ item, fetchers, onOpenStory }: { item: FeedbackItem; fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
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
  return <Card size="sm" aria-busy={busy || undefined}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 capitalize">{item.type}<StatusBadge tone={item.status === "new" ? "attention" : item.status === "closed" ? "done" : "neutral"}>{STATUSES.find((s) => s.value === item.status)?.label || item.status}</StatusBadge></CardTitle>
      <CardDescription><time dateTime={item.createdAt} title={exactPlanningDate(item.createdAt)}>{exactPlanningDate(item.createdAt) || __("Unknown date", "weekly-wildcat-headless")}</time>{item.name || item.email ? <> · {item.name || __("Reader", "weekly-wildcat-headless")}{item.email ? <> · <a className="underline-offset-2 hover:underline" href={`mailto:${item.email}`}>{item.email}</a></> : null}</> : null}</CardDescription>
      <CardAction>
        <Select items={STATUSES} value={item.status} disabled={!fetchers.updateFeedback || busy} onValueChange={(next) => { if (next && next !== item.status) status.mutate(next as FeedbackStatus); }}>
          <SelectTrigger aria-label={__("Feedback status", "weekly-wildcat-headless")} className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-2">
      <p className="text-sm whitespace-pre-line">{item.message}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {item.story ? <button type="button" className="font-medium hover:underline" onClick={() => onOpenStory(item.story!.id)}>{decodeEntities(item.story.title)}</button> : <span className="text-muted-foreground">{__("Not linked to a story", "weekly-wildcat-headless")}</span>}
        {item.type === "correction" && item.story && fetchers.createCorrectionFromFeedback ? <Button variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={() => correction.mutate()}>{__("Create draft correction", "weekly-wildcat-headless")}</Button> : null}
      </div>
    </CardContent>
  </Card>;
}

export function Feedback({ fetchers, onOpenStory }: { fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void }) {
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const query = useOptionalQuery<FeedbackResponse>(feedbackKey, fetchers.getFeedback ? () => fetchers.getFeedback!() : undefined, __("Feedback", "weekly-wildcat-headless"));
  const visible = useMemo(() => (query.data?.feedback || []).filter((item) => filter === "all" || item.status === filter), [filter, query.data]);
  return <>
    <PageHeader title={__("Feedback", "weekly-wildcat-headless")} description={__("Reader notes, kept private. Converting one makes a draft correction for an editor to verify; reader wording is never published automatically.", "weekly-wildcat-headless")} actions={<Select items={FILTER_ITEMS} value={filter} onValueChange={(next) => { if (next) setFilter(next as FeedbackStatus | "all"); }}><SelectTrigger aria-label={__("Show feedback", "weekly-wildcat-headless")} className="w-36"><SelectValue /></SelectTrigger><SelectContent>{FILTER_ITEMS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>} />
    <ResourceGate query={query} label={__("Feedback", "weekly-wildcat-headless")}>{(data) => visible.length
      ? <div className="grid gap-3 @3xl/planning:grid-cols-2">{visible.map((item) => <FeedbackCard key={item.id} item={item} fetchers={fetchers} onOpenStory={onOpenStory} />)}</div>
      : <NothingHere title={data.feedback.length ? __("Nothing in this view", "weekly-wildcat-headless") : __("No feedback yet", "weekly-wildcat-headless")} description={data.feedback.length ? __("No feedback matches this status.", "weekly-wildcat-headless") : __("Reader feedback appears here when someone sends it.", "weekly-wildcat-headless")} />}</ResourceGate>
  </>;
}
