"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { CircleAlert, GitBranch, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { choicesFor, describeCondition, expressionValue, visibleQuestionNames } from "../../polls/engine/logic";
import { isAnswerable, KIND_LABELS, type Answers, type Question, type SurveyDefinition } from "../../polls/engine/types";
import type { ImportIssue } from "../../polls/engine/xlsform";
import { useDraftChoiceImages } from "./ChoiceMedia";
import { respondentScreens, screenQuestions } from "../../polls/engine/presentation";
import type { ChoiceImages } from "../../polls/engine/types";
import { SurveyRunner } from "./runner/SurveyRunner";

/** Problems in the workbook, errors first, each with the sheet and row to fix. */
export function IssueList({ issues, max = 50 }: { issues: readonly ImportIssue[]; max?: number }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.sheet.localeCompare(b.sheet) || (a.row ?? 0) - (b.row ?? 0));
  return (
    <ItemGroup className="gap-0 rounded-lg border" data-polls-issues="">
      {sorted.slice(0, max).map((issue, index) => (
        <Item key={index} size="xs" className={cn("flex-nowrap items-start rounded-none", index && "border-t-border")}>
          <ItemMedia variant="icon" className={issue.severity === "error" ? "text-destructive" : "text-warning"}>
            {issue.severity === "error" ? <CircleAlert aria-label="Error" /> : <TriangleAlert aria-label="Warning" />}
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="font-normal">{issue.message}</ItemTitle>
            <ItemDescription className="font-mono text-xs">{issue.sheet}{issue.row ? ` · row ${issue.row}` : ""}{issue.column ? ` · ${issue.column}` : ""}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
      {sorted.length > max ? <Item size="xs" className="rounded-none border-t-border text-muted-foreground">{sorted.length - max} more…</Item> : null}
    </ItemGroup>
  );
}

/**
 * Every question in order, with its section, type, choices and the
 * conditions that show it, in words. With `onSelect` each question is a
 * selectable row of the editor's list.
 */
export function QuestionMap({ definition, issues = [], onSelect, selected, compact = false }: { definition: SurveyDefinition; issues?: readonly ImportIssue[]; onSelect?: (name: string) => void; selected?: string | null; compact?: boolean }) {
  const groups = new Map(definition.groups.map((group) => [group.name, group]));
  let number = 0;
  let lastSection = "";
  return (
    <ol className="flex flex-col" data-polls-question-map="">
      {definition.questions.map((question) => {
        const section = question.groups.at(-1) ?? "";
        const header = section !== lastSection && section ? groups.get(section) : null;
        lastSection = section;
        const own = issues.filter((issue) => question.source?.row !== undefined && issue.row === question.source.row && issue.sheet === question.source.sheet);
        if (isAnswerable(question)) number++;
        const current = selected === question.name;
        const body = (
          <>
            <span className="w-6 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums" aria-hidden={!isAnswerable(question) || undefined}>{isAnswerable(question) ? number : <Info className="ml-auto size-4" aria-label="Information" />}</span>
            <ItemContent className="min-w-0">
              <ItemTitle className="leading-snug">{question.label || <em className="font-normal text-muted-foreground">No label</em>}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {KIND_LABELS[question.kind]}{isAnswerable(question) ? ` · ${question.required ? "Required" : "Optional"}` : ""}{compact ? null : <> · <span className="font-mono">{question.name}</span></>}
              </ItemDescription>
              {!compact && (question.kind === "select_one" || question.kind === "select_multiple") ? (
                <span className="mt-1 flex flex-wrap gap-1">{choicesFor(definition, question).map((choice) => <Badge key={choice.name} variant="outline" className="font-normal">{choice.label}</Badge>)}</span>
              ) : null}
              {!compact && question.kind === "range" ? <ItemDescription>Scale {question.start}–{question.end}{question.startLabel ? ` (${question.startLabel} → ${question.endLabel ?? ""})` : ""}</ItemDescription> : null}
              {question.relevant ? <Condition text={describeCondition(definition, question.relevant)} /> : null}
              {!compact && isAnswerable(question) && question.constraint ? <ItemDescription>Rule: <code className="font-mono">{question.constraint}</code></ItemDescription> : null}
              {own.map((issue, index) => <span key={index} className={cn("text-xs font-medium", issue.severity === "error" ? "text-destructive" : "text-warning")}>{issue.message}</span>)}
            </ItemContent>
          </>
        );
        return (
          <li key={question.name} className="flex flex-col">
            {header ? (
              <div className="mt-5 mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 first:mt-0">
                <h3 className="text-sm font-medium text-muted-foreground">{header.label || header.name}</h3>
                {header.relevant ? <Condition text={describeCondition(definition, header.relevant)} prefix="Section shown when" /> : null}
              </div>
            ) : null}
            {onSelect ? (
              <Item
                size="sm"
                className={cn("flex-nowrap items-start text-left", current ? "bg-muted" : "hover:bg-muted/50")}
                render={<button type="button" onClick={() => onSelect(question.name)} aria-current={current ? "true" : undefined} data-polls-question={question.name} />}
              >
                {body}
              </Item>
            ) : (
              <Item size="sm" className="flex-nowrap items-start rounded-none border-b-border">{body}</Item>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Condition({ text, prefix = "Shown when" }: { text: string; prefix?: string }) {
  return <span className="mt-0.5 inline-flex items-start gap-1.5 text-xs text-muted-foreground"><GitBranch className="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{prefix} {text}</span></span>;
}

/**
 * The real respondent screen with a path tracker beside it: answer as a
 * student would and watch which questions apply, and why. Nothing is saved.
 */
export function PreviewPanel({ definition, frozenImages }: { definition: SurveyDefinition; frozenImages?: ChoiceImages }) {
  const draftImages = useDraftChoiceImages(frozenImages ? undefined : definition);
  const images = frozenImages ?? draftImages;
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState<{ answers: Answers; current: string | null }>({ answers: {}, current: null });
  const onProgress = useCallback((state: { answers: Answers; current: string | null }) => setProgress(state), []);
  const visible = useMemo(() => visibleQuestionNames(definition, progress.answers), [definition, progress.answers]);
  const screens = useMemo(() => respondentScreens(definition), [definition]);
  const groups = new Map(definition.groups.map((group) => [group.name, group]));
  const conditions = (questions: Question[]) => [...new Set(questions.flatMap((question) => [
    ...question.groups.map((name) => groups.get(name)?.relevant), question.relevant
  ]).filter(Boolean))];
  const conditional = screens.filter((screen) => conditions(screenQuestions(screen)).length);
  const branches = conditional.filter((screen) => screenQuestions(screen).some(({ name }) => visible.has(name))).length;
  const restart = () => { setRun((n) => n + 1); setProgress({ answers: {}, current: null }); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]" data-polls-preview="">
      <div className="h-[min(78dvh,52rem)] min-h-[34rem] overflow-y-auto rounded-lg border">
        <SurveyRunner key={run} definition={definition} images={images} mode="preview" embedded onProgress={onProgress} onSubmit={async () => ({ status: "saved" })} />
      </div>
      <aside className="flex flex-col gap-3 lg:max-h-[min(78dvh,52rem)] lg:overflow-y-auto" aria-label="Path through the poll">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">This path</h3>
          <Button type="button" variant="outline" size="sm" onClick={restart}><RotateCcw data-icon="inline-start" />Start again</Button>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {conditional.length
            ? `${branches} of ${conditional.length} conditional ${conditional.length === 1 ? "question applies" : "questions apply"} so far. Start again and answer differently to test another branch. Nothing is saved.`
            : "Every question is asked of everyone. Nothing is saved."}
        </p>
        <ol className="flex flex-col divide-y rounded-lg border text-sm" data-polls-path="">
          {screens.map((screen) => {
            const questions = screenQuestions(screen);
            const shown = questions.some((question) => visible.has(question.name));
            const current = progress.current === screen.name;
            const title = screen.kind === "matrix" ? screen.matrix.group.label : screen.question.label;
            const values = questions.flatMap((question) => {
              const state = progress.answers[question.name];
              if (!state) return [];
              const value = state.status === "answered" ? labelFor(definition, question, expressionValue(state)) : "Skipped";
              return [{ name: question.name, value: screen.kind === "matrix" ? `${question.label} · ${value}` : value }];
            });
            return (
              <li key={screen.name} className={cn("flex flex-col gap-0.5 px-3 py-2", !shown && "text-muted-foreground/70", current && "bg-muted")}
                aria-current={current ? "step" : undefined} data-path-state={shown ? (values.length ? "answered" : "pending") : "not-applicable"}>
                <span className="flex items-start gap-2">
                  <span className={cn("line-clamp-2 flex-1", !shown && "line-through")}>{title}</span>
                  {!shown ? <Badge variant="outline" className="shrink-0 font-normal">Not asked</Badge> : current ? <Badge variant="secondary" className="shrink-0 font-normal">Now</Badge> : null}
                </span>
                {values.map(({ name, value }) => <span key={name} className="text-xs font-medium wrap-anywhere">{value}</span>)}
                {conditions(questions).map((condition) => (
                  <span key={condition} className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                    <GitBranch className="mt-px size-3 shrink-0" aria-hidden="true" />
                    {shown ? "Asked because " : "Asked only when "}{describeCondition(definition, condition)}
                  </span>
                ))}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function labelFor(definition: SurveyDefinition, question: Question, value: string | number | boolean): string {
  if (question.kind === "acknowledge") return value === "OK" ? "Confirmed" : "";
  if (question.kind === "select_one" || question.kind === "select_multiple" || question.kind === "rank") {
    const choices = choicesFor(definition, question);
    return String(value).split(" ").map((name) => choices.find((choice) => choice.name === name)?.label ?? name).join(question.kind === "rank" ? " → " : ", ");
  }
  return String(value);
}
