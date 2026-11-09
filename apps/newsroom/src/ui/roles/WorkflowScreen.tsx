"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@byline/newsroom-ui/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
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
  const selected = data ? data.workflows.find((workflow) => workflow.id === selectedId) ?? data.workflows.find((workflow) => workflow.isDefault) ?? data.workflows[0] ?? null : null;

  return (
    <AdminRoot toaster={false} className="byline-workflows">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-workflows-screen="">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Review workflows</h1>
            <p className="max-w-prose text-sm text-muted-foreground">When a reporter sends a story for review, it goes through the steps of the most specific workflow that applies to it, in order.</p>
          </div>
          <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={!data}><Plus aria-hidden="true" />New workflow</Button>
        </header>
        <TeamNav current="workflows" />

        {workflows.isError ? <Alert variant="destructive"><AlertTitle>Workflows couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(workflows.error)[0]}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" onClick={() => void workflows.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {workflows.isPending ? <div className="grid gap-2" aria-busy="true"><Skeleton className="h-9 w-64" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : null}
        {data && selected ? (
          <Editor key={`${selected.id}:${selected.revision}`} api={api} overview={data} workflow={selected} onSelect={setSelectedId} />
        ) : null}
        {data && !selected ? <Alert><AlertTitle>No review workflow yet</AlertTitle><AlertDescription>Create one so stories can be sent for review.</AlertDescription></Alert> : null}
      </main>
      {data ? <NewWorkflowDialog api={api} open={creating} onOpenChange={setCreating} onCreated={setSelectedId} /> : null}
    </AdminRoot>
  );
}

/* ----------------------------------------------------------------- editor */

type Draft = { name: string; description: string; sections: string[]; formats: string[]; isDefault: boolean; steps: WorkflowStep[] };

const toDraft = (workflow: WorkflowRow): Draft => ({ name: workflow.name, description: workflow.description, sections: workflow.appliesTo.sections.map(String), formats: workflow.appliesTo.formats, isDefault: workflow.isDefault, steps: workflow.steps });

function Editor({ api, overview, workflow, onSelect }: { api: string; overview: WorkflowsOverview; workflow: WorkflowRow; onSelect: (id: number) => void }) {
  const save = useWorkflowWrites(api);
  const [draft, setDraft] = useState<Draft>(() => toDraft(workflow));
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const ids = { name: useId(), description: useId(), sections: useId(), formats: useId(), default: useId() };
  const original = useMemo(() => JSON.stringify(toDraft(workflow)), [workflow]);
  const dirty = JSON.stringify(draft) !== original;
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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(workflow.id)} onValueChange={(next) => { if (dirty && !window.confirm("Discard your unsaved changes to this workflow?")) return; onSelect(Number(next)); }}>
          <SelectTrigger className="w-64 max-w-full" aria-label="Workflow"><SelectValue>{workflow.name}</SelectValue></SelectTrigger>
          <SelectContent>{overview.workflows.map((entry) => <SelectItem key={entry.id} value={String(entry.id)}>{entry.name}{entry.isDefault ? " (default)" : ""}</SelectItem>)}</SelectContent>
        </Select>
        {workflow.isDefault ? <Badge variant="secondary">Default</Badge> : null}
        {workflow.appliesTo.sections.length || workflow.appliesTo.formats.length ? <Badge variant="outline">Specific stories</Badge> : <Badge variant="outline">Any story</Badge>}
      </div>

      {problems.length ? <Alert variant="destructive"><AlertTitle>{problems.length === 1 ? "That didn’t save" : "Fix these first"}</AlertTitle><AlertDescription>{problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}
      {!dirty && workflow.problems.length ? <Alert variant="destructive"><AlertTitle>This workflow has problems</AlertTitle><AlertDescription>{workflow.problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}

      <Collapsible>
        <CollapsibleTrigger render={<Button type="button" variant="outline" size="sm" className="group/details" />}>
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[panel-open]/details:rotate-180" />
          Name and which stories it applies to
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor={ids.description}>Description</FieldLabel><Textarea id={ids.description} value={draft.description} maxLength={400} rows={2} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor={ids.sections}>Sections</FieldLabel><ChoicesCombobox id={ids.sections} choices={overview.sections.map((section) => ({ value: String(section.id), label: section.name }))} value={draft.sections} onChange={(sections) => setDraft({ ...draft, sections })} placeholder="Any Section" /></Field>
            <Field><FieldLabel htmlFor={ids.formats}>Story formats</FieldLabel><ChoicesCombobox id={ids.formats} choices={overview.formats} value={draft.formats} onChange={(formats) => setDraft({ ...draft, formats })} placeholder="Any format" /><FieldDescription>With no Sections or formats, this workflow only applies when it’s the default. A story uses the most specific workflow that matches it.</FieldDescription></Field>
            <Field orientation="horizontal"><Checkbox id={ids.default} checked={draft.isDefault} disabled={workflow.isDefault} onCheckedChange={(checked) => setDraft({ ...draft, isDefault: Boolean(checked) })} /><FieldLabel htmlFor={ids.default} className="font-normal">{workflow.isDefault ? "This is the default workflow (make another one the default to change it)" : "Use for stories no other workflow claims"}</FieldLabel></Field>
            <div><Button type="button" variant="outline" size="sm" onClick={() => setArchiving(true)} disabled={workflow.isDefault}>Archive workflow</Button></div>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>

      <section aria-labelledby="steps-heading" className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="steps-heading" className="text-base font-medium">Steps, in order</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => { const next = blankStep(draft.steps); setSteps([...draft.steps, next]); setOpenStep(next.stepId); }}><Plus aria-hidden="true" />Add step</Button>
        </div>
        <StepList steps={draft.steps} overview={overview} onOpen={setOpenStep} onMove={move} />
        {live.length && dirty ? <p className="text-sm text-destructive" role="status">{live[0]}{live.length > 1 ? ` (and ${live.length - 1} more)` : ""}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => submit()} disabled={!dirty || save.isPending || !draft.name.trim()}>{save.isPending ? <Spinner /> : null}Save workflow</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(toDraft(workflow)); setProblems([]); }} disabled={!dirty || save.isPending}>Discard changes</Button>
          {dirty ? <span className="text-sm text-muted-foreground" role="status">Unsaved changes</span> : null}
        </div>
      </section>

      <Preview api={api} workflow={workflow} steps={draft.steps} overview={overview} dirty={dirty} />

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
          <AlertDialogFooter><AlertDialogCancel type="button">Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={save.isPending} onClick={archive}>Archive</Button></AlertDialogFooter>
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
  return (
    <li ref={row} className={over ? "rounded-lg ring-2 ring-ring" : dragging ? "opacity-50" : undefined}>
      <Item variant="outline" size="sm">
        <ItemMedia variant="icon">
          <span ref={handle} className="cursor-grab touch-none rounded p-1 text-muted-foreground" aria-hidden="true" title="Drag to reorder"><GripVertical className="size-4" /></span>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
            <button type="button" className="rounded text-left underline-offset-2 hover:underline focus-visible:outline-2" onClick={() => onOpen(step.stepId)} aria-label={`Edit step ${index + 1}: ${step.label}`}>{step.label}</button>
            <Badge variant="secondary">{REVIEW_TARGET_LABELS[step.target]}</Badge>
          </ItemTitle>
          <ItemDescription>{describeStep(step, overview)}</ItemDescription>
          {badges.length ? <div className="flex flex-wrap items-center gap-1"><span className="text-xs text-muted-foreground">Only for</span>{badges.map((badge) => <Badge key={badge} variant="outline">{badge}</Badge>)}</div> : null}
        </ItemContent>
        <ItemActions>
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
    <section aria-labelledby="preview-heading" className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 id="preview-heading" className="text-base font-medium">Preview with story…</h2>
        <p className="text-sm text-muted-foreground">See who each step would go to for a real story, {dirty ? "including your unsaved changes, " : ""}using the same routing as an actual submission.</p>
      </div>
      <Field>
        <FieldLabel htmlFor={id}>Story</FieldLabel>
        <Combobox items={choices} value={story} filter={null} inputValue={text} onInputValueChange={setText} onValueChange={(next: StoryHit | null) => { setStory(next); if (next) run(next); }} itemToStringLabel={(hit: StoryHit) => hit.title} isItemEqualToValue={(a: StoryHit, b: StoryHit) => a.id === b.id}>
          <ComboboxInput id={id} placeholder="Search stories by headline…" />
          <ComboboxContent>
            <ComboboxEmpty>{query.length < 2 ? "Type at least two letters." : hits.isFetching ? "Searching…" : "No stories found."}</ComboboxEmpty>
            <ComboboxList>{(hit: StoryHit) => <ComboboxItem key={hit.id} value={hit}><span className="flex min-w-0 flex-col"><span className="truncate">{hit.title}</span><span className="truncate text-xs text-muted-foreground">{hit.detail}</span></span></ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      {preview.isPending ? <div aria-busy="true" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : null}
      {preview.isError ? <FieldError errors={problemsOf(preview.error).map((message) => ({ message }))} /> : null}
      {preview.data && !preview.isPending ? <PreviewResult result={preview.data} workflow={workflow} overview={overview} admin={admin} /> : null}
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

function PreviewResult({ result, workflow, overview, admin }: { result: RoutingPreview; workflow: WorkflowRow; overview: WorkflowsOverview; admin: string }) {
  void overview;
  const different = result.actual && result.actual.id !== workflow.id ? result.actual : null;
  return (
    <div className="grid gap-3">
      <p className="text-sm"><span className="font-medium">{result.story.title}</span>{result.story.section ? <span className="text-muted-foreground"> · {result.story.section}</span> : <span className="text-muted-foreground"> · no Section</span>}</p>
      {different ? <Alert><AlertTitle>This workflow wouldn’t be used for this story</AlertTitle><AlertDescription>Submitting it would go through “{different.name}” instead. This preview shows {workflow.name} so you can check it.</AlertDescription></Alert> : null}
      {!result.actual && !different ? <Alert variant="destructive"><AlertTitle>No workflow would apply to this story</AlertTitle><AlertDescription>Make one the default so every story can be sent for review.</AlertDescription></Alert> : null}
      <ItemGroup>
        {result.steps.map((step, index) => {
          const link = fixLink(step, admin, result.story);
          return (
            <Item key={step.stepId} variant="outline" size="sm" className={step.kind === "failed" ? "border-destructive/50" : undefined}>
              <ItemContent>
                <ItemTitle>
                  <span className="text-muted-foreground tabular-nums">{index + 1}.</span>{step.label}
                  <Badge variant={step.kind === "failed" ? "destructive" : step.kind === "skipped" ? "outline" : "secondary"}>{step.kind === "failed" ? "Can’t be routed" : step.kind === "skipped" ? "Skipped" : step.kind === "queue" ? "Queue" : "Assigned"}</Badge>
                </ItemTitle>
                <ItemDescription>{step.kind === "failed" ? step.detail : step.kind === "skipped" ? step.detail : step.summary}</ItemDescription>
                {step.kind === "queue" ? <p className="text-sm text-muted-foreground">{step.people.join(", ")}</p> : null}
                {step.kind === "person" || step.kind === "queue" ? <p className="text-xs text-muted-foreground">{step.detail}{step.waitingFor ? ` · Reporters see “Waiting for ${step.waitingFor}”` : ""}</p> : null}
              </ItemContent>
              {link ? <ItemActions><Button type="button" size="sm" variant="outline" nativeButton={false} render={<ShellLink href={link.href} />}>{link.label}</Button></ItemActions> : null}
            </Item>
          );
        })}
      </ItemGroup>
      {result.failed ? <Alert variant="destructive"><AlertTitle>{result.failed === 1 ? "One step can’t be routed" : `${result.failed} steps can’t be routed`}</AlertTitle><AlertDescription>Submitting this story for review would fail at that step and tell the editors. Fix the role or the workflow, then preview again.</AlertDescription></Alert> : null}
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
      <DialogContent>
        <DialogHeader><DialogTitle>New review workflow</DialogTitle><DialogDescription>It starts with one step, the story’s editor. You’ll shape the steps and which stories it applies to next.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor={id}>Name</FieldLabel><Input id={id} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required autoFocus /></Field>
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={save.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={save.isPending || !name.trim()}>{save.isPending ? <Spinner /> : null}Create workflow</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
