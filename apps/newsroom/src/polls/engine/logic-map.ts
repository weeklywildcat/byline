import { OPERATOR_LABELS, readCondition, writeConditions, type Condition, type ConditionBuilder } from "./condition-builder";
import { compileExpression, evaluateCondition } from "./expression";
import { choicesFor, expressionValue, groupQuestionIndices, pruneAnswers, visibleQuestionNames } from "./logic";
import { isAnswerable, type Answers, type Group, type Question, type SurveyDefinition } from "./types";
import { validateDefinition, type ImportIssue } from "./xlsform";

export type LogicOwner = { kind: "question" | "section"; name: string };
export const ownerId = (owner: LogicOwner) => `${owner.kind}:${owner.name}`;
export const questionId = (name: string) => ownerId({ kind: "question", name });
export const choiceHandle = (name: string) => `choice:${name}`;
export const START = "start";
export const END = "end";
export const SHOWN_WHEN = "shown-when";

export type LogicTarget = LogicOwner & {
  item: Question | Group;
  start: number;
  members: readonly number[];
  builder: ConditionBuilder;
};

export type Dependency = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label: string;
  description: string;
  expression: string;
  row?: number;
};

export function diagnoseDefinition(definition: SurveyDefinition) {
  const byItem = new Map<Question | Group, string[]>();
  const issues = validateDefinition(definition, {
    onItemIssue(item, issue) {
      const messages = byItem.get(item) ?? [];
      messages.push(issue.message);
      byItem.set(item, messages);
    }
  });
  return { issues, byItem };
}

export function connectionProblem(source: Question | undefined, sourceIndex: number, target: LogicTarget | undefined): string | null {
  if (!source || !isAnswerable(source)) return "Choose an earlier question that a respondent can answer.";
  if (!target) return "Choose a question or section to show conditionally.";
  if (target.kind === "question" && source.name === target.name) return "A question cannot depend on its own answer.";
  if (target.kind === "section" && source.groups.includes(target.name)) return "A section cannot depend on an answer from inside that section.";
  if (sourceIndex >= target.start) return target.kind === "section"
    ? "Choose a question before the section begins."
    : "Choose a question that comes before the one it controls.";
  return null;
}

export function changeRelevance(definition: SurveyDefinition, target: LogicOwner, relevant: string | undefined): SurveyDefinition {
  const replace = <T extends Question | Group>(item: T): T => {
    if (item.name !== target.name || item.relevant === relevant) return item;
    const copy = { ...item, relevant };
    if (relevant === undefined) delete copy.relevant;
    return copy;
  };
  return target.kind === "question"
    ? { ...definition, questions: definition.questions.map(replace) }
    : { ...definition, groups: definition.groups.map(replace) };
}

export function relevanceProblem(definition: SurveyDefinition, target: LogicOwner, relevant: string | undefined): string | null {
  if (relevant === undefined) return null;
  const next = changeRelevance(definition, target, relevant);
  const items = target.kind === "section" ? next.groups : next.questions;
  const item = items.find((entry) => entry.name === target.name);
  if (!item) return "This destination is no longer in the poll.";
  let ownIssue: ImportIssue | undefined;
  const issues = validateDefinition(next, {
    onItemIssue(owner, issue) {
      if (owner === item && issue.column === "relevant") ownIssue ??= issue;
    }
  });
  if (ownIssue) return ownIssue.message;
  // An existing invalid draft can have a forward reference into this target.
  // Adding the reverse dependency could introduce a cycle reported at another item.
  const existing = new Set(validateDefinition(definition).filter((issue) => issue.column === "relevant").map((issue) => issue.message));
  return issues.find((issue) => issue.column === "relevant" && !existing.has(issue.message))?.message ?? null;
}

function rowLabel(row: Condition, choices: ReturnType<typeof choicesFor>, answered: boolean): string {
  if (row.op === "answered") return "Was answered";
  const value = choices.find((entry) => entry.name === row.value)?.label ?? (row.value || "blank");
  if (row.op === "is" && answered) return value;
  const operator = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[row.op as "gt" | "gte" | "lt" | "lte"] ?? OPERATOR_LABELS[row.op];
  return `${operator} ${value}`;
}

/** A projection of the current draft. Section gates are represented once, even for nested sections. */
export function projectLogic(definition: SurveyDefinition) {
  const groupMembers = groupQuestionIndices(definition);
  const targets = new Map<string, LogicTarget>();
  const questions = new Map<string, { question: Question; index: number }>();
  definition.questions.forEach((item, start) => {
    const target = { kind: "question" as const, name: item.name, item, start, members: [start], builder: readCondition(definition, item.relevant) };
    targets.set(ownerId(target), target);
    questions.set(item.name, { question: item, index: start });
  });
  for (const item of definition.groups) {
    const members = groupMembers.get(item.name) ?? [];
    const target = { kind: "section" as const, name: item.name, item, start: members[0] ?? definition.questions.length, members, builder: readCondition(definition, item.relevant) };
    targets.set(ownerId(target), target);
  }
  const dependencies: Dependency[] = [];
  for (const target of targets.values()) {
    const { builder } = target;
    const add = (ref: string, condition?: Condition, row?: number) => {
      const source = questions.get(ref)?.question;
      if (!source) return; // The validation message represents an unresolved reference.
      const choices = choicesFor(definition, source);
      const usesChoice = condition && (condition.op === "is" || condition.op === "includes") && choices.some((choice) => choice.name === condition.value);
      let expression = target.item.relevant ?? "";
      if (condition) {
        try { expression = writeConditions(definition, "and", [condition]); }
        catch { /* Preserve the original expression if this draft cannot be rebuilt. */ }
      }
      const label = condition ? rowLabel(condition, choices, Boolean(usesChoice && source.kind === "select_one")) : builder.kind === "invalid" ? "Invalid condition" : "Advanced condition";
      dependencies.push({
        id: JSON.stringify([ownerId(target), ref, row ?? "advanced", condition?.op, condition?.value]),
        source: questionId(ref), target: ownerId(target),
        sourceHandle: usesChoice ? choiceHandle(condition.value) : undefined,
        label, description: `Logic from ${source.label} to ${target.item.label || "Untitled section"} · ${label}`,
        expression, row
      });
    };
    if (builder.kind === "simple") builder.rows.forEach((row, index) => add(row.question, row, index));
    else builder.refs.forEach((ref) => add(ref));
  }
  return { targets, questions, dependencies, order: [START, ...definition.questions.map(({ name }) => questionId(name)), END] };
}

export type LogicProjection = ReturnType<typeof projectLogic>;

/** Test answers follow the same visibility and pruning rules as the respondent screen. */
export function projectTestPath(definition: SurveyDefinition, map: LogicProjection, answers: Answers) {
  const pruned = pruneAnswers(definition, answers);
  const visible = visibleQuestionNames(definition, pruned);
  const nodes = new Set([START, END]);
  for (const [id, target] of map.targets) {
    if (target.members.some((index) => visible.has(definition.questions[index].name))) nodes.add(id);
  }
  const active = new Set<string>();
  for (const dependency of map.dependencies) {
    if (!nodes.has(dependency.target)) continue;
    try {
      if (evaluateCondition(compileExpression(dependency.expression), {
        value: (name) => expressionValue(Object.hasOwn(pruned, name) ? pruned[name] : undefined)
      })) active.add(dependency.id);
    } catch { /* Invalid draft conditions never highlight. */ }
  }
  return { answers: pruned, visible, nodes, active };
}
