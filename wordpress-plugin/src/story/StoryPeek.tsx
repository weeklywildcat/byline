import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { decodeEntities } from "../admin-ui/lib/text";
import { PeopleAvatars, anyPicture } from "../admin-ui/components/people-avatars";
import { DatePicker, WritersPicker, fieldRow, valueSelectTriggerClass } from "../admin-ui/components/pickers";
import { ResourceIcon } from "../admin-ui/components/resource-icon";
import { WorkStatusBadge, mediaIntensity } from "../admin-ui/components/work-status-badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Spinner } from "../admin-ui/ui/spinner";
import { Separator } from "../admin-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../admin-ui/ui/sheet";
import { ConfirmRemoveDialog } from "../workspace/dialog-shell";
import { workingDraft } from "../workspace/resource-model";
import { appointmentLine } from "../workspace/schedule-model";
import { assigneeAvatars, sectionNames } from "../workspace/workspace-model";
import { RESOURCE_PURPOSES, type ReportingSummary, type ResourcePurpose, type StoryResource, type StoryWorkspace } from "../workspace/workspace-types";
import { exactDate, mediaStatusLabels, mediaTypeLabels, resourcePurposeLabels, shortDateTime } from "../home/newsroom-model";
import { mediaTypeIcons } from "./media-icons";
import { ActivityRow, RowSkeletons, TaskRow } from "./rows";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData, workspaceKey } from "./story-query";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const PEEK_ACTIVITY = 3;

/** A section of the peek: Item's header row, then its content. */
function PeekSection({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-1 py-3">
    <Item size="xs" className="px-0 py-0"><ItemHeader><ItemTitle role="heading" aria-level={3}>{title}</ItemTitle>{action ? <ItemActions>{action}</ItemActions> : null}</ItemHeader></Item>
    {children}
  </section>;
}

const compactEmpty = "items-start gap-2 border-0 p-0 text-left";

/** A compact, note-free roll-up. A target window is shown as a window; it never acquires a clock time. */
function ReportingPeek({ reporting, error, timezone, canAddSource, canAddAppointment, reportingUrl }: { reporting: ReportingSummary | null; error?: string; timezone: string; canAddSource: boolean; canAddAppointment: boolean; reportingUrl?: string }) {
  const next = reporting?.nextAppointment;
  const stats = reporting ? [reporting.sources ? plural(reporting.sources, "source") : "", reporting.interviewed ? `${reporting.interviewed} interviewed` : "", reporting.needsScheduling ? `${reporting.needsScheduling} needs scheduling` : ""].filter(Boolean) : [];
  const empty = !stats.length && !next;
  const canAdd = Boolean(reportingUrl) && (canAddSource || canAddAppointment);
  // Nothing to show and nothing to do here: leave the section out.
  if (!error && empty && !canAdd) return null;
  return <>
    <Separator />
    <PeekSection title="Reporting">
      {error ? <InlineAlert>Reporting couldn't be loaded.</InlineAlert> : empty
        ? <Empty className={compactEmpty}>
          <EmptyHeader className="items-start gap-0.5"><EmptyTitle>No sources or interviews yet.</EmptyTitle><EmptyDescription>Add people you plan to talk to.</EmptyDescription></EmptyHeader>
          <EmptyContent className="flex-row flex-wrap">
            {canAddSource ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={reportingUrl}><Plus data-icon="inline-start" aria-hidden="true" />Add source</a> : null}
            {canAddAppointment ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={reportingUrl}><Plus data-icon="inline-start" aria-hidden="true" />Add appointment</a> : null}
          </EmptyContent>
        </Empty>
        : <div className="flex flex-col gap-1 text-sm">
          {stats.length ? <p>{stats.join(" · ")}</p> : null}
          {next ? <p className="text-muted-foreground"><span className="font-medium text-foreground">{next.title}</span> · {appointmentLine({ ...next, status: "confirmed", endAt: null }, timezone)}</p> : null}
        </div>}
    </PeekSection>
  </>;
}

type LinkInput = { label: string; url: string; purpose?: ResourcePurpose };

function LinkForm({ resource, pending, onSubmit, onCancel }: { resource: StoryResource | null; pending: boolean; onSubmit: (input: LinkInput) => void; onCancel: () => void }) {
  const [purpose, setPurpose] = useState<ResourcePurpose | "none">(resource && resource.purpose !== "other" ? resource.purpose : "none");
  const purposeItems = [{ value: "none", label: "No purpose" }, ...RESOURCE_PURPOSES.map((value) => ({ value, label: resourcePurposeLabels[value] }))];
  return <form className="pt-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ label: String(form.get("label")), url: String(form.get("url")), ...(purpose !== "none" ? { purpose } : {}) }); }}>
    <FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="home-link-label">Label</FieldLabel><Input id="home-link-label" name="label" required maxLength={120} placeholder="Interview notes" defaultValue={resource?.label} autoFocus /></Field>
      <Field><FieldLabel htmlFor="home-link-url">URL</FieldLabel><Input id="home-link-url" name="url" type="url" required maxLength={2048} placeholder="https://…" defaultValue={resource?.url} /></Field>
      <Field><FieldLabel htmlFor="home-link-purpose">Purpose <span className="font-normal text-muted-foreground">Optional</span></FieldLabel>
        <Select items={purposeItems} value={purpose} onValueChange={(next) => setPurpose((next as ResourcePurpose | "none") || "none")}><SelectTrigger id="home-link-purpose" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{purposeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
      </Field>
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={onCancel} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? <><Spinner data-icon="inline-start" />Saving…</> : resource ? "Save link" : "Add link"}</Button></div>
    </FieldGroup>
  </form>;
}

/** One external link: an Item that is an anchor, with Edit and Remove in a menu for people who may manage links. */
function LinkRow({ link, canManage, disabled, onEdit, onRemove }: { link: StoryResource; canManage: boolean; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  let trigger: HTMLElement | null = null;
  return <div className="flex items-center gap-1">
    <Item size="sm" className="min-w-0 flex-1" render={<a href={link.url} target="_blank" rel="noopener noreferrer" />}>
      <ItemMedia variant="icon" className="text-muted-foreground"><ResourceIcon resource={link} /></ItemMedia>
      <ItemContent><ItemTitle>{link.label}</ItemTitle><ItemDescription>{link.kind}{link.purpose && link.purpose !== "other" ? ` · ${resourcePurposeLabels[link.purpose] || ""}` : ""}</ItemDescription></ItemContent>
      <ItemActions><ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
    </Item>
    {canManage ? <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button ref={(element: HTMLButtonElement | null) => { trigger = element; }} variant="ghost" size="icon-sm" aria-label={`Actions for ${link.label}`} disabled={disabled} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onEdit}><Pencil aria-hidden="true" />Edit link</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />Remove link</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmRemoveDialog open={confirming} onOpenChange={setConfirming} finalFocus={() => trigger} title="Remove this link?" description={`“${link.label}” is removed from the story. The document itself isn't touched.`} confirmLabel="Remove" onConfirm={onRemove} />
    </> : null}
  </div>;
}

export type StoryPeekContentProps = {
  data: StoryWorkspace;
  timezone: string;
  now: Date;
  workspaceUrl?: (storyId: number) => string;
  onNewTask: (storyId: number) => void;
  onComplete: (task: EditorialTask) => void;
  completing?: boolean;
  /** Mutations. Each rejects through `error`; none is called when the user lacks the capability. */
  onPlan: (patch: { deadline?: string | null; plannedPublishAt?: string | null; status?: string }) => void;
  onWriters: (writers: ContributorEntry[]) => void;
  onSaveLink: (input: LinkInput, existing: StoryResource | null) => void;
  onRemoveLink: (id: string) => void;
  planning: boolean;
  writing: boolean;
  linking: boolean;
  error: string;
  linkError: string;
  /** Closes the link form when the parent's save succeeds. */
  linkFormOpen: boolean | StoryResource;
  onLinkForm: (open: boolean | StoryResource) => void;
};

/** What the peek says about one story: identity in the header, then only the sections that have something to show or do. */
export function StoryPeekContent(props: StoryPeekContentProps) {
  const { data, timezone, now, workspaceUrl, onNewTask, onComplete, completing, onPlan, onWriters, onSaveLink, onRemoveLink, planning, writing, linking, error, linkError, linkFormOpen, onLinkForm } = props;
  const { story } = data;
  const cp = data.contributors;
  const contributors = cp.contributors;
  const tasks = data.tasks.filter((task) => task.state === "open");
  const assignments = data.mediaAssignments;
  const caps = data.capabilities;
  const peopleLabel = (id: number) => data.people.find((person) => Number(person.id) === id);
  const draft = workingDraft(data.resources);
  const workspaceHref = workspaceUrl?.(story.id);
  const canManageLinks = caps.manageResources;
  const visibleActivity = data.activity.slice(0, PEEK_ACTIVITY);
  const statusItems = data.statuses.map((status) => ({ value: status.id, label: status.label }));
  return <>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      <FieldSet className="gap-2 pt-4 pb-3">
        <FieldLegend variant="label" className="mb-0">Story details</FieldLegend>
        <FieldGroup className="gap-1">
          <Field orientation="horizontal" aria-label="Workflow" className={fieldRow.field}><FieldTitle className={fieldRow.label}>Workflow</FieldTitle><FieldContent className={fieldRow.value}>{caps.changeStatus ? <Select items={statusItems} value={story.workflow.id} disabled={planning} onValueChange={(id) => { if (id && id !== story.workflow.id) onPlan({ status: id }); }}><SelectTrigger aria-label="Workflow" className={valueSelectTriggerClass}><SelectValue /></SelectTrigger><SelectContent>{data.statuses.filter((status) => status.selectable).map((status) => <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>)}</SelectContent></Select> : story.workflow.label}</FieldContent></Field>
          {cp.canEdit ? <Field orientation="horizontal" aria-label="Writers" className={fieldRow.field}><FieldTitle className={fieldRow.label}>Writers</FieldTitle><FieldContent className={fieldRow.value}><WritersPicker people={cp.available || []} value={contributors} onChange={onWriters} disabled={writing} /></FieldContent></Field> : null}
          <Field orientation="horizontal" aria-label="Deadline" className={fieldRow.field}><FieldTitle className={fieldRow.label}>Deadline</FieldTitle><FieldContent className={fieldRow.value}>{caps.assign ? <DatePicker appearance="value" label="Deadline" dateOnly value={story.deadline} timezone={timezone} disabled={planning} onChange={(deadline) => onPlan({ deadline })} /> : exactDate(story.deadline, timezone)}</FieldContent></Field>
          <Field orientation="horizontal" aria-label="Planned publication" className={fieldRow.field}><FieldTitle className={fieldRow.label}>Planned publication</FieldTitle><FieldContent className={fieldRow.value}>{caps.assign ? <DatePicker appearance="value" label="Planned publication" value={story.plannedPublication} timezone={timezone} disabled={planning} onChange={(plannedPublishAt) => onPlan({ plannedPublishAt })} /> : exactDate(story.plannedPublication, timezone)}</FieldContent></Field>
          <Field orientation="horizontal" aria-label="WordPress" className={fieldRow.field}><FieldTitle className={fieldRow.label}>WordPress</FieldTitle><FieldContent className={fieldRow.value}>{story.wordpressState.label}{story.wordpressState.isScheduled ? ` · ${exactDate(story.wordpressState.scheduledAt, timezone)}` : ""}</FieldContent></Field>
        </FieldGroup>
        {error ? <InlineAlert>{error}</InlineAlert> : null}
      </FieldSet>

      <ReportingPeek reporting={data.reporting} error={data.errors.reporting} timezone={timezone} canAddSource={caps.addSource} canAddAppointment={caps.addAppointment} reportingUrl={workspaceHref ? `${workspaceHref}#ws-reporting` : undefined} />

      {tasks.length || caps.addTask ? <>
        <Separator />
        <PeekSection title="Tasks" action={caps.addTask ? <Button variant="outline" size="sm" data-peek-add-task="" onClick={() => onNewTask(story.id)}><Plus data-icon="inline-start" aria-hidden="true" />Add task</Button> : null}>
          {tasks.length ? <ItemGroup role="group" aria-label="Open tasks" className="-mx-3 w-auto gap-0">{tasks.map((task) => <TaskRow key={task.id} task={task} storyTitle={story.title} compact timezone={timezone} now={now} onComplete={() => onComplete(task)} pending={completing} />)}</ItemGroup> : <p className="text-sm text-muted-foreground">No open tasks.</p>}
        </PeekSection>
      </> : null}

      {data.errors.media || assignments.length ? <>
        <Separator />
        <PeekSection title="Production">
          {data.errors.media ? <InlineAlert>Production assignments couldn't be loaded.</InlineAlert> : <ItemGroup role="group" aria-label="Production assignments" className="-mx-3 w-auto gap-0">{assignments.map((item) => {
            const assignee = item.assignee ? { ...item.assignee, imageUrl: peopleLabel(item.assigneeId)?.imageUrl } : peopleLabel(item.assigneeId);
            const Icon = mediaTypeIcons[item.type] || mediaTypeIcons.other;
            const due = shortDateTime(item.dueAt, timezone);
            return <Item key={item.id} size="sm">
              {assignee && anyPicture([assignee]) ? <ItemMedia><PeopleAvatars people={[assignee]} /></ItemMedia> : <ItemMedia variant="icon" className="size-6 rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" /></ItemMedia>}
              <ItemContent>
                <ItemTitle>{item.title || mediaTypeLabels[item.type]}</ItemTitle>
                <ItemDescription>{mediaTypeLabels[item.type] || "Visual"} · {assignee?.name || "Unassigned"}</ItemDescription>
                {due ? <ItemDescription>Due {due}</ItemDescription> : null}
              </ItemContent>
              <ItemActions><WorkStatusBadge kind="production" intensity={mediaIntensity(item.status)}>{mediaStatusLabels[item.status] || "Needed"}</WorkStatusBadge></ItemActions>
            </Item>;
          })}</ItemGroup>}
        </PeekSection>
      </> : null}

      {data.resources.length || canManageLinks || draft ? <>
        <Separator />
        <PeekSection title="Files & links" action={canManageLinks && !linkFormOpen ? <Button variant="outline" size="sm" aria-label="Add link" disabled={linking} onClick={() => onLinkForm(true)}><Plus data-icon="inline-start" aria-hidden="true" />Add</Button> : null}>
          {data.resources.length ? <ItemGroup role="group" aria-label="Links" className="-mx-3 w-auto gap-0">{data.resources.map((link) => <LinkRow key={link.id} link={link} canManage={canManageLinks} disabled={linking} onEdit={() => onLinkForm(link)} onRemove={() => onRemoveLink(link.id)} />)}</ItemGroup> : linkFormOpen ? null : <p className="text-sm text-muted-foreground">No links yet.</p>}
          {linkFormOpen ? <LinkForm key={typeof linkFormOpen === "object" ? linkFormOpen.id : "new"} resource={typeof linkFormOpen === "object" ? linkFormOpen : null} pending={linking} onSubmit={(input) => onSaveLink(input, typeof linkFormOpen === "object" ? linkFormOpen : null)} onCancel={() => onLinkForm(false)} /> : null}
          {linkError ? <InlineAlert className="mt-2">{linkError}</InlineAlert> : null}
        </PeekSection>
      </> : null}

      {visibleActivity.length ? <>
        <Separator />
        <PeekSection title="Recent activity" action={data.activity.length > PEEK_ACTIVITY && workspaceHref ? <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`${workspaceHref}#ws-activity`}>View activity</a> : null}>
          <ItemGroup role="group" aria-label="Recent activity" className="-mx-2.5 w-auto gap-0">{visibleActivity.map((item) => <ActivityRow key={item.id} item={item} compact timezone={timezone} now={now} />)}</ItemGroup>
        </PeekSection>
      </> : null}
    </div>
    <SheetFooter className="flex-row flex-wrap items-center gap-2 border-t sm:justify-between">
      {workspaceHref ? <a className={buttonVariants({ variant: "outline" })} href={workspaceHref}><LayoutDashboard data-icon="inline-start" aria-hidden="true" />Open workspace</a> : <span />}
      <div className="flex flex-wrap items-center gap-2">
        {data.previewUrl ? <a className={buttonVariants({ variant: "ghost" })} href={data.previewUrl} target="_blank" rel="noopener noreferrer">Preview<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : null}
        {story.editUrl ? <a className={buttonVariants()} href={story.editUrl}>{story.workflow.id === "ready" && caps.assign ? "Review article" : "Edit article"}</a> : null}
      </div>
    </SheetFooter>
  </>;
}

export type StoryPeekProps = { storyId: number | null; fetchers: StoryFetchers; /** Used until the workspace names the site timezone. */ timezone?: string; onClose: () => void; origin: HTMLElement | null; onComplete: (task: EditorialTask) => void; completing?: boolean; onNewTask: (storyId: number) => void; now: Date; workspaceUrl?: (storyId: number) => string };

export function StoryPeek({ storyId, fetchers, timezone, onClose, origin, onComplete, completing, onNewTask, now, workspaceUrl }: StoryPeekProps) {
  const client = useQueryClient();
  const peek = useQuery({ queryKey: workspaceKey(storyId || 0), queryFn: () => fetchers.getWorkspace!(storyId!), enabled: Boolean(storyId && fetchers.getWorkspace) });
  const data = peek.data;
  const story = data?.story;
  const [linkForm, setLinkForm] = useState<boolean | StoryResource>(false);
  const [linkError, setLinkError] = useState("");
  const [editError, setEditError] = useState("");
  const refresh = () => invalidateStoryData(client, storyId);

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
    mutationFn: (input: { label: string; url: string; purpose?: ResourcePurpose; id?: string } | { remove: string }) => "remove" in input ? fetchers.workspace!.removeResource(storyId!, input.remove) : input.id ? fetchers.workspace!.updateResource(storyId!, input.id, { label: input.label, url: input.url, purpose: input.purpose || "other" }) : fetchers.workspace!.addResource(storyId!, input),
    onMutate: async (input) => {
      setLinkError("");
      await client.cancelQueries({ queryKey: workspaceKey(storyId!) });
      const previous = client.getQueryData<StoryWorkspace>(workspaceKey(storyId!))?.resources || [];
      client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: "remove" in input ? old.resources.filter((r) => r.id !== input.remove) : input.id ? old.resources : [...old.resources, { id: "pending-link", label: input.label, url: input.url, purpose: input.purpose || "other", kind: "Saving…" }] } : old);
      return previous;
    },
    onSuccess: (result) => { client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: result.resources } : old); setLinkForm(false); },
    onError: (error, _input, previous) => { client.setQueryData<StoryWorkspace>(workspaceKey(storyId!), (old) => old ? { ...old, resources: previous || [] } : old); setLinkError(describeEditorialError(error, "The link couldn't be saved. Try again.")); toast.error("Link couldn't be saved."); },
    onSettled: () => { void refresh(); }
  });

  const writerList = data?.contributors.contributors.length ? data.contributors.contributors : story?.authors || [];
  const editor = story?.editor ? { name: story.editor.name, imageUrl: data?.people.find((candidate) => Number(candidate.id) === story.editor!.id)?.imageUrl } : null;
  return <Sheet open={Boolean(storyId)} onOpenChange={(open) => { if (!open && !resources.isPending && !writers.isPending && !planning.isPending) { setLinkForm(false); setEditError(""); setLinkError(""); onClose(); } }}>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" finalFocus={() => { if (origin?.isConnected) return origin; return document.querySelector<HTMLElement>("[data-home-search]"); }}>
      <SheetHeader className="gap-1 border-b pr-12">
        <SheetTitle className="text-lg leading-snug [overflow-wrap:anywhere]">{decodeEntities(story?.title) || "Story details"}</SheetTitle>
        <SheetDescription>{story ? [story.workflow.label, sectionNames(data.sections)].filter(Boolean).join(" · ") : "Newsroom context"}</SheetDescription>
        {story && (writerList.length || editor) ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
          {writerList.length ? <span className="flex items-center gap-2"><PeopleAvatars people={writerList} /><span>{writerList.map((p) => p.name).join(", ")}</span></span> : null}
          {editor ? <span className="flex items-center gap-2 text-muted-foreground"><PeopleAvatars people={[editor]} />Edited by {editor.name}</span> : null}
        </div> : null}
      </SheetHeader>
      {peek.isPending ? <div className="py-4"><RowSkeletons count={7} /></div> : peek.isError || !story || !data ? <div className="p-4"><InlineAlert title="The story couldn't be loaded." onAction={() => void peek.refetch()}>{describeEditorialError(peek.error, "The story couldn't be loaded.")}</InlineAlert></div>
        : <StoryPeekContent data={data} timezone={data.timezone || timezone || "UTC"} now={now} workspaceUrl={workspaceUrl} onNewTask={onNewTask} onComplete={onComplete} completing={completing}
          onPlan={(patch) => planning.mutate(patch)} onWriters={(value) => writers.mutate(value)}
          onSaveLink={(input, existing) => resources.mutate(existing ? { ...input, id: existing.id } : input)} onRemoveLink={(id) => resources.mutate({ remove: id })}
          planning={planning.isPending} writing={writers.isPending} linking={resources.isPending} error={editError} linkError={linkError} linkFormOpen={linkForm} onLinkForm={(next) => { setLinkError(""); setLinkForm(next); }} />}
    </SheetContent>
  </Sheet>;
}
