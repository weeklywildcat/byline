import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { decodeEntities } from "../admin-ui/lib/text";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { Button } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "../admin-ui/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Spinner } from "../admin-ui/ui/spinner";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { ToggleGroup, ToggleGroupItem } from "../admin-ui/ui/toggle-group";
import { describeEditorialError } from "../editorial/editorial-model";
import { ConfirmRemoveDialog } from "../workspace/dialog-shell";
import { coverageKey, invalidateStoryData, planningKey } from "../story/story-query";
import { planningFilterParams, type PlanningFetchers } from "./planning-api";
import { EMPTY_PLANNING_FILTERS, exactPlanningDate, type CoverageItem, type CoverageResponse, type CoverageStatus } from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

type CoverageFilter = "active" | "upcoming" | "past" | "all";
const FILTERS: Array<{ value: CoverageFilter; label: string }> = [
  { value: "active", label: __("Active", "weekly-wildcat-headless") },
  { value: "upcoming", label: __("Upcoming", "weekly-wildcat-headless") },
  { value: "past", label: __("Past", "weekly-wildcat-headless") },
  { value: "all", label: __("All", "weekly-wildcat-headless") }
];
const visibleCoverage = (item: CoverageItem, filter: CoverageFilter) => filter === "all" || (filter === "past" ? item.status === "past" || item.status === "archived" : item.status === filter);
const statusLabel = (status: CoverageStatus) => status.charAt(0).toUpperCase() + status.slice(1);

type StoryChoice = { id: number; title: string };
type Props = { fetchers: PlanningFetchers; onOpenStory: (storyId: number) => void };

/** One coverage package: a public-safe identity that several stories belong to. A Card, because it is a thing of its own with stories inside it. */
function CoverageCard({ item, stories, canManage, fetchers, onOpenStory }: Props & { item: CoverageItem; stories: StoryChoice[]; canManage: boolean }) {
  const client = useQueryClient();
  const [adding, setAdding] = useState<StoryChoice | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [removing, setRemoving] = useState<{ id: number; title: string } | null>(null);
  const linked = new Set((item.stories || []).map((story) => story.id));
  const available = stories.filter((story) => !linked.has(story.id));
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: coverageKey }), invalidateStoryData(client)]);
  const run = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: () => { void refresh(); },
    onError: (error) => toast.error(describeEditorialError(error, __("Coverage could not be updated.", "weekly-wildcat-headless")))
  });
  return <Card size="sm" role="region" aria-label={item.title}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">{item.title}<StatusBadge tone={item.status === "active" ? "done" : item.status === "draft" ? "attention" : "neutral"}>{statusLabel(item.status)}</StatusBadge></CardTitle>
      <CardDescription>{[`/${item.slug}`, item.startAt ? `${exactPlanningDate(item.startAt)}${item.endAt ? ` – ${exactPlanningDate(item.endAt)}` : ""}` : "", item.publicLandingEnabled ? __("Public landing page", "weekly-wildcat-headless") : __("Private", "weekly-wildcat-headless")].filter(Boolean).join(" · ")}</CardDescription>
      {item.staff.length ? <CardAction><PeopleAvatars people={item.staff} /></CardAction> : null}
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      {item.shortDescription ? <p className="text-sm">{item.shortDescription}</p> : null}
      <section aria-label={__("Linked stories", "weekly-wildcat-headless")} className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground">{__("Stories", "weekly-wildcat-headless")} · {item.storyCount}{item.plannedStoryCount ? ` (${item.plannedStoryCount} ${__("planned", "weekly-wildcat-headless")})` : ""}</h3>
        {item.stories?.length
          ? <ItemGroup className="-mx-2 gap-0">{item.stories.map((story) => <Item key={story.id} size="xs">
            <ItemContent><ItemTitle><button type="button" className="text-left hover:underline" onClick={() => onOpenStory(story.id)}>{decodeEntities(story.title)}</button></ItemTitle></ItemContent>
            <ItemActions>
              <StatusBadge tone={story.isPublished ? "done" : "neutral"}>{story.isPublished ? __("Published", "weekly-wildcat-headless") : __("Planned", "weekly-wildcat-headless")}</StatusBadge>
              {canManage && fetchers.removeStoryFromCoverage ? <Button variant="ghost" size="icon-xs" aria-label={`${__("Remove", "weekly-wildcat-headless")} ${story.title}`} onClick={() => setRemoving(story)}><Trash2 aria-hidden="true" /></Button> : null}
            </ItemActions>
          </Item>)}</ItemGroup>
          : <p className="text-sm text-muted-foreground">{__("No stories linked yet.", "weekly-wildcat-headless")}</p>}
      </section>
      {canManage && (fetchers.addStoryToCoverage || fetchers.createCoverageStory) ? <div className="flex flex-wrap items-end gap-3">
        {fetchers.addStoryToCoverage ? <Field className="min-w-52 flex-1"><FieldLabel htmlFor={`coverage-add-${item.id}`}>{__("Add an existing story", "weekly-wildcat-headless")}</FieldLabel>
          <div className="flex gap-2"><Combobox items={available} itemToStringLabel={(story: StoryChoice) => story.title} isItemEqualToValue={(a: StoryChoice, b: StoryChoice) => a.id === b.id} value={adding} onValueChange={setAdding}><ComboboxInput id={`coverage-add-${item.id}`} placeholder={__("Choose a story…", "weekly-wildcat-headless")} disabled={!available.length || run.isPending} /><ComboboxContent><ComboboxEmpty>{__("No stories to add.", "weekly-wildcat-headless")}</ComboboxEmpty><ComboboxList>{(story: StoryChoice) => <ComboboxItem key={story.id} value={story}>{story.title}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox>
            <Button variant="outline" disabled={!adding || run.isPending} onClick={() => { const story = adding!; run.mutate(() => fetchers.addStoryToCoverage!(item.id, story.id).then(() => { setAdding(null); toast.success(__("Story added to coverage.", "weekly-wildcat-headless")); })); }}>{__("Add", "weekly-wildcat-headless")}</Button></div>
        </Field> : null}
        {fetchers.createCoverageStory ? <Field className="min-w-52 flex-1"><FieldLabel htmlFor={`coverage-create-${item.id}`}>{__("Quick-create a story", "weekly-wildcat-headless")}</FieldLabel>
          <div className="flex gap-2"><Input id={`coverage-create-${item.id}`} value={newTitle} disabled={run.isPending} onChange={(event) => setNewTitle(event.target.value)} /><Button variant="outline" disabled={!newTitle.trim() || run.isPending} onClick={() => run.mutate(() => fetchers.createCoverageStory!(item.id, newTitle.trim()).then(() => { setNewTitle(""); toast.success(__("Story created for coverage.", "weekly-wildcat-headless")); }))}>{__("Create", "weekly-wildcat-headless")}</Button></div>
        </Field> : null}
      </div> : null}
    </CardContent>
    <ConfirmRemoveDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }} title={__("Remove this story from the coverage?", "weekly-wildcat-headless")} description={removing ? `“${removing.title}” ${__("stays in Byline; it just leaves this coverage.", "weekly-wildcat-headless")}` : ""} confirmLabel={__("Remove", "weekly-wildcat-headless")} onConfirm={() => { const story = removing; if (story) run.mutate(() => fetchers.removeStoryFromCoverage!(item.id, story.id).then(() => { toast.success(__("Story removed from coverage.", "weekly-wildcat-headless")); })); }} />
  </Card>;
}

function NewCoverage({ fetchers, open, onClose }: { fetchers: PlanningFetchers; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: (title: string) => fetchers.createCoverage!({ title }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: coverageKey }); onClose(); toast.success(__("Coverage created.", "weekly-wildcat-headless")); },
    onError: (error) => toast.error(describeEditorialError(error, __("Coverage could not be created.", "weekly-wildcat-headless")))
  });
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !create.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{__("New coverage", "weekly-wildcat-headless")}</DialogTitle><DialogDescription>{__("A coverage package gives a group of stories one shared identity.", "weekly-wildcat-headless")}</DialogDescription></DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title") || "").trim(); if (title) create.mutate(title); }}>
        <FieldGroup><Field><FieldLabel htmlFor="coverage-new-title">{__("Coverage title", "weekly-wildcat-headless")}</FieldLabel><Input id="coverage-new-title" name="title" required maxLength={160} autoFocus disabled={create.isPending} /></Field></FieldGroup>
        <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>{__("Cancel", "weekly-wildcat-headless")}</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? <><Spinner data-icon="inline-start" />{__("Creating…", "weekly-wildcat-headless")}</> : __("Create coverage", "weekly-wildcat-headless")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function Coverage({ fetchers, onOpenStory }: Props) {
  const [filter, setFilter] = useState<CoverageFilter>("active");
  const [creating, setCreating] = useState(false);
  const query = useOptionalQuery<CoverageResponse>(coverageKey, fetchers.getCoverage ? () => fetchers.getCoverage!() : undefined, __("Coverage", "weekly-wildcat-headless"));
  // The stories a coverage can adopt are the same collection Stories shows, so they share its cache entry.
  const stories = useQuery({ queryKey: planningKey(planningFilterParams(EMPTY_PLANNING_FILTERS)), queryFn: () => fetchers.getPlanning(EMPTY_PLANNING_FILTERS), enabled: Boolean(query.data) });
  const choices = useMemo(() => (stories.data?.stories || []).map((story) => ({ id: story.id, title: decodeEntities(story.title) })), [stories.data]);
  const canManage = query.data?.capabilities?.canManageCoverage !== false;
  return <>
    <PageHeader title={__("Coverage", "weekly-wildcat-headless")} description={__("Organize stories around a public-safe identity, not a free-form tag.", "weekly-wildcat-headless")} actions={canManage && fetchers.createCoverage ? <Button onClick={() => setCreating(true)}><Plus data-icon="inline-start" aria-hidden="true" />{__("New coverage", "weekly-wildcat-headless")}</Button> : undefined} />
    <ResourceGate query={query} label={__("Coverage", "weekly-wildcat-headless")}>{(data) => {
      const visible = data.coverage.filter((item) => visibleCoverage(item, filter));
      return <div className="flex flex-col gap-3">
        <ToggleGroup variant="outline" value={[filter]} onValueChange={(value) => { if (value[0]) setFilter(value[0] as CoverageFilter); }} aria-label={__("Coverage status", "weekly-wildcat-headless")}>
          {FILTERS.map((item) => <ToggleGroupItem key={item.value} value={item.value} aria-label={item.label}>{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        {visible.length
          ? <div className="grid gap-3 @3xl/planning:grid-cols-2">{visible.map((item) => <CoverageCard key={item.id} item={item} stories={choices} canManage={canManage} fetchers={fetchers} onOpenStory={onOpenStory} />)}</div>
          : <NothingHere title={data.coverage.length ? __("No coverage matches", "weekly-wildcat-headless") : __("No coverage yet", "weekly-wildcat-headless")} description={data.coverage.length ? __("Try another status.", "weekly-wildcat-headless") : __("Create a coverage package when a group of stories needs a shared identity.", "weekly-wildcat-headless")} />}
      </div>;
    }}</ResourceGate>
    <NewCoverage fetchers={fetchers} open={creating} onClose={() => setCreating(false)} />
  </>;
}
