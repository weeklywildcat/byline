"use client";

import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { type CSSProperties } from "react";
import { choicesFor } from "../../../polls/engine/logic";
import type { Matrix } from "../../../polls/engine/presentation";
import type { Answers, AnswerState, SurveyDefinition } from "../../../polls/engine/types";

const GRID = "landscape:@2xl:grid landscape:@2xl:grid-cols-(--poll-matrix-grid) landscape:@2xl:items-stretch landscape:@2xl:gap-1";

export function MatrixAnswer({ matrix, definition, answers, problemRow, onAnswer }: {
  matrix: Matrix;
  definition: SurveyDefinition;
  answers: Answers;
  problemRow?: string;
  onAnswer: (name: string, state: AnswerState) => void;
}) {
  const choices = choicesFor(definition, matrix.rows[0]);
  const wide = choices.length <= 7;
  return (
    <div className="@container min-w-0" data-poll-matrix="">
      <div className="grid min-w-0 gap-3" style={{ "--poll-matrix-grid": `minmax(144px, 1.55fr) repeat(${choices.length}, minmax(0, 1fr))` } as CSSProperties}>
        {wide ? <div className={`hidden ${GRID}`} aria-hidden="true">
          <span />
          {choices.map((choice) => <span key={choice.name} className="self-end px-1 text-center text-sm font-medium wrap-anywhere">{choice.label}</span>)}
        </div> : null}
        {matrix.rows.map((row) => {
          const state = answers[row.name];
          const labelId = `matrix-row-${row.name}`;
          return (
            <RadioGroup key={row.name} id={`answers-${row.name}`} value={state?.status === "answered" ? String(state.value) : null}
              onValueChange={(value) => onAnswer(row.name, { status: "answered", value: String(value) })}
              aria-labelledby={labelId} aria-required={row.required} aria-invalid={problemRow === row.name || undefined}
              aria-describedby={problemRow === row.name ? `problem-${matrix.group.name}` : undefined}
              className={`grid min-w-0 gap-1 rounded-lg border p-2 ${wide ? GRID : ""}`}>
              <div className="min-w-0 self-center px-2 py-2">
                <p id={labelId} className="font-medium wrap-anywhere">{row.label}</p>
                {row.hint ? <p className="text-sm wrap-anywhere text-muted-foreground">{row.hint}</p> : null}
              </div>
              {choices.map((choice) => {
                const id = `matrix-${row.name}-${choice.name}`;
                return <label key={choice.name} htmlFor={id}
                  className={`flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 has-data-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-ring ${wide ? "landscape:@2xl:justify-center" : ""}`}>
                  <RadioGroupItem id={id} value={choice.name} aria-label={choice.label} className="size-5 shrink-0" />
                  <span className={`wrap-anywhere ${wide ? "landscape:@2xl:sr-only" : ""}`}>{choice.label}</span>
                </label>;
              })}
            </RadioGroup>
          );
        })}
      </div>
    </div>
  );
}
