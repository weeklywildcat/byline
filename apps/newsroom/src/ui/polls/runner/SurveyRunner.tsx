"use client";

import { Alert, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Progress } from "@byline/newsroom-ui/ui/progress";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { trackVisualViewport } from "@byline/newsroom-ui/lib/visual-viewport";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, CloudUpload } from "lucide-react";
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

/** The respondent's actions: the kit's Button at its large size, made taller for a finger on an iPad. */
const ACTION = "h-12 px-5 text-base";
/** The kiosk's primary action is bigger still: an iPad held at arm's length. */
const KIOSK_PRIMARY = "h-14 px-7 text-lg";

/**
 * Whether the number of questions a respondent will see is known before they
 * start: true when nothing in the poll is conditional. With branching the
 * total changes as they answer, so progress says "Question 4", never a total
 * that moves.
 */
export function hasStableLength(definition: SurveyDefinition): boolean {
  return !definition.questions.some((question) => question.relevant?.trim()) && !definition.groups.some((group) => group.relevant?.trim());
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

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

  const stable = useMemo(() => hasStableLength(definition), [definition]);
  const online = useOnline();
  const progress = stage === "welcome" ? 0 : stage === "done" ? 100 : Math.round((index / Math.max(1, screens.length)) * 100);
  const primary = mode === "kiosk" ? KIOSK_PRIMARY : ACTION;
  const gutter = "px-[max(1.25rem,var(--byline-safe-left))] sm:px-8";
  return (
    <div
      ref={rootRef}
      className={cn("relative flex flex-col bg-background text-foreground", embedded ? "min-h-full" : "min-h-dvh")}
      data-poll-runner={mode}
    >
      <header className={cn("sticky top-0 z-10 bg-background", !embedded && "pt-(--byline-safe-top)")}>
        <div className={cn("mx-auto flex min-h-14 w-full max-w-5xl items-center gap-3", gutter)}>
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{definition.settings.title}</p>
          {mode === "public" && !online ? <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground" role="status">Offline</span> : null}
          {stage === "questions" && current ? (
            <p className="shrink-0 text-sm text-muted-foreground tabular-nums" aria-live="polite" data-poll-progress="">
              {stable ? `Question ${index + 1} of ${screens.length}` : `Question ${index + 1}`}
            </p>
          ) : null}
          {stage === "questions" && props.onStop ? <Button type="button" variant="ghost" onClick={props.onStop}>Stop</Button> : null}
          {props.headerAction}
        </div>
        {stable ? (
          <div className={cn("mx-auto w-full max-w-5xl", gutter)}>
            <Progress value={progress} aria-label="Progress through the poll" />
          </div>
        ) : <div className="border-b" aria-hidden="true" />}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {stage === "welcome" ? (
          <Welcome definition={definition} count={stable ? screensFor(definition, {}).filter(isAnswerable).length : definition.questions.filter(isAnswerable).length} upTo={!stable} primary={primary} onBegin={begin} />
        ) : stage === "done" ? (
          <Done definition={definition} submitting={submitting} outcome={outcome} onRetry={retry} action={props.doneAction} mode={mode} />
        ) : current ? (
          <section
            key={current.name}
            className={cn(
              "mx-auto grid w-full max-w-5xl flex-1 content-start gap-8 pt-8 sm:pt-12",
              gutter,
              embedded ? "pb-10" : "pb-32",
              "[@media(min-width:1000px)_and_(orientation:landscape)]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] [@media(min-width:1000px)_and_(orientation:landscape)]:gap-14 [@media(min-width:1000px)_and_(orientation:landscape)]:pt-16",
              "animate-in fade-in duration-200 motion-reduce:animate-none",
              direction === "forward" ? "slide-in-from-right-4" : "slide-in-from-left-4"
            )}
            aria-labelledby={`q-${current.name}`}
          >
            <div className="flex flex-col gap-3">
              {sectionLabel(definition, current) ? <p className="text-sm font-medium text-muted-foreground">{sectionLabel(definition, current)}</p> : null}
              <h1 id={`q-${current.name}`} ref={headingRef} tabIndex={-1} className="text-2xl leading-tight font-semibold tracking-tight text-balance outline-none sm:text-3xl">
                {current.label}
              </h1>
              {current.hint ? <p className="max-w-[38rem] text-lg leading-relaxed text-muted-foreground">{current.hint}</p> : null}
              {answerable && optional ? <p className="text-sm text-muted-foreground">Optional</p> : null}
              {problem ? (
                <Alert variant="destructive" id={`problem-${current.name}`} className="text-base">
                  <CircleAlert />
                  <AlertTitle>{problem}</AlertTitle>
                </Alert>
              ) : null}
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
          <p className={cn("py-10 text-lg", gutter)}>This poll has no questions yet.</p>
        )}
      </main>

      {stage === "questions" && current ? (
        <footer className={cn("z-10 border-t bg-background", embedded ? "sticky bottom-0" : "fixed inset-x-0 bottom-(--byline-vv-bottom,0px) pb-(--byline-safe-bottom)")}>
          <div className={cn("mx-auto flex w-full max-w-5xl items-center gap-2 py-3", gutter)}>
            <Button type="button" variant="ghost" size="lg" className={ACTION} onClick={back}><ArrowLeft data-icon="inline-start" />Back</Button>
            <span className="flex-1" />
            {answerable && optional ? <Button type="button" variant="ghost" size="lg" className={ACTION} onClick={() => void skip()}>Skip</Button> : null}
            <Button type="button" size="lg" className={cn(primary, "min-w-36")} disabled={answerable && !hasAnswer} onClick={() => void next()}>
              {isLast ? "Submit" : "Continue"}
              {isLast ? <Check data-icon="inline-end" /> : <ArrowRight data-icon="inline-end" />}
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ screens */

function Welcome({ definition, count, upTo, primary, onBegin }: { definition: SurveyDefinition; count: number; upTo: boolean; primary: string; onBegin: () => void }) {
  const { settings } = definition;
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-[max(1.25rem,var(--byline-safe-left))] py-12 sm:px-8 animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">The Weekly Wildcat</p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">{settings.title}</h1>
        {settings.description ? <p className="text-lg leading-relaxed">{settings.description}</p> : null}
      </div>
      <p className="text-lg leading-relaxed text-muted-foreground">
        {settings.welcome || "Taking part is voluntary and anonymous. We never ask for your name, and you can skip any question or stop at any time."}
        {" "}{upTo ? "Up to" : ""} {count} {count === 1 ? "question" : "questions"}.
      </p>
      <div>
        <Button type="button" size="lg" className={cn(primary, "min-w-36")} onClick={onBegin}>Start<ArrowRight data-icon="inline-end" /></Button>
      </div>
    </section>
  );
}

function Done({ definition, submitting, outcome, onRetry, action, mode }: { definition: SurveyDefinition; submitting: boolean; outcome: SubmitOutcome | null; onRetry: () => void; action?: ReactNode; mode: RunnerProps["mode"] }) {
  const failed = outcome?.status === "failed";
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-[max(1.25rem,var(--byline-safe-left))] py-12 sm:px-8" aria-live="polite">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{failed ? "Almost there" : "Thank you"}</h1>
      {failed ? (
        <Alert variant="destructive" className="text-base">
          <CircleAlert />
          <AlertTitle>{outcome.message}</AlertTitle>
        </Alert>
      ) : (
        <p className="flex min-h-8 items-center gap-2.5 text-lg" role="status">
          {submitting || !outcome ? (<><Spinner className="size-5" />Sending your answers…</>)
            : outcome.status === "saved" ? (<><CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />{mode === "preview" ? "Preview finished. Nothing was saved." : "Your answers are saved."}</>)
            : (<><CloudUpload className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />Your answers are saved on this iPad and will upload automatically.</>)}
        </p>
      )}
      {failed && outcome.retry ? <div><Button type="button" size="lg" className={ACTION} onClick={onRetry}>Try again</Button></div> : null}
      {!failed ? <p className="text-lg leading-relaxed text-muted-foreground">{definition.settings.thankYou || (mode === "kiosk" ? "Please hand the iPad back to the reporter." : "You can close this page.")}</p> : null}
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

/**
 * One answer, as the kit composes a choice card (ChoiceCards): a FieldLabel
 * around a horizontal Field, the control first, sized for a finger. The
 * selected look is FieldLabel's own, made a touch stronger for a glance at
 * arm's length.
 */
const CHOICE = "*:data-[slot=field]:min-h-14 *:data-[slot=field]:gap-3.5 *:data-[slot=field]:px-4 *:data-[slot=field]:py-3.5 has-data-checked:border-primary";

function ChoiceOption({ htmlFor, control, children }: { htmlFor: string; control: ReactNode; children: ReactNode }) {
  return (
    <FieldLabel htmlFor={htmlFor} className={CHOICE}>
      <Field orientation="horizontal" className="items-center!">
        {control}
        <FieldContent>
          <FieldTitle className="text-base leading-snug font-normal sm:text-lg">{children}</FieldTitle>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

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
      <RadioGroup value={selected[0] ?? null} onValueChange={(value) => onChoose({ status: "answered", value: String(value) })} aria-labelledby={`q-${question.name}`} aria-describedby={describedBy} className="gap-2.5">
        {choices.map((choice) => (
          <ChoiceOption key={choice.name} htmlFor={`${id}-${choice.name}`} control={<RadioGroupItem id={`${id}-${choice.name}`} value={choice.name} className="size-5" />}>{choice.label}</ChoiceOption>
        ))}
      </RadioGroup>
    );
  }
  return (
    <FieldSet className="gap-2.5" aria-describedby={describedBy}>
      <FieldLegend className="sr-only">{question.label} (choose all that apply)</FieldLegend>
      <FieldDescription>Choose all that apply</FieldDescription>
      {choices.map((choice) => (
        <ChoiceOption key={choice.name} htmlFor={`${id}-${choice.name}`} control={<Checkbox id={`${id}-${choice.name}`} checked={selected.includes(choice.name)} onCheckedChange={(on) => toggle(choice.name, on === true)} className="size-5" />}>{choice.label}</ChoiceOption>
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
    <div className="flex flex-col gap-2.5">
      <RadioGroup value={chosen} onValueChange={(value) => onChoose({ status: "answered", value: Number(value) })} aria-labelledby={`q-${question.name}`} aria-describedby={describedBy}
        className={cn("gap-2", values.length <= 7 ? "grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))]" : "grid-cols-[repeat(auto-fit,minmax(3rem,1fr))]")}>
        {values.map((value) => (
          <FieldLabel key={value} htmlFor={`${id}-${value}`} className="*:data-[slot=field]:min-h-14 has-data-checked:border-primary has-data-checked:bg-primary has-data-checked:text-primary-foreground">
            <Field orientation="horizontal" className="justify-center text-lg font-medium tabular-nums">
              {/* The number is the visible control; the kit radio carries the semantics and keyboard. */}
              <RadioGroupItem id={`${id}-${value}`} value={String(value)} aria-label={describe(value)} className="sr-only" />
              {value}
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      {question.startLabel || question.endLabel ? (
        <div className="flex justify-between gap-4 text-sm text-muted-foreground" aria-hidden="true">
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
    placeholder: "Type your answer"
  };
  return (
    <div className="flex flex-col gap-2">
      {question.multiline
        ? <Textarea {...common} rows={6} className="min-h-40 px-3.5 py-3 text-lg md:text-lg" onChange={(event) => onDraft(event.target.value)} enterKeyHint="enter" />
        : <Input {...common} type="text" className="h-12 px-3.5 text-lg md:text-lg" autoComplete="off" enterKeyHint="next" onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }} />}
      {value.length > TEXT_ANSWER_MAX * 0.8 ? <p className="text-right text-sm text-muted-foreground tabular-nums">{value.length} / {TEXT_ANSWER_MAX}</p> : null}
    </div>
  );
}

function NumberAnswer({ question, state, draft, onDraft, onEnter, invalid, describedBy }: InputProps) {
  const value = draft ?? (state?.status === "answered" ? String(state.value) : "");
  return (
    <Input
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
      placeholder={question.kind === "integer" ? "A whole number" : "A number"}
      onChange={(event) => onDraft(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }}
      className="h-14 max-w-xs px-3.5 text-2xl tabular-nums md:text-2xl"
    />
  );
}
