"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useId, useState } from "react";
import { answerProblem, choicesFor, rangeValues, TEXT_ANSWER_MAX } from "../../polls/engine/logic";
import { type AnswerableQuestion, type Answers, type AnswerState, type SurveyDefinition } from "../../polls/engine/types";
import { RankAnswer } from "./runner/RankAnswer";
import { PollSelect } from "./fields";

export function TestPathAnswer({ definition, question, answers, onAnswer }: {
  definition: SurveyDefinition;
  question: AnswerableQuestion;
  answers: Answers;
  onAnswer: (answer: AnswerState | null) => void;
}) {
  const state = Object.hasOwn(answers, question.name) ? answers[question.name] : undefined;
  const value = state?.status === "answered" ? state.value : "";
  const [typed, setTyped] = useState(String(value));
  const [multiple, setMultiple] = useState(() => new Set(Array.isArray(value) ? value : []));
  const choiceId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const commit = (answer: AnswerState | null) => {
    const issue = answer ? answerProblem(definition, question, answer, answers) : null;
    setProblem(issue);
    if (!issue) onAnswer(answer);
  };
  const typedAnswer = () => {
    if (!typed.trim()) { commit(null); return; }
    if (question.kind === "text") { commit({ status: "answered", value: typed }); return; }
    const number = typed.trim().replace(",", ".");
    const grammar = question.kind === "integer" ? /^-?\d+$/ : /^-?(?:\d+\.?\d*|\.\d+)$/;
    commit({ status: "answered", value: grammar.test(number) ? Number(number) : Number.NaN });
  };
  const changeText = (value: string) => { setTyped(value); setProblem(null); };
  const choices = choicesFor(definition, question);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {question.kind === "select_one" ? (
        <PollSelect label="Test answer" value={String(value)} options={choices.map(({ name, label }) => ({ value: name, label }))}
          onChange={(choice) => commit({ status: "answered", value: choice })} />
      ) : question.kind === "select_multiple" ? (
        <div className="grid gap-1">
          {choices.map((choice) => (
            <label htmlFor={`${choiceId}-${choice.name}`} key={choice.name} className="poll-logic-touch flex cursor-pointer items-center gap-2 py-1 text-sm">
              <Checkbox id={`${choiceId}-${choice.name}`} checked={multiple.has(choice.name)} onCheckedChange={(checked) => {
                const next = new Set(multiple);
                if (checked) next.add(choice.name);
                else next.delete(choice.name);
                setMultiple(next);
                setProblem(null);
              }} />
              {choice.label}
            </label>
          ))}
          <Button type="button" className="poll-logic-touch justify-self-start" onClick={() => {
            // SurveyRunner keeps answers in the order of the choice list.
            const ordered = choices.map((choice) => choice.name).filter((name) => multiple.has(name));
            commit(ordered.length ? { status: "answered", value: ordered } : null);
          }}>Set answer</Button>
        </div>
      ) : question.kind === "acknowledge" ? (
        <label className="poll-logic-touch flex items-center gap-2">
          <Checkbox checked={value === "OK"} onCheckedChange={(checked) => commit(checked ? { status: "answered", value: "OK" } : null)} />
          I understand
        </label>
      ) : question.kind === "rank" ? (
        <RankAnswer choices={choices} confirmed={Array.isArray(value) ? value : undefined}
          onConfirm={(order) => commit({ status: "answered", value: order })} onClear={() => commit(null)} />
      ) : question.kind === "range" ? (
        <PollSelect label="Test answer" value={String(value)} options={rangeValues(question).map((step) => ({ value: String(step), label: String(step) }))}
          onChange={(choice) => commit({ status: "answered", value: Number(choice) })} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {question.kind === "text" && question.multiline ? (
            <Textarea aria-label="Test answer" rows={3} value={typed} maxLength={TEXT_ANSWER_MAX} onChange={(event) => changeText(event.target.value)} />
          ) : (
            <Input aria-label="Test answer" className="min-w-28 flex-1" inputMode={question.kind === "text" ? "text" : question.kind === "integer" ? "numeric" : "decimal"}
              value={typed} maxLength={TEXT_ANSWER_MAX} onChange={(event) => changeText(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); typedAnswer(); }
              }} />
          )}
          <Button type="button" className="poll-logic-touch" onClick={typedAnswer}>Set answer</Button>
        </div>
      )}
      {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {state ? <Button type="button" variant="ghost" size="sm" className="poll-logic-touch" onClick={() => { setTyped(""); setMultiple(new Set()); commit(null); }}>Clear answer</Button> : null}
        {!question.required && state?.status !== "skipped" ? <Button type="button" variant="ghost" size="sm" className="poll-logic-touch" onClick={() => { setTyped(""); setMultiple(new Set()); commit({ status: "skipped" }); }}>Skip</Button> : null}
        {state?.status === "skipped" ? <span className="text-sm text-muted-foreground">Skipped</span> : null}
      </div>
    </div>
  );
}
