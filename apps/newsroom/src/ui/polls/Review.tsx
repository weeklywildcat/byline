"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { CircleAlert, GitBranch, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { choicesFor, describeCondition, expressionValue, visibleQuestionNames } from "../../polls/engine/logic";
import { isAnswerable, KIND_LABELS, type Answers, type Question, type SurveyDefinition } from "../../polls/engine/types";
import type { ImportIssue } from "../../polls/engine/xlsform";
import { SurveyRunner } from "./runner/SurveyRunner";

/** Problems grouped by sheet, each with its row: what to fix in the workbook. */
export function IssueList({ issues, max = 50 }: { issues: readonly ImportIssue[]; max?: number }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.sheet.localeCompare(b.sheet) || (a.row ?? 0) - (b.row ?? 0));
  return (
    <ul className="divide-y rounded-lg border" data-polls-issues="">
      {sorted.slice(0, max).map((issue, index) => (
        <li key={index} className="flex items-start gap-3 px-4 py-2.5 text-sm">
          {issue.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Error" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Warning" />}
          <span className="w-32 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{issue.sheet}{issue.row ? ` · row ${issue.row}` : ""}{issue.column ? ` · ${issue.column}` : ""}</span>
          <span className="min-w-0 flex-1">{issue.message}</span>
        </li>
      ))}
      {sorted.length > max ? <li className="px-4 py-2.5 text-sm text-muted-foreground">{sorted.length - max} more…</li> : null}
    </ul>
  );
}

/** Every question in order, with its section, type, choices and the conditions that show it, in words. */
export function QuestionMap({ definition, issues = [], onSelect, selected }: { definition: SurveyDefinition; issues?: readonly ImportIssue[]; onSelect?: (name: string) => void; selected?: string | null }) {
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
        return (
          <li key={question.name} className="flex flex-col">
            {header ? (
              <div className="mt-6 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 first:mt-0">
                <h3 className="text-xs font-semibold tracking-[0.1em] text-(--poll-accent) uppercase">{header.label || header.name}</h3>
                {header.relevant ? <Condition text={describeCondition(definition, header.relevant)} prefix="Section shown when" /> : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(question.name)}
              className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t py-3 text-left outline-none disabled:cursor-default", onSelect && "hover:bg-muted/50 focus-visible:bg-muted/60", selected === question.name && "bg-muted", question.groups.length > 0 && "pl-2")}
              aria-current={selected === question.name ? "true" : undefined}
            >
              <span className="pt-0.5 text-right font-(family-name:--poll-serif) text-base text-muted-foreground tabular-nums">{isAnswerable(question) ? number : "i"}</span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[0.9375rem] leading-snug font-medium">{question.label || <em className="text-muted-foreground">No label</em>}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{KIND_LABELS[question.kind]}</span>
                  {isAnswerable(question) ? <span>· {question.required ? "Required" : "Optional"}</span> : null}
                  <span className="font-mono">· {question.name}</span>
                </span>
                {question.kind === "select_one" || question.kind === "select_multiple" ? (
                  <span className="flex flex-wrap gap-1">{choicesFor(definition, question).map((choice) => <Badge key={choice.name} variant="outline" className="font-normal">{choice.label}</Badge>)}</span>
                ) : null}
                {question.kind === "range" ? <span className="text-xs text-muted-foreground">Scale {question.start}–{question.end}{question.startLabel ? ` (${question.startLabel} → ${question.endLabel ?? ""})` : ""}</span> : null}
                {question.relevant ? <Condition text={describeCondition(definition, question.relevant)} /> : null}
                {isAnswerable(question) && question.constraint ? <span className="text-xs text-muted-foreground">Rule: <code className="font-mono">{question.constraint}</code></span> : null}
                {own.map((issue, index) => <span key={index} className={cn("text-xs font-medium", issue.severity === "error" ? "text-destructive" : "text-amber-700")}>{issue.message}</span>)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Condition({ text, prefix = "Shown when" }: { text: string; prefix?: string }) {
  return <span className="inline-flex items-start gap-1.5 text-xs text-(--poll-accent)"><GitBranch className="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{prefix} {text}</span></span>;
}

/**
 * The real respondent screen with a path tracker beside it: answer as a
 * student would and watch which questions apply. Nothing is saved.
 */
export function PreviewPanel({ definition }: { definition: SurveyDefinition }) {
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState<{ answers: Answers; current: string | null }>({ answers: {}, current: null });
  const onProgress = useCallback((state: { answers: Answers; current: string | null }) => setProgress(state), []);
  const visible = useMemo(() => visibleQuestionNames(definition, progress.answers), [definition, progress.answers]);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]" data-polls-preview="">
      <div className="h-[min(78dvh,52rem)] min-h-[34rem] overflow-y-auto rounded-lg">
        <SurveyRunner key={run} definition={definition} mode="preview" embedded onProgress={onProgress} onSubmit={async () => ({ status: "saved" })} />
      </div>
      <aside className="flex flex-col gap-3 lg:max-h-[min(78dvh,52rem)] lg:overflow-y-auto" aria-label="Path through the poll">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">This path</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setRun((n) => n + 1)}><RotateCcw data-icon="inline-start" />Start again</Button>
        </div>
        <p className="text-xs text-muted-foreground">Answer differently to test another branch. Hidden questions are not applicable and keep no answer.</p>
        <ol className="flex flex-col divide-y rounded-lg border text-sm">
          {definition.questions.map((question: Question) => {
            const shown = visible.has(question.name);
            const state = progress.answers[question.name];
            const value = state?.status === "answered" ? labelFor(definition, question, expressionValue(state)) : state?.status === "skipped" ? "Skipped" : shown ? "" : "Not applicable";
            return (
              <li key={question.name} className={cn("flex flex-col gap-0.5 px-3 py-2", !shown && "text-muted-foreground/60", progress.current === question.name && "bg-(--poll-accent-soft)")}>
                <span className={cn("line-clamp-1", !shown && "line-through")}>{question.label}</span>
                {value ? <span className={cn("text-xs", state?.status === "answered" ? "font-medium text-foreground" : "text-muted-foreground")}>{value}</span> : null}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function labelFor(definition: SurveyDefinition, question: Question, value: string | number | boolean): string {
  if (question.kind === "select_one" || question.kind === "select_multiple") {
    const choices = choicesFor(definition, question);
    return String(value).split(" ").map((name) => choices.find((choice) => choice.name === name)?.label ?? name).join(", ");
  }
  return String(value);
}
