/**
 * Wildcat Polls: the survey definition (docs/wildcat-polls.md).
 *
 * One definition drives the importer's review, the editor, the respondent
 * renderer, the server's validation and the results. It is plain data (JSON):
 * a published version stores exactly this object and is never changed.
 *
 * Identifiers (`name` on questions, groups and choices) are permanent within a
 * survey. Results, exports and conditions all read them.
 */

export const SURVEY_FORMAT_VERSION = 1 as const;

/** The supported XLSForm question types, as Byline names them. */
export type QuestionKind =
  | "select_one"
  | "select_multiple"
  | "text"
  | "integer"
  | "decimal"
  | "range"
  | "note";

export type Choice = { name: string; label: string };

export type ChoiceList = { name: string; choices: Choice[] };

type QuestionBase = {
  /** Stable identifier, unique across questions and groups (`survey` sheet `name`). */
  name: string;
  label: string;
  hint?: string;
  /** XLSForm `relevant`: shown only when this expression is true. */
  relevant?: string;
  /** Enclosing groups, outermost first (names from `groups`). */
  groups: string[];
  /** Where the row came from, for messages that point back at the workbook. */
  source?: { sheet: string; row: number };
};

export type NoteQuestion = QuestionBase & { kind: "note" };

type Answerable = QuestionBase & {
  required: boolean;
  requiredMessage?: string;
  constraint?: string;
  constraintMessage?: string;
  /** Marks a demographic question: results may break down by it, and small groups are suppressed. */
  appearance?: string;
};

export type SelectQuestion = Answerable & { kind: "select_one" | "select_multiple"; list: string };
export type TextQuestion = Answerable & { kind: "text"; multiline: boolean };
export type NumberQuestion = Answerable & { kind: "integer" | "decimal" };
export type RangeQuestion = Answerable & { kind: "range"; start: number; end: number; step: number; startLabel?: string; endLabel?: string };

export type Question = NoteQuestion | SelectQuestion | TextQuestion | NumberQuestion | RangeQuestion;
export type AnswerableQuestion = Exclude<Question, NoteQuestion>;

export type Group = {
  name: string;
  label: string;
  relevant?: string;
  /** Enclosing groups, outermost first. */
  groups: string[];
  source?: { sheet: string; row: number };
};

export type SurveySettings = {
  title: string;
  /** XLSForm `form_id`: informational; Byline's own IDs are the survey and version. */
  formId: string;
  /** XLSForm `version`, kept as the workbook said it. */
  version: string;
  description: string;
  welcome: string;
  thankYou: string;
  /** Questions results may break down by (grade, gender…). */
  breakdowns: string[];
};

export type SurveyDefinition = {
  format: typeof SURVEY_FORMAT_VERSION;
  settings: SurveySettings;
  /** In the order respondents meet them. */
  questions: Question[];
  groups: Group[];
  lists: ChoiceList[];
};

/** One question's recorded outcome. Unanswered and skipped are different facts; not applicable is computed. */
export type AnswerValue = string | string[] | number;
export type AnswerState = { status: "answered"; value: AnswerValue } | { status: "skipped" };
export type Answers = Record<string, AnswerState>;

/** What the server stores for every question of the version, after validation. */
export type StoredAnswer =
  | { status: "answered"; value: AnswerValue }
  | { status: "skipped" }
  | { status: "unanswered" }
  | { status: "not_applicable" };
export type StoredAnswers = Record<string, StoredAnswer>;

export const isAnswerable = (question: Question): question is AnswerableQuestion => question.kind !== "note";

export function emptySettings(title = "Untitled poll"): SurveySettings {
  return { title, formId: "", version: "", description: "", welcome: "", thankYou: "", breakdowns: [] };
}

export function emptyDefinition(title?: string): SurveyDefinition {
  return { format: SURVEY_FORMAT_VERSION, settings: emptySettings(title), questions: [], groups: [], lists: [] };
}

export const KIND_LABELS: Record<QuestionKind, string> = {
  select_one: "Single choice",
  select_multiple: "Multiple choice",
  text: "Written answer",
  integer: "Whole number",
  decimal: "Number",
  range: "Scale",
  note: "Information"
};
