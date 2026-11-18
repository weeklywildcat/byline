import { compileExpression, ExpressionError, type ParsedExpression } from "./expression";
import { groupQuestionIndices } from "./logic";
import { isChoiceImageFilename, isTableGroup, matricesFor, usesImageCards } from "./presentation";
import { emptySettings, hasChoices, SURVEY_FORMAT_VERSION, type ChoiceList, type Group, type Question, type QuestionKind, type SurveyDefinition, type SurveySettings } from "./types";
import type { Sheet, Workbook, WriteSheet } from "./xlsx";

/**
 * The supported XLSForm subset (docs/wildcat-polls-xlsform.md): `survey`,
 * `choices` and `settings` sheets in, a `SurveyDefinition` plus every problem
 * found, each pointing at its sheet and row, out. Nothing in the workbook is
 * executed. A definition with any error is never published.
 */

export type ImportIssue = { severity: "error" | "warning"; sheet: string; row?: number; column?: string; message: string };
export type ImportResult = { definition: SurveyDefinition; issues: ImportIssue[] };

export const DEFINITION_LIMITS = { questions: 300, choicesPerList: 100, lists: 100, label: 1000, hint: 1000, appearance: 1000, name: 64, groupDepth: 4, rangeSteps: 101 } as const;

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const CHOICE_NAME = /^[^\s'"]+$/;
const TRUE = new Set(["yes", "true", "true()", "1", "y"]);
const FALSE = new Set(["", "no", "false", "false()", "0", "n"]);

const METADATA_TYPES = new Set(["start", "end", "today", "deviceid", "username", "phonenumber", "simserial", "subscriberid", "email", "audit", "start-geopoint", "background-audio", "instanceid"]);
const UNSUPPORTED_TYPES: Record<string, string> = {
  calculate: "Calculations are not supported. Ask the question directly, or work it out in the results.",
  date: "Date questions are not supported yet. Use a single-choice question with date ranges.",
  time: "Time questions are not supported.",
  datetime: "Date and time questions are not supported.",
  geopoint: "Location questions are not supported: Wildcat Polls does not collect where respondents are.",
  geotrace: "Location questions are not supported.",
  geoshape: "Location questions are not supported.",
  image: "Photo questions are not supported.",
  audio: "Audio questions are not supported.",
  video: "Video questions are not supported.",
  file: "File questions are not supported.",
  barcode: "Barcode questions are not supported.",
  hidden: "Hidden questions are not supported.",
  "begin repeat": "Repeats are not supported.",
  "end repeat": "Repeats are not supported.",
  select_one_from_file: "Choices from a file are not supported. List the choices on the choices sheet.",
  select_multiple_from_file: "Choices from a file are not supported. List the choices on the choices sheet."
};
const KNOWN_SURVEY_COLUMNS = new Set(["type", "name", "label", "hint", "required", "required_message", "relevant", "constraint", "constraint_message", "appearance", "parameters"]);
const IGNORED_SURVEY_COLUMNS: Record<string, string> = {
  choice_filter: "Choice filters are not supported; this column was ignored.",
  default: "Default answers are not supported; respondents always start blank.",
  calculation: "Calculations are not supported; this column was ignored.",
  read_only: "Read-only questions are not supported; this column was ignored.",
  repeat_count: "Repeats are not supported; this column was ignored.",
  trigger: "Triggers are not supported; this column was ignored."
};
const KNOWN_SETTINGS = new Set(["form_title", "form_id", "version", "default_language", "description", "welcome_message", "thank_you_message", "breakdowns"]);

type Table = { sheet: Sheet; header: string[]; headerRow: number; rows: Array<{ row: number; get: (column: string) => string }> };

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");

function table(sheet: Sheet, labelColumn: (headers: string[]) => string | null): Table {
  const first = sheet.rows.find((row) => row.cells.some((cell) => cell.trim()));
  if (!first) return { sheet, header: [], headerRow: 0, rows: [] };
  const header = first.cells.map((cell) => normalizeHeader(cell));
  const preferred = labelColumn(header);
  const index = new Map<string, number>();
  header.forEach((name, i) => { if (name && !index.has(name)) index.set(name, i); });
  if (preferred) index.set("label", header.indexOf(preferred));
  const preferredHint = preferred?.replace(/^label/, "hint");
  if (preferredHint && header.includes(preferredHint)) index.set("hint", header.indexOf(preferredHint));
  const rows = sheet.rows
    .filter((row) => row.row > first.row && row.cells.some((cell) => cell.trim()))
    .map((row) => ({ row: row.row, get: (column: string) => { const i = index.get(column); return i === undefined ? "" : (row.cells[i] ?? "").trim(); } }));
  return { sheet, header, headerRow: first.row, rows };
}

function findSheet(workbook: Workbook, name: string): Sheet | undefined {
  return workbook.sheets.find((sheet) => sheet.name.trim().toLowerCase() === name);
}

/** `label`, or the `label::<language>` column for the default language, or the first language column. */
function labelColumnFor(defaultLanguage: string) {
  return (headers: string[]) => {
    if (headers.includes("label")) return "label";
    const languages = headers.filter((header) => header.startsWith("label::"));
    if (!languages.length) return null;
    const wanted = defaultLanguage.trim().toLowerCase().replace(/\s+/g, "_");
    return languages.find((header) => wanted && header.slice(7).startsWith(wanted)) ?? languages[0];
  };
}

function parseParameters(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|(\S+))/g)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return result;
}

export function importWorkbook(workbook: Workbook): ImportResult {
  const issues: ImportIssue[] = [];
  const error = (sheet: string, row: number | undefined, message: string, column?: string) => issues.push({ severity: "error", sheet, row, column, message });
  const warn = (sheet: string, row: number | undefined, message: string, column?: string) => issues.push({ severity: "warning", sheet, row, column, message });

  for (const cell of workbook.formulaCells.slice(0, 5)) warn(cell.sheet, Number(/\d+$/.exec(cell.cell)?.[0]) || undefined, `Cell ${cell.cell} is a formula. Byline used the value the spreadsheet saved and never runs formulas; type the text directly instead.`);
  if (workbook.formulaCells.length > 5) warn(workbook.formulaCells[5].sheet, undefined, `${workbook.formulaCells.length - 5} more cells are formulas.`);

  /* ---- settings */
  const settings: SurveySettings = emptySettings("");
  let defaultLanguage = "";
  const settingsSheet = findSheet(workbook, "settings");
  if (settingsSheet) {
    const t = table(settingsSheet, () => null);
    const values = t.rows[0];
    for (const header of t.header) if (header && !KNOWN_SETTINGS.has(header)) warn(settingsSheet.name, t.headerRow, `The "${header}" setting is not used by Wildcat Polls and was ignored.`, header);
    if (values) {
      settings.title = values.get("form_title");
      settings.formId = values.get("form_id");
      settings.version = values.get("version");
      defaultLanguage = values.get("default_language");
      settings.description = values.get("description");
      settings.welcome = values.get("welcome_message");
      settings.thankYou = values.get("thank_you_message");
      settings.breakdowns = values.get("breakdowns").split(/[\s,]+/).filter(Boolean);
      if (t.rows.length > 1) warn(settingsSheet.name, t.rows[1].row, "Only the first row of settings is read.");
    }
  }

  /* ---- choices */
  const lists: ChoiceList[] = [];
  const choicesSheet = findSheet(workbook, "choices");
  if (choicesSheet) {
    const t = table(choicesSheet, labelColumnFor(defaultLanguage));
    const listColumn = t.header.includes("list_name") ? "list_name" : null;
    if (!listColumn) error(choicesSheet.name, t.headerRow || 1, "The choices sheet needs list_name, name and label columns.");
    else {
      for (const row of t.rows) {
        const listName = row.get("list_name");
        const name = row.get("name");
        const label = row.get("label");
        if (!listName) { error(choicesSheet.name, row.row, "This choice has no list_name.", "list_name"); continue; }
        if (!NAME.test(listName)) error(choicesSheet.name, row.row, `"${listName}" is not a valid list name. Use letters, numbers and underscores, starting with a letter.`, "list_name");
        if (!name) { error(choicesSheet.name, row.row, "This choice has no name.", "name"); continue; }
        if (!CHOICE_NAME.test(name) || name.length > DEFINITION_LIMITS.name) error(choicesSheet.name, row.row, `"${name}" is not a valid choice name: no spaces or quotes, at most ${DEFINITION_LIMITS.name} characters.`, "name");
        if (!label) error(choicesSheet.name, row.row, `Choice "${name}" has no label.`, "label");
        if (label.length > DEFINITION_LIMITS.label) error(choicesSheet.name, row.row, "This label is too long.", "label");
        let list = lists.find((entry) => entry.name === listName);
        if (!list) { list = { name: listName, choices: [] }; lists.push(list); }
        if (list.choices.some((choice) => choice.name === name)) { error(choicesSheet.name, row.row, `List "${listName}" already has a choice named "${name}".`, "name"); continue; }
        const image = row.get("image") || row.get("media::image");
        if (image && !isChoiceImageFilename(image)) error(choicesSheet.name, row.row, "Use an image filename, without a path or URL.", "image");
        if (image && isChoiceImageFilename(image)) warn(choicesSheet.name, row.row, `“${image}” is referenced by this choice. Choose the matching image from Media before publishing.`, "image");
        list.choices.push({ name, label, ...(isChoiceImageFilename(image) ? { image: { sourceName: image } } : {}) });
      }
      for (const list of lists) if (list.choices.length > DEFINITION_LIMITS.choicesPerList) error(choicesSheet.name, undefined, `List "${list.name}" has more than ${DEFINITION_LIMITS.choicesPerList} choices.`);
    }
  }

  /* ---- survey */
  const questions: Question[] = [];
  const groups: Group[] = [];
  const surveySheet = findSheet(workbook, "survey");
  const sheetName = surveySheet?.name ?? "survey";
  if (!surveySheet) {
    error("survey", undefined, "The workbook needs a sheet named \"survey\".");
  } else {
    const t = table(surveySheet, labelColumnFor(defaultLanguage));
    if (!t.header.includes("type") || !t.header.includes("name")) error(sheetName, t.headerRow || 1, "The survey sheet needs type, name and label columns.");
    for (const header of t.header) {
      if (!header || KNOWN_SURVEY_COLUMNS.has(header) || header.startsWith("label::") || header.startsWith("hint::") || header.startsWith("media::") || header.startsWith("constraint_message::") || header.startsWith("required_message::")) continue;
      if (IGNORED_SURVEY_COLUMNS[header] && t.rows.some((row) => row.get(header))) warn(sheetName, t.headerRow, IGNORED_SURVEY_COLUMNS[header], header);
    }
    const stack: Array<{ name: string; row: number }> = [];
    for (const row of t.rows) {
      const rawType = row.get("type").replace(/\s+/g, " ");
      const type = rawType.toLowerCase();
      const name = row.get("name");
      const label = row.get("label");
      const hint = row.get("hint");
      const relevant = row.get("relevant");
      const appearance = row.get("appearance");
      if (appearance.length > DEFINITION_LIMITS.appearance) error(sheetName, row.row, "This appearance is too long.", "appearance");
      const source = { sheet: sheetName, row: row.row };
      const at = (message: string, column?: string) => error(sheetName, row.row, message, column);
      if (!type) { if (name || label) at("This row has no type.", "type"); continue; }
      if (type === "begin group" || type === "begin_group") {
        if (!name) { at("A group needs a name.", "name"); continue; }
        if (stack.length >= DEFINITION_LIMITS.groupDepth) at(`Groups can be nested at most ${DEFINITION_LIMITS.groupDepth} deep.`);
        groups.push({
          name, label, ...(hint ? { hint } : {}), ...(appearance ? { appearance } : {}),
          ...(relevant ? { relevant } : {}), groups: stack.map((entry) => entry.name), source
        });
        stack.push({ name, row: row.row });
        continue;
      }
      if (type === "end group" || type === "end_group") {
        if (!stack.length) at("This end group has no matching begin group.", "type");
        else stack.pop();
        continue;
      }
      if (METADATA_TYPES.has(type)) { warn(sheetName, row.row, `"${rawType}" metadata is not collected: Byline records the session and submission times itself.`, "type"); continue; }
      const base = type.split(" ")[0];
      if (UNSUPPORTED_TYPES[type] || UNSUPPORTED_TYPES[base]) { at(UNSUPPORTED_TYPES[type] ?? UNSUPPORTED_TYPES[base], "type"); continue; }
      if (!name) { at("This question has no name.", "name"); continue; }
      if (!label) at(`Question "${name}" has no label.`, "label");
      if (label.length > DEFINITION_LIMITS.label) at("This label is too long.", "label");
      if (hint.length > DEFINITION_LIMITS.hint) at("This hint is too long.", "hint");
      const requiredText = row.get("required").toLowerCase();
      if (!TRUE.has(requiredText) && !FALSE.has(requiredText)) at(`Write "yes" or leave required empty (found "${row.get("required")}").`, "required");
      const required = TRUE.has(requiredText);
      const constraint = row.get("constraint");
      const common = {
        name, label, ...(hint ? { hint } : {}), ...(relevant ? { relevant } : {}), groups: stack.map((entry) => entry.name), source
      };
      const answerable = {
        ...common, required,
        ...(row.get("required_message") ? { requiredMessage: row.get("required_message") } : {}),
        ...(constraint ? { constraint } : {}),
        ...(row.get("constraint_message") ? { constraintMessage: row.get("constraint_message") } : {}),
        ...(appearance ? { appearance } : {})
      };
      const selectMatch = /^(select_one|select_multiple)\s+(\S+)(?:\s+or_other)?$/.exec(type);
      if (/^(select_one|select_multiple)\s+\S+\s+or_other$/.test(type)) warn(sheetName, row.row, "or_other is not supported. Add an \"Other\" choice and a follow-up text question instead.", "type");
      if (selectMatch) {
        const listName = rawType.split(" ")[1];
        if (!lists.some((list) => list.name === listName)) at(`There is no choice list named "${listName}" on the choices sheet.`, "type");
        questions.push({ ...answerable, kind: selectMatch[1] as "select_one" | "select_multiple", list: listName });
        continue;
      }
      const rankMatch = /^rank\s+(\S+)$/.exec(rawType.replace(/^rank/i, "rank"));
      if (rankMatch) {
        const listName = rankMatch[1];
        if (!lists.some((list) => list.name === listName)) at(`There is no choice list named "${listName}" on the choices sheet.`, "type");
        questions.push({ ...answerable, kind: "rank", list: listName });
        continue;
      }
      if (type === "acknowledge" || type === "trigger") {
        questions.push({ ...answerable, kind: "acknowledge" });
        continue;
      }
      if (type === "select_one" || type === "select_multiple" || type === "rank") { at(`Name the choice list after ${type}, for example "${type} yes_no".`, "type"); continue; }
      if (type === "note") {
        if (required) warn(sheetName, row.row, "A note cannot be required; this was ignored.", "required");
        if (constraint) warn(sheetName, row.row, "A note has no answer to constrain; this was ignored.", "constraint");
        questions.push({ ...common, kind: "note" });
        continue;
      }
      if (type === "text") { questions.push({ ...answerable, kind: "text", multiline: /multiline/.test(appearance) }); continue; }
      if (type === "integer" || type === "decimal") { questions.push({ ...answerable, kind: type }); continue; }
      if (type === "range") {
        const parameters = parseParameters(row.get("parameters"));
        const start = Number(parameters.start ?? 1);
        const end = Number(parameters.end ?? 10);
        const step = Number(parameters.step ?? 1);
        if (![start, end, step].every(Number.isFinite) || step <= 0 || start === end) at("A range needs parameters like \"start=1 end=5 step=1\".", "parameters");
        else if (Math.abs(end - start) / step + 1 > DEFINITION_LIMITS.rangeSteps) at(`A range can have at most ${DEFINITION_LIMITS.rangeSteps} points.`, "parameters");
        questions.push({ ...answerable, kind: "range", start, end, step, ...(parameters.start_label ? { startLabel: parameters.start_label } : {}), ...(parameters.end_label ? { endLabel: parameters.end_label } : {}) });
        continue;
      }
      at(`"${rawType}" is not a supported question type. See the Wildcat Polls spreadsheet guide.`, "type");
    }
    for (const open of stack) error(sheetName, open.row, `Group "${open.name}" is never closed with "end group".`, "type");
  }

  const definition: SurveyDefinition = { format: SURVEY_FORMAT_VERSION, settings, questions, groups, lists };
  if (!definition.settings.title) definition.settings.title = definition.settings.formId || "Untitled poll";
  const matrices = new Set(matricesFor(definition).map(({ group }) => group.name));
  for (const group of groups) {
    if (isTableGroup(group) && !matrices.has(group.name)) {
      warn(sheetName, group.source?.row, `“${group.label || group.name}” is an imported table. The Matrix editor requires direct single-choice rows that share one answer list. The imported structure was kept.`, "appearance");
    }
  }
  issues.push(...validateDefinition(definition, { checkUnusedLists: true }));
  return { definition, issues: dedupe(issues) };
}

function dedupe(issues: ImportIssue[]): ImportIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}|${issue.sheet}|${issue.row}|${issue.column}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The structural checks every definition passes before it can be published,
 * whether it came from a workbook or the visual editor: unique names, known
 * references, valid expressions, choices that exist, no circular or forward
 * conditions.
 */
export function validateDefinition(definition: SurveyDefinition, options: { checkUnusedLists?: boolean; onItemIssue?: (item: Question | Group, issue: ImportIssue) => void } = {}): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const where = (item: { source?: { sheet: string; row: number } }) => ({ sheet: item.source?.sheet ?? "survey", row: item.source?.row });
  const error = (item: Question | Group, message: string, column?: string) => {
    const issue: ImportIssue = { severity: "error", ...where(item), column, message };
    issues.push(issue);
    options.onItemIssue?.(item, issue);
  };

  if (!definition.questions.some((question) => question.kind !== "note")) issues.push({ severity: "error", sheet: "survey", message: "The survey has no questions to answer." });
  if (definition.questions.length > DEFINITION_LIMITS.questions) issues.push({ severity: "error", sheet: "survey", message: `A poll can have at most ${DEFINITION_LIMITS.questions} questions.` });
  if (definition.lists.length > DEFINITION_LIMITS.lists) issues.push({ severity: "error", sheet: "choices", message: `A poll can have at most ${DEFINITION_LIMITS.lists} choice lists.` });
  if (!definition.settings.title.trim()) issues.push({ severity: "error", sheet: "settings", message: "The poll needs a title (form_title)." });

  const names = new Map<string, { kind: "question" | "group"; index: number }>();
  definition.groups.forEach((group, index) => {
    if (!NAME.test(group.name) || group.name.length > DEFINITION_LIMITS.name) error(group, `"${group.name}" is not a valid name. Use letters, numbers and underscores, starting with a letter.`, "name");
    if (names.has(group.name)) error(group, `The name "${group.name}" is used twice.`, "name");
    names.set(group.name, { kind: "group", index });
  });
  definition.questions.forEach((question, index) => {
    if (!NAME.test(question.name) || question.name.length > DEFINITION_LIMITS.name) error(question, `"${question.name}" is not a valid name. Use letters, numbers and underscores, starting with a letter.`, "name");
    if (names.has(question.name)) error(question, `The name "${question.name}" is used twice.`, "name");
    names.set(question.name, { kind: "question", index });
    if (!question.label.trim()) error(question, `Question "${question.name}" has no label.`, "label");
    if (hasChoices(question)) {
      const list = definition.lists.find((entry) => entry.name === question.list);
      if (!list) error(question, `There is no choice list named "${question.list}".`, "type");
      else if (list.choices.length < 2) error(question, `List "${question.list}" needs at least two choices.`, "type");
    }
  });
  const listNames = new Set<string>();
  for (const list of definition.lists) {
    if (!NAME.test(list.name) || list.name.length > DEFINITION_LIMITS.name) {
      issues.push({ severity: "error", sheet: "choices", message: `“${list.name}” is not a valid list name.` });
    }
    if (listNames.has(list.name)) issues.push({ severity: "error", sheet: "choices", message: `List “${list.name}” is defined twice.` });
    listNames.add(list.name);
    const seen = new Set<string>();
    for (const choice of list.choices) {
      if (!CHOICE_NAME.test(choice.name) || choice.name.length > DEFINITION_LIMITS.name) {
        issues.push({ severity: "error", sheet: "choices", message: `List “${list.name}” has an invalid answer identifier “${choice.name}”.` });
      }
      if (seen.has(choice.name)) issues.push({ severity: "error", sheet: "choices", message: `List "${list.name}" has two choices named "${choice.name}".` });
      seen.add(choice.name);
      if (!choice.label.trim()) issues.push({ severity: "error", sheet: "choices", message: `Choice "${choice.name}" in "${list.name}" has no label.` });
    }
    if (options.checkUnusedLists && !definition.questions.some((question) => hasChoices(question) && question.list === list.name)) {
      issues.push({ severity: "warning", sheet: "choices", message: `List "${list.name}" is not used by any question.` });
    }
  }

  const questionByName = new Map(definition.questions.map((question, index) => [question.name, { question, index }]));
  const parse = (owner: Question | Group, source: string, column: "relevant" | "constraint", ownIndex: number): ParsedExpression | null => {
    let parsed: ParsedExpression;
    try {
      parsed = compileExpression(source);
    } catch (problem) {
      error(owner, `${column}: ${problem instanceof ExpressionError ? problem.message : "This expression cannot be read."}`, column);
      return null;
    }
    for (const ref of parsed.refs) {
      const target = names.get(ref);
      if (!target) { error(owner, `${column}: \${${ref}} is not a question in this survey.`, column); continue; }
      if (target.kind === "group") { error(owner, `${column}: \${${ref}} is a group, which has no answer.`, column); continue; }
      const question = definition.questions[target.index];
      if (question.kind === "note") error(owner, `${column}: \${${ref}} is a note, which has no answer.`, column);
      if (column === "relevant" && target.index >= ownIndex && ref !== owner.name) error(owner, `relevant: \${${ref}} is asked later in the survey, so it would always be empty here. Move this question after it.`, column);
    }
    if (column === "relevant" && parsed.usesDot) error(owner, "relevant: \".\" means the question's own answer, which only a constraint can use.", column);
    for (const { question: ref, choice } of parsed.selectedRefs) {
      const target = questionByName.get(ref)?.question;
      if (!target || choice === null) continue;
      if (hasChoices(target)) {
        const list = definition.lists.find((entry) => entry.name === target.list);
        if (list && !list.choices.some((entry) => entry.name === choice)) error(owner, `${column}: "${choice}" is not a choice of \${${ref}} (list "${target.list}").`, column);
      }
    }
    return parsed;
  };

  // Group relevance applies to every question inside; the first question in a group is where the group starts.
  const groupMembers = groupQuestionIndices(definition);
  const edges = new Map<string, Set<string>>();
  for (const group of definition.groups) {
    if (!group.relevant) continue;
    const parsed = parse(group, group.relevant, "relevant", groupMembers.get(group.name)?.[0] ?? definition.questions.length);
    if (parsed) for (const question of definition.questions) if (question.groups.includes(group.name)) for (const ref of parsed.refs) {
      if (question.groups.length && definition.questions.find((q) => q.name === ref)?.groups.includes(group.name)) error(group, `relevant: \${${ref}} is inside the group "${group.name}" that it controls.`, "relevant");
      edges.set(question.name, new Set([...(edges.get(question.name) ?? []), ref]));
    }
  }
  definition.questions.forEach((question, index) => {
    if (question.relevant) {
      const parsed = parse(question, question.relevant, "relevant", index);
      if (parsed) {
        if (parsed.refs.includes(question.name)) error(question, `relevant: "${question.name}" depends on its own answer.`, "relevant");
        edges.set(question.name, new Set([...(edges.get(question.name) ?? []), ...parsed.refs]));
      }
    }
    if (question.kind !== "note" && question.constraint) parse(question, question.constraint, "constraint", index);
  });

  // Circular conditions (forward references are already refused, so this catches anything left).
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (name: string) => {
    state.set(name, "visiting");
    stack.push(name);
    for (const next of edges.get(name) ?? []) {
      if (state.get(next) === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(next)), next];
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          const owner = questionByName.get(name)?.question;
          if (owner) error(owner, `These conditions depend on each other in a circle: ${cycle.join(" → ")}.`, "relevant");
        }
      } else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const name of edges.keys()) if (!state.has(name)) visit(name);

  for (const name of definition.settings.breakdowns) {
    const question = questionByName.get(name)?.question;
    if (!question) issues.push({ severity: "error", sheet: "settings", message: `breakdowns: "${name}" is not a question in this survey.`, column: "breakdowns" });
    else if (question.kind !== "select_one") issues.push({ severity: "error", sheet: "settings", message: `breakdowns: "${name}" must be a single-choice question.`, column: "breakdowns" });
  }
  return issues;
}

export const hasErrors = (issues: readonly ImportIssue[]) => issues.some((issue) => issue.severity === "error");

/* ------------------------------------------------------------------ export */

const KIND_TYPE: Record<QuestionKind, string> = { select_one: "select_one", select_multiple: "select_multiple", rank: "rank", acknowledge: "acknowledge", text: "text", integer: "integer", decimal: "decimal", range: "range", note: "note" };

/** A definition as an XLSForm workbook: the same format the importer reads, so a draft can round-trip. */
export function definitionToSheets(definition: SurveyDefinition): WriteSheet[] {
  const survey: string[][] = [["type", "name", "label", "hint", "required", "relevant", "constraint", "constraint_message", "appearance", "parameters", "required_message"]];
  const open: string[] = [];
  const closeTo = (depth: number) => { while (open.length > depth) { open.pop(); survey.push(["end group"]); } };
  const groupByName = new Map(definition.groups.map((group) => [group.name, group]));
  for (const question of definition.questions) {
    let common = 0;
    while (common < open.length && open[common] === question.groups[common]) common++;
    closeTo(common);
    for (const name of question.groups.slice(common)) {
      const group = groupByName.get(name);
      survey.push(["begin group", name, group?.label ?? "", group?.hint ?? "", "", group?.relevant ?? "", "", "", group?.appearance ?? ""]);
      open.push(name);
    }
    const type = hasChoices(question) ? `${KIND_TYPE[question.kind]} ${question.list}` : KIND_TYPE[question.kind];
    const answerable = question.kind !== "note";
    const parameters = question.kind === "range" ? [`start=${question.start}`, `end=${question.end}`, `step=${question.step}`, ...(question.startLabel ? [`start_label='${question.startLabel}'`] : []), ...(question.endLabel ? [`end_label='${question.endLabel}'`] : [])].join(" ") : "";
    const appearance = answerable && usesImageCards(definition, question) ? question.appearance || "columns"
      : question.kind === "text" && question.multiline ? question.appearance || "multiline"
      : answerable ? question.appearance ?? "" : "";
    survey.push([type, question.name, question.label, question.hint ?? "", answerable && question.required ? "yes" : "", question.relevant ?? "", answerable ? question.constraint ?? "" : "", answerable ? question.constraintMessage ?? "" : "", appearance, parameters, answerable ? question.requiredMessage ?? "" : ""]);
  }
  closeTo(0);
  const choices: string[][] = [["list_name", "name", "label", "image"], ...definition.lists.flatMap((list) =>
    list.choices.map((choice) => [list.name, choice.name, choice.label, choice.image?.sourceName ?? (choice.image?.mediaId ? `${list.name}-${choice.name}.webp` : "")])
  )];
  const s = definition.settings;
  const settings: string[][] = [["form_title", "form_id", "version", "description", "welcome_message", "thank_you_message", "breakdowns"], [s.title, s.formId, s.version, s.description, s.welcome, s.thankYou, s.breakdowns.join(" ")]];
  return [
    { name: "survey", rows: survey, widths: [26, 22, 60, 36, 10, 40, 30, 30, 14, 30, 35] },
    { name: "choices", rows: choices, widths: [20, 22, 50, 30] },
    { name: "settings", rows: settings, widths: [36, 22, 12, 50, 50, 50, 24] }
  ];
}
