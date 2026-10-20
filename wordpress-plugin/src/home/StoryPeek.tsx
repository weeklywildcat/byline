import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import type { HomeFetchers } from "./home-api";
import type { HomeBootstrap, HomePeek, StoryResource } from "./newsroom-model";
import { exactDate } from "./newsroom-model";
import { homeKey, peekKey } from "./home-query";
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

export type StoryPeekProps = { storyId: number | null; fetchers: HomeFetchers; timezone: string; onClose: () => void; origin: HTMLElement | null; onComplete: (task: EditorialTask) => void; completing?: boolean; onNewTask: (storyId: number) => void; now: Date };

export function StoryPeek({ storyId, fetchers, timezone, onClose, origin, onComplete, completing, onNewTask, now }: StoryPeekProps) {
  const client = useQueryClient();
  const peek = useQuery({ queryKey: peekKey(storyId || 0), queryFn: () => fetchers.getPeek!(storyId!), enabled: Boolean(storyId && fetchers.getPeek) });
  const data = peek.data;
  const story = data?.homeContext.story;
  const [addingLink, setAddingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [editError, setEditError] = useState("");
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: homeKey }), client.invalidateQueries({ queryKey: peekKey(storyId!) })]);

  const planning = useMutation({
    mutationFn: (patch: { deadline?: string | null; plannedPublishAt?: string | null; status?: string }) => fetchers.editorial!.updateWorkflow(storyId!, { ...patch, expectedRevision: data?.story.revision }),
    onMutate: async (patch) => {
      setEditError("");
      await client.cancelQueries({ queryKey: peekKey(storyId!) });
      const previous = client.getQueryData<HomePeek>(peekKey(storyId!));
      client.setQueryData<HomePeek>(peekKey(storyId!), (old) => old ? { ...old, homeContext: { ...old.homeContext, story: { ...old.homeContext.story, ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}), ...(patch.plannedPublishAt !== undefined ? { plannedPublication: patch.plannedPublishAt } : {}), ...(patch.status ? { workflow: old.statuses.find((s) => s.id === patch.status) || old.homeContext.story.workflow } : {}) } } } : old);
      return previous;
    },
    onError: (error, _patch, previous) => { if (previous) client.setQueryData<HomePeek>(peekKey(storyId!), (current) => current ? { ...current, homeContext: { ...current.homeContext, story: previous.homeContext.story } } : current); setEditError(describeEditorialError(error, "The story couldn't be updated. Try again.")); },
    onSettled: refresh
  });
  const writers = useMutation({ mutationFn: (value: ContributorEntry[]) => fetchers.editorial!.saveContributors(storyId!, value), onError: (error) => setEditError(describeEditorialError(error, "Writers couldn't be saved.")), onSuccess: refresh });
  const resources = useMutation({
    mutationFn: (input: { label: string; url: string } | { remove: string }) => "remove" in input ? fetchers.removeResource!(storyId!, input.remove) : fetchers.addResource!(storyId!, input),
    onMutate: async (input) => {
      setLinkError("");
      await client.cancelQueries({ queryKey: peekKey(storyId!) });
      const previous = client.getQueryData<HomePeek>(peekKey(storyId!))?.homeContext.resources || [];
      client.setQueryData<HomePeek>(peekKey(storyId!), (old) => old ? { ...old, homeContext: { ...old.homeContext, resources: "remove" in input ? old.homeContext.resources.filter((r) => r.id !== input.remove) : [...old.homeContext.resources, { id: "pending-link", ...input, kind: "Saving…" }] } } : old);
      return previous;
    },
    onSuccess: (result) => { client.setQueryData<HomePeek>(peekKey(storyId!), (old) => old ? { ...old, homeContext: { ...old.homeContext, resources: result.resources } } : old); setAddingLink(false); },
    onError: (error, _input, previous) => { client.setQueryData<HomePeek>(peekKey(storyId!), (old) => old ? { ...old, homeContext: { ...old.homeContext, resources: previous || [] } } : old); setLinkError(describeEditorialError(error, "The link couldn't be saved. Try again.")); toast.error("Link couldn't be saved."); }
  });
  const cp = data?.homeContext.contributors;
  const contributors = cp?.contributors || [];
  const taskList = data?.tasks.tasks.filter((task) => task.state === "open") || [];
  return <Sheet open={Boolean(storyId)} onOpenChange={(open) => { if (!open && !resources.isPending && !writers.isPending && !planning.isPending) { setAddingLink(false); setEditError(""); setLinkError(""); onClose(); } }}>
    <SheetContent className="home-story-peek" finalFocus={() => { if (origin?.isConnected) return origin; return document.querySelector<HTMLElement>(".home-search-trigger"); }}>
      <SheetHeader><SheetTitle>{story?.title || "Story details"}</SheetTitle><SheetDescription>Newsroom context</SheetDescription></SheetHeader>
      <div className="home-peek-scroll">
        {peek.isPending ? <RowSkeletons count={7} /> : peek.isError || !story ? <div className="home-inline-error" role="alert"><p>{describeEditorialError(peek.error, "The story couldn't be loaded.")}</p><Button variant="outline" onClick={() => void peek.refetch()}>Try again</Button></div> : <>
          <div className="home-peek-state"><Badge variant="outline">{story.workflow.label}</Badge><span className="home-meta">{data.homeContext.sections.join(" · ") || "No section"}</span></div>
          <dl className="home-properties">
            <dt>Workflow</dt><dd>{data.capabilities.changeStatus ? <Combobox items={data.statuses.filter((s) => s.selectable)} value={data.statuses.find((s) => s.id === story.workflow.id) || null} itemToStringLabel={(s) => s.label} isItemEqualToValue={(a, b) => a.id === b.id} onValueChange={(s) => { if (s) planning.mutate({ status: s.id }); }} disabled={planning.isPending}><ComboboxInput aria-label="Workflow" /><ComboboxContent><ComboboxList>{(status: HomePeek["statuses"][number]) => <ComboboxItem key={status.id} value={status}>{status.label}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox> : story.workflow.label}</dd>
            <dt>Writers</dt><dd>{cp?.canEdit ? <WritersPicker people={cp.available || []} value={contributors} onChange={(value) => writers.mutate(value)} disabled={writers.isPending} /> : <div className="home-people"><AvatarGroup>{contributors.map((person) => <PersonAvatar key={`${person.kind}:${person.id}`} name={person.name} url={person.imageUrl} />)}</AvatarGroup>{contributors.map((p) => p.name).join(", ")}</div>}</dd>
            <dt>Deadline</dt><dd>{data.capabilities.assign ? <DatePicker label="Deadline" dateOnly value={story.deadline} timezone={timezone} disabled={planning.isPending} onChange={(deadline) => planning.mutate({ deadline })} /> : exactDate(story.deadline, timezone)}</dd>
            <dt>Planned publication</dt><dd>{data.capabilities.assign ? <DatePicker label="Planned publication" value={story.plannedPublication} timezone={timezone} disabled={planning.isPending} onChange={(plannedPublishAt) => planning.mutate({ plannedPublishAt })} /> : exactDate(story.plannedPublication, timezone)}</dd>
            <dt>WordPress</dt><dd>{story.wordpressState.label}{story.wordpressState.isScheduled ? ` · ${exactDate(story.wordpressState.scheduledAt, timezone)}` : ""}</dd>
          </dl>
          {editError ? <p className="home-inline-error" role="alert">{editError}</p> : null}
          <Separator />
          <section className="home-peek-section"><header><h3>Tasks</h3>{data.tasks.capabilities.canEditLinkedStory ? <Button variant="ghost" onClick={() => onNewTask(story.id)}><Plus size={14} /> Add task</Button> : null}</header>{taskList.length ? <ul className="home-rows">{taskList.map((task) => <TaskRow key={task.id} task={task} storyTitle={story.title} timezone={timezone} now={now} onComplete={() => onComplete(task)} pending={completing} />)}</ul> : <Empty>No open tasks.</Empty>}</section>
          <Separator />
          <section className="home-peek-section"><header><h3>Visuals</h3></header>{data.media.type !== "none" ? <><p className="home-visual-summary">{data.media.type === "photo" ? "Photo" : "Visual"}<Badge variant="outline">{{ needed: "Needed", assigned: "Assigned", "in-progress": "In progress", uploaded: "Uploaded", selected: "Selected", done: "Done" }[data.media.status] || "Needed"}</Badge></p><p className="home-meta">{data.tasks.people.find((p) => Number(p.id) === data.media.assigneeId)?.name || "Unassigned"}{data.media.dueAt ? ` · ${exactDate(data.media.dueAt, timezone)}` : ""}</p>{data.media.notes ? <p className="home-visual-notes">{data.media.notes}</p> : null}</> : <Empty>No visual request.</Empty>}</section>
          <Separator />
          <section className="home-peek-section"><header><h3>Links</h3><Button variant="ghost" disabled={resources.isPending} onClick={() => setAddingLink(!addingLink)}><Plus size={14} /> Add link</Button></header>
            <ul className="home-resources">{data.homeContext.resources.map((link: StoryResource) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer"><span>{link.label}</span><small>{link.kind} <ArrowUpRight size={12} /></small></a><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${link.label}`} disabled={resources.isPending} onClick={() => resources.mutate({ remove: link.id })} />}><Trash2 size={13} /></TooltipTrigger><TooltipContent>Remove link</TooltipContent></Tooltip></li>)}</ul>
            {!data.homeContext.resources.length && !addingLink ? <Empty>No resource links.</Empty> : null}
            {addingLink ? <form className="home-link-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); resources.mutate({ label: String(form.get("label")), url: String(form.get("url")) }); }}><Field><FieldLabel htmlFor="home-link-label">Label</FieldLabel><Input id="home-link-label" name="label" required maxLength={120} placeholder="Interview notes" autoFocus /></Field><Field><FieldLabel htmlFor="home-link-url">URL</FieldLabel><Input id="home-link-url" name="url" type="url" required maxLength={2048} placeholder="https://…" /></Field><div><Button type="submit" disabled={resources.isPending}>{resources.isPending ? "Saving…" : "Add link"}</Button><Button variant="ghost" type="button" onClick={() => setAddingLink(false)}>Cancel</Button></div></form> : null}
            {linkError ? <p role="alert" className="home-inline-error">{linkError}</p> : null}
          </section>
          <Separator />
          <section className="home-peek-section"><header><h3>Recent activity</h3></header>{data.activity.activity.length ? <ul className="home-rows home-peek-activity">{data.activity.activity.slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} />)}</ul> : <Empty>No recent activity.</Empty>}</section>
        </>}
      </div>
      {story ? <SheetFooter>{story.editUrl ? <Button render={<a href={story.editUrl} />}>{story.workflow.id === "ready" && data.capabilities.assign ? "Review article" : "Edit article"}<ArrowUpRight size={14} /></Button> : null}{data.homeContext.previewUrl ? <Button variant="outline" render={<a href={data.homeContext.previewUrl} target="_blank" rel="noopener noreferrer" />}>Preview<ArrowUpRight size={14} /></Button> : null}</SheetFooter> : null}
    </SheetContent>
  </Sheet>;
}
