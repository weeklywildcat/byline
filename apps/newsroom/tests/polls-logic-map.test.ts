import { describe, expect, it } from "vitest";
import { normalizeDefinition } from "../src/polls/definition";
import { newCondition, readCondition, writeConditions } from "../src/polls/engine/condition-builder";
import { visibleQuestionNames } from "../src/polls/engine/logic";
import { changeRelevance, connectionProblem, diagnoseDefinition, projectLogic, projectTestPath, questionId, relevanceProblem, START, END } from "../src/polls/engine/logic-map";
import { emptyDefinition, type Question, type SurveyDefinition } from "../src/polls/engine/types";
import { validateDefinition } from "../src/polls/engine/xlsform";
import { arrangeLogicMap } from "../src/ui/polls/logic-layout";
import { normalizePositions } from "../src/ui/polls/logic-positions";

function poll(): SurveyDefinition {
  return {
    ...emptyDefinition("Logic Map"),
    lists: [{ name: "answers", choices: [{ name: "yes", label: "Yes" }, { name: "no", label: "No" }] }],
    groups: [{ name: "outer", label: "Outer", groups: [], relevant: "${book} = 'yes'" }, { name: "inner", label: "Inner", groups: ["outer"] }],
    questions: [
      { name: "book", label: "Book report?", groups: [], kind: "select_one", required: true, list: "answers" },
      { name: "topics", label: "Topics?", groups: [], kind: "select_multiple", required: false, list: "answers" },
      { name: "count", label: "How many?", groups: [], kind: "integer", required: false },
      { name: "note", label: "Thanks for helping", groups: ["outer"], kind: "note" },
      { name: "detail", label: "Tell us more", groups: ["outer", "inner"], kind: "text", required: false, multiline: false, relevant: "${count} >= 3" }
    ]
  };
}

describe("Poll condition builder", () => {
  it("distinguishes empty, invalid and advanced conditions", () => {
    const draft = poll();
    expect(readCondition(draft, undefined).kind).toBe("empty");
    expect(readCondition(draft, "${count} >").kind).toBe("invalid");
    const source = "  ${book} = \"yes\" and (selected(${topics}, 'yes') or ${count} >= 3)  ";
    expect(readCondition(draft, source)).toEqual({ kind: "advanced", source, refs: ["book", "topics", "count"] });
    const withRule = changeRelevance(draft, { kind: "question", name: "detail" }, source);
    const editedElsewhere = { ...withRule, settings: { ...withRule.settings, thankYou: "Thank you!" } };
    expect(normalizeDefinition(editedElsewhere).questions.at(-1)?.relevant).toBe(source);
    expect(projectLogic(withRule).dependencies.filter((edge) => edge.target === "question:detail").map((edge) => [edge.source, edge.label, edge.expression])).toEqual(
      ["book", "topics", "count"].map((name) => [questionId(name), "Advanced condition", source])
    );
  });

  it.each([
    ["${book} = 'yes'", "is", "yes"],
    ["${book} != 'no'", "is_not", "no"],
    ["${book} != ''", "answered", ""],
    ["selected(${topics}, 'yes')", "includes", "yes"],
    ["not(selected(${topics}, 'no'))", "excludes", "no"],
    ["${count} >= 3", "gte", "3"],
    ["${count} < -2.5", "lt", "-2.5"]
  ])("round-trips %s through the shared builder", (expression, op, value) => {
    const draft = poll();
    const result = readCondition(draft, expression);
    expect(result).toMatchObject({ kind: "simple", rows: [{ op, value }] });
    if (result.kind !== "simple") throw new Error("Expected a builder rule");
    expect(writeConditions(draft, result.join, result.rows)).toBe(expression);
    expect(validateDefinition(changeRelevance(draft, { kind: "question", name: "detail" }, expression))).toEqual([]);
  });

  it.each(["and", "or"] as const)("reads flat %s without splitting quoted values", (join) => {
    const draft = poll();
    const result = readCondition(draft, `${"${detail}"} = "It's true and useful" ${join} ${"${count}"} > 1`);
    expect(result).toMatchObject({ kind: "simple", join, rows: [{ value: "It's true and useful" }, { value: "1" }] });
  });

  it("preserves equality coercion and multiple-choice semantics by treating other forms as Advanced", () => {
    const draft = poll();
    for (const expression of ["${count} = '03'", "${topics} = 'yes no'", "selected(${book}, 'yes')"]) {
      expect(readCondition(draft, expression)).toMatchObject({ kind: "advanced", source: expression });
    }
  });
});

describe("Poll Logic Map", () => {
  it("projects section conditions once and derives stable identifiers independently of layout and order", () => {
    const draft = poll();
    const before = structuredClone(draft);
    const map = projectLogic(draft);
    const positions = arrangeLogicMap(map);
    positions[questionId("book")].x += 30;
    expect(draft).toEqual(before);
    expect(map.order).toEqual([START, ...draft.questions.map((question) => questionId(question.name)), END]);
    expect(map.targets.get("section:outer")?.members).toEqual([3, 4]);
    expect(map.targets.get("section:inner")?.members).toEqual([4]);
    expect(map.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ source: "question:book", sourceHandle: "choice:yes", target: "section:outer", label: "Yes" })]));
    expect(map.dependencies.filter((edge) => edge.source === "question:book")).toHaveLength(1);
    const reordered = { ...draft, questions: [draft.questions[1], draft.questions[0], ...draft.questions.slice(2)] };
    expect(projectLogic(reordered).order[2]).toBe("question:book");
    expect(projectLogic(reordered).dependencies).toEqual(map.dependencies);
  });

  it("rejects a forward reference, a note and an answer inside a section", () => {
    const draft = poll();
    const map = projectLogic(draft);
    expect(connectionProblem(draft.questions[2], 2, map.targets.get("question:book"))).toMatch(/comes before/);
    expect(connectionProblem(draft.questions[3], 3, map.targets.get("question:detail"))).toMatch(/can answer/);
    expect(connectionProblem(draft.questions[4], 4, map.targets.get("section:outer"))).toMatch(/inside that section/);
    const broken = changeRelevance(draft, { kind: "question", name: "book" }, "${count} >= 3");
    expect(diagnoseDefinition(broken).byItem.get(broken.questions[0])?.[0]).toMatch(/asked later/);
  });

  it("blocks a new cycle even if the other rule already has a forward reference", () => {
    const draft = changeRelevance(poll(), { kind: "question", name: "topics" }, "${count} >= 3");
    expect(relevanceProblem(draft, { kind: "question", name: "count" }, "selected(${topics}, 'yes')")).toMatch(/depend on each other in a circle/);
  });

  it("keeps only finite positions belonging to current questions and sections", () => {
    expect(normalizePositions({
      "question:book": { x: 49.2, y: 50 }, "question:removed": { x: 21, y: 5 },
      "question:detail": { x: Infinity, y: 5 }, "section:outer": { x: 400000, y: -1 }
    }, new Set(["question:book", "question:detail", "section:outer"]))).toEqual({ "question:book": { x: 49, y: 50 } });
  });

  it("generates a valid rule, removes it and prunes test answers using the respondent path", () => {
    const draft = poll();
    const target = { kind: "question", name: "topics" } as const;
    const book = draft.questions[0];
    if (book.kind !== "select_one") throw new Error("Missing fixture");
    const expression = writeConditions(draft, "and", [newCondition(draft, book, "yes")]);
    const gated = changeRelevance(draft, target, expression);
    expect(validateDefinition(gated)).toEqual([]);
    const map = projectLogic(gated);
    const yes = projectTestPath(gated, map, { book: { status: "answered", value: "yes" }, topics: { status: "answered", value: ["yes"] } });
    expect(yes.nodes.has("section:outer")).toBe(true);
    expect(yes.nodes.has("section:inner")).toBe(false);
    expect(yes.active.size).toBe(2);
    const no = projectTestPath(gated, map, { ...yes.answers, book: { status: "answered", value: "no" } });
    expect(no.answers).not.toHaveProperty("topics");
    expect(no.visible).toEqual(visibleQuestionNames(gated, no.answers));
    expect(no.active.size).toBe(0);
    expect(visibleQuestionNames(changeRelevance(gated, target, undefined), {}).has("topics")).toBe(true);
  });

  it("lays out the full 300-question limit deterministically", { timeout: 5000 }, () => {
    const draft = poll();
    draft.groups = [];
    draft.questions = Array.from({ length: 300 }, (_, index): Question => ({
      kind: "integer", name: `q${index}`, label: `Question ${index}`, groups: [], required: false,
      relevant: index ? `\${q${index - 1}} >= 3` : undefined
    }));
    const map = projectLogic(draft);
    expect(map.order).toHaveLength(302);
    expect(map.dependencies).toHaveLength(299);
    const positions = arrangeLogicMap(map);
    expect(positions).toEqual(arrangeLogicMap(map));
    expect(map.order.every((id, index) => !index || positions[id].x > positions[map.order[index - 1]].x)).toBe(true);
  });
});
