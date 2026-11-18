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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, CloudCheck, Copy, GitBranch, GripVertical, Info, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { Viewport } from "@xyflow/react";
import { toast } from "sonner";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { choicesFor, describeCondition } from "../../polls/engine/logic";
import { hasChoices, isAnswerable, isSelect, KIND_LABELS, type Choice, type ChoiceImage, type ChoiceQuestion, type Group, type Question, type QuestionKind, type SurveyDefinition } from "../../polls/engine/types";
import { readCondition } from "../../polls/engine/condition-builder";
import { changeMatrixSection, createMatrix, definitionNames, deleteBuildItem, duplicateBuildItem, previewItem, restoreBuildItem, uniqueName } from "../../polls/engine/build-items";
import { CHOICE_DISPLAYS, DISPLAY_APPEARANCES, choiceDisplay, isTableGroup, likertChoices, respondentScreens, screenQuestions, type ChoiceDisplay, type Matrix, type RespondentScreen } from "../../polls/engine/presentation";
import { diagnoseDefinition } from "../../polls/engine/logic-map";
import { useNewsroomRoutes } from "../shell/account";
import { ApiError } from "../story/api";
import { fetchSurvey, pollKeys, updateSurvey, type SurveyDetail } from "./api";
import { PollSelect, SwitchField } from "./fields";
import { useLogicPositions } from "./useLogicPositions";
import { RuleEditor } from "./RuleEditor";
import { ChoiceMedia, useDraftChoiceImages } from "./ChoiceMedia";
import { SurveyRunner } from "./runner/SurveyRunner";
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

const LogicMap = dynamic(() => import("./LogicMap").then((module) => module.LogicMap), {
  loading: () => <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Spinner />Loading map…</p>
});

type AddKind = QuestionKind | "image_choice" | "matrix";
const QUESTION_MENU: Array<{ label: string; kinds: AddKind[] }> = [
  { label: "Choice", kinds: ["select_one", "select_multiple", "image_choice", "rank", "matrix"] },
  { label: "Input", kinds: ["text", "integer", "decimal", "range"] },
  { label: "Structure", kinds: ["acknowledge", "note"] }
];
const addLabel = (kind: AddKind) => kind === "image_choice" ? "Image choice" : kind === "matrix" ? "Matrix" : KIND_LABELS[kind];
type ChangeDraft = (update: SurveyDefinition | ((current: SurveyDefinition) => SurveyDefinition)) => void;
const AUTOSAVE_MS = 1200;
/** Measure the rows before a drag starts, so the keyboard sensor always has their resting places. */
const MEASURING = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "answer";

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
    const taken = new Set([...definitionNames(draft), ...published].filter((entry) => entry !== name));
    finalName = uniqueName(slug(question.label), taken);
    next = { ...next, questions: next.questions.map((entry, i) => (i === index ? { ...entry, name: finalName } : entry)) };
  }
  if (hasChoices(question) && !referenced(draft, name) && !draft.questions.some((entry) => entry.name !== name && "list" in entry && entry.list === question.list)) {
    const list = next.lists.find((entry) => entry.name === question.list);
    if (list) {
      const used = new Set<string>();
      const choices = list.choices.map((choice) => {
        let value = choice.name;
        if (AUTO_CHOICE.test(choice.name) && choice.label.trim() && !/^Answer \d+$|^First answer$|^Second answer$/.test(choice.label)) {
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

  const change = useCallback((update: SurveyDefinition | ((current: SurveyDefinition) => SurveyDefinition)) => {
    const next = typeof update === "function" ? update(latest.current) : update;
    if (next === latest.current) return;
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
  const items = useMemo(() => respondentScreens(draft), [draft]);
  const [selected, setSelected] = useState<string | null>(items[0]?.name ?? null);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logic = useSearchParams()?.get("build") === "logic";
  const { positions, update: setPositions } = useLogicPositions(id, logic, draft);
  const viewport = useRef<Viewport | undefined>(undefined);
  const setViewport = useCallback((next: Viewport | undefined) => { viewport.current = next; }, []);
  const { issues: definitionIssues, byItem } = useMemo(() => diagnoseDefinition(draft), [draft]);
  const issues = [...definitionIssues, ...data.draftMediaIssues];
  const published = useMemo(() => data.current ? definitionNames(data.current.definition) : new Set<string>(), [data.current]);
  const selectedItem = items.find((item) => item.name === selected) ?? items.find(
    (item) => item.kind === "matrix" && item.matrix.rows.some((row) => row.name === selected)
  );
  const position = items.findIndex((item) => item === selectedItem);
  const question = selectedItem?.kind === "question" ? selectedItem.question : null;
  const index = question ? draft.questions.indexOf(question) : -1;

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
  const add = (preset: AddKind) => {
    const settled = selected ? settleNames(draft, selected, published) : { draft, name: null };
    const base = settled.draft;
    const after = selectedItem ? draft.questions.indexOf(screenQuestions(selectedItem).at(-1)!) : -1;
    const groups = selectedItem?.kind === "matrix" ? selectedItem.matrix.group.groups : after >= 0 ? base.questions[after].groups : [];
    const at = after >= 0 ? after + 1 : base.questions.length;
    if (preset === "matrix") {
      const result = createMatrix(base, at, groups.length < 4 ? groups : groups.slice(0, 3), published);
      change(result.draft);
      setSelected(result.name);
      setDrawerOpen(true);
      return;
    }
    const kind = preset === "image_choice" ? "select_one" : preset;
    const name = uniqueName(kind === "note" ? "note" : "question", new Set([...definitionNames(base), ...published]));
    let lists = base.lists;
    let created: Question;
    if (kind === "select_one" || kind === "select_multiple" || kind === "rank") {
      const list = uniqueName(`${name}_choices`, new Set(lists.map((entry) => entry.name)));
      lists = [...lists, { name: list, choices: [{ name: "answer_1", label: "Answer 1" }, { name: "answer_2", label: "Answer 2" }] }];
      created = { kind, name, label: "New question", groups, required: false, list };
      if (isSelect(created) && preset === "image_choice") created = { ...created, appearance: "columns", imageCards: true };
    } else if (kind === "range") created = { kind, name, label: "New question", groups, required: false, start: 1, end: 5, step: 1 };
    else if (kind === "text") created = { kind, name, label: "New question", groups, required: false, multiline: true };
    else if (kind === "note") created = { kind, name, label: "Information for respondents", groups };
    else created = { kind, name, label: "New question", groups, required: false };
    change({ ...base, lists, questions: [...base.questions.slice(0, at), created, ...base.questions.slice(at)] });
    setSelected(name);
    setDrawerOpen(true);
  };
  const moveTo = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    change({ ...draft, questions: arrayMove(items, from, to).flatMap(screenQuestions) });
  };
  const removeAt = (at: number) => {
    const item = items[at];
    if (!item) return;
    change(deleteBuildItem(draft, item));
    setSelected((items[at + 1] ?? items[at - 1])?.name ?? null);
    setDrawerOpen(false);
    toast.success(item.kind === "matrix" ? "Matrix deleted" : "Question deleted", {
      action: { label: "Undo", onClick: () => change((current) => restoreBuildItem(current, draft, item)) }
    });
  };
  const duplicateAt = (at: number) => {
    const result = duplicateBuildItem(draft, items[at], published);
    change(result.draft);
    setSelected(result.name);
    setDrawerOpen(true);
  };

  const actions = {
    onMove: (delta: -1 | 1) => moveTo(position, position + delta),
    onDuplicate: () => duplicateAt(position),
    onRemove: () => removeAt(position)
  };
  const inspector = selectedItem?.kind === "matrix" ? (
    <MatrixInspector key={selectedItem.name} draft={draft} matrix={selectedItem.matrix}
      position={position} count={items.length} published={published} onChange={change} {...actions} />
  ) : question && selectedItem ? (
    <QuestionInspector
      key={`${index}-${question.kind}`} draft={draft} question={question} index={index} position={position} count={items.length}
      published={published.has(question.name)} publishedNames={published}
      onChange={change} onReplace={replace} onRename={rename} {...actions}
    />
  ) : null;

  // Both views stay inside this editor and share its draft and revision fence.
  const openView = (view: string, name?: string) => {
    if (view === "logic" && !logic) {
      setSelected(settle(selected));
      setDrawerOpen(false);
    } else if (name) {
      setSelected(name);
      setDrawerOpen(true);
    }
    const url = new URL(window.location.href);
    if (view === "logic") url.searchParams.set("build", "logic");
    else url.searchParams.delete("build");
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  };
  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <div className="flex flex-col gap-4" data-polls-editor="">
      <div className="sticky top-[var(--byline-header-height,0px)] z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 lg:-mx-6 lg:px-6">
        <Tabs value={logic ? "logic" : "questions"} onValueChange={(view) => openView(view)}>
          <TabsList aria-label="Build views">
            <TabsTrigger value="questions" className="poll-logic-touch">Questions</TabsTrigger>
            <TabsTrigger value="logic" className="poll-logic-touch">Logic</TabsTrigger>
          </TabsList>
        </Tabs>
        {!logic ? <ButtonGroup>
          <Button type="button" variant="outline" onClick={() => add("select_one")}><Plus data-icon="inline-start" />Add question</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="Add a different kind of question" />}><ChevronDown /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {QUESTION_MENU.map(({ label, kinds }, i) => <DropdownMenuGroup key={label}>
                {i > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                {kinds.map((kind) => <DropdownMenuItem key={kind} onClick={() => add(kind)}>{addLabel(kind)}</DropdownMenuItem>)}
              </DropdownMenuGroup>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup> : null}
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
      {issues.length ? <IssueList issues={issues} max={6} /> : null}

      {logic ? (
        <LogicMap definition={draft} issues={byItem} selectedQuestion={selected} onSelectQuestion={setSelected}
          onEditQuestion={(name) => openView("questions", name)} onChange={change}
          positions={positions} onPositions={setPositions} viewport={viewport.current} onViewport={setViewport} />
      ) : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          {draft.questions.length ? (
            <SortableQuestions draft={draft} items={items} selected={wide ? selected : null} onSelect={(name) => select(name)} onMove={moveTo} onDuplicate={duplicateAt} onRemove={removeAt} />
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
          <Drawer open={Boolean(selectedItem) && drawerOpen} onOpenChange={(open) => { if (!open) setSelected(settle(selected)); setDrawerOpen(open); }}>
            <DrawerContent keyboardAware className="max-h-[92dvh]">
              <DrawerHeader>
                <DrawerTitle>{selectedItem?.kind === "matrix" ? "Edit matrix" : question ? `Edit ${KIND_LABELS[question.kind].toLowerCase()}` : "Edit question"}</DrawerTitle>
                <DrawerDescription className="sr-only">Changes save as you go.</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,var(--byline-safe-bottom))]">{inspector}</div>
            </DrawerContent>
          </Drawer>
        )}
      </div>}
    </div>
  );
}

/** The questions in order, draggable (pointer or keyboard) by their handles. */
function SortableQuestions({ draft, items, selected, onSelect, onMove, onDuplicate, onRemove }: {
  draft: SurveyDefinition;
  items: RespondentScreen[];
  selected: string | null;
  onSelect: (name: string) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (at: number) => void;
  onRemove: (at: number) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const labelOf = (name: string | number) => {
    const item = items.find((entry) => entry.name === String(name));
    return item?.kind === "matrix" ? item.matrix.group.label : item?.question.label ?? "question";
  };
  const position = (name: string | number) => items.findIndex((item) => item.name === String(name)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${labelOf(active.id)}”, question ${position(active.id)} of ${items.length}.`,
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
      <SortableContext items={items.map((item) => item.name)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col" data-polls-question-map="">
          {items.map((item, at) => {
            const question = item.kind === "question" ? item.question : null;
            const content = item.kind === "matrix" ? item.matrix.group : item.question;
            const section = content.groups.at(-1) ?? "";
            const header = section !== lastSection && section ? groups.get(section) : null;
            lastSection = section;
            const answerable = item.kind === "matrix" || (question && isAnswerable(question));
            if (answerable) number++;
            const type = item.kind === "matrix" ? `Matrix · ${item.matrix.rows.length} rows` : KIND_LABELS[item.question.kind];
            const required = question && isAnswerable(question) ? question.required : item.kind === "matrix" ? item.matrix.rows.every((row) => row.required) : false;
            return (
              <SortableQuestion key={item.name} name={item.name} label={content.label} type={type} required={required}
                number={answerable ? number : null}
                header={header ? `${isTableGroup(header) ? "Imported table · " : ""}${header.label || header.name}` : null}
                condition={content.relevant ? describeCondition(draft, content.relevant) : null}
                current={selected === item.name}
                first={at === 0}
                last={at === items.length - 1}
                onSelect={() => onSelect(item.name)}
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

function SortableQuestion({ name, label, type, required, number, header, condition, current, first, last, onSelect, onMove, onDuplicate, onRemove }: {
  name: string; label: string; type: string; required: boolean; number: number | null; header: string | null; condition: string | null; current: boolean; first: boolean; last: boolean;
  onSelect: () => void; onMove: (delta: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: name });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("flex flex-col", isDragging && "relative z-10")}>
      {header ? <h3 className="mt-5 mb-1 px-3 text-sm font-medium text-muted-foreground first:mt-0">{header}</h3> : null}
      <div className={cn("group flex items-start gap-1 rounded-lg border border-transparent py-1 pr-1 pl-0.5", current ? "bg-muted" : "hover:bg-muted/50", isDragging && "border-border bg-background shadow-md")} data-polls-question={name}>
        <Button ref={setActivatorNodeRef} type="button" variant="ghost" size="icon-sm" className="mt-1 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label={`Move “${label || "question"}”`} {...attributes} {...listeners}>
          <GripVertical />
        </Button>
        <button type="button" onClick={onSelect} aria-current={current ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className="w-6 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums">{number ?? <Info className="ml-auto size-4" aria-label="Information" />}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm leading-snug font-medium">{label || <em className="font-normal text-muted-foreground">No wording yet</em>}</span>
            <span className="text-xs text-muted-foreground">{type}{number ? ` · ${required ? "Required" : "Optional"}` : ""}</span>
            {condition ? <span className="inline-flex items-start gap-1.5 text-xs text-muted-foreground"><GitBranch className="mt-px size-3.5 shrink-0" aria-hidden="true" />Shown when {condition}</span> : null}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" className="mt-1 shrink-0 text-muted-foreground" aria-label={`Actions for “${label || "question"}”`} />}><MoreHorizontal /></DropdownMenuTrigger>
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
function QuestionInspector({ draft, question, index, position, count, published, publishedNames, onChange, onReplace, onRename, onMove, onDuplicate, onRemove }: {
  draft: SurveyDefinition;
  question: Question;
  index: number;
  position: number;
  count: number;
  published: boolean;
  publishedNames: ReadonlySet<string>;
  onChange: ChangeDraft;
  onReplace: (patch: Partial<Question> & Record<string, unknown>) => void;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-5" data-polls-inspector="">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">{KIND_LABELS[question.kind]} · {position + 1} of {count}</p>
        <ButtonGroup>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Move up" disabled={position === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Move down" disabled={position === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
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

      {question.kind === "acknowledge" ? <FieldDescription>Ask respondents to acknowledge a statement before continuing.</FieldDescription> : null}
      {question.kind === "rank" ? <FieldDescription>Respondents put every option in order from highest to lowest.</FieldDescription> : null}
      {isSelect(question) ? <DisplayPicker draft={draft} question={question} locked={published} onChange={onChange} /> : null}
      {hasChoices(question) ? (<><Separator /><ChoicesEditor draft={draft} question={question}
        locked={draft.questions.some((entry) => publishedNames.has(entry.name) && hasChoices(entry) && entry.list === question.list)}
        withImages={isSelect(question) && choiceDisplay(draft, question) === "images"} onChange={onChange} /></>) : null}
      <QuestionPreview draft={draft} item={{ kind: "question", name: question.name, question }} />
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
        <RuleEditor key={question.relevant ?? ""} definition={draft} target={{
          kind: "question", name: question.name, item: question, start: index, members: [index], builder: readCondition(draft, question.relevant)
        }} onApply={(relevant) => onReplace({ relevant })} />
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
                {isSelect(question) && choiceDisplay(draft, question) === "advanced" ? (
                  <TextField label="Imported appearance" hint="This display is preserved when you download the spreadsheet." value={question.appearance ?? ""}
                    onChange={(appearance) => onReplace({ appearance: appearance || undefined })} />
                ) : null}
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
function ChoicesEditor({ draft, question, locked, withImages = false, columns = false, onChange }: {
  draft: SurveyDefinition; question: ChoiceQuestion; locked: boolean; withImages?: boolean; columns?: boolean; onChange: ChangeDraft;
}) {
  const choices = choicesFor(draft, question);
  const sharedWith = draft.questions.filter((entry) => entry.name !== question.name && hasChoices(entry) && entry.list === question.list
    && (!columns || entry.groups.at(-1) !== question.groups.at(-1))).length;
  const itemLabel = columns ? "Column" : "Answer";
  const setChoices = (next: Choice[]) => onChange((current) => ({ ...current, lists: current.lists.map((list) => (list.name === question.list ? { ...list, choices: next } : list)) }));
  const setImage = (choice: string, image?: ChoiceImage) => onChange((current) => ({
    ...current, lists: current.lists.map((list) => list.name === question.list ? {
      ...list, choices: list.choices.map((entry) => entry.name === choice ? { ...entry, image } : entry)
    } : list)
  }));
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
      <FieldLegend variant="label">{columns ? "Columns" : "Answers"}</FieldLegend>
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
              <SortableChoice key={choice.name} choice={choice} index={i} itemLabel={itemLabel}
                media={withImages ? <ChoiceMedia image={choice.image} label={choice.label || `answer ${i + 1}`} onChange={(image) => setImage(choice.name, image)} /> : null}
                onLabel={(label) => setChoices(choices.map((entry, j) => (j === i ? { ...entry, label } : entry)))}
                onRemove={() => setChoices(choices.filter((_entry, j) => j !== i))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setChoices([...choices, { name: uniqueName(`answer_${choices.length + 1}`, taken), label: `${itemLabel} ${choices.length + 1}` }])}><Plus data-icon="inline-start" />Add {itemLabel.toLowerCase()}</Button>
      <Collapsible>
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2.5 w-fit text-muted-foreground" />}>{itemLabel} identifiers<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
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

function SortableChoice({ choice, index, itemLabel, media, onLabel, onRemove }: {
  choice: Choice; index: number; itemLabel: string; media?: React.ReactNode; onLabel: (label: string) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: choice.name });
  const fields = <>
    <Button ref={setActivatorNodeRef} type="button" variant="ghost" size="icon-sm" className="shrink-0 cursor-grab touch-none text-muted-foreground" aria-label={`Move answer “${choice.label || index + 1}”`} {...attributes} {...listeners}><GripVertical /></Button>
    <Input aria-label={`${itemLabel} ${index + 1}`} value={choice.label} onChange={(event) => onLabel(event.target.value)} />
    <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remove ${choice.label || `answer ${index + 1}`}`} onClick={onRemove}><X /></Button>
  </>;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(media ? "grid min-w-0" : "flex items-center gap-1", isDragging && "relative z-10 rounded-md bg-background shadow-md")}>
      {media ? <><div className="flex min-w-0 items-center gap-1">{fields}</div>{media}</> : fields}
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
        <PollSelect id={id} value={current} emptyLabel="None" options={draft.groups.filter((entry) => !isTableGroup(entry) || entry.name === current).map((entry) => ({ value: entry.name, label: entry.label || entry.name }))}
          onChange={(value) => setGroups(value ? [...(draft.groups.find((entry) => entry.name === value)?.groups ?? []), value] : [])} />
        <Button type="button" variant="outline" onClick={addSection}><Plus data-icon="inline-start" />New</Button>
      </div>
      {group && isTableGroup(group) ? <FieldDescription>This imported table is kept as written. The Matrix editor needs direct single-choice rows with a shared answer list.</FieldDescription> : null}
      {group ? <Input aria-label="Section heading" value={group.label} onChange={(event) => onChange({ ...draft, groups: draft.groups.map((entry) => (entry.name === group.name ? { ...entry, label: event.target.value } : entry)) })} /> : null}
    </FormField>
  );
}

function DisplayPicker({ draft, question, locked, onChange }: {
  draft: SurveyDefinition; question: Parameters<typeof choiceDisplay>[1]; locked: boolean; onChange: ChangeDraft;
}) {
  const display = choiceDisplay(draft, question);
  const options: Array<{ value: string; label: string }> = Object.entries(CHOICE_DISPLAYS)
    .filter(([value]) => value !== "likert" || question.kind === "select_one")
    .map(([value, label]) => ({ value, label }));
  if (display === "advanced") options.push({ value: "advanced", label: "Imported display" });
  const choose = (value: ChoiceDisplay | "advanced") => {
    if (value === "advanced" || value === display) return;
    const otherQuestions = draft.questions.some((other) => other.name !== question.name && hasChoices(other) && other.list === question.list);
    const choices = choicesFor(draft, question);
    const seed = value === "likert" && !locked && !otherQuestions && choices.every((choice) => /^Answer \d+$/.test(choice.label) && !choice.image);
    const appearance = value === "list" && choices.some((choice) => choice.image) ? "list" : DISPLAY_APPEARANCES[value];
    onChange({
      ...draft, questions: draft.questions.map((entry) => entry === question ? { ...question, appearance: appearance || undefined, imageCards: value === "images" } : entry),
      lists: seed ? draft.lists.map((list) => list.name === question.list ? { ...list, choices: likertChoices() } : list) : draft.lists
    });
  };
  const id = useId();
  return <FieldGroup>
    <FormField id={id} label="Display">
      <PollSelect id={id} value={display} options={options} onChange={(value) => choose(value as ChoiceDisplay | "advanced")} />
      {display === "advanced" ? <FieldDescription>Byline shows this as a list. The spreadsheet appearance is under Advanced.</FieldDescription> : null}
    </FormField>
    {display === "images" ? <SwitchField label="Allow multiple answers" description={locked ? "Published questions keep the same answer type across versions." : undefined}
      checked={question.kind === "select_multiple"} disabled={locked} onChange={(multiple) => {
        const kind = multiple ? "select_multiple" : "select_one";
        onChange((current) => ({
          ...current, questions: current.questions.map((entry) => entry.name === question.name ? { ...question, kind } : entry),
          settings: multiple ? { ...current.settings, breakdowns: current.settings.breakdowns.filter((name) => name !== question.name) } : current.settings
        }));
      }} /> : null}
  </FieldGroup>;
}

function QuestionPreview({ draft, item }: { draft: SurveyDefinition; item: RespondentScreen }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button type="button" variant="outline" size="sm" className="min-h-11 w-fit" />}>Preview question<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {open ? <QuestionPreviewBody draft={draft} item={item} /> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuestionPreviewBody({ draft, item }: { draft: SurveyDefinition; item: RespondentScreen }) {
  const definition = useMemo(() => previewItem(draft, item), [draft, item]);
  const images = useDraftChoiceImages(definition);
  return <div className="max-h-[32rem] min-h-48 overflow-auto rounded-lg border" data-polls-question-preview="">
    <SurveyRunner key={JSON.stringify([definition.groups, definition.questions, definition.lists])} definition={definition} images={images} mode="preview" embedded skipWelcome
      onSubmit={async () => ({ status: "saved" })} />
  </div>;
}

function MatrixInspector({ draft, matrix, position, count, published, onChange, onMove, onDuplicate, onRemove }: {
  draft: SurveyDefinition; matrix: Matrix; position: number; count: number; published: ReadonlySet<string>;
  onChange: ChangeDraft; onMove: (delta: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const { group, rows, list } = matrix;
  const start = draft.questions.indexOf(rows[0]);
  const replace = (patch: Partial<Group>) => onChange((current) => ({
    ...current, groups: current.groups.map((entry) => entry.name === group.name ? { ...entry, ...patch } : entry)
  }));
  const setRows = (next: Matrix["rows"]) => onChange((current) => ({
    ...current, questions: [...current.questions.slice(0, start), ...next, ...current.questions.slice(start + rows.length)],
    settings: { ...current.settings, breakdowns: current.settings.breakdowns.filter((name) => !rows.some((row) => row.name === name) || next.some((row) => row.name === name)) }
  }));
  const addRow = () => {
    const name = uniqueName(`${group.name}_row_${rows.length + 1}`, new Set([...definitionNames(draft), ...published]));
    setRows([...rows, { kind: "select_one", list, name, label: `Statement ${rows.length + 1}`, groups: [...group.groups, group.name], required: rows.every((row) => row.required) }]);
  };
  const sectionId = useId();
  const allRequired = rows.every((row) => row.required);
  const mixed = !allRequired && rows.some((row) => row.required);
  const section = group.groups.at(-1);
  const sections = draft.groups.filter((entry) => !isTableGroup(entry) && !entry.groups.includes(group.name) && entry.groups.length < 3);
  return <div className="flex min-w-0 flex-col gap-5" data-polls-inspector="" data-polls-matrix-editor="">
    <div className="flex items-center gap-2">
      <p className="flex-1 text-sm text-muted-foreground">Matrix · {position + 1} of {count}</p>
      <ButtonGroup>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Move matrix up" disabled={position === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Move matrix down" disabled={position === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
      </ButtonGroup>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" aria-label="More matrix actions" />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onDuplicate}><Copy />Duplicate matrix</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 />Delete matrix</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <FieldGroup>
      <TextAreaField label="Question" value={group.label} rows={3} maxLength={1000} onChange={(label) => replace({ label })} />
      <TextField label="Hint" optional value={group.hint ?? ""} maxLength={1000} onChange={(hint) => replace({ hint: hint || undefined })} />
      <SwitchField label="Require every row" description={mixed ? "Some imported rows are required. Changing this applies to every row." : undefined}
        checked={allRequired} onChange={(required) => setRows(rows.map((row) => ({ ...row, required })))} />
    </FieldGroup>
    <FieldSet>
      <FieldLegend variant="label">Rows</FieldLegend>
      <ol className="m-0 grid list-none gap-2 p-0">
        {rows.map((row, i) => <li key={row.name} className="flex min-w-0 items-center gap-1">
          <Input aria-label={`Row ${i + 1}`} className="min-w-0" value={row.label} onChange={(event) => {
            const label = event.target.value;
            setRows(rows.map((entry) => entry === row ? { ...entry, label } : entry));
          }} />
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 any-pointer-coarse:size-11" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => setRows(arrayMove(rows, i, i - 1))}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 any-pointer-coarse:size-11" aria-label={`Move row ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => setRows(arrayMove(rows, i, i + 1))}><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 any-pointer-coarse:size-11" aria-label={`Remove row ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((entry) => entry !== row))}><X /></Button>
        </li>)}
      </ol>
      <Button type="button" variant="outline" size="sm" className="min-h-11 self-start" onClick={addRow}><Plus />Add row</Button>
    </FieldSet>
    <ChoicesEditor draft={draft} question={rows[0]} columns locked={draft.questions.some((question) => hasChoices(question) && question.list === list && published.has(question.name))} onChange={onChange} />
    <QuestionPreview draft={draft} item={{ kind: "matrix", name: group.name, matrix }} />
    <Separator />
    <FormField id={sectionId} label="Section">
      <PollSelect id={sectionId} value={section ?? ""} emptyLabel="None" options={sections.map(({ name, label }) => ({ value: name, label: label || name }))}
        onChange={(value) => {
          const selected = sections.find((entry) => entry.name === value);
          if (value !== (section ?? "")) onChange(changeMatrixSection(draft, group, selected ? [...selected.groups, selected.name] : []));
        }} />
    </FormField>
    <RuleEditor key={group.relevant ?? ""} definition={draft} target={{
      kind: "section", name: group.name, item: group, start, members: rows.map((_row, i) => start + i), builder: readCondition(draft, group.relevant)
    }} onApply={(relevant) => replace({ relevant })} />
    <Collapsible>
      <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2.5 w-fit" />}>Advanced<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <Identifier label="Matrix identifier" value={group.name} />
        <Identifier label="Shared answer list" value={list} />
        {rows.map((row) => <div key={row.name} className="grid gap-2">
          <Identifier label={row.label || "Row identifier"} value={row.name} />
          {row.relevant ? <p className="text-sm text-muted-foreground">{describeCondition(draft, row.relevant)}</p> : null}
        </div>)}
      </CollapsibleContent>
    </Collapsible>
  </div>;
}

function Identifier({ label, value }: { label: string; value: string }) {
  const id = useId();
  return <FormField id={id} label={label}><Input id={id} className="font-mono text-xs" value={value} readOnly /></FormField>;
}
