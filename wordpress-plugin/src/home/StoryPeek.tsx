import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, FileText, LayoutDashboard, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { EmptyState } from "../admin-ui/components/empty-state";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { ItemList } from "../admin-ui/components/item-list";
import { DatePicker, WritersPicker, valueSelectTriggerClass } from "../admin-ui/components/pickers";
import { Property, PropertyList } from "../admin-ui/components/properties";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { SubHeading } from "../admin-ui/components/sub-heading";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Separator } from "../admin-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../admin-ui/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../admin-ui/ui/tooltip";
import type { HomeFetchers } from "./home-api";
import { exactDate, mediaStatusLabels, mediaTypeLabels, resourcePurposeLabels } from "./newsroom-model";
import { homeKey, workspaceKey } from "./home-query";
import { appointmentLine } from "../workspace/schedule-model";
import { RESOURCE_PURPOSES, type ReportingSummary, type ResourcePurpose, type StoryResource, type StoryWorkspace } from "../workspace/workspace-types";
import { ActivityRow, RowSkeletons, TaskRow } from "./components/rows";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function PeekSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-1 py-4"><SubHeading title={title}>{action}</SubHeading>{children}</section>;
}

const Quiet = ({ children }: { children: React.ReactNode }) => <EmptyState title={children} className="border-0 p-2" />;

/** A compact, note-free roll-up. A target window is shown as a window; it never acquires a clock time. */
function ReportingPeek({ reporting, error, timezone }: { reporting: ReportingSummary | null; error?: string; timezone: string }) {
  const next = reporting?.nextAppointment;
  const stats = reporting ? [reporting.sources ? plural(reporting.sources, "source") : "", reporting.interviewed ? `${reporting.interviewed} interviewed` : "", reporting.needsScheduling ? `${reporting.needsScheduling} needs scheduling` : ""].filter(Boolean) : [];
  return <PeekSection title="Reporting">
    {error ? <InlineAlert>Reporting couldn't be loaded.</InlineAlert> : stats.length || next ? <div className="flex flex-col gap-1.5 text-sm">
      {stats.length ? <ul className="flex flex-col gap-0.5">{stats.map((stat) => <li key={stat}>{stat}</li>)}</ul> : null}
      {next ? <div className="flex flex-col"><span className="text-muted-foreground">Next:</span><span className="font-medium">{next.title}</span><span className="text-muted-foreground">{appointmentLine({ ...next, status: "confirmed", endAt: null }, timezone)}</span></div> : null}
    </div> : <Quiet>No sources or appointments yet.</Quiet>}
  </PeekSection>;
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
  const [purpose, setPurpose] = useState<ResourcePurpose | "none">("none");
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
  const purposeItems = [{ value: "none", label: "No purpose" }, ...RESOURCE_PURPOSES.map((value) => ({ value, label: resourcePurposeLabels[value] }))];
  return <Sheet open={Boolean(storyId)} onOpenChange={(open) => { if (!open && !resources.isPending && !writers.isPending && !planning.isPending) { setAddingLink(false); setEditError(""); setLinkError(""); onClose(); } }}>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl" finalFocus={() => { if (origin?.isConnected) return origin; return document.querySelector<HTMLElement>("[data-home-search]"); }}>
      <SheetHeader className="border-b pr-12"><SheetTitle className="text-lg leading-snug [overflow-wrap:anywhere]">{story?.title || "Story details"}</SheetTitle><SheetDescription>Newsroom context</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {peek.isPending ? <div className="py-4"><RowSkeletons count={7} /></div> : peek.isError || !story ? <div className="py-4"><InlineAlert title="The story couldn't be loaded." onAction={() => void peek.refetch()}>{describeEditorialError(peek.error, "The story couldn't be loaded.")}</InlineAlert></div> : <>
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Badge variant="secondary">{story.workflow.label}</Badge>{data.sections.join(" · ") || "No section"}</div>
          <PropertyList>
            <Property label="Workflow">{data.capabilities.changeStatus ? <Select items={data.statuses.map((s) => ({ value: s.id, label: s.label }))} value={story.workflow.id} disabled={planning.isPending} onValueChange={(id) => { if (id && id !== story.workflow.id) planning.mutate({ status: id }); }}><SelectTrigger aria-label="Workflow" className={valueSelectTriggerClass}><SelectValue /></SelectTrigger><SelectContent>{data.statuses.filter((s) => s.selectable).map((status) => <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>)}</SelectContent></Select> : story.workflow.label}</Property>
            <Property label="Writers">{cp?.canEdit ? <WritersPicker people={cp.available || []} value={contributors} onChange={(value) => writers.mutate(value)} disabled={writers.isPending} /> : contributors.map((p) => p.name).join(", ") || "None"}</Property>
            <Property label="Deadline">{data.capabilities.assign ? <DatePicker appearance="value" label="Deadline" dateOnly value={story.deadline} timezone={timezone} disabled={planning.isPending} onChange={(deadline) => planning.mutate({ deadline })} /> : exactDate(story.deadline, timezone)}</Property>
            <Property label="Planned publication">{data.capabilities.assign ? <DatePicker appearance="value" label="Planned publication" value={story.plannedPublication} timezone={timezone} disabled={planning.isPending} onChange={(plannedPublishAt) => planning.mutate({ plannedPublishAt })} /> : exactDate(story.plannedPublication, timezone)}</Property>
            <Property label="WordPress">{story.wordpressState.label}{story.wordpressState.isScheduled ? ` · ${exactDate(story.wordpressState.scheduledAt, timezone)}` : ""}</Property>
          </PropertyList>
          {editError ? <div className="pt-3"><InlineAlert>{editError}</InlineAlert></div> : null}
          <Separator className="mt-4" />
          <ReportingPeek reporting={data.reporting} error={data.errors.reporting} timezone={timezone} />
          <Separator />
          <PeekSection title="Tasks" action={data.capabilities.addTask ? <Button variant="outline" size="sm" data-peek-add-task="" onClick={() => onNewTask(story.id)}><Plus data-icon="inline-start" aria-hidden="true" />Add task</Button> : null}>
            {taskList.length ? <ItemList className="-mx-3 w-auto">{taskList.map((task) => <TaskRow key={task.id} task={task} storyTitle={story.title} timezone={timezone} now={now} onComplete={() => onComplete(task)} pending={completing} />)}</ItemList> : <Quiet>No open tasks.</Quiet>}
          </PeekSection>
          <Separator />
          <PeekSection title="Production">{data.errors.media ? <InlineAlert>Production assignments couldn't be loaded.</InlineAlert> : assignments.length ? <ItemList className="-mx-3 w-auto">{assignments.map((item) => <Item key={item.id} size="sm"><ItemContent><ItemTitle>{item.title || mediaTypeLabels[item.type]}</ItemTitle><ItemDescription>{mediaTypeLabels[item.type] || "Visual"} · {item.assignee?.name || peopleLabel(item.assigneeId) || "Unassigned"}{item.dueAt ? ` · ${exactDate(item.dueAt, timezone)}` : ""}</ItemDescription></ItemContent><ItemActions><StatusBadge tone={item.status === "needed" ? "attention" : "neutral"}>{mediaStatusLabels[item.status] || "Needed"}</StatusBadge></ItemActions></Item>)}</ItemList> : <Quiet>No production assignments.</Quiet>}</PeekSection>
          <Separator />
          <PeekSection title="Links" action={data.capabilities.manageResources ? <Button variant="outline" size="sm" disabled={resources.isPending} onClick={() => setAddingLink(!addingLink)}><Plus data-icon="inline-start" aria-hidden="true" />Add link</Button> : null}>
            {drafts.length === 1 ? <a className={buttonVariants({ variant: "ghost", size: "sm" }) + " self-start"} href={drafts[0].url} target="_blank" rel="noopener noreferrer"><FileText data-icon="inline-start" aria-hidden="true" />Open working draft<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></a> : null}
            {data.resources.length ? <ItemList className="-mx-3 w-auto">{data.resources.map((link: StoryResource) => <div key={link.id} className="flex items-center gap-1">
              <Item size="sm" className="min-w-0 flex-1" render={<a href={link.url} target="_blank" rel="noopener noreferrer" />}>
                <ItemMedia variant="icon" className="text-muted-foreground"><Link2 aria-hidden="true" /></ItemMedia>
                <ItemContent><ItemTitle>{link.label}</ItemTitle><ItemDescription>{link.kind}{link.purpose && link.purpose !== "other" ? ` · ${resourcePurposeLabels[link.purpose] || ""}` : ""}</ItemDescription></ItemContent>
                <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
              </Item>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${link.label}`} disabled={resources.isPending} onClick={() => resources.mutate({ remove: link.id })} />}><Trash2 aria-hidden="true" /></TooltipTrigger><TooltipContent>Remove link</TooltipContent></Tooltip>
            </div>)}</ItemList> : addingLink ? null : <Quiet>No resource links.</Quiet>}
            {addingLink ? <form className="pt-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); resources.mutate({ label: String(form.get("label")), url: String(form.get("url")), ...(purpose !== "none" ? { purpose } : {}) }); }}>
              <FieldGroup className="gap-4">
                <Field><FieldLabel htmlFor="home-link-label">Label</FieldLabel><Input id="home-link-label" name="label" required maxLength={120} placeholder="Interview notes" autoFocus /></Field>
                <Field><FieldLabel htmlFor="home-link-url">URL</FieldLabel><Input id="home-link-url" name="url" type="url" required maxLength={2048} placeholder="https://…" /></Field>
                <Field><FieldLabel htmlFor="home-link-purpose">Purpose <span className="font-normal text-muted-foreground">Optional</span></FieldLabel>
                  <Select items={purposeItems} value={purpose} onValueChange={(next) => setPurpose((next as ResourcePurpose | "none") || "none")}><SelectTrigger id="home-link-purpose" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{purposeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
                </Field>
                <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setAddingLink(false)}>Cancel</Button><Button type="submit" disabled={resources.isPending}>{resources.isPending ? "Saving…" : "Add link"}</Button></div>
              </FieldGroup>
            </form> : null}
            {linkError ? <InlineAlert className="mt-2">{linkError}</InlineAlert> : null}
          </PeekSection>
          <Separator />
          <PeekSection title="Recent activity">{data.activity.length ? <ItemList className="-mx-3 w-auto">{data.activity.slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} now={now} />)}</ItemList> : <Quiet>No recent activity.</Quiet>}</PeekSection>
        </>}
      </div>
      {story ? <SheetFooter className="flex-row flex-wrap border-t">
        {story.editUrl ? <a className={buttonVariants()} href={story.editUrl}>{story.workflow.id === "ready" && data.capabilities.assign ? "Review article" : "Edit article"}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></a> : null}
        {workspaceUrl ? <a className={buttonVariants({ variant: "outline" })} href={workspaceUrl(story.id)}><LayoutDashboard data-icon="inline-start" aria-hidden="true" />Open full story workspace</a> : null}
        {data.previewUrl ? <a className={buttonVariants({ variant: "outline" })} href={data.previewUrl} target="_blank" rel="noopener noreferrer">Preview<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></a> : null}
      </SheetFooter> : null}
    </SheetContent>
  </Sheet>;
}
