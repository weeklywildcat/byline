import { compileExpression, ExpressionError, type Node } from "./expression";
import { choicesFor } from "./logic";
import { isAnswerable, type AnswerableQuestion, type SurveyDefinition } from "./types";

const comparisons = { is: "=", is_not: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
export type ConditionOperator = keyof typeof comparisons | "includes" | "excludes" | "answered" | "confirmed";
export type Condition = { question: string; op: ConditionOperator; value: string };
export type ConditionJoin = "and" | "or";
export type ConditionBuilder =
  | { kind: "empty"; refs: readonly string[] }
  | { kind: "simple"; refs: readonly string[]; join: ConditionJoin; rows: Condition[] }
  | { kind: "advanced"; refs: readonly string[]; source: string }
  | { kind: "invalid"; refs: readonly string[]; source: string; message: string };

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  is: "is", is_not: "is not", includes: "includes", excludes: "does not include",
  confirmed: "is confirmed", answered: "was answered", gt: "is greater than", gte: "is at least", lt: "is less than", lte: "is at most"
};

export function isNumeric(question: AnswerableQuestion) {
  return question.kind === "integer" || question.kind === "decimal" || question.kind === "range";
}

export const isConditionSource = (question: Parameters<typeof isAnswerable>[0]): question is AnswerableQuestion =>
  isAnswerable(question) && question.kind !== "rank";

export function operatorsFor(question: AnswerableQuestion): ConditionOperator[] {
  if (question.kind === "rank") return [];
  if (question.kind === "acknowledge") return ["confirmed", "answered"];
  if (question.kind === "select_multiple") return ["includes", "excludes", "answered"];
  if (isNumeric(question)) return ["is", "is_not", "gt", "gte", "lt", "lte", "answered"];
  return ["is", "is_not", "answered"];
}

export function newCondition(definition: SurveyDefinition, question: AnswerableQuestion, choice?: string): Condition {
  if (question.kind === "acknowledge") return { question: question.name, op: "confirmed", value: "" };
  const options = choicesFor(definition, question);
  const selected = options.find((option) => option.name === choice) ?? options[0];
  const op = selected ? (question.kind === "select_multiple" ? "includes" : "is") : "answered";
  return { question: question.name, op, value: selected?.name ?? (isNumeric(question) ? "0" : "") };
}

function literal(node: Node) {
  if (node.kind === "literal") return node.value;
  if (node.kind === "unary" && node.operand.kind === "literal" && typeof node.operand.value === "number") return -node.operand.value;
  return undefined;
}

function conditionRow(definition: SurveyDefinition, questions: ReadonlyMap<string, AnswerableQuestion>, node: Node): Condition | null {
  const negated = node.kind === "call" && node.name === "not";
  const selected = negated ? node.args[0] : node;
  if (selected.kind === "call" && selected.name === "selected") {
    const [ref, choice] = selected.args;
    if (ref.kind !== "ref" || choice.kind !== "literal" || typeof choice.value !== "string") return null;
    const question = questions.get(ref.name);
    if (question?.kind !== "select_multiple" || !choicesFor(definition, question).some((entry) => entry.name === choice.value)) return null;
    return { question: ref.name, op: negated ? "excludes" : "includes", value: choice.value };
  }
  if (node.kind !== "binary" || node.left.kind !== "ref") return null;
  const question = questions.get(node.left.name);
  if (!question || !isConditionSource(question)) return null;
  const value = literal(node.right);
  if (question.kind === "acknowledge" && node.op === "=" && value === "OK") {
    return { question: question.name, op: "confirmed", value: "" };
  }
  if (node.op === "!=" && value === "") return { question: question.name, op: "answered", value: "" };
  const op = (Object.keys(comparisons) as Array<keyof typeof comparisons>).find((key) => comparisons[key] === node.op);
  if (!op || !operatorsFor(question).includes(op)) return null;
  if (isNumeric(question)) {
    // String and number equality use different coercion in the engine.
    if (typeof value !== "number" || !Number.isFinite(value) || /e/i.test(String(value))) return null;
  } else if (typeof value !== "string" || (question.kind === "select_one" && !choicesFor(definition, question).some((choice) => choice.name === value))) return null;
  return { question: question.name, op, value: String(value) };
}

export function readCondition(definition: SurveyDefinition, source: string | undefined): ConditionBuilder {
  if (!source) return { kind: "empty", refs: [] };
  try {
    const { ast, refs, usesDot } = compileExpression(source);
    if (usesDot) return { kind: "invalid", source, refs, message: 'Display logic cannot use "." to refer to its own answer.' };
    const questions = new Map(definition.questions.filter(isAnswerable).map((question) => [question.name, question]));
    const join = ast.kind === "binary" && ast.op === "or" ? "or" : "and";
    const rows: Condition[] = [];
    const read = (node: Node): boolean => {
      if (node.kind === "binary" && node.op === join) return read(node.left) && read(node.right);
      const row = conditionRow(definition, questions, node);
      if (row) rows.push(row);
      return row !== null;
    };
    return read(ast) ? { kind: "simple", refs, join, rows } : { kind: "advanced", refs, source };
  } catch (error) {
    if (!(error instanceof ExpressionError)) throw error;
    return { kind: "invalid", refs: [], source, message: error.message };
  }
}

function quote(value: string): string {
  // The engine accepts straight and workbook-style curly quotes without escape sequences.
  for (const [open, close] of [["'", "'"], ['"', '"'], ["‘", "’"], ["“", "”"]]) {
    if (!value.includes(close)) return open + value + close;
  }
  throw new ExpressionError("This value uses every supported quotation mark. Use a different comparison value.");
}

export function writeConditions(definition: SurveyDefinition, join: ConditionJoin, rows: readonly Condition[]): string {
  if (!rows.length) return "";
  const questions = new Map(definition.questions.filter(isAnswerable).map((question) => [question.name, question]));
  const source = rows.map((row) => {
    const question = questions.get(row.question);
    if (!question || !operatorsFor(question).includes(row.op)) throw new ExpressionError("Choose an earlier question and a comparison for that question.");
    const ref = `\${${question.name}}`;
    if (row.op === "confirmed") return `${ref} = 'OK'`;
    if (row.op === "answered") return `${ref} != ''`;
    if ((question.kind === "select_one" || question.kind === "select_multiple") && !choicesFor(definition, question).some((choice) => choice.name === row.value)) {
      throw new ExpressionError("Choose an answer from the question's list.");
    }
    if (row.op === "includes" || row.op === "excludes") {
      const selected = `selected(${ref}, ${quote(row.value)})`;
      return row.op === "excludes" ? `not(${selected})` : selected;
    }
    if (!isNumeric(question)) return `${ref} ${comparisons[row.op]} ${quote(row.value)}`;
    const number = row.value.trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(number) || !Number.isFinite(Number(number))) throw new ExpressionError("Enter a number for the comparison.");
    return `${ref} ${comparisons[row.op]} ${number}`;
  }).join(` ${join} `);
  compileExpression(source);
  return source;
}
