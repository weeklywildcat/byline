import { choicesFor, visibleQuestionNames } from "./logic";
import { isSelect, type Answers, type Choice, type Group, type Question, type SelectQuestion, type SurveyDefinition } from "./types";

export const MAX_POLL_IMAGES = 60;

export const CHOICE_DISPLAYS = {
  list: "List",
  cards: "Cards",
  dropdown: "Dropdown",
  horizontal: "Horizontal",
  likert: "Likert",
  images: "Image cards"
} as const;

export type ChoiceDisplay = keyof typeof CHOICE_DISPLAYS;
export const DISPLAY_APPEARANCES: Record<ChoiceDisplay, string> = {
  list: "", cards: "compact", dropdown: "minimal", horizontal: "horizontal", likert: "likert", images: "columns"
};

export function choiceDisplay(definition: SurveyDefinition, question: SelectQuestion): ChoiceDisplay | "advanced" {
  const appearance = question.appearance?.toLowerCase().trim() ?? "";
  if (question.imageCards === true) return "images";
  switch (appearance) {
    case "columns":
      return question.imageCards !== false && choicesFor(definition, question).some((choice) => choice.image) ? "images" : "advanced";
    case "":
      return question.imageCards !== false && choicesFor(definition, question).some((choice) => choice.image) ? "images" : "list";
    case "list": return "list";
    case "compact": return "cards";
    case "minimal": return "dropdown";
    case "horizontal":
    case "horizontal-compact": return "horizontal";
    case "likert": return question.kind === "select_one" ? "likert" : "advanced";
    default: return "advanced";
  }
}

export function imageCardLists(definition: SurveyDefinition) {
  const lists = new Map(definition.lists.map((list) => [list.name, list.choices]));
  const imageLists = new Map<string, { question: SelectQuestion; choices: Choice[] }>();
  for (const question of definition.questions) {
    if (!isSelect(question) || !usesImageCards(definition, question) || imageLists.has(question.list)) continue;
    imageLists.set(question.list, { question, choices: lists.get(question.list) ?? [] });
  }
  return imageLists;
}

export function usesImageCards(definition: SurveyDefinition, question: Question): boolean {
  return isSelect(question) && choiceDisplay(definition, question) === "images";
}

export function likertChoices(): Choice[] {
  return [
    { name: "strongly_disagree", label: "Strongly disagree" },
    { name: "disagree", label: "Disagree" },
    { name: "neutral", label: "Neither agree nor disagree" },
    { name: "agree", label: "Agree" },
    { name: "strongly_agree", label: "Strongly agree" }
  ];
}

export function isChoiceImageFilename(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && value.trim() === value
    && value !== "." && value !== ".." && !/[/:\\\x00-\x1f\x7f]/.test(value);
}

export function isTableGroup(group: Group): boolean {
  return group.appearance?.toLowerCase() === "table-list";
}

export type Matrix = { group: Group; list: string; rows: SelectQuestion<"select_one">[] };

function isMatrixRow(question: Question): question is SelectQuestion<"select_one"> {
  return question.kind === "select_one" && question.imageCards !== true
    && ["", "list", "list-nolabel"].includes(question.appearance ?? "");
}

/** Only contiguous, direct single-choice rows using one list can share a matrix screen. */
export function matricesFor(definition: SurveyDefinition): Matrix[] {
  const groups = new Map(definition.groups.filter(isTableGroup).map((group) => [group.name, group]));
  if (!groups.size) return [];
  const nested = new Set(definition.groups.flatMap((group) => group.groups));
  const members = new Map<string, { rows: Matrix["rows"]; start: number; invalid: boolean }>();
  definition.questions.forEach((question, index) => {
    for (const name of question.groups) {
      const group = groups.get(name);
      if (!group) continue;
      const matrix = members.get(name) ?? { rows: [], start: index, invalid: false };
      members.set(name, matrix);
      if (nested.has(name) || index !== matrix.start + matrix.rows.length
        || question.groups.join("/") !== [...group.groups, group.name].join("/")
        || !isMatrixRow(question) || usesImageCards(definition, question)
        || (matrix.rows.length && question.list !== matrix.rows[0].list)) {
        matrix.invalid = true;
      } else {
        matrix.rows.push(question);
      }
    }
  });
  const matrices: Matrix[] = [];
  for (const [name, { rows, invalid }] of members) {
    if (!invalid && rows.length) matrices.push({ group: groups.get(name)!, list: rows[0].list, rows });
  }
  return matrices;
}

export type RespondentScreen =
  | { kind: "question"; name: string; question: Question }
  | { kind: "matrix"; name: string; matrix: Matrix };

/** Keep individual answers and visibility, while combining compatible rows on one screen. */
export function respondentScreens(definition: SurveyDefinition, answers?: Answers): RespondentScreen[] {
  const visible = answers ? visibleQuestionNames(definition, answers) : undefined;
  const matrices = new Map(matricesFor(definition).flatMap((matrix) => matrix.rows.map((row) => [row.name, matrix] as const)));
  const seen = new Set<string>();
  const screens: RespondentScreen[] = [];
  for (const question of definition.questions) {
    if (visible && !visible.has(question.name)) continue;
    const matrix = matrices.get(question.name);
    if (!matrix) {
      screens.push({ kind: "question", name: question.name, question });
    } else if (!seen.has(matrix.group.name)) {
      seen.add(matrix.group.name);
      const rows = visible ? matrix.rows.filter((row) => visible.has(row.name)) : matrix.rows;
      screens.push({ kind: "matrix", name: matrix.group.name, matrix: { ...matrix, rows } });
    }
  }
  return screens;
}

export function screenQuestions(screen: RespondentScreen): Question[] {
  return screen.kind === "matrix" ? screen.matrix.rows : [screen.question];
}
