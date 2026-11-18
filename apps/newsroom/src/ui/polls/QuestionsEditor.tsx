"use client";

import { closestCorners, DndContext, KeyboardSensor, MeasuringStrategy, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FormField, TextAreaField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@byline/newsroom-ui/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, CloudCheck, Copy, GitBranch, GripVertical, Info, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { choicesFor, describeCondition } from "../../polls/engine/logic";
import { isAnswerable, KIND_LABELS, type Choice, type Question, type QuestionKind, type SurveyDefinition } from "../../polls/engine/types";
import { validateDefinition } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { ApiError } from "../story/api";
import { fetchSurvey, pollKeys, updateSurvey, type SurveyDetail } from "./api";
import { PollSelect, SwitchField } from "./fields";
import { IssueList } from "./Review";

/**
 * Build (docs/wildcat-polls.md#build): the poll's draft, edited without a
 * spreadsheet and saved as you go. Saves carry the draft's revision, so a
 * stale editor is refused (409) and asked what to do, never silently merged.
 * Publish makes the immutable version.
 *
 * Question and answer identifiers are generated and stay out of the way
 * (under Advanced). Anything already published keeps its identifier, so
 * results stay comparable across versions.
 */

const NEW_KINDS: QuestionKind[] = ["select_one", "select_multiple", "range", "text", "integer", "note"];
const AUTOSAVE_MS = 1200;
/** Measure the rows before a drag starts, so the keyboard sensor always has their resting places. */
const MEASURING = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "answer";

function uniqueName(base: string, taken: Set<string>): string {
  const start = /^[a-z_]/.test(base) ? base : `q_${base}`;
  let name = start;
  for (let n = 2; taken.has(name); n++) name = `${start}_${n}`;
  return name;
}

/** Identifiers Build made up itself, which may still follow the wording. */
const AUTO_QUESTION = /^(question|note)(_\d+)?$/;
const AUTO_CHOICE = /^(answer(_\d+)?|first|second)(_\d+)?$/;

/** Whether any condition, rule or breakdown in the draft names `name`. */
function referenced(draft: SurveyDefinition, name: string): boolean {
  const mention = new RegExp(`\\$\\{${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`);
  const expressions = [...draft.questions.flatMap((question) => [question.relevant, isAnswerable(question) ? question.constraint : undefined]), ...draft.groups.map((group) => group.relevant)];
  return expressions.some((source) => source && mention.test(source)) || draft.settings.breakdowns.includes(name);
}

/**
 * Gives a question (and its new answers) identifiers from its wording, once
 * it has wording, if Build named it and nothing published or referenced uses
 * the name yet. Called when the question loses focus, so names never shift
 * while someone types.
 */
function settleNames(draft: SurveyDefinition, name: string, published: ReadonlySet<string>): { draft: SurveyDefinition; name: string } {
  const index = draft.questions.findIndex((entry) => entry.name === name);
  const question = draft.questions[index];
  if (!question || published.has(name)) return { draft, name };
  let next = draft;
  let finalName = name;
  if (AUTO_QUESTION.test(name) && !referenced(draft, name) && question.label.trim() && !/^New question$|^Information for respondents$/.test(question.label)) {
    const taken = new Set([...draft.questions.map((entry) => entry.name), ...draft.groups.map((entry) => entry.name)].filter((entry) => entry !== name));
    finalName = uniqueName(slug(question.label), taken);
    next = { ...next, questions: next.questions.map((entry, i) => (i === index ? { ...entry, name: finalName } : entry)) };
  }
  if ((question.kind === "select_one" || question.kind === "select_multiple") && !draft.questions.some((entry) => entry.name !== name && "list" in entry && entry.list === question.list)) {
    const list = next.lists.find((entry) => entry.name === question.list);
    if (list) {
      const used = new Set<string>();
      const choices = list.choices.map((choice) => {
        let value = choice.name;
        if (AUTO_CHOICE.test(choice.name) && choice.label.trim() && !/^Answer \d+$|^First answer$|^Second answer$/.test(choice.label) && !new RegExp(`'${choice.name}'`).test(JSON.stringify(next.questions.map((entry) => entry.relevant ?? "")))) {
          value = uniqueName(slug(choice.label), new Set([...list.choices.map((entry) => entry.name).filter((entry) => entry !== choice.name), ...used]));
        }
        used.add(value);
        return { ...choice, name: value };
      });
      next = { ...next, lists: next.lists.map((entry) => (entry.name === list.name ? { ...entry, choices } : entry)) };
    }
  }
  return { draft: next, name: finalName };
}

type Condition = { question: string; op: "is" | "is_not" | "includes" | "answered"; value: string };

/** Reads a condition the builder can show; anything else stays as written (Advanced). */
function parseConditions(source: string | undefined): { join: "and" | "or"; rows: Condition[] } | null {
  if (!source?.trim()) return { join: "and", rows: [] };
  const join = / or /.test(source) && !/ and /.test(source) ? "or" : "and";
  const rows: Condition[] = [];
  for (const part of source.split(join === "and" ? / and / : / or /)) {
    const text = part.trim();
    let match = /^\$\{([\w.-]+)\}\s*(=|!=)\s*'([^']*)'$/.exec(text);
    if (match) { rows.push({ question: match[1], op: match[3] === "" ? (match[2] === "!=" ? "answered" : "is") : match[2] === "=" ? "is" : "is_not", value: match[3] }); continue; }
    match = /^selected\(\$\{([\w.-]+)\},\s*'([^']*)'\)$/.exec(text);
    if (match) { rows.push({ question: match[1], op: "includes", value: match[2] }); continue; }
    return null;
  }
  return { join, rows };
}

function writeConditions(join: "and" | "or", rows: Condition[]): string {
  return rows.filter((row) => row.question).map((row) => (
    row.op === "includes" ? `selected(\${${row.question}}, '${row.value}')`
      : row.op === "answered" ? `\${${row.question}} != ''`
      : `\${${row.question}} ${row.op === "is" ? "=" : "!="} '${row.value}'`
  )).join(` ${join} `);
}

type SaveState = { kind: "saved" } | { kind: "dirty" } | { kind: "saving" } | { kind: "conflict" } | { kind: "error"; message: string };

/**
 * The draft as this editor holds it, saved a moment after each change. One
 * save at a time; changes made during a save go in the next one. The revision
 * the server last confirmed is the fence for the next save.
 */
function useAutosave(id: number, initial: SurveyDefinition, initialRevision: number) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [draft, setDraft] = useState<SurveyDefinition>(() => structuredClone(initial));
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const revision = useRef(initialRevision);
  const latest = useRef(draft);
  const saved = useRef(draft);
  const inFlight = useRef(false);
  const conflict = useRef(false);
  const timer = useRef<number | null>(null);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    const sending = latest.current;
    if (sending === saved.current) { setState({ kind: "saved" }); return; }
    inFlight.current = true;
    setState({ kind: "saving" });
    try {
      const next = await updateSurvey(api, id, { draft: sending, draftRevision: revision.current });
      revision.current = next.survey.draftRevision ?? revision.current + 1;
      saved.current = sending;
      queries.setQueryData(pollKeys.survey(id), next);
      void queries.invalidateQueries({ queryKey: pollKeys.overview() });
      inFlight.current = false;
      if (latest.current !== sending) void run(); else setState({ kind: "saved" });
    } catch (error) {
      inFlight.current = false;
      if (error instanceof ApiError && error.status === 409) { conflict.current = true; setState({ kind: "conflict" }); }
      else setState({ kind: "error", message: (error as Error).message || "Byline couldn't save the draft." });
    }
  }, [api, id, queries]);

  const change = useCallback((next: SurveyDefinition) => {
    latest.current = next;
    setDraft(next);
    if (conflict.current) return;
    setState({ kind: "dirty" });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!conflict.current) void run(); }, AUTOSAVE_MS);
  }, [run]);

  /** After a 409: take the server's draft and drop this editor's changes. */
  const reload = useCallback(async () => {
    const fresh = await fetchSurvey(api, id);
    queries.setQueryData(pollKeys.survey(id), fresh);
    revision.current = fresh.survey.draftRevision ?? 0;
    const next = structuredClone(fresh.draft!);
    latest.current = next;
    saved.current = next;
    conflict.current = false;
    setDraft(next);
    setState({ kind: "saved" });
  }, [api, id, queries]);

  /** After a 409, deliberately: save this editor's draft over the newer one. */
  const overwrite = useCallback(async () => {
    const fresh = await fetchSurvey(api, id);
    revision.current = fresh.survey.draftRevision ?? 0;
    conflict.current = false;
    saved.current = structuredClone(fresh.draft!);
    await run();
  }, [api, id, run]);

  // Leaving with a change not yet sent: send it now.
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); if (latest.current !== saved.current && !inFlight.current && !conflict.current) void updateSurvey(api, id, { draft: latest.current, draftRevision: revision.current }).catch(() => undefined); }, [api, id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (latest.current !== saved.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return { draft, change, state, retry: run, reload, overwrite };
}

function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite" data-polls-save={state.kind}>
      {state.kind === "saving" ? <><Spinner className="size-3.5" />Saving…</>
        : state.kind === "dirty" ? "Unsaved changes"
        : state.kind === "conflict" ? <span className="text-destructive">Not saved: changed elsewhere</span>
        : state.kind === "error" ? <span className="text-destructive">Not saved</span>
        : <><CloudCheck className="size-4" aria-hidden="true" />Saved</>}
    </span>
  );
}

export function BuildEditor({ id, data }: { id: number; data: SurveyDetail }) {
  const { draft, change, state, retry, reload, overwrite } = useAutosave(id, data.draft!, data.survey.draftRevision ?? 0);
  const [selected, setSelected] = useState<string | null>(draft.questions[0]?.name ?? null);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const issues = useMemo(() => validateDefinition(draft), [draft]);
  const published = useMemo(() => new Set(data.versions.length && data.current ? data.current.definition.questions.map((question) => question.name) : []), [data.versions.length, data.current]);
  const index = draft.questions.findIndex((question) => question.name === selected);
  const question = index >= 0 ? draft.questions[index] : null;

  /** Gives the question being left identifiers from its wording, where Build may. */
  const settle = useCallback((name: string | null) => {
    if (!name) return name;
    const settled = settleNames(draft, name, published);
    if (settled.draft !== draft) change(settled.draft);
    return settled.name;
  }, [change, draft, published]);
  const select = useCallback((name: string | null) => {
    if (selected && selected !== name) settle(selected);
    setSelected(name);
    setDrawerOpen(Boolean(name));
  }, [selected, settle]);

  const replace = (patch: Partial<Question> & Record<string, unknown>) => {
    if (!question) return;
    change({ ...draft, questions: draft.questions.map((entry, i) => (i === index ? { ...entry, ...patch } as Question : entry)) });
  };
  const rename = (name: string) => {
    if (!question) return;
    replace({ name });
    setSelected(name);
  };
  const add = (kind: QuestionKind) => {
    const base = selected ? settleNames(draft, selected, published).draft : draft;
    const taken = new Set([...base.questions.map((entry) => entry.name), ...base.groups.map((entry) => entry.name)]);
    const name = uniqueName(kind === "note" ? "note" : "question", taken);
    const after = base.questions.findIndex((entry) => entry.name === selected);
    const groups = after >= 0 ? base.questions[after].groups : [];
    let lists = base.lists;
    let created: Question;
    if (kind === "select_one" || kind === "select_multiple") {
      const listName = uniqueName(`${name}_choices`, new Set(lists.map((list) => list.name)));
      lists = [...lists, { name: listName, choices: [{ name: "answer_1", label: "Answer 1" }, { name: "answer_2", label: "Answer 2" }] }];
      created = { kind, name, label: "New question", groups, required: false, list: listName };
    } else if (kind === "range") created = { kind, name, label: "New question", groups, required: false, start: 1, end: 5, step: 1 };
    else if (kind === "text") created = { kind, name, label: "New question", groups, required: false, multiline: true };
    else if (kind === "note") created = { kind, name, label: "Information for respondents", groups };
    else created = { kind: kind as "integer" | "decimal", name, label: "New question", groups, required: false };
    const at = after >= 0 ? after + 1 : base.questions.length;
    change({ ...base, lists, questions: [...base.questions.slice(0, at), created, ...base.questions.slice(at)] });
    setSelected(name);
    setDrawerOpen(true);
  };
  const moveTo = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= draft.questions.length || from === to) return;
    change({ ...draft, questions: arrayMove(draft.questions, from, to) });
  };
  const removeAt = (at: number) => {
    const questions = draft.questions.filter((_entry, i) => i !== at);
    change({ ...draft, questions });
    setSelected(questions[Math.min(at, questions.length - 1)]?.name ?? null);
    setDrawerOpen(false);
  };
  const duplicateAt = (at: number) => {
    const source = draft.questions[at];
    const taken = new Set([...draft.questions.map((entry) => entry.name), ...draft.groups.map((entry) => entry.name)]);
    const copy = { ...structuredClone(source), name: uniqueName(`${source.name}_copy`, taken) };
    change({ ...draft, questions: [...draft.questions.slice(0, at + 1), copy, ...draft.questions.slice(at + 1)] });
    setSelected(copy.name);
  };

  const inspector = question ? (
    <QuestionInspector
      key={`${index}-${question.kind}`}
      draft={draft}
      question={question}
      index={index}
      published={published.has(question.name)}
      publishedNames={published}
      onChange={change}
      onReplace={replace}
      onRename={rename}
      onMove={(delta) => { moveTo(index, index + delta); }}
      onDuplicate={() => duplicateAt(index)}
      onRemove={() => removeAt(index)}
    />
  ) : null;

  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <div className="flex flex-col gap-4" data-polls-editor="">
      <div className="sticky top-[var(--byline-header-height,0px)] z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 lg:-mx-6 lg:px-6">
        <ButtonGroup>
          <Button type="button" variant="outline" onClick={() => add("select_one")}><Plus data-icon="inline-start" />Add question</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="Add a different kind of question" />}><ChevronDown /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {NEW_KINDS.map((kind) => <DropdownMenuItem key={kind} onClick={() => add(kind)}>{KIND_LABELS[kind]}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <span className="flex-1" />
        {errors.length ? <span className="text-sm text-destructive tabular-nums">{errors.length} {errors.length === 1 ? "error" : "errors"}</span> : null}
        <SaveStatus state={state} />
      </div>

      {state.kind === "conflict" ? (
        <Alert variant="destructive" data-polls-conflict="">
          <CircleAlert />
          <AlertTitle>Someone else changed this draft</AlertTitle>
          <AlertDescription>Your latest changes weren't saved, so nothing of theirs was overwritten. Load their version (your unsaved changes are dropped), or save yours over it.</AlertDescription>
          <AlertAction className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void reload()}>Load latest</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void overwrite()}>Save mine over it</Button>
          </AlertAction>
        </Alert>
      ) : state.kind === "error" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>The draft wasn't saved</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
          <AlertAction><Button type="button" size="sm" variant="outline" onClick={() => void retry()}>Try again</Button></AlertAction>
        </Alert>
      ) : null}
      {errors.length ? <IssueList issues={errors} max={6} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          {draft.questions.length ? (
            <SortableQuestions draft={draft} selected={wide ? selected : null} onSelect={(name) => select(name)} onMove={moveTo} onDuplicate={duplicateAt} onRemove={removeAt} />
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No questions yet</EmptyTitle>
                <EmptyDescription>Add one here, or import a spreadsheet.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button type="button" onClick={() => add("select_one")}><Plus data-icon="inline-start" />Add question</Button></EmptyContent>
            </Empty>
          )}
          <Separator />
          <PollScreens draft={draft} onChange={change} />
        </div>

        {wide ? (
          inspector ? (
            <aside className="min-w-0 lg:sticky lg:top-[calc(var(--byline-header-height,0px)+4rem)] lg:max-h-[calc(100dvh-var(--byline-header-height,0px)-5rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:pl-6" aria-label="Edit question">{inspector}</aside>
          ) : null
        ) : (
          <Drawer open={Boolean(question) && drawerOpen} onOpenChange={(open) => { if (!open) setSelected(settle(selected)); setDrawerOpen(open); }}>
            <DrawerContent keyboardAware className="max-h-[92dvh]">
              <DrawerHeader>
                <DrawerTitle>{question ? `Edit ${KIND_LABELS[question.kind].toLowerCase()}` : "Edit question"}</DrawerTitle>
                <DrawerDescription className="sr-only">Changes save as you go.</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,var(--byline-safe-bottom))]">{inspector}</div>
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </div>
  );
}

/** The questions in order, draggable (pointer or keyboard) by their handles. */
function SortableQuestions({ draft, selected, onSelect, onMove, onDuplicate, onRemove }: {
  draft: SurveyDefinition;
  selected: string | null;
  onSelect: (name: string) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (at: number) => void;
  onRemove: (at: number) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const labelOf = (name: string | number) => draft.questions.find((question) => question.name === String(name))?.label ?? "question";
  const position = (name: string | number) => draft.questions.findIndex((question) => question.name === String(name)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${labelOf(active.id)}”, question ${position(active.id)} of ${draft.questions.length}.`,
    onDragOver: ({ active, over }) => (over ? `“${labelOf(active.id)}” is over position ${position(over.id)}.` : `“${labelOf(active.id)}” is no longer over a position.`),
    onDragEnd: ({ active, over }) => (over ? `“${labelOf(active.id)}” moved to position ${position(over.id)}.` : `“${labelOf(active.id)}” dropped.`),
    onDragCancel: ({ active }) => `Moving “${labelOf(active.id)}” cancelled.`
  };
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onMove(position(active.id) - 1, position(over.id) - 1);
  };
  const groups = new Map(draft.groups.map((group) => [group.name, group]));
  let number = 0;
  let lastSection = "";
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} measuring={MEASURING} onDragEnd={end} accessibility={{ announcements, screenReaderInstructions: { draggable: "To move a question, press Space or Enter on its handle, use the arrow keys, then press Space or Enter again. Escape cancels." } }}>
      <SortableContext items={draft.questions.map((question) => question.name)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col" data-polls-question-map="">
          {draft.questions.map((question, at) => {
            const section = question.groups.at(-1) ?? "";
            const header = section !== lastSection && section ? groups.get(section) : null;
            lastSection = section;
            if (isAnswerable(question)) number++;
            return (
              <SortableQuestion
                key={question.name}
                question={question}
                number={isAnswerable(question) ? number : null}
                header={header ? header.label || header.name : null}
                condition={question.relevant ? describeCondition(draft, question.relevant) : null}
                current={selected === question.name}
                first={at === 0}
                last={at === draft.questions.length - 1}
                onSelect={() => onSelect(question.name)}
                onMove={(delta) => onMove(at, at + delta)}
                onDuplicate={() => onDuplicate(at)}
                onRemove={() => onRemove(at)}
              />
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableQuestion({ question, number, header, condition, current, first, last, onSelect, onMove, onDuplicate, onRemove }: {
  question: Question; number: number | null; header: string | null; condition: string | null; current: boolean; first: boolean; last: boolean;
  onSelect: () => void; onMove: (delta: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: question.name });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("flex flex-col", isDragging && "relative z-10")}>
      {header ? <h3 className="mt-5 mb-1 px-3 text-sm font-medium text-muted-foreground first:mt-0">{header}</h3> : null}
      <div className={cn("group flex items-start gap-1 rounded-lg border border-transparent py-1 pr-1 pl-0.5", current ? "bg-muted" : "hover:bg-muted/50", isDragging && "border-border bg-background shadow-md")} data-polls-question={question.name}>
        <Button ref={setActivatorNodeRef} type="button" variant="ghost" size="icon-sm" className="mt-1 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label={`Move “${question.label || "question"}”`} {...attributes} {...listeners}>
          <GripVertical />
        </Button>
        <button type="button" onClick={onSelect} aria-current={current ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className="w-6 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums">{number ?? <Info className="ml-auto size-4" aria-label="Information" />}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm leading-snug font-medium">{question.label || <em className="font-normal text-muted-foreground">No wording yet</em>}</span>
            <span className="text-xs text-muted-foreground">{KIND_LABELS[question.kind]}{isAnswerable(question) ? ` · ${question.required ? "Required" : "Optional"}` : ""}</span>
            {condition ? <span className="inline-flex items-start gap-1.5 text-xs text-muted-foreground"><GitBranch className="mt-px size-3.5 shrink-0" aria-hidden="true" />Shown when {condition}</span> : null}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" className="mt-1 shrink-0 text-muted-foreground" aria-label={`Actions for “${question.label || "question"}”`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={first} onClick={() => onMove(-1)}><ArrowUp />Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={last} onClick={() => onMove(1)}><ArrowDown />Move down</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}><Copy />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** The welcome and thank-you screens, and the questions results can be compared by. */
function PollScreens({ draft, onChange }: { draft: SurveyDefinition; onChange: (next: SurveyDefinition) => void }) {
  const settings = draft.settings;
  const eligible = draft.questions.filter((question) => question.kind === "select_one");
  const toggle = (name: string, on: boolean) => onChange({ ...draft, settings: { ...settings, breakdowns: on ? [...settings.breakdowns.filter((entry) => entry !== name), name] : settings.breakdowns.filter((entry) => entry !== name) } });
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <FieldSet>
        <FieldLegend>Respondent screens</FieldLegend>
        <FieldGroup>
          <TextAreaField label="Welcome text" hint="Say it's voluntary and anonymous, and how long it takes." value={settings.welcome} rows={3} maxLength={2000} onChange={(welcome) => onChange({ ...draft, settings: { ...settings, welcome } })} />
          <TextAreaField label="Thank-you text" value={settings.thankYou} rows={2} maxLength={1000} onChange={(thankYou) => onChange({ ...draft, settings: { ...settings, thankYou } })} />
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Compare results by</FieldLegend>
        <FieldDescription>Single-choice questions such as grade. Results can be broken down by these, with small groups withheld.</FieldDescription>
        {eligible.length ? (
          <FieldGroup data-slot="checkbox-group" className="gap-3">
            {eligible.map((question) => (
              <Field key={question.name} orientation="horizontal">
                <Checkbox id={`breakdown-${question.name}`} checked={settings.breakdowns.includes(question.name)} onCheckedChange={(on) => toggle(question.name, on === true)} />
                <FieldContent><FieldLabel htmlFor={`breakdown-${question.name}`} className="font-normal">{question.label}</FieldLabel></FieldContent>
              </Field>
            ))}
          </FieldGroup>
        ) : <p className="text-sm text-muted-foreground">Add a single-choice question to compare by.</p>}
      </FieldSet>
    </div>
  );
}

/** One question's settings, in groups: wording, answers, when it's asked, and the rarer details. */
function QuestionInspector({ draft, question, index, published, publishedNames, onChange, onReplace, onRename, onMove, onDuplicate, onRemove }: {
  draft: SurveyDefinition;
  question: Question;
  index: number;
  published: boolean;
  publishedNames: ReadonlySet<string>;
  onChange: (next: SurveyDefinition) => void;
  onReplace: (patch: Partial<Question> & Record<string, unknown>) => void;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-5" data-polls-inspector="">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">{KIND_LABELS[question.kind]} · {index + 1} of {draft.questions.length}</p>
        <ButtonGroup>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Move down" disabled={index === draft.questions.length - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
        </ButtonGroup>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" aria-label="More question actions" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onDuplicate}><Copy />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 />Delete question</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FieldGroup>
        <TextAreaField label={question.kind === "note" ? "Text" : "Question"} value={question.label} rows={3} maxLength={1000} onChange={(label) => onReplace({ label })} />
        <TextField label="Hint" optional hint="Shown under the question." value={question.hint ?? ""} maxLength={1000} onChange={(hint) => onReplace({ hint: hint || undefined })} />
        {isAnswerable(question) ? <SwitchField label="Required" description="Optional questions get a Skip button." checked={question.required} onChange={(required) => onReplace({ required })} /> : null}
      </FieldGroup>

      {question.kind === "select_one" || question.kind === "select_multiple" ? (<><Separator /><ChoicesEditor draft={draft} question={question} locked={publishedNames.has(question.name)} onChange={onChange} /></>) : null}
      {question.kind === "range" ? (
        <>
          <Separator />
          <FieldSet>
            <FieldLegend variant="label">Scale</FieldLegend>
            <div className="grid grid-cols-3 gap-3">
              <TextField label="From" type="number" inputMode="numeric" value={String(question.start)} onChange={(value) => onReplace({ start: Number(value) })} />
              <TextField label="To" type="number" inputMode="numeric" value={String(question.end)} onChange={(value) => onReplace({ end: Number(value) })} />
              <TextField label="Step" type="number" inputMode="numeric" value={String(question.step)} onChange={(value) => onReplace({ step: Number(value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Low label" optional value={question.startLabel ?? ""} onChange={(value) => onReplace({ startLabel: value || undefined })} />
              <TextField label="High label" optional value={question.endLabel ?? ""} onChange={(value) => onReplace({ endLabel: value || undefined })} />
            </div>
          </FieldSet>
        </>
      ) : null}
      {question.kind === "text" ? (<><Separator /><SwitchField label="Long answer" description="A larger box for a few sentences." checked={question.multiline} onChange={(multiline) => onReplace({ multiline })} /></>) : null}

      <Separator />
      <FieldGroup>
        <SectionPicker draft={draft} question={question} onChange={onChange} />
        <ConditionEditor draft={draft} question={question} onChange={(relevant) => onReplace({ relevant: relevant || undefined })} />
      </FieldGroup>

      <Separator />
      <Collapsible defaultOpen={Boolean(isAnswerable(question) && question.constraint)}>
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2.5 w-fit" />}>Advanced<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <FieldGroup>
            <TextField label="Identifier" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              hint={published ? "Published questions keep their identifier, so results stay comparable." : "Used in exports, conditions and results across versions. Byline makes one from the wording; change it only if you need to."}
              value={question.name} disabled={published} onChange={(name) => onRename(name.replace(/\s+/g, "_"))} />
            {isAnswerable(question) ? (
              <>
                <TextField label="Answer rule" hint="An XLSForm constraint; “.” is the answer." autoCapitalize="none" autoCorrect="off" spellCheck={false} value={question.constraint ?? ""} onChange={(value) => onReplace({ constraint: value || undefined })} />
                <TextField label="Message when it fails" value={question.constraintMessage ?? ""} onChange={(value) => onReplace({ constraintMessage: value || undefined })} />
              </>
            ) : null}
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** The answers, reorderable (pointer or keyboard). Their identifiers are under Advanced. */
function ChoicesEditor({ draft, question, locked, onChange }: { draft: SurveyDefinition; question: Extract<Question, { kind: "select_one" | "select_multiple" }>; locked: boolean; onChange: (next: SurveyDefinition) => void }) {
  const choices = choicesFor(draft, question);
  const sharedWith = draft.questions.filter((entry) => entry.name !== question.name && (entry.kind === "select_one" || entry.kind === "select_multiple") && entry.list === question.list).length;
  const setChoices = (next: Choice[]) => onChange({ ...draft, lists: draft.lists.map((list) => (list.name === question.list ? { ...list, choices: next } : list)) });
  const taken = new Set(choices.map((choice) => choice.name));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setChoices(arrayMove(choices, choices.findIndex((choice) => choice.name === active.id), choices.findIndex((choice) => choice.name === over.id)));
  };
  const labelOf = (id: string | number) => choices.find((choice) => choice.name === String(id))?.label ?? "answer";
  const at = (id: string | number) => choices.findIndex((choice) => choice.name === String(id)) + 1;
  return (
    <FieldSet>
      <FieldLegend variant="label">Answers</FieldLegend>
      {sharedWith ? <FieldDescription>This list is also used by {sharedWith} other question{sharedWith === 1 ? "" : "s"}.</FieldDescription> : null}
      <DndContext sensors={sensors} collisionDetection={closestCorners} measuring={MEASURING} onDragEnd={end} accessibility={{ announcements: {
        onDragStart: ({ active }) => `Picked up “${labelOf(active.id)}”, answer ${at(active.id)} of ${choices.length}.`,
        onDragOver: ({ active, over }) => (over ? `“${labelOf(active.id)}” is over position ${at(over.id)}.` : ""),
        onDragEnd: ({ active, over }) => (over ? `“${labelOf(active.id)}” moved to position ${at(over.id)}.` : `“${labelOf(active.id)}” dropped.`),
        onDragCancel: ({ active }) => `Moving “${labelOf(active.id)}” cancelled.`
      } }}>
        <SortableContext items={choices.map((choice) => choice.name)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-1.5">
            {choices.map((choice, i) => (
              <SortableChoice key={choice.name} choice={choice} index={i}
                onLabel={(label) => setChoices(choices.map((entry, j) => (j === i ? { ...entry, label } : entry)))}
                onRemove={() => setChoices(choices.filter((_entry, j) => j !== i))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setChoices([...choices, { name: uniqueName(`answer_${choices.length + 1}`, taken), label: `Answer ${choices.length + 1}` }])}><Plus data-icon="inline-start" />Add answer</Button>
      <Collapsible>
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2.5 w-fit text-muted-foreground" />}>Answer identifiers<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-1.5">
          <FieldDescription>{locked ? "This question is published: its answers keep their identifiers. New answers get their own." : "Stored with each response and used in conditions. Made from the wording."}</FieldDescription>
          {choices.map((choice, i) => (
            <FormField key={`${choice.name}-${i}`} id={`choice-key-${question.name}-${i}`} label={choice.label || `Answer ${i + 1}`}>
              <Input id={`choice-key-${question.name}-${i}`} className="font-mono text-xs" value={choice.name} disabled={locked} autoCapitalize="none" spellCheck={false}
                onChange={(event) => setChoices(choices.map((entry, j) => (j === i ? { ...entry, name: event.target.value.replace(/\s+/g, "_") } : entry)))} />
            </FormField>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </FieldSet>
  );
}

function SortableChoice({ choice, index, onLabel, onRemove }: { choice: Choice; index: number; onLabel: (label: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: choice.name });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("flex items-center gap-1", isDragging && "relative z-10 rounded-md bg-background shadow-md")}>
      <Button ref={setActivatorNodeRef} type="button" variant="ghost" size="icon-sm" className="shrink-0 cursor-grab touch-none text-muted-foreground" aria-label={`Move answer “${choice.label || index + 1}”`} {...attributes} {...listeners}><GripVertical /></Button>
      <Input aria-label={`Answer ${index + 1}`} value={choice.label} onChange={(event) => onLabel(event.target.value)} />
      <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remove ${choice.label || `answer ${index + 1}`}`} onClick={onRemove}><X /></Button>
    </li>
  );
}

function SectionPicker({ draft, question, onChange }: { draft: SurveyDefinition; question: Question; onChange: (next: SurveyDefinition) => void }) {
  const current = question.groups.at(-1) ?? "";
  const group = draft.groups.find((entry) => entry.name === current);
  const setGroups = (groups: string[]) => onChange({ ...draft, questions: draft.questions.map((entry) => (entry.name === question.name ? { ...entry, groups } : entry)) });
  const addSection = () => {
    const taken = new Set([...draft.questions.map((entry) => entry.name), ...draft.groups.map((entry) => entry.name)]);
    const name = uniqueName("section", taken);
    onChange({ ...draft, groups: [...draft.groups, { name, label: "New section", groups: [] }], questions: draft.questions.map((entry) => (entry.name === question.name ? { ...entry, groups: [name] } : entry)) });
  };
  const id = useId();
  return (
    <FormField id={id} label="Section">
      <div className="flex gap-2">
        <PollSelect id={id} value={current} emptyLabel="None" options={draft.groups.map((entry) => ({ value: entry.name, label: entry.label || entry.name }))}
          onChange={(value) => setGroups(value ? [...(draft.groups.find((entry) => entry.name === value)?.groups ?? []), value] : [])} />
        <Button type="button" variant="outline" onClick={addSection}><Plus data-icon="inline-start" />New</Button>
      </div>
      {group ? <Input aria-label="Section heading" value={group.label} onChange={(event) => onChange({ ...draft, groups: draft.groups.map((entry) => (entry.name === group.name ? { ...entry, label: event.target.value } : entry)) })} /> : null}
    </FormField>
  );
}

/** When a question is asked: the builder by default, the raw expression under "Write it". */
function ConditionEditor({ draft, question, onChange }: { draft: SurveyDefinition; question: Question; onChange: (relevant: string) => void }) {
  const parsed = parseConditions(question.relevant);
  const [advanced, setAdvanced] = useState(parsed === null);
  const earlier = draft.questions.slice(0, draft.questions.findIndex((entry) => entry.name === question.name)).filter(isAnswerable);
  const rows = parsed?.rows ?? [];
  const join = parsed?.join ?? "and";
  const write = (nextRows: Condition[], nextJoin = join) => onChange(writeConditions(nextJoin, nextRows));
  return (
    <FieldSet>
      <div className="flex items-center justify-between">
        <FieldLegend variant="label" className="mb-0">Show this question</FieldLegend>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)}>{advanced ? "Use the builder" : "Write it"}</Button>
      </div>
      {advanced || parsed === null ? (
        <TextField label="Condition" hint="An XLSForm condition. Refer to earlier questions as ${identifier}." autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="${book_report} = 'yes'" value={question.relevant ?? ""} onChange={onChange} />
      ) : (
        <>
          {!rows.length ? <FieldDescription>Always shown.</FieldDescription> : null}
          {rows.length > 1 ? (
            <PollSelect label="How conditions combine" className="w-48" value={join} options={[{ value: "and", label: "When all are true" }, { value: "or", label: "When any is true" }]} onChange={(value) => write(rows, value === "or" ? "or" : "and")} />
          ) : null}
          {rows.map((row, i) => {
            const target = earlier.find((entry) => entry.name === row.question);
            const options = target ? choicesFor(draft, target) : [];
            const set = (patch: Partial<Condition>) => write(rows.map((entry, j) => (j === i ? { ...entry, ...patch } : entry)));
            return (
              <div key={i} className="grid gap-1.5 border-l-2 pl-3">
                <PollSelect label="Earlier question" value={row.question} options={earlier.map((entry) => ({ value: entry.name, label: entry.label.slice(0, 70) }))} onChange={(value) => set({ question: value, value: "" })} />
                <div className="flex gap-1.5">
                  <PollSelect label="Comparison" className="w-36 shrink-0" value={row.op} options={[{ value: "is", label: "is" }, { value: "is_not", label: "is not" }, ...(target?.kind === "select_multiple" ? [{ value: "includes", label: "includes" }] : []), { value: "answered", label: "was answered" }]} onChange={(value) => set({ op: value as Condition["op"] })} />
                  {row.op !== "answered" ? (
                    options.length
                      ? <PollSelect label="Answer" value={row.value} options={options.map((choice) => ({ value: choice.name, label: choice.label }))} onChange={(value) => set({ value })} />
                      : <Input value={row.value} onChange={(event) => set({ value: event.target.value })} aria-label="Value" />
                  ) : null}
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Remove condition" onClick={() => write(rows.filter((_entry, j) => j !== i))}><X /></Button>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={!earlier.length} onClick={() => write([...rows, { question: earlier.at(-1)?.name ?? "", op: "is", value: "" }])}><Plus data-icon="inline-start" />Only when…</Button>
        </>
      )}
    </FieldSet>
  );
}
