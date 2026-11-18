import { choicesFor, rangeValues, sectionLabel } from "./logic";
import { matricesFor } from "./presentation";
import { isAnswerable, isSelect, KIND_LABELS, type AnswerableQuestion, type QuestionKind, type StoredAnswer, type StoredAnswers, type SurveyDefinition } from "./types";

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
export type RankingOption = {
  name: string; label: string; base: number; averagePosition: number | null;
  firstPlaceCount: number; firstPlacePercent: number | null; positions: number[];
};
export type ConfirmationResult = { confirmed: number; base: number };
export type MatrixResult = { name: string; label: string; rows: string[]; columns: Array<{ name: string; label: string }> };

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
  ranking?: RankingOption[];
  confirmation?: ConfirmationResult;
  /** Written answers, newest first. Never broken down by group. */
  texts?: Array<{ responseId: number; text: string }>;
};

export type BreakdownCell = { count: number; percent: number | null };
export type BreakdownGroup = { name: string; label: string; base: number; suppressed: boolean; cells: Record<string, BreakdownCell>; ranking?: RankingOption[] };
export type Breakdown = { kind?: "rank" | "acknowledge"; by: string; byLabel: string; question: string; questionLabel: string; choices: Array<{ name: string; label: string }>; groups: BreakdownGroup[] };

export type SurveyResults = {
  responses: number;
  questions: QuestionResult[];
  breakdowns: Breakdown[];
  matrices: MatrixResult[];
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

const statusOf = (answers: StoredAnswers, name: string): StoredAnswer => Object.hasOwn(answers, name) ? answers[name] : { status: "not_applicable" };

/** The questions results can be compared by: the poll's configured breakdowns that are single-choice questions. */
export function compareOptions(definition: SurveyDefinition): Array<{ name: string; label: string }> {
  return definition.settings.breakdowns.flatMap((name) => {
    const question = definition.questions.find((entry) => entry.name === name);
    return question?.kind === "select_one" ? [{ name, label: question.label }] : [];
  });
}

function rankOptions(choices: readonly { name: string; label: string }[], values: readonly unknown[]): RankingOption[] {
  const entries = new Map(choices.map((choice) => [choice.name, { name: choice.name, label: choice.label, positions: [] as number[] }]));
  let longest = choices.length;
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    longest = Math.max(longest, value.length);
    value.forEach((name: string, index) => {
      const option = entries.get(name) ?? { name, label: name, positions: [] };
      option.positions[index] = (option.positions[index] ?? 0) + 1;
      entries.set(name, option);
    });
  }
  return [...entries.values()].map((option) => {
    const positions = Array.from({ length: longest }, (_, i) => option.positions[i] ?? 0);
    const base = positions.reduce((sum, count) => sum + count, 0);
    const average = base ? positions.reduce((sum, count, index) => sum + count * (index + 1), 0) / base : null;
    return {
      name: option.name, label: option.label, base, positions, average, averagePosition: average === null ? null : round(average),
      firstPlaceCount: positions[0] ?? 0, firstPlacePercent: pct(positions[0] ?? 0, base)
    };
  }).sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity)).map(({ average: _average, ...option }) => option);
}

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
    } else if (question.kind === "rank") {
      result.ranking = rankOptions(choicesFor(definition, question), answered.map(({ value }) => value));
    } else if (question.kind === "acknowledge") {
      result.confirmation = { confirmed: answered.filter(({ value }) => value === "OK").length, base: base.shown };
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
    .flatMap((by) => definition.questions.filter((question) => question.name !== by && (isSelect(question) || question.kind === "rank" || question.kind === "acknowledge")).map((question) => breakdown(definition, rows, by, question as AnswerableQuestion, options.minimumGroup)))
    .filter((entry): entry is Breakdown => entry !== null);
  const byName = new Map(questions.map((question) => [question.name, question]));
  const matrices = matricesFor(definition).map(({ group, rows: members }) => {
    const columns = new Map<string, { name: string; label: string }>();
    for (const member of members) {
      for (const choice of byName.get(member.name)?.choices ?? []) columns.set(choice.name, { name: choice.name, label: choice.label });
    }
    return { name: group.name, label: group.label, rows: members.map(({ name }) => name), columns: [...columns.values()] };
  });
  return { responses: rows.length, questions, breakdowns, matrices, minimumGroup: options.minimumGroup };
}

/** One question by one demographic. A group's base is the respondents in it who answered the question. */
export function breakdown(definition: SurveyDefinition, rows: readonly ResponseRow[], by: string, question: AnswerableQuestion, minimumGroup: number): Breakdown | null {
  const byQuestion = definition.questions.find((entry) => entry.name === by);
  if (!byQuestion || byQuestion.kind !== "select_one") return null;
  const groups = choicesFor(definition, byQuestion);
  const rankingQuestion = question.kind === "rank";
  const confirmation = question.kind === "acknowledge";
  const choices = confirmation ? [{ name: "OK", label: "Confirmed" }] : [...choicesFor(definition, question)];
  const answeredIn = groups.map((group) => rows.flatMap((row) => {
    const byState = statusOf(row.answers, by);
    if (byState.status !== "answered" || byState.value !== group.name) return [];
    const state = statusOf(row.answers, question.name);
    if (state.status === "answered") return [state.value];
    return confirmation && state.status !== "not_applicable" ? [""] : [];
  }));
  if (isSelect(question)) {
    const known = new Set(choices.map(({ name }) => name));
    for (const values of answeredIn) {
      for (const value of values) {
        for (const name of Array.isArray(value) ? value : [String(value)]) {
          if (known.has(name)) continue;
          known.add(name);
          choices.push({ name, label: name });
        }
      }
    }
  }
  const rankings = rankingQuestion ? answeredIn.map((values) => rankOptions(choices, values)) : undefined;
  const withheld = new Set(answeredIn.flatMap((answered, index) => (
    answered.length < minimumGroup || rankings?.[index].some(({ base }) => base > 0 && base < minimumGroup) ? [index] : []
  )));
  // Secondary suppression: if exactly one group with anyone in it is withheld, the
  // overall result minus the others would give it away, so the next smallest is withheld too.
  const occupiedWithheld = [...withheld].filter((index) => answeredIn[index].length > 0);
  if (occupiedWithheld.length === 1) {
    const smallest = answeredIn.map((answered, index) => ({ index, size: answered.length })).filter((entry) => !withheld.has(entry.index) && entry.size > 0).sort((a, b) => a.size - b.size)[0];
    if (smallest) withheld.add(smallest.index);
  }
  return {
    by, byLabel: byQuestion.label, question: question.name, questionLabel: question.label,
    ...(rankingQuestion ? { kind: "rank" as const } : confirmation ? { kind: "acknowledge" as const } : {}),
    choices: choices.map(({ name, label }) => ({ name, label })),
    groups: groups.map((group, index) => {
      const answered = answeredIn[index];
      const base = answered.length;
      // A withheld group carries nothing: no base, no counts, no percentages.
      if (withheld.has(index)) return { name: group.name, label: group.label, base: 0, suppressed: true, cells: Object.fromEntries(choices.map((choice) => [choice.name, { count: 0, percent: null }])) };
      if (rankings) return { name: group.name, label: group.label, base, suppressed: false, cells: {}, ranking: rankings[index] };
      const cells: Record<string, BreakdownCell> = Object.create(null);
      for (const choice of choices) {
        const count = answered.filter((value) => (Array.isArray(value) ? value.includes(choice.name) : value === choice.name)).length;
        cells[choice.name] = { count, percent: pct(count, base) };
      }
      return { name: group.name, label: group.label, base, suppressed: false, cells };
    })
  };
}

/* ------------------------------------------------------------------ over time */

export type TimelinePoint = { day: string; kiosk: number; public: number };

/** Responses per day (in the newsroom's timezone), by how they were collected. Counts only. */
export function responseTimeline(rows: readonly Pick<ResponseRow, "submittedAt" | "mode">[], timeZone: string): TimelinePoint[] {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const days = new Map<string, TimelinePoint>();
  for (const row of rows) {
    const day = format.format(new Date(row.submittedAt));
    const point = days.get(day) ?? { day, kiosk: 0, public: 0 };
    point[row.mode] += 1;
    days.set(day, point);
  }
  const sorted = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length < 2) return sorted;
  // Fill quiet days so the line doesn't skip over them.
  const filled: TimelinePoint[] = [];
  const cursor = new Date(`${sorted[0].day}T12:00:00Z`);
  const last = sorted.at(-1)!.day;
  for (let guard = 0; guard < 400; guard++) {
    const day = cursor.toISOString().slice(0, 10);
    filled.push(days.get(day) ?? { day, kiosk: 0, public: 0 });
    if (day >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return filled;
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
  const header = ["question", "label", "type", "choice", "choice_label", "count", "percent", "base_answered", "skipped", "unanswered", "not_applicable", "matrix", "average_position", "first_place_count", "first_place_percent", "base", "positions", "compare_by", "group"];
  const lines = [csvLine(header)];
  const append = (cells: unknown[]) => lines.push(csvLine(Array.from({ length: header.length }, (_, i) => cells[i])));
  const matrixLabels = new Map(results.matrices.flatMap((matrix) => matrix.rows.map((name) => [name, matrix.label] as const)));
  const questions = new Map(results.questions.map((question) => [question.name, question]));
  for (const q of results.questions) {
    const head = [q.name, q.label, q.kindLabel];
    const tail = [q.base.answered, q.base.skipped, q.base.unanswered, q.base.notApplicable, matrixLabels.get(q.name)];
    if (q.choices) for (const c of q.choices) append([...head, c.name, c.label, c.count, c.percent, ...tail]);
    else if (q.ranking) for (const option of q.ranking) append([
      ...head, option.name, option.label, null, null, ...tail,
      option.averagePosition, option.firstPlaceCount, option.firstPlacePercent, option.base, option.positions.join(" ")
    ]);
    else if (q.confirmation) append([...head, "OK", "Confirmed", q.confirmation.confirmed, null, ...tail, null, null, null, q.confirmation.base]);
    else if (q.numeric) {
      for (const d of q.numeric.distribution) append([...head, d.value, d.value, d.count, pct(d.count, q.base.answered), ...tail]);
      append([...head, "mean", "Mean", q.numeric.mean, null, ...tail]);
    } else append([...head, null, null, q.base.answered, null, ...tail]);
  }
  for (const entry of results.breakdowns) {
    const head = [entry.question, entry.questionLabel, questions.get(entry.question)?.kindLabel];
    const matrix = matrixLabels.get(entry.question);
    for (const group of entry.groups) {
      if (group.suppressed) continue;
      if (entry.kind === "rank") {
        for (const option of group.ranking ?? []) append([
          ...head, option.name, option.label, null, null, group.base, null, null, null, matrix,
          option.averagePosition, option.firstPlaceCount, option.firstPlacePercent, option.base, option.positions.join(" "), entry.byLabel, group.label
        ]);
      } else {
        for (const choice of entry.choices) {
          const cell = group.cells[choice.name];
          append([
            ...head, choice.name, choice.label, cell?.count, cell?.percent, entry.kind === "acknowledge" ? null : group.base,
            null, null, null, matrix, null, null, null, group.base, null, entry.byLabel, group.label
          ]);
        }
      }
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
