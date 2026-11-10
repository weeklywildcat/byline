"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@byline/newsroom-ui/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CircleAlert, GitBranch, GripVertical, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { blankStep, moveStep, workflowSaveProblems } from "../../domain/role-admin";
import { REVIEW_TARGET_LABELS, type WorkflowStep } from "../../domain/newsroom-roles";
import { problemsOf, rememberInUrl, searchStoryHits, usePreviewRouting, useWorkflowWrites, useWorkflows, type PreviewStep, type RoutingPreview, type StoryHit, type WorkflowRow, type WorkflowsOverview } from "./api";
import { ChoicesCombobox } from "./pickers";
import { StepSheet } from "./StepSheet";
import { TeamNav } from "./TeamNav";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";

/**
 * The review workflow builder (docs/newsroom-roles.md#workflows): an ordered
 * sequence of steps, edited as a draft and saved once. Drag reorders, and Move
 * up and Move down always do the same, because drag must never be required.
 * "Preview with story…" asks the server's real resolver who each step would
 * go to; nothing about routing is decided in this file.
 */

const appliesNarrowly = (workflow: WorkflowRow) => Boolean(workflow.appliesTo.sections.length || workflow.appliesTo.formats.length);
/** Which stories a workflow is used for, as the list and the editor both say it. */
const appliesLabel = (workflow: WorkflowRow) => (appliesNarrowly(workflow) ? "Specific stories" : workflow.isDefault ? "Any story" : "No stories yet");

export function WorkflowScreen() {
  const { api } = useNewsroomRoutes();
  const params = useSearchParams();
  const workflows = useWorkflows(api);
  const data = workflows.data;
  const [selectedId, choose] = useState<number | null>(() => {
    const candidate = Number(params?.get("workflow"));
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
  });
  const setSelectedId = (id: number | null) => { choose(id); rememberInUrl("workflow", id); };
  const [creating, setCreating] = useState(false);
  // Switching workflows with unsaved edits asks first, in an AlertDialog.
  const dirty = useRef(false);
  const onDirtyChange = useCallback((next: boolean) => { dirty.current = next; }, []);
  const [pending, setPending] = useState<number | null>(null);
  const selected = data ? data.workflows.find((workflow) => workflow.id === selectedId) ?? data.workflows.find((workflow) => workflow.isDefault) ?? data.workflows[0] ?? null : null;
  const select = (id: number) => { if (id === selected?.id) return; if (dirty.current) setPending(id); else setSelectedId(id); };

  return (
    <AdminRoot toaster={false} className="byline-workflows">
      <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-workflows-screen="">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Review workflows</h1>
            <p className="max-w-prose text-sm text-muted-foreground">When a reporter sends a story for review, it goes through the steps of the most specific workflow that applies to it, in order.</p>
          </div>
          <Button type="button" onClick={() => setCreating(true)} disabled={!data}><Plus data-icon="inline-start" aria-hidden="true" />New workflow</Button>
        </header>
        <TeamNav current="workflows" />

        {workflows.isError ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Workflows couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(workflows.error)[0]}</AlertDescription><AlertAction><Button type="button" size="xs" variant="outline" onClick={() => void workflows.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {workflows.isPending ? <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-busy="true"><Skeleton className="hidden h-48 rounded-xl lg:block" /><div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 rounded-xl" /></div></div> : null}
        {data && !selected ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><GitBranch aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No review workflow yet</EmptyTitle>
              <EmptyDescription>Create one so stories can be sent for review.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button type="button" size="sm" onClick={() => setCreating(true)}><Plus data-icon="inline-start" aria-hidden="true" />New workflow</Button></EmptyContent>
          </Empty>
        ) : null}
        {data && selected ? (
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <nav aria-label="Review workflows" className="hidden lg:sticky lg:top-16 lg:block">
              <ItemGroup className="gap-1">
                {data.workflows.map((workflow) => {
                  const current = workflow.id === selected.id;
                  return (
                    <div role="listitem" key={workflow.id}>
                      <Item size="sm" render={<button type="button" onClick={() => select(workflow.id)} aria-current={current ? "page" : undefined} />} className={`w-full text-left ${current ? "bg-muted" : "hover:bg-muted/60"}`}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="line-clamp-none break-words">{workflow.name}</ItemTitle>
                          <ItemDescription className="flex flex-wrap items-center gap-1">
                            {workflow.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                            <span className="text-xs">{appliesLabel(workflow)} · {workflow.steps.length} {workflow.steps.length === 1 ? "step" : "steps"}</span>
                            {workflow.problems.length ? <Badge variant="destructive">{workflow.problems.length} {workflow.problems.length === 1 ? "problem" : "problems"}</Badge> : null}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    </div>
                  );
                })}
              </ItemGroup>
            </nav>
            <div className="min-w-0">
              <div className="mb-4 lg:hidden">
                <Select value={String(selected.id)} onValueChange={(next) => select(Number(next))}>
                  <SelectTrigger className="w-full sm:w-72" aria-label="Workflow"><SelectValue>{selected.name}</SelectValue></SelectTrigger>
                  <SelectContent>{data.workflows.map((entry) => <SelectItem key={entry.id} value={String(entry.id)}>{entry.name}{entry.isDefault ? " (default)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Editor key={`${selected.id}:${selected.revision}`} api={api} overview={data} workflow={selected} onSelect={setSelectedId} onDirtyChange={onDirtyChange} />
            </div>
          </div>
        ) : null}
      </main>
      {data ? <NewWorkflowDialog api={api} open={creating} onOpenChange={setCreating} onCreated={(id) => { dirty.current = false; setSelectedId(id); }} /> : null}
      <AlertDialog open={pending !== null} onOpenChange={(next) => { if (!next) setPending(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to {selected?.name ?? "this workflow"} haven’t been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Keep editing</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" onClick={() => { const next = pending; setPending(null); dirty.current = false; if (next !== null) setSelectedId(next); }}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminRoot>
  );
}

/* ----------------------------------------------------------------- editor */

type Draft = { name: string; description: string; sections: string[]; formats: string[]; isDefault: boolean; steps: WorkflowStep[] };

const toDraft = (workflow: WorkflowRow): Draft => ({ name: workflow.name, description: workflow.description, sections: workflow.appliesTo.sections.map(String), formats: workflow.appliesTo.formats, isDefault: workflow.isDefault, steps: workflow.steps });

function Editor({ api, overview, workflow, onSelect, onDirtyChange }: { api: string; overview: WorkflowsOverview; workflow: WorkflowRow; onSelect: (id: number) => void; onDirtyChange: (dirty: boolean) => void }) {
  const save = useWorkflowWrites(api);
  const [draft, setDraft] = useState<Draft>(() => toDraft(workflow));
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const ids = { name: useId(), description: useId(), sections: useId(), formats: useId(), default: useId(), defaultHelp: useId(), settings: useId() };
  const original = useMemo(() => JSON.stringify(toDraft(workflow)), [workflow]);
  const dirty = JSON.stringify(draft) !== original;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const known = useMemo(() => ({
    roles: new Map(overview.roles.map((role) => [role.id, { name: role.name, archived: role.archived, scopeKind: role.scopeKind }])),
    users: new Set(overview.people.map((person) => person.id)),
    sections: new Set(overview.sections.map((section) => section.id))
  }), [overview]);
  const live = useMemo(() => workflowSaveProblems(draft.steps, known), [draft.steps, known]);
  const sheetStep = draft.steps.find((step) => step.stepId === openStep) ?? null;

  const setSteps = (steps: WorkflowStep[]) => setDraft((current) => ({ ...current, steps }));
  const move = (from: number, to: number) => setSteps(moveStep(draft.steps, from, to));
  const input = () => ({ name: draft.name, description: draft.description, isDefault: draft.isDefault, appliesTo: { sections: draft.sections.map(Number), formats: draft.formats }, steps: draft.steps, expectedRevision: workflow.revision });

  function submit(event?: FormEvent) {
    event?.preventDefault();
    setProblems([]);
    save.mutate({ id: workflow.id, data: input() }, { onSuccess: () => toast.success("Workflow saved."), onError: (error) => setProblems(problemsOf(error)) });
  }
  function archive() {
    setProblems([]);
    save.mutate({ id: workflow.id, data: { archived: true, expectedRevision: workflow.revision } }, {
      onSuccess: (next) => { toast.success("Workflow archived."); setArchiving(false); const other = next.workflows.find((entry) => entry.isDefault) ?? next.workflows[0]; if (other) onSelect(other.id); },
      onError: (error) => { setProblems(problemsOf(error)); setArchiving(false); }
    });
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="sticky top-12 z-20 -mx-1 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-1 py-2.5" data-workflow-toolbar="">
        <div className="flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-2">
          <h2 className="min-w-0 break-words text-lg font-semibold tracking-tight">{draft.name || "Untitled workflow"}</h2>
          {workflow.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          <Badge variant="outline" className="font-normal">{appliesLabel(workflow)}</Badge>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">Unsaved changes</Badge> : null}
          {dirty ? <Button type="button" variant="ghost" onClick={() => { setDraft(toDraft(workflow)); setProblems([]); }} disabled={save.isPending}>Discard changes</Button> : null}
          <Button type="button" onClick={() => submit()} disabled={!dirty || save.isPending || !draft.name.trim()}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save workflow</Button>
        </div>
      </div>

      {problems.length ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{problems.length === 1 ? "That didn’t save" : "Fix these first"}</AlertTitle><AlertDescription>{problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}
      {!dirty && workflow.problems.length ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>This workflow has problems</AlertTitle><AlertDescription>{workflow.problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}

      <Card role="region" aria-labelledby="steps-heading">
        <CardHeader>
          <CardTitle id="steps-heading" role="heading" aria-level={3}>Steps, in order</CardTitle>
          <CardDescription>Open a step to choose who reviews it. Drag the handle or use the arrows to reorder.</CardDescription>
          <CardAction><Button type="button" size="sm" variant="outline" onClick={() => { const next = blankStep(draft.steps); setSteps([...draft.steps, next]); setOpenStep(next.stepId); }}><Plus data-icon="inline-start" aria-hidden="true" />Add step</Button></CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          <StepList steps={draft.steps} overview={overview} onOpen={setOpenStep} onMove={move} />
          {live.length && dirty ? <Alert variant="destructive" role="status"><CircleAlert aria-hidden="true" /><AlertDescription>{live[0]}{live.length > 1 ? ` (and ${live.length - 1} more)` : ""}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      <Preview api={api} workflow={workflow} steps={draft.steps} overview={overview} dirty={dirty} />

      <Card role="region" aria-labelledby={ids.settings}>
        <CardHeader>
          <CardTitle id={ids.settings} role="heading" aria-level={3}>Name and which stories it applies to</CardTitle>
          <CardDescription>A story uses the most specific workflow that matches it.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor={ids.description}>Description <span className="font-normal text-muted-foreground">Optional</span></FieldLabel><Textarea id={ids.description} value={draft.description} maxLength={400} rows={2} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
            <div className="grid gap-x-4 gap-y-6 md:grid-cols-2">
              <Field><FieldLabel htmlFor={ids.sections}>Sections</FieldLabel><ChoicesCombobox id={ids.sections} choices={overview.sections.map((section) => ({ value: String(section.id), label: section.name }))} value={draft.sections} onChange={(sections) => setDraft({ ...draft, sections })} placeholder="Any Section" /></Field>
              <Field><FieldLabel htmlFor={ids.formats}>Story formats</FieldLabel><ChoicesCombobox id={ids.formats} choices={overview.formats} value={draft.formats} onChange={(formats) => setDraft({ ...draft, formats })} placeholder="Any format" /></Field>
            </div>
            <FieldDescription className="-mt-3">With no Sections or formats, this workflow only applies when it’s the default.</FieldDescription>
            <Field orientation="horizontal" data-disabled={workflow.isDefault ? true : undefined}>
              <FieldContent>
                <FieldLabel htmlFor={ids.default}>Default workflow</FieldLabel>
                <FieldDescription id={ids.defaultHelp}>{workflow.isDefault ? "This is the default. Make another workflow the default to change it." : "Used for stories no other workflow claims."}</FieldDescription>
              </FieldContent>
              <Switch id={ids.default} checked={draft.isDefault} disabled={workflow.isDefault} aria-describedby={ids.defaultHelp} onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked === true })} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setArchiving(true)} disabled={workflow.isDefault} title={workflow.isDefault ? "The default workflow can’t be archived" : undefined}>Archive workflow</Button>
        </CardFooter>
      </Card>

      <StepSheet
        step={sheetStep}
        overview={overview}
        open={sheetStep !== null}
        onOpenChange={(next) => { if (!next) setOpenStep(null); }}
        onChange={(next) => setSteps(draft.steps.map((step) => (step.stepId === next.stepId ? next : step)))}
        onRemove={() => { setSteps(draft.steps.filter((step) => step.stepId !== openStep)); setOpenStep(null); }}
        canRemove={draft.steps.length > 1}
      />
      <AlertDialog open={archiving} onOpenChange={setArchiving}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader><AlertDialogTitle>Archive {workflow.name}?</AlertDialogTitle><AlertDialogDescription>Stories it applies to will use the next most specific workflow, or the default. Reviews already in progress keep the workflow they were submitted with.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel type="button">Cancel</AlertDialogCancel><AlertDialogAction type="button" variant="destructive" disabled={save.isPending} onClick={archive}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Archive</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ steps */

function describeStep(step: WorkflowStep, overview: WorkflowsOverview): string {
  if (step.resolver === "story-editor") return "The story’s editor";
  if (step.resolver === "person") return overview.people.find((person) => person.id === step.userId)?.name ?? "Choose a person";
  const role = overview.roles.find((entry) => entry.id === step.roleId);
  if (!role) return "Choose a role";
  const match = step.roleMatch === "story-section" ? " · matches the Section" : step.roleMatch === "story-media" ? " · matches the media" : "";
  return `${role.name}${match}`;
}

function conditionBadges(step: WorkflowStep, overview: WorkflowsOverview): string[] {
  const names = step.conditions.sections.map((id) => overview.sections.find((section) => section.id === id)?.name).filter((name): name is string => Boolean(name));
  return [...names, ...step.conditions.formats, ...(step.conditions.onlyWithVisuals ? ["With visuals"] : []), ...step.conditions.mediaTypes];
}

function StepList({ steps, overview, onOpen, onMove }: { steps: WorkflowStep[]; overview: WorkflowsOverview; onOpen: (stepId: string) => void; onMove: (from: number, to: number) => void }) {
  const move = useRef(onMove);
  move.current = onMove;
  // One monitor for the list: a drop moves the dragged step to the position it landed on.
  useEffect(() => monitorForElements({
    canMonitor: ({ source }) => source.data.kind === "workflow-step",
    onDrop: ({ source, location }) => {
      const target = location.current.dropTargets[0];
      if (!target) return;
      const from = Number(source.data.index);
      const to = Number(target.data.index);
      if (Number.isInteger(from) && Number.isInteger(to) && from !== to) move.current(from, to);
    }
  }), []);
  return (
    <ol className="grid gap-2" aria-label="Review steps">
      {steps.map((step, index) => <StepRow key={step.stepId} step={step} index={index} count={steps.length} overview={overview} onOpen={onOpen} onMove={onMove} />)}
    </ol>
  );
}

function StepRow({ step, index, count, overview, onOpen, onMove }: { step: WorkflowStep; index: number; count: number; overview: WorkflowsOverview; onOpen: (stepId: string) => void; onMove: (from: number, to: number) => void }) {
  const row = useRef<HTMLLIElement>(null);
  const handle = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!row.current || !handle.current) return;
    return combine(
      draggable({ element: row.current, dragHandle: handle.current, getInitialData: () => ({ kind: "workflow-step", index }), onDragStart: () => setDragging(true), onDrop: () => setDragging(false) }),
      dropTargetForElements({ element: row.current, canDrop: ({ source }) => source.data.kind === "workflow-step" && source.data.index !== index, getData: () => ({ index }), onDragEnter: () => setOver(true), onDragLeave: () => setOver(false), onDrop: () => setOver(false) })
    );
  }, [index]);
  const badges = conditionBadges(step, overview);
  const unrouted = (step.resolver === "role" && step.roleId === null) || (step.resolver === "person" && step.userId === null);
  return (
    <li ref={row} className={over ? "rounded-lg ring-2 ring-ring" : dragging ? "opacity-50" : undefined}>
      <Item variant="outline" size="sm" className={`relative flex-nowrap hover:bg-muted/40 ${unrouted ? "border-destructive/50" : ""}`}>
        <ItemMedia className="relative z-10 gap-1">
          <span ref={handle} className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" aria-hidden="true" title="Drag to reorder"><GripVertical className="size-4" /></span>
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums" aria-hidden="true">{index + 1}</span>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="line-clamp-none flex-wrap">
            {/* The whole row opens the step; the handle and arrows sit above this stretched button. */}
            <button type="button" className="rounded text-left outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50" onClick={() => onOpen(step.stepId)} aria-label={`Edit step ${index + 1}: ${step.label}`}>{step.label}</button>
            <Badge variant="secondary">{REVIEW_TARGET_LABELS[step.target]}</Badge>
          </ItemTitle>
          <ItemDescription className={unrouted ? "text-destructive" : undefined}>{describeStep(step, overview)}</ItemDescription>
          {badges.length ? <div className="flex flex-wrap items-center gap-1"><span className="text-xs text-muted-foreground">Only for</span>{badges.map((badge) => <Badge key={badge} variant="outline" className="font-normal">{badge}</Badge>)}</div> : null}
        </ItemContent>
        <ItemActions className="relative z-10 gap-0.5">
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={`Move step ${index + 1}, ${step.label}, up`}><ArrowUp aria-hidden="true" /></Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(index, index + 1)} disabled={index === count - 1} aria-label={`Move step ${index + 1}, ${step.label}, down`}><ArrowDown aria-hidden="true" /></Button>
        </ItemActions>
      </Item>
    </li>
  );
}

/* --------------------------------------------------------------- preview */

function Preview({ api, workflow, steps, overview, dirty }: { api: string; workflow: WorkflowRow; steps: WorkflowStep[]; overview: WorkflowsOverview; dirty: boolean }) {
  const { admin } = useNewsroomRoutes();
  const preview = usePreviewRouting(api);
  const [story, setStory] = useState<StoryHit | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const id = useId();
  useEffect(() => { const timer = window.setTimeout(() => setQuery(text.trim()), 250); return () => window.clearTimeout(timer); }, [text]);
  const hits = useQuery({ queryKey: ["byline", "workflow-preview-stories", api, query], queryFn: () => searchStoryHits(api, query), enabled: query.length >= 2 });
  const choices = hits.data ?? [];
  const run = (target: StoryHit) => preview.mutate({ storyId: target.id, workflowId: workflow.id, steps });
  // The draft changed since the last preview: ask again, so the result never describes older steps.
  const stepsKey = JSON.stringify(steps);
  useEffect(() => { if (story) run(story); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey]);

  return (
    <section aria-labelledby="preview-heading">
      <Card>
        <CardHeader>
          <CardTitle id="preview-heading" role="heading" aria-level={3}>Preview with story…</CardTitle>
          <CardDescription>See who each step would go to for a real story, {dirty ? "including your unsaved changes, " : ""}using the same routing as an actual submission.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor={id}>Story</FieldLabel>
            <Combobox items={choices} value={story} filter={null} inputValue={text} onInputValueChange={setText} onValueChange={(next: StoryHit | null) => { setStory(next); if (next) run(next); }} itemToStringLabel={(hit: StoryHit) => hit.title} isItemEqualToValue={(a: StoryHit, b: StoryHit) => a.id === b.id}>
              <ComboboxInput id={id} placeholder="Search stories by headline…" className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>{query.length < 2 ? "Type at least two letters." : hits.isFetching ? "Searching…" : "No stories found."}</ComboboxEmpty>
                <ComboboxList>{(hit: StoryHit) => <ComboboxItem key={hit.id} value={hit}><span className="flex min-w-0 flex-col"><span className="truncate">{hit.title}</span><span className="truncate text-xs text-muted-foreground">{hit.detail}</span></span></ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
          {preview.isPending ? <div aria-busy="true" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : null}
          {preview.isError ? <FieldError errors={problemsOf(preview.error).map((message) => ({ message }))} /> : null}
          {preview.data && !preview.isPending ? <PreviewResult result={preview.data} workflow={workflow} admin={admin} /> : null}
          {!story && !preview.data ? <p className="text-sm text-muted-foreground">Pick a story to check this workflow against it. Nothing is submitted.</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function fixLink(step: PreviewStep, admin: string, story: RoutingPreview["story"]): { href: string; label: string } | null {
  if (!step.fix) return null;
  switch (step.fix.kind) {
    case "role": return { href: `${admin}/people?view=roles&role=${step.fix.roleId}`, label: "Fix roles" };
    case "workflow": return null;
    case "story-editor": return { href: `${admin}/collections/stories/${story.id}`, label: "Open the story to assign an editor" };
    case "school-year": return { href: `${admin}/people?view=rollover`, label: "Start a school year" };
  }
}

function PreviewResult({ result, workflow, admin }: { result: RoutingPreview; workflow: WorkflowRow; admin: string }) {
  const different = result.actual && result.actual.id !== workflow.id ? result.actual : null;
  return (
    <div className="grid gap-3">
      <p className="text-sm"><span className="font-medium">{result.story.title}</span>{result.story.section ? <span className="text-muted-foreground"> · {result.story.section}</span> : <span className="text-muted-foreground"> · no Section</span>}</p>
      {different ? <Alert><CircleAlert aria-hidden="true" /><AlertTitle>This workflow wouldn’t be used for this story</AlertTitle><AlertDescription>Submitting it would go through “{different.name}” instead. This preview shows {workflow.name} so you can check it.</AlertDescription></Alert> : null}
      {!result.actual && !different ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>No workflow would apply to this story</AlertTitle><AlertDescription>Make one the default so every story can be sent for review.</AlertDescription></Alert> : null}
      <ItemGroup className="gap-2">
        {result.steps.map((step, index) => {
          const link = fixLink(step, admin, result.story);
          return (
            <div role="listitem" key={step.stepId}>
              <Item variant="outline" size="sm" className={step.kind === "failed" ? "border-destructive/50 bg-destructive/5" : step.kind === "skipped" ? "opacity-70" : undefined}>
                <ItemMedia><span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums" aria-hidden="true">{index + 1}</span></ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none flex-wrap">
                    {step.label}
                    <Badge variant={step.kind === "failed" ? "destructive" : step.kind === "skipped" ? "outline" : "secondary"}>{step.kind === "failed" ? "Can’t be routed" : step.kind === "skipped" ? "Skipped" : step.kind === "queue" ? "Queue" : "Assigned"}</Badge>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none">{step.kind === "failed" ? step.detail : step.kind === "skipped" ? step.detail : step.summary}</ItemDescription>
                  {step.kind === "queue" ? <p className="text-sm text-muted-foreground">{step.people.join(", ")}</p> : null}
                  {step.kind === "person" || step.kind === "queue" ? <p className="text-xs text-muted-foreground">{step.detail}{step.waitingFor ? ` · Reporters see “Waiting for ${step.waitingFor}”` : ""}</p> : null}
                </ItemContent>
                {link ? <ItemActions><Button type="button" size="sm" variant="outline" nativeButton={false} role="link" render={<ShellLink href={link.href} />}>{link.label}</Button></ItemActions> : null}
              </Item>
            </div>
          );
        })}
      </ItemGroup>
      {result.failed ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{result.failed === 1 ? "One step can’t be routed" : `${result.failed} steps can’t be routed`}</AlertTitle><AlertDescription>Submitting this story for review would fail at that step and tell the editors. Fix the role or the workflow, then preview again.</AlertDescription></Alert> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- new one */

function NewWorkflowDialog({ api, open, onOpenChange, onCreated }: { api: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const save = useWorkflowWrites(api);
  const id = useId();
  const [name, setName] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setProblems([]);
    save.mutate({ id: null, data: { name, steps: [{ ...blankStep([]), stepId: "edit", label: "Edit" }] } }, {
      onSuccess: (next) => {
        toast.success("Workflow created. Add steps and applies-to rules, then save.");
        const created = next.workflows.filter((workflow) => workflow.name === name.trim()).sort((a, b) => b.id - a.id)[0];
        setName(""); onOpenChange(false);
        if (created) onCreated(created.id);
      },
      onError: (error) => setProblems(problemsOf(error))
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New review workflow</DialogTitle><DialogDescription>It starts with one step, the story’s editor. You’ll shape the steps and which stories it applies to next.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor={id}>Name</FieldLabel><Input id={id} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required placeholder="Sports review" /></Field>
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={save.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={save.isPending || !name.trim()}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Create workflow</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
