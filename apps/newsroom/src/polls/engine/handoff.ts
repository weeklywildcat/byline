import type { Breakdown, SurveyResults } from "./results";

/**
 * Results → Byline Data (docs/wildcat-polls.md#results-to-byline-data).
 *
 * The rows a "Create dataset from results" hands to Data: reviewed aggregates
 * only. Every row is a count or a share of a group of respondents; nothing in
 * it belongs to one person. Written answers never enter it (not even counted),
 * any question answered by fewer people than the poll's smallest reported
 * group is left out, and a breakdown group the results withhold stays
 * withheld. The dataset is a private working dataset; making any of it public
 * is Data's own Publish step.
 */

export type HandoffField =
  | { key: string; label: string; type: "text"; required: boolean; visibility: "public"; description?: string; options: { maxLength: number } }
  | { key: string; label: string; type: "integer"; required: boolean; visibility: "public"; description?: string; options: { min?: number } }
  | { key: string; label: string; type: "number" | "percentage"; required: boolean; visibility: "public"; description?: string; options: { min?: number; max?: number; decimals?: number } };

export type HandoffRow = {
  question: string;
  question_key: string;
  matrix?: string;
  average_position?: number | null;
  first_place_count?: number;
  first_place_percent?: number | null;
  compare_by: string | null;
  group: string;
  answer: string;
  answer_key: string;
  count: number | null;
  percent: number | null;
  value: number | null;
  base: number;
  /** Only on all-respondent rows; a group's skips aren't broken out. */
  skipped: number | null;
  not_asked: number | null;
};

const TEXT = 500;
const text = (key: string, label: string, description?: string): HandoffField => ({ key, label, type: "text", required: false, visibility: "public", ...(description ? { description } : {}), options: { maxLength: TEXT } });
const integer = (key: string, label: string, description?: string): HandoffField => ({ key, label, type: "integer", required: false, visibility: "public", ...(description ? { description } : {}), options: { min: 0 } });

export const HANDOFF_FIELDS: HandoffField[] = [
  text("question", "Question"),
  text("question_key", "Question key"),
  text("matrix", "Matrix"),
  { key: "average_position", label: "Average position", type: "number", required: false, visibility: "public", options: { min: 1, decimals: 1 } },
  integer("first_place_count", "First-place responses"),
  { key: "first_place_percent", label: "First-place percent", type: "percentage", required: false, visibility: "public", options: { min: 0, max: 100, decimals: 1 } },
  text("compare_by", "Compared by", "Empty for all respondents."),
  text("group", "Group"),
  text("answer", "Answer"),
  text("answer_key", "Answer key"),
  integer("count", "Respondents"),
  { key: "percent", label: "Percent", type: "percentage", required: false, visibility: "public", description: "Of the group's respondents who answered the question.", options: { min: 0, max: 100, decimals: 1 } },
  { key: "value", label: "Value", type: "number", required: false, visibility: "public", description: "Averages and medians of numeric questions.", options: { decimals: 2 } },
  integer("base", "Answered", "The base for the percentages."),
  integer("skipped", "Skipped"),
  integer("not_asked", "Not asked", "A condition hid the question.")
];

const cut = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, TEXT);
const ALL = "All respondents";

export type Handoff = { rows: HandoffRow[]; withheld: string[]; questions: number };

/**
 * Builds the rows from results the server has already computed (and already
 * suppressed). `compare` is the breakdown the person was looking at, if any.
 */
export function aggregateHandoff(results: SurveyResults, options: { minimumGroup: number; compare?: readonly Breakdown[] }): Handoff {
  const rows: HandoffRow[] = [];
  const withheld: string[] = [];
  const included = new Set<string>();
  const matrices = new Map(results.matrices.flatMap((matrix) => matrix.rows.map((name) => [name, cut(matrix.label)] as const)));
  const matrixFields = (name: string) => matrices.has(name) ? { matrix: matrices.get(name) } : {};
  for (const question of results.questions) {
    if (question.texts || question.kind === "text") continue;
    const base = question.base;
    if (base.answered < options.minimumGroup) {
      if (base.answered > 0) withheld.push(question.label);
      continue;
    }
    included.add(question.name);
    const common = { ...matrixFields(question.name), question: cut(question.label), question_key: question.name, compare_by: null, group: ALL, base: base.answered, skipped: base.skipped, not_asked: base.notApplicable };
    if (question.choices) {
      for (const choice of question.choices) rows.push({ ...common, answer: cut(choice.label), answer_key: choice.name, count: choice.count, percent: choice.percent, value: null });
    } else if (question.ranking) {
      for (const option of question.ranking) if (option.base >= options.minimumGroup) {
        rows.push({ ...common, answer: cut(option.label), answer_key: option.name, count: null, percent: null, value: null,
          base: option.base, average_position: option.averagePosition, first_place_count: option.firstPlaceCount, first_place_percent: option.firstPlacePercent });
      }
    } else if (question.confirmation) {
      rows.push({ ...common, answer: "Confirmed", answer_key: "OK", count: question.confirmation.confirmed,
        percent: null, value: null, base: question.confirmation.base, skipped: null, not_asked: null });
    } else if (question.numeric) {
      if (question.kind === "range") {
        for (const entry of question.numeric.distribution) rows.push({ ...common, answer: String(entry.value), answer_key: String(entry.value), count: entry.count, percent: base.answered ? Math.round((entry.count / base.answered) * 1000) / 10 : null, value: null });
      }
      rows.push({ ...common, answer: "Average", answer_key: "mean", count: null, percent: null, value: question.numeric.mean });
      rows.push({ ...common, answer: "Median", answer_key: "median", count: null, percent: null, value: question.numeric.median });
    }
  }
  for (const entry of options.compare ?? []) {
    if (!included.has(entry.question)) continue;
    for (const group of entry.groups) {
      if (group.suppressed) continue;
      const common = { ...matrixFields(entry.question), question: cut(entry.questionLabel), question_key: entry.question,
        compare_by: cut(entry.byLabel), group: cut(group.label), base: group.base, skipped: null, not_asked: null };
      if (entry.kind === "rank") {
        for (const option of group.ranking ?? []) if (option.base >= options.minimumGroup) {
          rows.push({ ...common, answer: cut(option.label), answer_key: option.name, count: null, percent: null, value: null,
            base: option.base, average_position: option.averagePosition, first_place_count: option.firstPlaceCount, first_place_percent: option.firstPlacePercent });
        }
        continue;
      }
      for (const choice of entry.choices) {
        const cell = group.cells[choice.name];
        rows.push({ ...common, answer: cut(choice.label), answer_key: choice.name, count: cell?.count ?? 0, percent: entry.kind === "acknowledge" ? null : cell?.percent ?? null, value: null });
      }
    }
  }
  return { rows, withheld, questions: included.size };
}
