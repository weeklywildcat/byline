"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { trackVisualViewport } from "@byline/newsroom-ui/lib/visual-viewport";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CloudUpload } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { answerProblem, choicesFor, pruneAnswers, rangeValues, screensFor, sectionLabel, TEXT_ANSWER_MAX } from "../../../polls/engine/logic";
import { isAnswerable, type Answers, type AnswerState, type Question, type SurveyDefinition } from "../../../polls/engine/types";

/**
 * The respondent experience (docs/wildcat-polls.md#respondent-mode): one
 * question per screen, large answers, honest progress. The same component
 * runs the kiosk, public links and Poll Studio's preview, with the same logic
 * the server validates against, so the path tested in preview is the path a
 * student takes.
 */

export type SubmitOutcome = { status: "saved" } | { status: "queued" } | { status: "failed"; message: string; retry: boolean };

export type RunnerProps = {
  definition: SurveyDefinition;
  mode: "kiosk" | "public" | "preview";
  onSubmit: (answers: Answers, meta: { startedAt: string; durationMs: number }) => Promise<SubmitOutcome>;
  /** Kiosk: the respondent asked to stop. */
  onStop?: () => void;
  /** Kiosk: shown on the thank-you screen (return to the interviewer). */
  doneAction?: ReactNode;
  /** A control in the top bar (the kiosk's interviewer button). */
  headerAction?: ReactNode;
  /** Preview: follow the path being tested. */
  onProgress?: (state: { answers: Answers; current: string | null; stage: Stage }) => void;
  /** Preview: drawn inside Poll Studio rather than filling the screen. */
  embedded?: boolean;
  /** Preview: jump straight to the questions. */
  skipWelcome?: boolean;
  /** Submitting from outside (the kiosk retries a queued upload) reports here. */
  outcomeOverride?: SubmitOutcome | null;
};

type Stage = "welcome" | "questions" | "done";
type Draft = Record<string, string>;

const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-(--poll-accent)/40";

export function SurveyRunner(props: RunnerProps) {
  const { definition, mode, embedded = false } = props;
  const [stage, setStage] = useState<Stage>(props.skipWelcome ? "questions" : "welcome");
  const [answers, setAnswers] = useState<Answers>({});
  const [drafts, setDrafts] = useState<Draft>({});
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const screens = useMemo(() => screensFor(definition, answers), [answers, definition]);
  const current = screens.find((question) => question.name === currentName) ?? screens[0] ?? null;
  const index = current ? screens.indexOf(current) : 0;

  useEffect(() => props.onProgress?.({ answers, current: stage === "questions" ? current?.name ?? null : null, stage }), [answers, current, stage, props.onProgress]);
  useEffect(() => { if (!embedded && rootRef.current) return trackVisualViewport(rootRef.current); }, [embedded]);
  useEffect(() => { if (stage === "questions") headingRef.current?.focus({ preventScroll: true }); }, [current?.name, stage]);
  useEffect(() => { if (props.outcomeOverride) setOutcome(props.outcomeOverride); }, [props.outcomeOverride]);

  const begin = () => {
    startedAt.current = Date.now();
    setStage("questions");
    setCurrentName(screens[0]?.name ?? null);
    setDirection("forward");
  };

  /** Commits an answer and drops answers to anything it hides, at once. */
  const commit = useCallback((name: string, state: AnswerState | null) => {
    setProblem(null);
    setAnswers((previous) => {
      const next = { ...previous };
      if (state) next[name] = state; else delete next[name];
      return pruneAnswers(definition, next);
    });
  }, [definition]);

  const draftState = (question: Question): AnswerState | null | undefined => {
    if (!isAnswerable(question)) return undefined;
    if (question.kind === "text") {
      const text = drafts[question.name] ?? (answers[question.name]?.status === "answered" ? String((answers[question.name] as { value: unknown }).value) : "");
      return text.trim() ? { status: "answered", value: text } : null;
    }
    if (question.kind === "integer" || question.kind === "decimal") {
      const raw = (drafts[question.name] ?? (answers[question.name]?.status === "answered" ? String((answers[question.name] as { value: unknown }).value) : "")).trim().replace(",", ".");
      if (!raw) return null;
      const number = Number(raw);
      return { status: "answered", value: (question.kind === "integer" ? /^-?\d+$/ : /^-?(\d+\.?\d*|\.\d+)$/).test(raw) && Number.isFinite(number) ? number : Number.NaN };
    }
    return undefined;
  };

  const go = (target: Question | null, dir: "forward" | "back") => {
    setDirection(dir);
    setProblem(null);
    setCurrentName(target?.name ?? null);
    if (!embedded) window.scrollTo({ top: 0 });
  };

  const advance = async (override?: Answers) => {
    const now = override ?? answers;
    const nextScreens = screensFor(definition, now);
    const position = current ? nextScreens.findIndex((question) => question.name === current.name) : -1;
    const next = nextScreens[position + 1] ?? null;
    if (next) { go(next, "forward"); return; }
    await submit(now);
  };

  const next = async () => {
    if (!current) { await submit(answers); return; }
    let nextAnswers = answers;
    const typed = draftState(current);
    if (typed !== undefined) {
      nextAnswers = { ...answers };
      if (typed) nextAnswers[current.name] = typed; else delete nextAnswers[current.name];
    }
    const issue = answerProblem(definition, current, nextAnswers[current.name], nextAnswers);
    if (issue) { setProblem(issue); return; }
    if (typed !== undefined) {
      nextAnswers = pruneAnswers(definition, nextAnswers);
      setAnswers(nextAnswers);
    }
    await advance(nextAnswers);
  };

  const skip = async () => {
    if (!current) return;
    const nextAnswers = pruneAnswers(definition, { ...answers, [current.name]: { status: "skipped" } });
    setDrafts((previous) => { const copy = { ...previous }; delete copy[current.name]; return copy; });
    setAnswers(nextAnswers);
    await advance(nextAnswers);
  };

  const back = () => {
    if (!current || index === 0) { setStage("welcome"); return; }
    go(screens[index - 1], "back");
  };

  const submit = async (final: Answers) => {
    setStage("done");
    setSubmitting(true);
    setOutcome(null);
    const began = startedAt.current ?? Date.now();
    try {
      setOutcome(await props.onSubmit(pruneAnswers(definition, final), { startedAt: new Date(began).toISOString(), durationMs: Date.now() - began }));
    } catch (error) {
      setOutcome({ status: "failed", message: (error as Error).message || "Your answers didn't send.", retry: true });
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => void submit(answers);

  const answerable = current ? isAnswerable(current) : false;
  const hasAnswer = current ? (draftState(current) !== undefined ? Boolean(draftState(current)) : answers[current.name]?.status === "answered") : false;
  const optional = current && isAnswerable(current) ? !current.required : false;
  const isLast = current ? screens.indexOf(current) === screens.length - 1 : true;

  return (
    <div
      ref={rootRef}
      className={cn("byline-polls relative flex flex-col bg-(--poll-paper) text-(--poll-ink)", embedded ? "min-h-full rounded-lg border border-(--poll-rule)" : "min-h-dvh")}
      data-poll-runner={mode}
    >
      <header className={cn("sticky top-0 z-10 bg-(--poll-paper)/95 backdrop-blur-sm", embedded ? "rounded-t-lg" : "pt-(--byline-safe-top)")}>
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center gap-4 px-[max(1.25rem,var(--byline-safe-left))] sm:px-8">
          <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium tracking-[0.08em] text-(--poll-muted) uppercase">{definition.settings.title}</p>
          {stage === "questions" && current ? (
            <p className="shrink-0 text-sm text-(--poll-muted) tabular-nums" aria-live="polite">
              <span className="sr-only">Question </span>{index + 1}<span aria-hidden="true"> / </span><span className="sr-only"> of about </span>{screens.length}
            </p>
          ) : null}
          {stage === "questions" && props.onStop ? (
            <Button type="button" variant="ghost" className="h-11 px-3 text-(--poll-muted)" onClick={props.onStop}>Stop</Button>
          ) : null}
          {props.headerAction}
        </div>
        <div className="h-[3px] w-full bg-(--poll-rule)" aria-hidden="true">
          <div className="h-full bg-(--poll-accent) transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${stage === "welcome" ? 0 : stage === "done" ? 100 : Math.round((index / Math.max(1, screens.length)) * 100)}%` }} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {stage === "welcome" ? (
          <Welcome definition={definition} count={screensFor(definition, {}).filter(isAnswerable).length} onBegin={begin} mode={mode} />
        ) : stage === "done" ? (
          <Done definition={definition} submitting={submitting} outcome={outcome} onRetry={retry} action={props.doneAction} mode={mode} />
        ) : current ? (
          <section
            key={current.name}
            className={cn(
              cn("mx-auto grid w-full max-w-6xl flex-1 content-start gap-8 px-[max(1.25rem,var(--byline-safe-left))] pt-10 sm:px-10 sm:pt-14", embedded ? "pb-10" : "pb-36"),
              "[@media(min-width:1000px)_and_(orientation:landscape)]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] [@media(min-width:1000px)_and_(orientation:landscape)]:gap-16 [@media(min-width:1000px)_and_(orientation:landscape)]:pt-20",
              "animate-in fade-in duration-200 motion-reduce:animate-none",
              direction === "forward" ? "slide-in-from-right-6" : "slide-in-from-left-6"
            )}
            aria-labelledby={`q-${current.name}`}
          >
            <div className="flex flex-col gap-4">
              {sectionLabel(definition, current) ? <p className="text-[0.8125rem] font-semibold tracking-[0.08em] text-(--poll-accent) uppercase">{sectionLabel(definition, current)}</p> : null}
              <h1 id={`q-${current.name}`} ref={headingRef} tabIndex={-1} className="font-(family-name:--poll-serif) text-[2rem] leading-[1.12] font-medium text-balance outline-none sm:text-[2.5rem]">
                {current.label}
              </h1>
              {current.hint ? <p className="max-w-[38rem] text-lg leading-relaxed text-(--poll-muted)">{current.hint}</p> : null}
              {answerable && optional ? <p className="text-sm text-(--poll-muted)">Optional</p> : null}
              <p id={`problem-${current.name}`} role="alert" className={cn("flex items-center gap-2 rounded-lg bg-(--poll-accent-soft) px-4 py-3 text-base font-medium text-(--poll-accent)", problem ? "" : "hidden")}>
                <CircleAlert className="size-5 shrink-0" aria-hidden="true" />{problem}
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {isAnswerable(current) ? (
                <QuestionInput
                  question={current}
                  definition={definition}
                  state={answers[current.name]}
                  draft={drafts[current.name]}
                  onDraft={(value) => { setProblem(null); setDrafts((previous) => ({ ...previous, [current.name]: value })); }}
                  onChoose={(state) => commit(current.name, state)}
                  onEnter={() => void next()}
                  invalid={Boolean(problem)}
                  describedBy={problem ? `problem-${current.name}` : undefined}
                />
              ) : null}
            </div>
          </section>
        ) : (
          <p className="p-10 text-lg">This poll has no questions yet.</p>
        )}
      </main>

      {stage === "questions" && current ? (
        <footer
          className={cn("z-10 border-t border-(--poll-rule) bg-(--poll-paper)/95 backdrop-blur-sm", embedded ? "sticky bottom-0 rounded-b-lg" : "fixed inset-x-0 bottom-(--byline-vv-bottom,0px) pb-(--byline-safe-bottom)")}
        >
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-[max(1.25rem,var(--byline-safe-left))] py-3 sm:px-10">
            <Button type="button" variant="ghost" className="h-14 gap-2 px-5 text-base" onClick={back}>
              <ArrowLeft className="size-5" aria-hidden="true" />Back
            </Button>
            <span className="flex-1" />
            {answerable && optional ? (
              <Button type="button" variant="ghost" className="h-14 px-5 text-base text-(--poll-muted)" onClick={() => void skip()}>Skip</Button>
            ) : null}
            <Button
              type="button"
              className={cn("h-14 min-w-40 gap-2 rounded-full bg-(--poll-ink) px-7 text-base text-(--poll-paper) hover:bg-(--poll-ink)/90", FOCUS)}
              disabled={answerable && !hasAnswer}
              onClick={() => void next()}
            >
              {isLast ? "Submit" : "Next"}
              {isLast ? <Check className="size-5" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />}
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ screens */

function Welcome({ definition, count, onBegin, mode }: { definition: SurveyDefinition; count: number; onBegin: () => void; mode: RunnerProps["mode"] }) {
  const { settings } = definition;
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-[max(1.25rem,var(--byline-safe-left))] py-12 sm:px-10 animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="flex flex-col gap-5">
        <p className="text-[0.8125rem] font-semibold tracking-[0.12em] text-(--poll-accent) uppercase">{mode === "public" ? "The Weekly Wildcat · Poll" : "The Weekly Wildcat asks"}</p>
        <h1 className="font-(family-name:--poll-serif) text-[2.75rem] leading-[1.05] font-medium text-balance sm:text-[3.5rem]">{settings.title}</h1>
        {settings.description ? <p className="max-w-[40rem] text-xl leading-relaxed text-(--poll-ink)/85">{settings.description}</p> : null}
      </div>
      <p className="max-w-[40rem] text-lg leading-relaxed text-(--poll-muted)">
        {settings.welcome || "Taking part is voluntary and anonymous. We never ask for your name, and you can skip any question or stop at any time."}
      </p>
      <dl className="grid max-w-[40rem] grid-cols-3 gap-6 border-y border-(--poll-rule) py-5 text-sm">
        <div><dt className="text-(--poll-muted)">Questions</dt><dd className="mt-1 text-lg font-medium tabular-nums">About {count}</dd></div>
        <div><dt className="text-(--poll-muted)">Your name</dt><dd className="mt-1 text-lg font-medium">Never asked</dd></div>
        <div><dt className="text-(--poll-muted)">Stopping</dt><dd className="mt-1 text-lg font-medium">Any time</dd></div>
      </dl>
      <div>
        <Button type="button" className={cn("h-16 gap-3 rounded-full bg-(--poll-ink) px-10 text-lg text-(--poll-paper) hover:bg-(--poll-ink)/90", FOCUS)} onClick={onBegin}>
          Start<ArrowRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function Done({ definition, submitting, outcome, onRetry, action, mode }: { definition: SurveyDefinition; submitting: boolean; outcome: SubmitOutcome | null; onRetry: () => void; action?: ReactNode; mode: RunnerProps["mode"] }) {
  const failed = outcome?.status === "failed";
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-[max(1.25rem,var(--byline-safe-left))] py-12 sm:px-10" aria-live="polite">
      <h1 className="font-(family-name:--poll-serif) text-[3rem] leading-[1.05] font-medium sm:text-[4rem]">{failed ? "Almost there." : "Thank you."}</h1>
      <div className="flex min-h-14 items-center gap-3 text-lg" role="status">
        {submitting || !outcome ? (<><Spinner className="size-5" />Sending your answers…</>)
          : outcome.status === "saved" ? (<><span className="grid size-8 place-items-center rounded-full bg-(--poll-accent) text-white"><Check className="size-5" aria-hidden="true" /></span>{mode === "preview" ? "Preview finished. Nothing was saved." : "Your answers are saved."}</>)
          : outcome.status === "queued" ? (<><CloudUpload className="size-6 text-(--poll-accent)" aria-hidden="true" />Your answers are saved on this iPad and will upload automatically.</>)
          : (<><CircleAlert className="size-6 shrink-0 text-(--poll-accent)" aria-hidden="true" /><span>{outcome.message}</span></>)}
      </div>
      {failed && outcome.retry ? <div><Button type="button" className="h-14 rounded-full px-8 text-base" onClick={onRetry}>Try again</Button></div> : null}
      {!failed ? <p className="max-w-[40rem] text-xl leading-relaxed text-(--poll-ink)/85">{definition.settings.thankYou || (mode === "kiosk" ? "Please hand the iPad back to the reporter." : "You can close this page.")}</p> : null}
      {action}
    </section>
  );
}

/* ------------------------------------------------------------------ inputs */

type InputProps = {
  question: Exclude<Question, { kind: "note" }>;
  definition: SurveyDefinition;
  state: AnswerState | undefined;
  draft: string | undefined;
  onDraft: (value: string) => void;
  onChoose: (state: AnswerState | null) => void;
  onEnter: () => void;
  invalid: boolean;
  describedBy?: string;
};

function QuestionInput(props: InputProps) {
  const { question } = props;
  if (question.kind === "select_one" || question.kind === "select_multiple") return <ChoiceList {...props} />;
  if (question.kind === "range") return <Scale {...props} />;
  if (question.kind === "text") return <TextAnswer {...props} />;
  return <NumberAnswer {...props} />;
}

/** An answer card: the kit's FieldLabel around its control, sized for a finger. */
const CARD = "flex min-h-16 w-full cursor-pointer items-center gap-4 rounded-xl border-2 bg-white px-5 py-3 text-left text-lg leading-snug font-normal transition-colors duration-150 select-none motion-reduce:transition-none hover:border-(--poll-ink)/40 has-focus-visible:ring-[3px] has-focus-visible:ring-(--poll-accent)/40 has-data-checked:border-(--poll-ink) has-data-checked:bg-(--poll-accent-soft)";
/** The kit's radio and checkbox, enlarged to match the card. */
const CONTROL = "size-7 border-2 border-(--poll-ink)/30 after:hidden data-checked:border-(--poll-ink) data-checked:bg-(--poll-ink) [&_[data-slot=radio-group-indicator]]:size-full [&_[data-slot=radio-group-indicator]>span]:size-2.5 [&_[data-slot=checkbox-indicator]_svg]:size-4.5";

function ChoiceList({ question, definition, state, onChoose, describedBy }: InputProps) {
  const multiple = question.kind === "select_multiple";
  const choices = choicesFor(definition, question);
  const selected = state?.status === "answered" ? (Array.isArray(state.value) ? state.value.map(String) : [String(state.value)]) : [];
  const id = useId();
  const toggle = (choice: string, on: boolean) => {
    const next = on ? [...selected, choice] : selected.filter((entry) => entry !== choice);
    // Keep the list's order, whatever order they were tapped in.
    const ordered = choices.map((entry) => entry.name).filter((entry) => next.includes(entry));
    onChoose(ordered.length ? { status: "answered", value: ordered } : null);
  };
  if (!multiple) {
    return (
      <RadioGroup value={selected[0] ?? null} onValueChange={(value) => onChoose({ status: "answered", value: String(value) })} aria-labelledby={`q-${question.name}`} aria-describedby={describedBy} className="gap-3">
        {choices.map((choice) => (
          <FieldLabel key={choice.name} htmlFor={`${id}-${choice.name}`} className={CARD}>
            <RadioGroupItem id={`${id}-${choice.name}`} value={choice.name} className={CONTROL} />
            <span className="min-w-0 flex-1">{choice.label}</span>
          </FieldLabel>
        ))}
      </RadioGroup>
    );
  }
  return (
    <FieldSet className="gap-3" aria-describedby={describedBy}>
      <FieldLegend className="sr-only">{question.label} (choose all that apply)</FieldLegend>
      <FieldDescription className="text-sm font-medium text-(--poll-muted)">Choose all that apply</FieldDescription>
      {choices.map((choice) => (
        <FieldLabel key={choice.name} htmlFor={`${id}-${choice.name}`} className={CARD}>
          <Checkbox id={`${id}-${choice.name}`} checked={selected.includes(choice.name)} onCheckedChange={(on) => toggle(choice.name, on === true)} className={cn(CONTROL, "rounded-md")} />
          <span className="min-w-0 flex-1">{choice.label}</span>
        </FieldLabel>
      ))}
    </FieldSet>
  );
}

function Scale({ question, state, onChoose, describedBy }: InputProps) {
  const id = useId();
  if (question.kind !== "range") return null;
  const values = rangeValues(question);
  const chosen = state?.status === "answered" ? String(state.value) : null;
  const describe = (value: number) => `${value}${value === question.start && question.startLabel ? `, ${question.startLabel}` : ""}${value === question.end && question.endLabel ? `, ${question.endLabel}` : ""}`;
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={chosen} onValueChange={(value) => onChoose({ status: "answered", value: Number(value) })} aria-labelledby={`q-${question.name}`} aria-describedby={describedBy}
        className={cn("gap-2", values.length <= 7 ? "grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))]" : "grid-cols-[repeat(auto-fit,minmax(3rem,1fr))]")}>
        {values.map((value) => (
          <FieldLabel key={value} htmlFor={`${id}-${value}`} className={cn(CARD, "justify-center px-0 text-xl font-medium tabular-nums has-data-checked:bg-(--poll-ink) has-data-checked:text-(--poll-paper)")}>
            {/* The number is the visible control; the kit radio carries the semantics and keyboard. */}
            <RadioGroupItem id={`${id}-${value}`} value={String(value)} aria-label={describe(value)} className="sr-only" />
            {value}
          </FieldLabel>
        ))}
      </RadioGroup>
      {question.startLabel || question.endLabel ? (
        <div className="flex justify-between gap-4 text-base text-(--poll-muted)" aria-hidden="true">
          <span>{question.startLabel}</span><span className="text-right">{question.endLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function TextAnswer({ question, state, draft, onDraft, onEnter, invalid, describedBy }: InputProps) {
  if (question.kind !== "text") return null;
  const value = draft ?? (state?.status === "answered" ? String(state.value) : "");
  const common = {
    id: `answer-${question.name}`,
    value,
    "aria-labelledby": `q-${question.name}`,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    maxLength: TEXT_ANSWER_MAX,
    autoCapitalize: "sentences" as const,
    spellCheck: true,
    className: cn("w-full rounded-xl border-2 border-(--poll-rule) bg-white px-5 py-4 text-xl leading-relaxed outline-none placeholder:text-(--poll-muted)/70 focus:border-(--poll-ink)", invalid && "border-(--poll-accent)")
  };
  return (
    <div className="flex flex-col gap-2">
      {question.multiline
        ? <textarea {...common} rows={6} placeholder="Type your answer" onChange={(event) => onDraft(event.target.value)} enterKeyHint="enter" />
        : <input {...common} type="text" placeholder="Type your answer" autoComplete="off" enterKeyHint="next" onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }} />}
      {value.length > TEXT_ANSWER_MAX * 0.8 ? <p className="text-right text-sm text-(--poll-muted) tabular-nums">{value.length} / {TEXT_ANSWER_MAX}</p> : null}
    </div>
  );
}

function NumberAnswer({ question, state, draft, onDraft, onEnter, invalid, describedBy }: InputProps) {
  const value = draft ?? (state?.status === "answered" ? String(state.value) : "");
  return (
    <input
      id={`answer-${question.name}`}
      type="text"
      inputMode={question.kind === "integer" ? "numeric" : "decimal"}
      pattern={question.kind === "integer" ? "-?[0-9]*" : undefined}
      autoComplete="off"
      enterKeyHint="next"
      value={value}
      aria-labelledby={`q-${question.name}`}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      placeholder={question.kind === "integer" ? "Enter a whole number" : "Enter a number"}
      onChange={(event) => onDraft(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }}
      className={cn("w-full max-w-xs rounded-xl border-2 border-(--poll-rule) bg-white px-5 py-4 text-3xl tabular-nums outline-none placeholder:text-lg placeholder:text-(--poll-muted)/70 focus:border-(--poll-ink)", invalid && "border-(--poll-accent)")}
    />
  );
}
