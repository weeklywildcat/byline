import { compileExpression, evaluateCondition, type Value } from "./expression";
import {
  isAnswerable,
  type AnswerableQuestion,
  type Answers,
  type AnswerState,
  type AnswerValue,
  type Choice,
  type Question,
  type StoredAnswers,
  type SurveyDefinition
} from "./types";

/**
 * The survey's runtime logic, shared by the respondent screen, Poll Studio's
 * preview and the server's validation, so a path that works in preview is the
 * path a respondent takes and the one the server accepts.
 */

export const TEXT_ANSWER_MAX = 2000;
const NUMBER_LIMIT = 1_000_000_000;

export function choicesFor(definition: SurveyDefinition, question: Question): Choice[] {
  if (question.kind !== "select_one" && question.kind !== "select_multiple") return [];
  return definition.lists.find((list) => list.name === question.list)?.choices ?? [];
}

/** A question's value in an expression: "" unless answered; a multiple choice is its names joined by spaces. */
export function expressionValue(state: AnswerState | undefined): Value {
  if (!state || state.status !== "answered") return "";
  const value = state.value;
  return Array.isArray(value) ? value.join(" ") : value;
}

function safeCondition(source: string | undefined, value: (name: string) => Value, dot?: Value): boolean {
  if (!source) return true;
  try {
    return evaluateCondition(compileExpression(source), { value, dot });
  } catch {
    // A published definition never holds an invalid expression (the importer refuses it);
    // a draft being edited may. Treat it as false so nothing appears by mistake.
    return false;
  }
}

/**
 * Which questions apply, in order. A question applies when every enclosing
 * group's `relevant` and its own are true. Questions decided earlier count as
 * empty while they are hidden, so hiding a question also hides what depends on it.
 */
export function visibleQuestionNames(definition: SurveyDefinition, answers: Answers): Set<string> {
  const groups = new Map(definition.groups.map((group) => [group.name, group]));
  const visible = new Set<string>();
  const decided = new Set<string>();
  const value = (name: string): Value => (decided.has(name) && !visible.has(name) ? "" : expressionValue(answers[name]));
  const groupCache = new Map<string, boolean>();
  const groupRelevant = (name: string): boolean => {
    const cached = groupCache.get(name);
    if (cached !== undefined) return cached;
    const group = groups.get(name);
    const result = !group || safeCondition(group.relevant, value);
    groupCache.set(name, result);
    return result;
  };
  for (const question of definition.questions) {
    const shown = question.groups.every(groupRelevant) && safeCondition(question.relevant, value);
    if (shown) visible.add(question.name);
    decided.add(question.name);
  }
  return visible;
}

/**
 * Drops answers to questions that no longer apply. Repeats until stable,
 * because clearing one answer can hide a question that depended on it.
 */
export function pruneAnswers(definition: SurveyDefinition, answers: Answers): Answers {
  let current = answers;
  for (let pass = 0; pass < definition.questions.length + 1; pass++) {
    const visible = visibleQuestionNames(definition, current);
    const next = Object.fromEntries(Object.entries(current).filter(([name]) => visible.has(name)));
    if (Object.keys(next).length === Object.keys(current).length) return current;
    current = next;
  }
  return current;
}

/** The screens a respondent sees now, in order (information screens included). */
export function screensFor(definition: SurveyDefinition, answers: Answers): Question[] {
  const visible = visibleQuestionNames(definition, answers);
  return definition.questions.filter((question) => visible.has(question.name));
}

/** The innermost enclosing group label: the section a question sits in. */
export function sectionLabel(definition: SurveyDefinition, question: Question): string {
  for (let i = question.groups.length - 1; i >= 0; i--) {
    const label = definition.groups.find((group) => group.name === question.groups[i])?.label;
    if (label) return label;
  }
  return "";
}

function rangeSteps(question: Extract<Question, { kind: "range" }>): number[] {
  const values: number[] = [];
  const direction = question.end >= question.start ? 1 : -1;
  const step = Math.abs(question.step) * direction;
  for (let v = question.start; direction > 0 ? v <= question.end + 1e-9 : v >= question.end - 1e-9; v += step) {
    values.push(Number(v.toFixed(6)));
    if (values.length > 101) break;
  }
  return values;
}

export function rangeValues(question: Extract<Question, { kind: "range" }>): number[] {
  return rangeSteps(question);
}

/** Why a value is not a well-formed answer of this question's type, or null. */
export function valueProblem(definition: SurveyDefinition, question: AnswerableQuestion, value: unknown): string | null {
  switch (question.kind) {
    case "select_one": {
      if (typeof value !== "string" || !choicesFor(definition, question).some((choice) => choice.name === value)) return "Choose one of the answers.";
      return null;
    }
    case "select_multiple": {
      const names = new Set(choicesFor(definition, question).map((choice) => choice.name));
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !names.has(item)) || new Set(value).size !== value.length) return "Choose at least one of the answers.";
      return null;
    }
    case "text": {
      if (typeof value !== "string" || !value.trim()) return "Write an answer, or skip this question.";
      if (value.length > TEXT_ANSWER_MAX) return `Keep this under ${TEXT_ANSWER_MAX} characters.`;
      return null;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > NUMBER_LIMIT) return "Enter a whole number.";
      return null;
    }
    case "decimal": {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > NUMBER_LIMIT) return "Enter a number.";
      return null;
    }
    case "range": {
      if (typeof value !== "number" || !rangeSteps(question).includes(value)) return "Choose a point on the scale.";
      return null;
    }
  }
}

/**
 * Whether the current answer (or its absence) lets the respondent move on.
 * `answers` are everyone else's answers, for constraints that compare.
 */
export function answerProblem(definition: SurveyDefinition, question: Question, state: AnswerState | undefined, answers: Answers): string | null {
  if (!isAnswerable(question)) return null;
  if (!state) return question.required ? question.requiredMessage || "This question needs an answer." : null;
  if (state.status === "skipped") return question.required ? question.requiredMessage || "This question needs an answer." : null;
  const problem = valueProblem(definition, question, state.value);
  if (problem) return problem;
  if (question.constraint) {
    const value = (name: string) => expressionValue(name === question.name ? state : answers[name]);
    if (!safeCondition(question.constraint, value, expressionValue(state))) return question.constraintMessage || "Check this answer.";
  }
  return null;
}

export type SubmissionCheck =
  | { ok: true; stored: StoredAnswers; answered: number }
  | { ok: false; errors: Array<{ question: string; message: string }> };

/**
 * The server's independent check of a submission against the exact version
 * the respondent saw. Visibility is recomputed from the submitted answers; an
 * answer to a question that does not apply, an unknown question, a value of
 * the wrong shape or a broken rule is refused, never repaired.
 */
export function checkSubmission(definition: SurveyDefinition, submitted: unknown): SubmissionCheck {
  const errors: Array<{ question: string; message: string }> = [];
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) return { ok: false, errors: [{ question: "", message: "The answers are malformed." }] };
  const byName = new Map(definition.questions.map((question) => [question.name, question]));
  const answers: Answers = {};
  for (const [name, raw] of Object.entries(submitted as Record<string, unknown>)) {
    const question = byName.get(name);
    if (!question || !isAnswerable(question)) { errors.push({ question: name, message: "Not a question in this poll." }); continue; }
    const state = raw as { status?: unknown; value?: unknown } | null;
    if (state && state.status === "skipped" && Object.keys(state).length === 1) answers[name] = { status: "skipped" };
    else if (state && state.status === "answered" && "value" in state && Object.keys(state).length === 2) answers[name] = { status: "answered", value: state.value as AnswerValue };
    else errors.push({ question: name, message: "The answer is malformed." });
  }
  if (errors.length) return { ok: false, errors };
  const visible = visibleQuestionNames(definition, answers);
  const stored: StoredAnswers = {};
  let answered = 0;
  for (const question of definition.questions) {
    if (!isAnswerable(question)) continue;
    const state = answers[question.name];
    if (!visible.has(question.name)) {
      if (state) errors.push({ question: question.name, message: "Answered a question that does not apply." });
      stored[question.name] = { status: "not_applicable" };
      continue;
    }
    const problem = answerProblem(definition, question, state, answers);
    if (problem) { errors.push({ question: question.name, message: problem }); continue; }
    if (!state) stored[question.name] = { status: "unanswered" };
    else if (state.status === "skipped") stored[question.name] = { status: "skipped" };
    else {
      const value = question.kind === "text" ? String(state.value).trim() : state.value;
      stored[question.name] = { status: "answered", value };
      answered++;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, stored, answered };
}

/** A readable sentence for a condition, for the review and the editor. */
export function describeCondition(definition: SurveyDefinition, source: string | undefined): string {
  if (!source) return "";
  const label = (name: string) => {
    const question = definition.questions.find((q) => q.name === name);
    return question ? `“${shorten(question.label)}”` : name;
  };
  const choice = (questionName: string, choiceName: string) => {
    const question = definition.questions.find((q) => q.name === questionName);
    const found = question ? choicesFor(definition, question).find((c) => c.name === choiceName) : undefined;
    return found ? `“${found.label}”` : `'${choiceName}'`;
  };
  return source
    .replace(/selected\(\s*\$\{([^}]+)\}\s*,\s*['"‘“]([^'"’”]*)['"’”]\s*\)/g, (_m, q: string, c: string) => `${label(q)} includes ${choice(q, c)}`)
    .replace(/\$\{([^}]+)\}\s*=\s*['"‘“]([^'"’”]*)['"’”]/g, (_m, q: string, c: string) => `${label(q)} is ${choice(q, c)}`)
    .replace(/\$\{([^}]+)\}\s*!=\s*['"‘“]([^'"’”]*)['"’”]/g, (_m, q: string, c: string) => (c === "" ? `${label(q)} is answered` : `${label(q)} is not ${choice(q, c)}`))
    .replace(/\$\{([^}]+)\}/g, (_m, q: string) => label(q));
}

const shorten = (text: string) => (text.length > 48 ? `${text.slice(0, 46).trimEnd()}…` : text);
