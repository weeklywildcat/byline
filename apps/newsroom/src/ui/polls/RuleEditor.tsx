"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { FieldDescription, FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { TextAreaField } from "@byline/newsroom-ui/components/form-fields";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { isConditionSource, isNumeric, newCondition, OPERATOR_LABELS, operatorsFor, writeConditions, type Condition, type ConditionJoin } from "../../polls/engine/condition-builder";
import { choicesFor, describeCondition } from "../../polls/engine/logic";
import { relevanceProblem, type LogicTarget } from "../../polls/engine/logic-map";
import { type SurveyDefinition } from "../../polls/engine/types";
import { PollSelect } from "./fields";

export function RuleEditor({ definition, target, seed, focusedRow, onApply, onCancel }: {
  definition: SurveyDefinition;
  target: LogicTarget;
  seed?: Condition;
  focusedRow?: number;
  onApply: (relevant: string | undefined) => void;
  onCancel?: () => void;
}) {
  const builder = target.builder;
  const original = target.item.relevant ?? "";
  const [raw, setRaw] = useState(original);
  const [advanced, setAdvanced] = useState(builder.kind === "advanced" || builder.kind === "invalid");
  const [rows, setRows] = useState(() => [
    ...(builder.kind === "simple" ? builder.rows : []),
    ...(seed && !(builder.kind === "simple" && builder.rows.some((row) => row.question === seed.question && row.op === seed.op && row.value === seed.value)) ? [seed] : [])
  ]);
  const [join, setJoin] = useState<ConditionJoin>(builder.kind === "simple" ? builder.join : "and");
  const [editing, setEditing] = useState(Boolean(seed));
  const [problem, setProblem] = useState<string | null>(null);
  const earlier = definition.questions.slice(0, target.start).filter(isConditionSource);
  const reset = () => {
    setEditing(false);
    setProblem(null);
    setRows(builder.kind === "simple" ? builder.rows : []);
    setJoin(builder.kind === "simple" ? builder.join : "and");
    setRaw(original);
    setAdvanced(builder.kind === "advanced" || builder.kind === "invalid");
  };
  const changeRows = (next: Condition[]) => {
    setRows(next);
    setEditing(true);
    setProblem(null);
  };
  const apply = () => {
    try {
      const expression = advanced ? raw : writeConditions(definition, join, rows);
      const relevant = expression.trim() ? expression : undefined;
      const issue = relevanceProblem(definition, target, relevant);
      if (issue) { setProblem(issue); return; }
      onApply(relevant);
      setEditing(false);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Check the condition.");
    }
  };

  return (
    <FieldGroup className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{target.kind === "section" ? "Show this section" : "Show this question"}</p>
        <Button type="button" variant="ghost" size="sm" className="poll-logic-touch" onClick={() => {
          if (advanced) {
            setAdvanced(false);
            setEditing(true);
            setProblem(null);
          } else {
            try {
              setRaw(editing ? writeConditions(definition, join, rows) : original);
              setAdvanced(true);
              setProblem(null);
            } catch (error) { setProblem((error as Error).message); }
          }
        }}>{advanced ? (builder.kind === "simple" || builder.kind === "empty" ? "Use the builder" : "Replace with builder") : "Write it"}</Button>
      </div>
      {advanced ? (
        <>
          {builder.kind === "advanced" ? <FieldDescription>The visual builder cannot fully represent this Advanced condition. Keeping it here preserves the expression.</FieldDescription> : null}
          {builder.kind === "invalid" ? <p className="text-sm text-destructive">{builder.message}</p> : null}
          {seed && builder.kind !== "simple" && builder.kind !== "empty" ? <FieldDescription>To use the new connection, edit this expression or replace it with the builder.</FieldDescription> : null}
          {original && builder.kind === "advanced" ? <p className="text-sm wrap-anywhere">{describeCondition(definition, original)}</p> : null}
          <TextAreaField label="Condition" hint={'XLSForm expression. Refer to an earlier question as ${identifier}.'}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} rows={3} maxLength={1000} value={raw}
            onChange={(value) => { setRaw(value); setEditing(true); setProblem(null); }} />
        </>
      ) : (
        <>
          {!rows.length ? <FieldDescription>{editing && original ? "Applying with no conditions clears the display rule." : target.kind === "section" ? "This section has no condition of its own." : "This question has no condition of its own."}</FieldDescription> : null}
          {rows.length > 1 ? (
            <PollSelect label="How conditions combine" value={join} options={[{ value: "and", label: "When all are true" }, { value: "or", label: "When any is true" }]}
              onChange={(value) => { setJoin(value === "or" ? "or" : "and"); setEditing(true); }} />
          ) : null}
          {rows.map((row, index) => {
            const source = earlier.find((question) => question.name === row.question);
            const options = source ? choicesFor(definition, source) : [];
            const sourceOptions = earlier.map((question) => ({ value: question.name, label: question.label || "Untitled question" }));
            if (!source) sourceOptions.push({ value: row.question, label: definition.questions.find((question) => question.name === row.question)?.label || "Unavailable question" });
            const set = (patch: Partial<Condition>) => changeRows(rows.map((entry, position) => position === index ? { ...entry, ...patch } : entry));
            return (
              <div key={index} className={`grid min-w-0 gap-1.5 border-l-2 pl-3 ${index === focusedRow ? "border-l-primary" : ""}`}>
                <div className="flex min-w-0 gap-1.5">
                  <PollSelect label="Earlier question" value={row.question} options={sourceOptions} onChange={(value) => {
                    const question = earlier.find((entry) => entry.name === value);
                    if (question) set(newCondition(definition, question));
                  }} />
                  <Button type="button" variant="ghost" size="icon" className="poll-logic-touch shrink-0" aria-label={`Remove condition ${index + 1}`}
                    onClick={() => changeRows(rows.filter((_entry, position) => position !== index))}><X /></Button>
                </div>
                <PollSelect label="Comparison" value={row.op} options={(source ? operatorsFor(source) : [row.op]).map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
                  onChange={(value) => set({ op: value as Condition["op"], value: row.value || options[0]?.name || (source && isNumeric(source) ? "0" : "") })} />
                {row.op === "answered" || row.op === "confirmed" ? null : options.length ? (
                  <PollSelect label="Answer" value={row.value} options={options.map((choice) => ({ value: choice.name, label: choice.label }))} onChange={(value) => set({ value })} />
                ) : (
                  <Input value={row.value} inputMode={source && isNumeric(source) ? "decimal" : undefined} aria-label="Comparison value"
                    onChange={(event) => set({ value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="poll-logic-touch self-start" disabled={!earlier.length} onClick={() => {
            const question = earlier.at(-1);
            if (question) changeRows([...rows, newCondition(definition, question)]);
          }}><Plus data-icon="inline-start" />Only when…</Button>
        </>
      )}
      {problem ? <p role="alert" className="text-sm wrap-anywhere text-destructive">{problem}</p> : null}
      {editing || onCancel ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="poll-logic-touch" disabled={!editing} onClick={apply}>Apply</Button>
          <Button type="button" className="poll-logic-touch" variant="outline" onClick={onCancel ?? reset}>Cancel</Button>
        </div>
      ) : null}
    </FieldGroup>
  );
}
