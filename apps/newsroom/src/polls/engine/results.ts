import { choicesFor, rangeValues, sectionLabel } from "./logic";
import { isAnswerable, KIND_LABELS, type AnswerableQuestion, type QuestionKind, type StoredAnswer, type StoredAnswers, type SurveyDefinition } from "./types";

/**
 * Results from validated responses (docs/wildcat-polls.md#results).
 *
 * Every percentage has an explicit base: the respondents who answered that
 * question. Skipped (the respondent chose Skip), unanswered (shown, left
 * blank) and not applicable (hidden by a condition) are counted separately
 * and never fall into a base. Breakdown groups smaller than the survey's
 * minimum are withheld, so a small group cannot point at a student.
 */

export type ResponseRow = {
  id: number;
  versionId: number;
  sessionId: string | null;
  mode: "kiosk" | "public";
  location: string;
  submittedAt: string;
  answers: StoredAnswers;
};

export type QuestionBase = { total: number; shown: number; answered: number; skipped: number; unanswered: number; notApplicable: number };
export type ChoiceResult = { name: string; label: string; count: number; percent: number | null };
export type NumericResult = { mean: number | null; median: number | null; min: number | null; max: number | null; distribution: Array<{ value: number; count: number }> };

export type QuestionResult = {
  name: string;
  label: string;
  kind: QuestionKind;
  kindLabel: string;
  section: string;
  base: QuestionBase;
  choices?: ChoiceResult[];
  /** Multiple choice: percentages are of respondents who answered, and add up to more than 100. */
  multiple?: boolean;
  numeric?: NumericResult;
  /** Written answers, newest first. Never broken down by group. */
  texts?: Array<{ responseId: number; text: string }>;
};

export type BreakdownCell = { count: number; percent: number | null };
export type BreakdownGroup = { name: string; label: string; base: number; suppressed: boolean; cells: Record<string, BreakdownCell> };
export type Breakdown = { by: string; byLabel: string; question: string; questionLabel: string; choices: Array<{ name: string; label: string }>; groups: BreakdownGroup[] };

export type SurveyResults = {
  responses: number;
  questions: QuestionResult[];
  breakdowns: Breakdown[];
  minimumGroup: number;
};

const round = (value: number) => Math.round(value * 10) / 10;
const pct = (count: number, base: number) => (base > 0 ? round((count / base) * 100) : null);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2);
}

const statusOf = (answers: StoredAnswers, name: string): StoredAnswer => answers[name] ?? { status: "not_applicable" };

export function summarize(definition: SurveyDefinition, rows: readonly ResponseRow[], options: { minimumGroup: number; breakdowns?: readonly string[] }): SurveyResults {
  const questions: QuestionResult[] = [];
  for (const question of definition.questions) {
    if (!isAnswerable(question)) continue;
    const base: QuestionBase = { total: rows.length, shown: 0, answered: 0, skipped: 0, unanswered: 0, notApplicable: 0 };
    const answered: Array<{ row: ResponseRow; value: unknown }> = [];
    for (const row of rows) {
      const state = statusOf(row.answers, question.name);
      if (state.status === "not_applicable") { base.notApplicable++; continue; }
      base.shown++;
      if (state.status === "skipped") base.skipped++;
      else if (state.status === "unanswered") base.unanswered++;
      else { base.answered++; answered.push({ row, value: state.value }); }
    }
    const result: QuestionResult = { name: question.name, label: question.label, kind: question.kind, kindLabel: KIND_LABELS[question.kind], section: sectionLabel(definition, question), base };
    if (question.kind === "select_one" || question.kind === "select_multiple") {
      const counts = new Map<string, number>();
      for (const { value } of answered) for (const name of Array.isArray(value) ? value : [value]) counts.set(String(name), (counts.get(String(name)) ?? 0) + 1);
      const known = choicesFor(definition, question);
      // A choice an earlier version offered keeps its count under its stored name.
      const extra = [...counts.keys()].filter((name) => !known.some((choice) => choice.name === name)).map((name) => ({ name, label: name }));
      result.choices = [...known, ...extra].map((choice) => ({ name: choice.name, label: choice.label, count: counts.get(choice.name) ?? 0, percent: pct(counts.get(choice.name) ?? 0, base.answered) }));
      result.multiple = question.kind === "select_multiple";
    } else if (question.kind === "text") {
      result.texts = answered
        .map(({ row, value }) => ({ responseId: row.id, at: row.submittedAt, text: String(value) }))
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(({ responseId, text }) => ({ responseId, text }));
    } else {
      const values = answered.map(({ value }) => Number(value)).filter(Number.isFinite);
      const distribution = new Map<number, number>();
      if (question.kind === "range") for (const value of rangeValues(question)) distribution.set(value, 0);
      for (const value of values) distribution.set(value, (distribution.get(value) ?? 0) + 1);
      result.numeric = {
        mean: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
        median: median(values),
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        distribution: [...distribution.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count }))
      };
    }
    questions.push(result);
  }
  const breakdowns = (options.breakdowns ?? definition.settings.breakdowns)
    .flatMap((by) => definition.questions.filter((question) => question.name !== by && (question.kind === "select_one" || question.kind === "select_multiple")).map((question) => breakdown(definition, rows, by, question as AnswerableQuestion, options.minimumGroup)))
    .filter((entry): entry is Breakdown => entry !== null);
  return { responses: rows.length, questions, breakdowns, minimumGroup: options.minimumGroup };
}

/** One question by one demographic. A group's base is the respondents in it who answered the question. */
export function breakdown(definition: SurveyDefinition, rows: readonly ResponseRow[], by: string, question: AnswerableQuestion, minimumGroup: number): Breakdown | null {
  const byQuestion = definition.questions.find((entry) => entry.name === by);
  if (!byQuestion || byQuestion.kind !== "select_one") return null;
  const groups = choicesFor(definition, byQuestion);
  const choices = choicesFor(definition, question);
  return {
    by, byLabel: byQuestion.label, question: question.name, questionLabel: question.label,
    choices: choices.map(({ name, label }) => ({ name, label })),
    groups: groups.map((group) => {
      const inGroup = rows.filter((row) => { const state = statusOf(row.answers, by); return state.status === "answered" && state.value === group.name; });
      const answered = inGroup.flatMap((row) => { const state = statusOf(row.answers, question.name); return state.status === "answered" ? [state.value] : []; });
      const base = answered.length;
      const suppressed = base < minimumGroup;
      const cells: Record<string, BreakdownCell> = {};
      for (const choice of choices) {
        const count = answered.filter((value) => (Array.isArray(value) ? value.includes(choice.name) : value === choice.name)).length;
        cells[choice.name] = suppressed ? { count: 0, percent: null } : { count, percent: pct(count, base) };
      }
      return { name: group.name, label: group.label, base: suppressed ? 0 : base, suppressed, cells };
    })
  };
}

/* ------------------------------------------------------------------ fieldwork */

export type EventCounts = { started: number; declined: number; completed: number; abandoned: number };
export type FieldworkRow = EventCounts & { key: string; label: string; approached: number; declineRate: number | null; completionRate: number | null; reliable: boolean };

/**
 * Approaches are interviewer-recorded (agreed + declined), so rates exist only
 * for interviewer-led sessions and only when enough people were approached to
 * mean anything. Public-link responses have no approaches.
 */
export function fieldworkRow(key: string, label: string, counts: EventCounts, minimumGroup: number): FieldworkRow {
  const approached = counts.started + counts.declined;
  const reliable = approached >= minimumGroup;
  return {
    key, label, ...counts, approached, reliable,
    declineRate: reliable ? pct(counts.declined, approached) : null,
    completionRate: reliable && counts.started > 0 ? pct(counts.completed, counts.started) : null
  };
}

/* ------------------------------------------------------------------ CSV */

/** A spreadsheet must never read an answer as a formula. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

const STATUS_TOKEN: Record<Exclude<StoredAnswer["status"], "answered">, string> = { skipped: "[skipped]", unanswered: "[unanswered]", not_applicable: "[not applicable]" };

/**
 * One row per response, one column per question (plus one 0/1 column per
 * choice of a multiple-choice question). Skipped, unanswered and not
 * applicable are written as distinct bracketed tokens, never as blanks.
 */
export function responsesCsv(definition: SurveyDefinition, rows: readonly ResponseRow[], versionNumbers: ReadonlyMap<number, number>): string {
  const questions = definition.questions.filter(isAnswerable);
  const header = ["response", "submitted_at", "version", "mode", "session", "location"];
  for (const question of questions) {
    header.push(question.name);
    if (question.kind === "select_multiple") for (const choice of choicesFor(definition, question)) header.push(`${question.name}/${choice.name}`);
  }
  const lines = [csvLine(header)];
  for (const row of rows) {
    const cells: unknown[] = [row.id, row.submittedAt, versionNumbers.get(row.versionId) ?? row.versionId, row.mode, row.sessionId ?? "", row.location];
    for (const question of questions) {
      const state = statusOf(row.answers, question.name);
      cells.push(state.status === "answered" ? (Array.isArray(state.value) ? state.value.join(" ") : state.value) : STATUS_TOKEN[state.status]);
      if (question.kind === "select_multiple") for (const choice of choicesFor(definition, question)) cells.push(state.status === "answered" && Array.isArray(state.value) ? (state.value.includes(choice.name) ? 1 : 0) : "");
    }
    lines.push(csvLine(cells));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** The aggregate table: what could be released, never individual answers. Written answers are not included. */
export function summaryCsv(results: SurveyResults): string {
  const lines = [csvLine(["question", "label", "type", "choice", "choice_label", "count", "percent", "base_answered", "skipped", "unanswered", "not_applicable"])];
  for (const q of results.questions) {
    const tail = [q.base.answered, q.base.skipped, q.base.unanswered, q.base.notApplicable];
    if (q.choices) for (const c of q.choices) lines.push(csvLine([q.name, q.label, q.kindLabel, c.name, c.label, c.count, c.percent ?? "", ...tail]));
    else if (q.numeric) {
      for (const d of q.numeric.distribution) lines.push(csvLine([q.name, q.label, q.kindLabel, d.value, d.value, d.count, pct(d.count, q.base.answered) ?? "", ...tail]));
      lines.push(csvLine([q.name, q.label, q.kindLabel, "mean", "Mean", q.numeric.mean ?? "", "", ...tail]));
    } else lines.push(csvLine([q.name, q.label, q.kindLabel, "", "", q.base.answered, "", ...tail]));
  }
  return `${lines.join("\r\n")}\r\n`;
}
