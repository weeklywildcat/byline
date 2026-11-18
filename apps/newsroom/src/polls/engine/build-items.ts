import { likertChoices, respondentScreens, screenQuestions, type RespondentScreen } from "./presentation";
import { hasChoices, type Group, type Question, type SelectQuestion, type SurveyDefinition } from "./types";

export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  const start = (/^[a-z_]/.test(base) ? base : `q_${base}`).slice(0, 64);
  let name = start;
  for (let n = 2; taken.has(name); n++) {
    const suffix = `_${n}`;
    name = start.slice(0, 64 - suffix.length) + suffix;
  }
  return name;
}

export function definitionNames(draft: SurveyDefinition): Set<string> {
  return new Set([...draft.questions, ...draft.groups].map(({ name }) => name));
}

export function createMatrix(draft: SurveyDefinition, at: number, groups: string[], reserved: ReadonlySet<string> = new Set()) {
  const taken = new Set([...definitionNames(draft), ...reserved]);
  const name = uniqueName("matrix", taken);
  taken.add(name);
  const list = uniqueName(`${name}_scale`, new Set(draft.lists.map((entry) => entry.name)));
  const columns = likertChoices().map((choice) => choice.name === "neutral" ? { ...choice, label: "Neutral" } : choice);
  const group: Group = { name, label: "How much do you agree with each statement?", appearance: "table-list", groups };
  const rows: SelectQuestion<"select_one">[] = ["First statement", "Second statement", "Third statement"].map((label, i) => {
    const rowName = uniqueName(`${name}_row_${i + 1}`, taken);
    taken.add(rowName);
    return { kind: "select_one", name: rowName, label, list, groups: [...groups, name], required: true };
  });
  return {
    name,
    draft: { ...draft, groups: [...draft.groups, group], lists: [...draft.lists, { name: list, choices: columns }],
      questions: [...draft.questions.slice(0, at), ...rows, ...draft.questions.slice(at)] }
  };
}

export function duplicateBuildItem(draft: SurveyDefinition, item: RespondentScreen, reserved: ReadonlySet<string> = new Set()) {
  const taken = new Set([...definitionNames(draft), ...reserved]);
  const name = uniqueName(`${item.name}_copy`, taken);
  taken.add(name);
  const questions = screenQuestions(item);
  const at = draft.questions.indexOf(questions.at(-1)!) + 1;
  if (item.kind === "question") {
    const copy = { ...item.question, name, source: undefined };
    return { name, draft: { ...draft, questions: [...draft.questions.slice(0, at), copy, ...draft.questions.slice(at)] } };
  }
  const { matrix } = item;
  const oldList = draft.lists.find((list) => list.name === matrix.list);
  const list = uniqueName(`${name}_scale`, new Set(draft.lists.map((entry) => entry.name)));
  const group = { ...matrix.group, name, source: undefined };
  const rowNames = new Map(matrix.rows.map((row) => {
    const rowName = uniqueName(`${row.name}_copy`, taken);
    taken.add(rowName);
    return [row.name, rowName];
  }));
  const remap = (source?: string) => source?.replace(/\$\{([^}]+)\}/g, (expression, ref: string) => rowNames.has(ref) ? `\${${rowNames.get(ref)}}` : expression);
  const rows = matrix.rows.map((row) => ({
    ...row, name: rowNames.get(row.name)!, list, groups: [...group.groups, group.name], source: undefined,
    relevant: remap(row.relevant), constraint: remap(row.constraint)
  }));
  return { name, draft: {
    ...draft, groups: [...draft.groups, group], lists: [...draft.lists, { name: list, choices: oldList?.choices ?? [] }],
    questions: [...draft.questions.slice(0, at), ...rows, ...draft.questions.slice(at)]
  } };
}

export function deleteBuildItem(draft: SurveyDefinition, item: RespondentScreen) {
  const removed = new Set(screenQuestions(item).map(({ name }) => name));
  const questions = draft.questions.filter(({ name }) => !removed.has(name));
  const matrix = item.kind === "matrix" ? item.matrix : null;
  const list = item.kind === "matrix" ? item.matrix.list : hasChoices(item.question) ? item.question.list : undefined;
  return {
    ...draft, questions,
    groups: matrix ? draft.groups.filter(({ name }) => name !== item.name) : draft.groups,
    lists: list && !questions.some((question) => hasChoices(question) && question.list === list)
      ? draft.lists.filter(({ name }) => name !== list) : draft.lists,
    settings: { ...draft.settings, breakdowns: draft.settings.breakdowns.filter((name) => !removed.has(name)) }
  };
}

export function restoreBuildItem(current: SurveyDefinition, original: SurveyDefinition, item: RespondentScreen): SurveyDefinition {
  const taken = definitionNames(current);
  const rows = screenQuestions(item);
  if (taken.has(item.name) || rows.some(({ name }) => taken.has(name))) return current;
  const next = original.questions.slice(original.questions.indexOf(rows.at(-1)!) + 1).find(({ name }) => taken.has(name));
  const at = next ? current.questions.findIndex(({ name }) => name === next.name) : current.questions.length;
  const lists = new Set(rows.filter(hasChoices).map(({ list }) => list));
  const groups = new Set(rows.flatMap(({ groups }) => groups));
  const breakdowns = new Set([...current.settings.breakdowns, ...original.settings.breakdowns.filter((name) => rows.some((row) => row.name === name))]);
  return {
    ...current, questions: [...current.questions.slice(0, at), ...rows, ...current.questions.slice(at)],
    groups: [...current.groups, ...original.groups.filter(({ name }) => groups.has(name) && !current.groups.some((group) => group.name === name))],
    lists: [...current.lists, ...original.lists.filter(({ name }) => lists.has(name) && !current.lists.some((list) => list.name === name))],
    settings: { ...current.settings, breakdowns: [...breakdowns] }
  };
}

/** A section move replaces only the enclosing path; Matrix rows keep their own names and semantics. */
export function changeMatrixSection(draft: SurveyDefinition, group: Group, path: string[]): SurveyDefinition {
  const matrix = respondentScreens(draft).find((item) => item.kind === "matrix" && item.name === group.name);
  if (!matrix || path.length >= 4) return draft;
  const names = new Set(screenQuestions(matrix).map(({ name }) => name));
  const others = draft.questions.filter(({ name }) => !names.has(name));
  const members = draft.questions.filter(({ name }) => names.has(name)).map((row) => ({ ...row, groups: [...path, group.name] }));
  const last = path.length ? others.findLastIndex(({ groups }) => groups.includes(path.at(-1)!)) : -1;
  const at = last >= 0 ? last + 1 : others.length;
  return {
    ...draft, groups: draft.groups.map((entry) => entry === group ? { ...group, groups: path } : entry),
    questions: [...others.slice(0, at), ...members, ...others.slice(at)]
  };
}

/** Use the respondent renderer for an unconditional, single-item Build preview. */
export function previewItem(draft: SurveyDefinition, item: RespondentScreen): SurveyDefinition {
  const questions = screenQuestions(item).map((question): Question => ({
    ...question, relevant: undefined, groups: item.kind === "matrix" ? [item.name] : []
  }));
  const usedLists = new Set(questions.filter(hasChoices).map(({ list }) => list));
  return {
    ...draft, questions, groups: item.kind === "matrix" ? [{ ...item.matrix.group, groups: [], relevant: undefined }] : [],
    lists: draft.lists.filter(({ name }) => usedLists.has(name))
  };
}
