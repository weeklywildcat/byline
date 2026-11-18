import { APIError } from "payload";
import { SURVEY_FORMAT_VERSION, type ChoiceList, type Group, type Question, type QuestionKind, type SurveyDefinition } from "./engine/types";
import { DEFINITION_LIMITS } from "./engine/xlsform";

/**
 * Rebuilds a definition from untrusted JSON (the visual editor's draft, or a
 * stored document): only known fields, of the right type, within limits. The
 * semantic checks (names, references, conditions) are `validateDefinition`.
 */

const KINDS: readonly QuestionKind[] = ["select_one", "select_multiple", "text", "integer", "decimal", "range", "note"];
type Raw = Record<string, unknown>;

const record = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {});
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const optional = (value: unknown, max: number) => { const result = text(value, max).trim(); return result ? result : undefined; };
// Keep the spelling of an existing XLSForm condition when other draft fields change.
const relevance = (value: unknown) => {
  const expression = text(value, 1000);
  return expression.trim() ? { relevant: expression } : {};
};
const list = (value: unknown, max: number, what: string): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new APIError(`The poll's ${what} must be a list.`, 400);
  if (value.length > max) throw new APIError(`A poll can have at most ${max} ${what}.`, 400);
  return value;
};
const names = (value: unknown, max: number) => list(value, max, "names").map((entry) => text(entry, DEFINITION_LIMITS.name)).filter(Boolean);
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const source = (value: unknown) => {
  const raw = record(value);
  return typeof raw.sheet === "string" && Number.isInteger(raw.row) ? { source: { sheet: raw.sheet.slice(0, 40), row: raw.row as number } } : {};
};

export function normalizeDefinition(input: unknown): SurveyDefinition {
  const raw = record(input);
  if (raw.format !== undefined && raw.format !== SURVEY_FORMAT_VERSION) throw new APIError("This poll definition is from an unsupported format.", 400);
  const settings = record(raw.settings);
  const lists: ChoiceList[] = list(raw.lists, DEFINITION_LIMITS.lists, "choice lists").map((entry) => {
    const item = record(entry);
    return {
      name: text(item.name, DEFINITION_LIMITS.name),
      choices: list(item.choices, DEFINITION_LIMITS.choicesPerList, "choices").map((choice) => ({ name: text(record(choice).name, DEFINITION_LIMITS.name), label: text(record(choice).label, DEFINITION_LIMITS.label) }))
    };
  });
  const groups: Group[] = list(raw.groups, 100, "groups").map((entry) => {
    const item = record(entry);
    return { name: text(item.name, DEFINITION_LIMITS.name), label: text(item.label, DEFINITION_LIMITS.label), ...relevance(item.relevant), groups: names(item.groups, DEFINITION_LIMITS.groupDepth), ...source(item.source) };
  });
  const questions: Question[] = list(raw.questions, DEFINITION_LIMITS.questions, "questions").map((entry) => {
    const item = record(entry);
    const kind = KINDS.includes(item.kind as QuestionKind) ? item.kind as QuestionKind : null;
    if (!kind) throw new APIError("A question has an unsupported type.", 400);
    const base = {
      name: text(item.name, DEFINITION_LIMITS.name),
      label: text(item.label, DEFINITION_LIMITS.label),
      ...(optional(item.hint, DEFINITION_LIMITS.hint) ? { hint: optional(item.hint, DEFINITION_LIMITS.hint) } : {}),
      ...relevance(item.relevant),
      groups: names(item.groups, DEFINITION_LIMITS.groupDepth),
      ...source(item.source)
    };
    if (kind === "note") return { ...base, kind };
    const answerable = {
      ...base,
      required: item.required === true,
      ...(optional(item.requiredMessage, 300) ? { requiredMessage: optional(item.requiredMessage, 300) } : {}),
      ...(optional(item.constraint, 1000) ? { constraint: optional(item.constraint, 1000) } : {}),
      ...(optional(item.constraintMessage, 300) ? { constraintMessage: optional(item.constraintMessage, 300) } : {}),
      ...(optional(item.appearance, 60) ? { appearance: optional(item.appearance, 60) } : {})
    };
    if (kind === "select_one" || kind === "select_multiple") return { ...answerable, kind, list: text(item.list, DEFINITION_LIMITS.name) };
    if (kind === "text") return { ...answerable, kind, multiline: item.multiline === true };
    if (kind === "range") {
      return {
        ...answerable, kind, start: finite(item.start, 1), end: finite(item.end, 5), step: finite(item.step, 1),
        ...(optional(item.startLabel, 80) ? { startLabel: optional(item.startLabel, 80) } : {}),
        ...(optional(item.endLabel, 80) ? { endLabel: optional(item.endLabel, 80) } : {})
      };
    }
    return { ...answerable, kind };
  });
  return {
    format: SURVEY_FORMAT_VERSION,
    settings: {
      title: text(settings.title, 200), formId: text(settings.formId, 64), version: text(settings.version, 64),
      description: text(settings.description, 2000), welcome: text(settings.welcome, 2000), thankYou: text(settings.thankYou, 1000),
      breakdowns: names(settings.breakdowns, 10)
    },
    questions, groups, lists
  };
}
