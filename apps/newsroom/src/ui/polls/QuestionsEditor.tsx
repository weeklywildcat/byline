"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { FormField, TextAreaField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { choicesFor } from "../../polls/engine/logic";
import { isAnswerable, KIND_LABELS, type Choice, type Question, type QuestionKind, type SurveyDefinition } from "../../polls/engine/types";
import { hasErrors, validateDefinition } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { pollKeys, updateSurvey, type SurveyDetail } from "./api";
import { PollSelect, SwitchField } from "./fields";
import { IssueList, QuestionMap } from "./Review";

/**
 * The visual editor for a poll's draft: wording, choices, sections and
 * conditions, without a spreadsheet. It edits the draft only; Publish makes
 * the immutable version. Names of questions already published are fixed, so
 * results stay comparable across versions.
 */

const NEW_KINDS: QuestionKind[] = ["select_one", "select_multiple", "range", "text", "integer", "note"];
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "answer";

function uniqueName(base: string, taken: Set<string>): string {
  let name = /^[a-z_]/.test(base) ? base : `q_${base}`;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
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

export function QuestionsEditor({ id, data }: { id: number; data: SurveyDetail }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [draft, setDraft] = useState<SurveyDefinition>(() => structuredClone(data.draft!));
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(draft.questions[0]?.name ?? null);
  const issues = useMemo(() => validateDefinition(draft), [draft]);
  const published = useMemo(() => new Set((data.versions.length && data.current ? data.current.definition.questions : []).map((question) => question.name)), [data]);
  const save = useMutation({
    mutationFn: () => updateSurvey(api, id, { draft, draftRevision: data.survey.draftRevision ?? 0 }),
    onSuccess: (next) => { setDirty(false); queries.setQueryData(pollKeys.survey(id), next); }
  });
  const change = (next: SurveyDefinition) => { setDraft(next); setDirty(true); };
  const index = draft.questions.findIndex((question) => question.name === selected);
  const question = index >= 0 ? draft.questions[index] : null;

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
    const taken = new Set([...draft.questions.map((entry) => entry.name), ...draft.groups.map((entry) => entry.name)]);
    const name = uniqueName(kind === "note" ? "note" : "question", taken);
    const groups = question?.groups ?? [];
    let lists = draft.lists;
    let created: Question;
    if (kind === "select_one" || kind === "select_multiple") {
      const listName = uniqueName(`${name}_choices`, new Set(lists.map((list) => list.name)));
      lists = [...lists, { name: listName, choices: [{ name: "first", label: "First answer" }, { name: "second", label: "Second answer" }] }];
      created = { kind, name, label: "New question", groups, required: false, list: listName };
    } else if (kind === "range") created = { kind, name, label: "New question", groups, required: false, start: 1, end: 5, step: 1 };
    else if (kind === "text") created = { kind, name, label: "New question", groups, required: false, multiline: true };
    else if (kind === "note") created = { kind, name, label: "Information for respondents", groups };
    else created = { kind: kind as "integer" | "decimal", name, label: "New question", groups, required: false };
    const at = index >= 0 ? index + 1 : draft.questions.length;
    change({ ...draft, lists, questions: [...draft.questions.slice(0, at), created, ...draft.questions.slice(at)] });
    setSelected(name);
  };
  const move = (delta: -1 | 1) => {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= draft.questions.length) return;
    const questions = [...draft.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    change({ ...draft, questions });
  };
  const remove = () => {
    if (!question) return;
    const questions = draft.questions.filter((_entry, i) => i !== index);
    change({ ...draft, questions });
    setSelected(questions[Math.min(index, questions.length - 1)]?.name ?? null);
  };
  const duplicate = () => {
    if (!question) return;
    const taken = new Set([...draft.questions.map((entry) => entry.name), ...draft.groups.map((entry) => entry.name)]);
    const copy = { ...structuredClone(question), name: uniqueName(`${question.name}_copy`, taken) };
    change({ ...draft, questions: [...draft.questions.slice(0, index + 1), copy, ...draft.questions.slice(index + 1)] });
    setSelected(copy.name);
  };

  return (
    <div className="flex flex-col gap-4" data-polls-editor="">
      <div className="sticky top-[var(--byline-header-height,0px)] z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur lg:-mx-6 lg:px-6">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" />}><Plus data-icon="inline-start" />Add question</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {NEW_KINDS.map((kind) => <DropdownMenuItem key={kind} onClick={() => add(kind)}>{KIND_LABELS[kind]}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1 text-sm text-muted-foreground" role="status">{save.isPending ? "Saving…" : dirty ? "Unsaved changes" : "Draft saved"}{hasErrors(issues) ? " · has errors" : ""}</span>
        {dirty ? <Button type="button" variant="ghost" onClick={() => { setDraft(structuredClone(data.draft!)); setDirty(false); }}>Discard</Button> : null}
        <Button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : null}Save draft</Button>
      </div>
      {save.isError ? <InlineAlert title="The draft wasn't saved">{(save.error as Error).message}</InlineAlert> : null}
      {issues.some((issue) => issue.severity === "error") ? <IssueList issues={issues.filter((issue) => issue.severity === "error")} max={6} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <div className={cn("min-w-0", question && "hidden lg:block")}>
          {draft.questions.length ? <QuestionMap definition={draft} onSelect={setSelected} selected={selected} /> : <p className="text-muted-foreground">No questions yet. Add one, or import a spreadsheet.</p>}
          <FieldSet className="mt-6 max-w-xl border-t pt-6">
            <FieldLegend>Respondent screens</FieldLegend>
            <FieldGroup>
              <TextAreaField label="Welcome text" hint="Say it's voluntary and anonymous, and how long it takes." value={draft.settings.welcome} rows={3} maxLength={2000} onChange={(welcome) => change({ ...draft, settings: { ...draft.settings, welcome } })} />
              <TextAreaField label="Thank-you text" value={draft.settings.thankYou} rows={2} maxLength={1000} onChange={(thankYou) => change({ ...draft, settings: { ...draft.settings, thankYou } })} />
              <TextField label="Break results down by" hint="Single-choice questions such as grade, separated by spaces." value={draft.settings.breakdowns.join(" ")} onChange={(value) => change({ ...draft, settings: { ...draft.settings, breakdowns: value.split(/[\s,]+/).filter(Boolean) } })} />
            </FieldGroup>
          </FieldSet>
        </div>

        {question ? (
          <aside className="flex min-w-0 flex-col gap-5 rounded-lg border p-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto" aria-label="Edit question">
            <div className="flex items-center gap-1">
              <p className="flex-1 text-xs font-semibold tracking-[0.1em] text-(--poll-accent) uppercase">{KIND_LABELS[question.kind]}</p>
              <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => move(-1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={index === draft.questions.length - 1} onClick={() => move(1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Duplicate" onClick={duplicate}><Copy /></Button>
              <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label="Delete question" onClick={remove}><Trash2 /></Button>
              <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Close" onClick={() => setSelected(null)}><X /></Button>
            </div>
            <TextAreaField label={question.kind === "note" ? "Text" : "Question"} value={question.label} rows={3} maxLength={1000} onChange={(label) => replace({ label })} />
            <TextField label="Hint" optional hint="Shown under the question." value={question.hint ?? ""} maxLength={1000} onChange={(hint) => replace({ hint: hint || undefined })} />
            <TextField label="Name" autoCapitalize="none" autoCorrect="off" spellCheck={false} hint={published.has(question.name) ? "Published questions keep their name, so results stay comparable." : "A permanent identifier used by results and conditions."}
              value={question.name} disabled={published.has(question.name)} onChange={(name) => rename(name.replace(/\s+/g, "_"))} />
            {isAnswerable(question) ? <SwitchField label="Required" description="Optional questions get a Skip button." checked={question.required} onChange={(required) => replace({ required })} /> : null}
            {question.kind === "select_one" || question.kind === "select_multiple" ? <ChoicesEditor draft={draft} question={question} onChange={change} /> : null}
            {question.kind === "range" ? (
              <div className="grid grid-cols-3 gap-3">
                <TextField label="From" type="number" inputMode="numeric" value={String(question.start)} onChange={(value) => replace({ start: Number(value) })} />
                <TextField label="To" type="number" inputMode="numeric" value={String(question.end)} onChange={(value) => replace({ end: Number(value) })} />
                <TextField label="Step" type="number" inputMode="numeric" value={String(question.step)} onChange={(value) => replace({ step: Number(value) })} />
                <div className="col-span-3 grid grid-cols-2 gap-3">
                  <TextField label="Low label" optional value={question.startLabel ?? ""} onChange={(value) => replace({ startLabel: value || undefined })} />
                  <TextField label="High label" optional value={question.endLabel ?? ""} onChange={(value) => replace({ endLabel: value || undefined })} />
                </div>
              </div>
            ) : null}
            {question.kind === "text" ? (
              <SwitchField label="Long answer" description="A larger box for a few sentences." checked={question.multiline} onChange={(multiline) => replace({ multiline })} />
            ) : null}
            <SectionPicker draft={draft} question={question} onChange={change} />
            <ConditionEditor draft={draft} question={question} onChange={(relevant) => replace({ relevant: relevant || undefined })} />
            {isAnswerable(question) ? (
              <Collapsible defaultOpen={Boolean(question.constraint)}>
                <CollapsibleTrigger render={<Button type="button" variant="ghost" className="-ml-2.5 w-fit" />}>Answer rule<ChevronDown data-icon="inline-end" /></CollapsibleTrigger>
                <CollapsibleContent className="mt-2 grid gap-3">
                  <TextField label="Constraint" hint="An XLSForm expression; “.” is the answer." autoCapitalize="none" autoCorrect="off" spellCheck={false} value={question.constraint ?? ""} onChange={(value) => replace({ constraint: value || undefined })} />
                  <TextField label="Message when it fails" value={question.constraintMessage ?? ""} onChange={(value) => replace({ constraintMessage: value || undefined })} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ChoicesEditor({ draft, question, onChange }: { draft: SurveyDefinition; question: Extract<Question, { kind: "select_one" | "select_multiple" }>; onChange: (next: SurveyDefinition) => void }) {
  const choices = choicesFor(draft, question);
  const sharedWith = draft.questions.filter((entry) => entry.name !== question.name && (entry.kind === "select_one" || entry.kind === "select_multiple") && entry.list === question.list).length;
  const setChoices = (next: Choice[]) => onChange({ ...draft, lists: draft.lists.map((list) => (list.name === question.list ? { ...list, choices: next } : list)) });
  const taken = new Set(choices.map((choice) => choice.name));
  return (
    <FieldSet>
      <FieldLegend variant="label">Answers</FieldLegend>
      {sharedWith ? <FieldDescription>This list is also used by {sharedWith} other question{sharedWith === 1 ? "" : "s"}.</FieldDescription> : null}
      <ol className="flex flex-col gap-2">
        {choices.map((choice, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-1.5">
            <Input aria-label={`Answer ${i + 1}`} value={choice.label} onChange={(event) => setChoices(choices.map((entry, j) => (j === i ? { ...entry, label: event.target.value } : entry)))} />
            <Input aria-label={`Answer ${i + 1} name`} className="font-mono text-xs" value={choice.name} onChange={(event) => setChoices(choices.map((entry, j) => (j === i ? { ...entry, name: event.target.value.replace(/\s+/g, "_") } : entry)))} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${choice.label}`} onClick={() => setChoices(choices.filter((_entry, j) => j !== i))}><X /></Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setChoices([...choices, { name: uniqueName(slug(`answer ${choices.length + 1}`), taken), label: `Answer ${choices.length + 1}` }])}><Plus data-icon="inline-start" />Add answer</Button>
    </FieldSet>
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
        <Button type="button" variant="outline" onClick={addSection}>New</Button>
      </div>
      {group ? <Input aria-label="Section heading" value={group.label} onChange={(event) => onChange({ ...draft, groups: draft.groups.map((entry) => (entry.name === group.name ? { ...entry, label: event.target.value } : entry)) })} /> : null}
    </FormField>
  );
}

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
        <TextField label="Condition" hint="An XLSForm condition. Refer to earlier questions as ${name}." autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="${book_report} = 'yes'" value={question.relevant ?? ""} onChange={onChange} />
      ) : (
        <>
          {!rows.length ? <FieldDescription>Always.</FieldDescription> : null}
          {rows.length > 1 ? (
            <PollSelect label="How conditions combine" className="w-48" value={join} options={[{ value: "and", label: "When all are true" }, { value: "or", label: "When any is true" }]} onChange={(value) => write(rows, value === "or" ? "or" : "and")} />
          ) : null}
          {rows.map((row, i) => {
            const target = earlier.find((entry) => entry.name === row.question);
            const options = target ? choicesFor(draft, target) : [];
            const set = (patch: Partial<Condition>) => write(rows.map((entry, j) => (j === i ? { ...entry, ...patch } : entry)));
            return (
              <div key={i} className="grid gap-1.5 rounded-lg bg-muted/50 p-2">
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
