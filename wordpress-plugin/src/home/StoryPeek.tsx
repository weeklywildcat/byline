import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import type { HomeFetchers } from "./home-api";
import { exactDate, mediaStatusLabels, mediaTypeLabels, resourcePurposeLabels } from "./newsroom-model";
import { homeKey, workspaceKey } from "./home-query";
import { appointmentLine } from "../workspace/schedule-model";
import { RESOURCE_PURPOSES, type ReportingSummary, type ResourcePurpose, type StoryResource, type StoryWorkspace } from "../workspace/workspace-types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./ui/sheet";
import { Badge } from "./ui/badge";
import { AvatarGroup } from "./ui/avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxItem, ComboboxList } from "./ui/combobox";
import { ActivityRow, Empty, PersonAvatar, RowSkeletons, TaskRow } from "./components/rows";
import { DatePicker, WritersPicker } from "./components/pickers";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A compact, note-free roll-up. A target window is shown as a window; it never acquires a clock time. */
function ReportingPeek({ reporting, error, timezone }: { reporting: ReportingSummary | null; error?: string; timezone: string }) {
  const next = reporting?.nextAppointment;
  const stats = reporting ? [reporting.sources ? plural(reporting.sources, "source") : "", reporting.interviewed ? `${reporting.interviewed} interviewed` : "", reporting.needsScheduling ? `${reporting.needsScheduling} needs scheduling` : ""].filter(Boolean) : [];
  return <section className="home-peek-section" aria-label="Reporting"><header><h3>Reporting</h3></header>
    {error ? <p className="home-inline-error" role="alert">Reporting couldn't be loaded.</p> : stats.length || next ? <>
      {stats.length ? <ul className="home-reporting-stats">{stats.map((stat) => <li key={stat}>{stat}</li>)}</ul> : null}
      {next ? <div className="home-reporting-next"><span className="home-meta">Next:</span><span className="home-row-title">{next.title}</span><span className="home-meta">{appointmentLine({ ...next, status: "confirmed", endAt: null }, timezone)}</span></div> : null}
    </> : <Empty>No sources or appointments yet.</Empty>}
  </section>;
}

export type StoryPeekProps = { storyId: number | null; fetchers: HomeFetchers; timezone: string; onClose: () => void; origin: HTMLElement | null; onComplete: (task: EditorialTask) => void; completing?: boolean; onNewTask: (storyId: number) => void; now: Date; workspaceUrl?: (storyId: number) => string };

export function StoryPeek({ storyId, fetchers, timezone, onClose, origin, onComplete, completing, onNewTask, now, workspaceUrl }: StoryPeekProps) {
  const client = useQueryClient();
  const peek = useQuery({ queryKey: workspaceKey(storyId || 0), queryFn: () => fetchers.getWorkspace!(storyId!), enabled: Boolean(storyId && fetchers.getWorkspace) });
  const data = peek.data;
  const story = data?.story;
  const [addingLink, setAddingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [editError, setEditError] = useState("");
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: homeKey }), client.invalidateQueries({ queryKey: workspaceKey(storyId!) })]);

  const planning = useMutation({
    mutationFn: (patch: { deadline?: string | null; plannedPublishAt?: string | null; status?: string }) => fetchers.editorial!.updateWorkflow(storyId!, { ...patch, expectedRevision: data?.revision }),
    onMutate: async (patch) => {
      setEditError("");
      await client.cancelQueries({ queryKey: workspaceKey(storyId!) });
      const previous = client.getQueryData<StoryWorkspace>(workspaceKey(storyId!));
      client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, story: { ...old.story, ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}), ...(patch.plannedPublishAt !== undefined ? { plannedPublication: patch.plannedPublishAt } : {}), ...(patch.status ? { workflow: (old.statuses.find((s) => s.id === patch.status) as StoryWorkspace["story"]["workflow"] | undefined) || old.story.workflow } : {}) } } : old);
      return previous;
    },
    onError: (error, _patch, previous) => { if (previous) client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (current) => current ? { ...current, story: previous.story } : current); setEditError(describeEditorialError(error, "The story couldn't be updated. Try again.")); },
    onSettled: refresh
  });
  const writers = useMutation({ mutationFn: (value: ContributorEntry[]) => fetchers.editorial!.saveContributors(storyId!, value), onError: (error) => setEditError(describeEditorialError(error, "Writers couldn't be saved.")), onSuccess: refresh });
  const resources = useMutation({
    mutationFn: (input: { label: string; url: string; purpose?: ResourcePurpose } | { remove: string }) => "remove" in input ? fetchers.workspace!.removeResource(storyId!, input.remove) : fetchers.workspace!.addResource(storyId!, input),
    onMutate: async (input) => {
      setLinkError("");
      await client.cancelQueries({ queryKey: workspaceKey(storyId!) });
      const previous = client.getQueryData<StoryWorkspace>(workspaceKey(storyId!))?.resources || [];
      client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: "remove" in input ? old.resources.filter((r) => r.id !== input.remove) : [...old.resources, { id: "pending-link", label: input.label, url: input.url, purpose: input.purpose || "other", kind: "Saving…" }] } : old);
      return previous;
    },
    onSuccess: (result) => { client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: result.resources } : old); setAddingLink(false); },
    onError: (error, _input, previous) => { client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: previous || [] } : old); setLinkError(describeEditorialError(error, "The link couldn't be saved. Try again.")); toast.error("Link couldn't be saved."); }
  });
  const cp = data?.contributors;
  const contributors = cp?.contributors || [];
  const taskList = data?.tasks.filter((task) => task.state === "open") || [];
  const drafts = data?.resources.filter((link) => link.purpose === "draft") || [];
  const assignments = data?.mediaAssignments || [];
  const peopleLabel = (id: number) => data?.people.find((p) => Number(p.id) === id)?.name;
  return <Sheet open={Boolean(storyId)} onOpenChange={(open) => { if (!open && !resources.isPending && !writers.isPending && !planning.isPending) { setAddingLink(false); setEditError(""); setLinkError(""); onClose(); } }}>
    <SheetContent className="home-story-peek" finalFocus={() => { if (origin?.isConnected) return origin; return document.querySelector<HTMLElement>(".home-search-trigger"); }}>
      <SheetHeader><SheetTitle>{story?.title || "Story details"}</SheetTitle><SheetDescription>Newsroom context</SheetDescription></SheetHeader>
      <div className="home-peek-scroll">
        {peek.isPending ? <RowSkeletons count={7} /> : peek.isError || !story ? <div className="home-inline-error" role="alert"><p>{describeEditorialError(peek.error, "The story couldn't be loaded.")}</p><Button variant="outline" onClick={() => void peek.refetch()}>Try again</Button></div> : <>
          <div className="home-peek-state"><Badge variant="outline">{story.workflow.label}</Badge><span className="home-meta">{data.sections.join(" · ") || "No section"}</span></div>
          <dl className="home-properties">
            <dt>Workflow</dt><dd>{data.capabilities.changeStatus ? <Combobox items={data.statuses.filter((s) => s.selectable)} value={data.statuses.find((s) => s.id === story.workflow.id) || null} itemToStringLabel={(s) => s.label} isItemEqualToValue={(a, b) => a.id === b.id} onValueChange={(s) => { if (s) planning.mutate({ status: s.id }); }} disabled={planning.isPending}><ComboboxInput aria-label="Workflow" /><ComboboxContent><ComboboxList>{(status: StoryWorkspace["statuses"][number]) => <ComboboxItem key={status.id} value={status}>{status.label}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox> : story.workflow.label}</dd>
            <dt>Writers</dt><dd>{cp?.canEdit ? <WritersPicker people={cp.available || []} value={contributors} onChange={(value) => writers.mutate(value)} disabled={writers.isPending} /> : <div className="home-people"><AvatarGroup>{contributors.map((person) => <PersonAvatar key={`${person.kind}:${person.id}`} name={person.name} url={person.imageUrl} />)}</AvatarGroup>{contributors.map((p) => p.name).join(", ")}</div>}</dd>
            <dt>Deadline</dt><dd>{data.capabilities.assign ? <DatePicker label="Deadline" dateOnly value={story.deadline} timezone={timezone} disabled={planning.isPending} onChange={(deadline) => planning.mutate({ deadline })} /> : exactDate(story.deadline, timezone)}</dd>
            <dt>Planned publication</dt><dd>{data.capabilities.assign ? <DatePicker label="Planned publication" value={story.plannedPublication} timezone={timezone} disabled={planning.isPending} onChange={(plannedPublishAt) => planning.mutate({ plannedPublishAt })} /> : exactDate(story.plannedPublication, timezone)}</dd>
            <dt>WordPress</dt><dd>{story.wordpressState.label}{story.wordpressState.isScheduled ? ` · ${exactDate(story.wordpressState.scheduledAt, timezone)}` : ""}</dd>
          </dl>
          {editError ? <p className="home-inline-error" role="alert">{editError}</p> : null}
          <Separator />
          <ReportingPeek reporting={data.reporting} error={data.errors.reporting} timezone={timezone} />
          <Separator />
          <section className="home-peek-section"><header><h3>Tasks</h3>{data.capabilities.addTask ? <Button variant="ghost" onClick={() => onNewTask(story.id)}><Plus size={14} /> Add task</Button> : null}</header>{taskList.length ? <ul className="home-rows">{taskList.map((task) => <TaskRow key={task.id} task={task} storyTitle={story.title} timezone={timezone} now={now} onComplete={() => onComplete(task)} pending={completing} />)}</ul> : <Empty>No open tasks.</Empty>}</section>
          <Separator />
          <section className="home-peek-section"><header><h3>Production</h3></header>{data.errors.media ? <p className="home-inline-error" role="alert">Production assignments couldn't be loaded.</p> : assignments.length ? <ul className="home-production">{assignments.map((item) => <li key={item.id}><span className="home-row-title">{item.title || mediaTypeLabels[item.type]}</span><span className="home-meta">{mediaTypeLabels[item.type] || "Visual"} · {item.assignee?.name || peopleLabel(item.assigneeId) || "Unassigned"}{item.dueAt ? ` · ${exactDate(item.dueAt, timezone)}` : ""}</span><Badge variant="outline">{mediaStatusLabels[item.status] || "Needed"}</Badge></li>)}</ul> : <Empty>No production assignments.</Empty>}</section>
          <Separator />
          <section className="home-peek-section"><header><h3>Links</h3>{data.capabilities.manageResources ? <Button variant="ghost" disabled={resources.isPending} onClick={() => setAddingLink(!addingLink)}><Plus size={14} /> Add link</Button> : null}</header>
            {drafts.length === 1 ? <a className="home-working-draft" href={drafts[0].url} target="_blank" rel="noopener noreferrer">Open working draft<ArrowUpRight size={12} /></a> : null}
            <ul className="home-resources">{data.resources.map((link: StoryResource) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer"><span>{link.label}</span><small>{link.kind}{link.purpose && link.purpose !== "other" ? ` · ${resourcePurposeLabels[link.purpose] || ""}` : ""} <ArrowUpRight size={12} /></small></a><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${link.label}`} disabled={resources.isPending} onClick={() => resources.mutate({ remove: link.id })} />}><Trash2 size={13} /></TooltipTrigger><TooltipContent>Remove link</TooltipContent></Tooltip></li>)}</ul>
            {!data.resources.length && !addingLink ? <Empty>No resource links.</Empty> : null}
            {addingLink ? <form className="home-link-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const purpose = String(form.get("purpose") || ""); resources.mutate({ label: String(form.get("label")), url: String(form.get("url")), ...(RESOURCE_PURPOSES.includes(purpose as ResourcePurpose) ? { purpose: purpose as ResourcePurpose } : {}) }); }}><Field><FieldLabel htmlFor="home-link-label">Label</FieldLabel><Input id="home-link-label" name="label" required maxLength={120} placeholder="Interview notes" autoFocus /></Field><Field><FieldLabel htmlFor="home-link-url">URL</FieldLabel><Input id="home-link-url" name="url" type="url" required maxLength={2048} placeholder="https://…" /></Field><Field><FieldLabel htmlFor="home-link-purpose">Purpose (optional)</FieldLabel><select id="home-link-purpose" name="purpose" className="home-native-select" defaultValue=""><option value="">No purpose</option>{RESOURCE_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{resourcePurposeLabels[purpose]}</option>)}</select></Field><div><Button type="submit" disabled={resources.isPending}>{resources.isPending ? "Saving…" : "Add link"}</Button><Button variant="ghost" type="button" onClick={() => setAddingLink(false)}>Cancel</Button></div></form> : null}
            {linkError ? <p role="alert" className="home-inline-error">{linkError}</p> : null}
          </section>
          <Separator />
          <section className="home-peek-section"><header><h3>Recent activity</h3></header>{data.activity.length ? <ul className="home-rows home-peek-activity">{data.activity.slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} />)}</ul> : <Empty>No recent activity.</Empty>}</section>
        </>}
      </div>
      {story ? <SheetFooter>{story.editUrl ? <Button render={<a href={story.editUrl} />}>{story.workflow.id === "ready" && data.capabilities.assign ? "Review article" : "Edit article"}<ArrowUpRight size={14} /></Button> : null}{workspaceUrl ? <Button variant="outline" render={<a href={workspaceUrl(story.id)} />}><LayoutDashboard size={14} />Open full story workspace</Button> : null}{data.previewUrl ? <Button variant="outline" render={<a href={data.previewUrl} target="_blank" rel="noopener noreferrer" />}>Preview<ArrowUpRight size={14} /></Button> : null}</SheetFooter> : null}
    </SheetContent>
  </Sheet>;
}
