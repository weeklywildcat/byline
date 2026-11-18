import { describe, expect, it } from "vitest";
import { normalizeDefinition } from "../src/polls/definition";
import { createMatrix, deleteBuildItem, duplicateBuildItem, restoreBuildItem } from "../src/polls/engine/build-items";
import { readCondition, writeConditions } from "../src/polls/engine/condition-builder";
import { aggregateHandoff } from "../src/polls/engine/handoff";
import { answerProblem, checkSubmission, describeCondition, pruneAnswers, valueProblem } from "../src/polls/engine/logic";
import { projectLogic, questionId } from "../src/polls/engine/logic-map";
import { choiceDisplay, matricesFor, respondentScreens } from "../src/polls/engine/presentation";
import { responsesCsv, summarize, summaryCsv, type ResponseRow } from "../src/polls/engine/results";
import { emptyDefinition, isSelect, type Answers, type Question, type RankQuestion, type SurveyDefinition } from "../src/polls/engine/types";
import { definitionToSheets, importWorkbook, validateDefinition } from "../src/polls/engine/xlsform";
import { readWorkbook, writeWorkbook } from "../src/polls/engine/xlsx";

const yes = <T extends string | string[]>(value: T) => ({ status: "answered" as const, value });
const skipped = { status: "skipped" as const };
const rank: RankQuestion = { kind: "rank", name: "priorities", label: "Rank the priorities", required: true, groups: [], list: "issues" };
const confirm: Question = { kind: "acknowledge", name: "policy", label: "I have read the policy", required: true, groups: [] };

function fixture(): SurveyDefinition {
  const initial: SurveyDefinition = {
    ...emptyDefinition("School ideas"),
    questions: [
      { kind: "select_one", name: "grade", label: "Grade", required: false, groups: [], list: "grades" },
      rank, confirm
    ],
    lists: [
      { name: "grades", choices: ["9", "10", "11"].map((name) => ({ name, label: `Grade ${name}` })) },
      { name: "issues", choices: [{ name: "lunch", label: "School lunch" }, { name: "parking", label: "Parking" }, { name: "events", label: "Events" }] }
    ]
  };
  initial.settings.breakdowns = ["grade"];
  const { draft } = createMatrix(initial, 3, []);
  draft.groups[0].relevant = "${policy} = 'OK'";
  return draft;
}

async function roundTrip(definition: SurveyDefinition) {
  return importWorkbook(await readWorkbook(writeWorkbook(definitionToSheets(definition))));
}

describe("rank and acknowledge semantics", () => {
  it("requires a complete, intentionally answered permutation", () => {
    const definition = fixture();
    expect(valueProblem(definition, rank, ["events", "lunch", "parking"])).toBeNull();
    for (const invalid of [["events", "lunch", "lunch"], ["events", "lunch"], ["events", "lunch", "uniforms"], "events lunch parking", [], [3, 2, 1]]) {
      expect(valueProblem(definition, rank, invalid)).toMatch(/every answer/);
    }
    const one = { ...definition, questions: [rank] };
    expect(checkSubmission(one, {})).toMatchObject({ ok: false, errors: [{ question: rank.name }] });
    expect(checkSubmission({ ...one, questions: [{ ...rank, required: false }] }, { priorities: skipped })).toEqual({
      ok: true, stored: { priorities: skipped }, answered: 0
    });
    const order = ["parking", "events", "lunch"];
    expect(checkSubmission(one, { priorities: yes(order) })).toEqual({ ok: true, stored: { priorities: yes(order) }, answered: 1 });
  });

  it("stores exactly OK, respects required and Skip, and compiles friendly logic", () => {
    const definition = { ...fixture(), questions: [confirm] };
    expect(checkSubmission(definition, { policy: yes("OK") })).toMatchObject({ ok: true, stored: { policy: yes("OK") } });
    for (const invalid of [true, 1, "yes", "ok", ["OK"], " OK "]) {
      expect(checkSubmission(definition, { policy: { status: "answered", value: invalid } })).toMatchObject({ ok: false });
    }
    expect(checkSubmission(definition, { policy: skipped })).toMatchObject({ ok: false });
    expect(checkSubmission({ ...definition, questions: [{ ...confirm, required: false }] }, { policy: skipped })).toMatchObject({ ok: true });
    const source = writeConditions(definition, "and", [{ question: "policy", op: "confirmed", value: "" }]);
    expect(source).toBe("${policy} = 'OK'");
    expect(readCondition(definition, source)).toMatchObject({ kind: "simple", rows: [{ question: "policy", op: "confirmed" }] });
    expect(describeCondition(definition, source)).toBe("“I have read the policy” is confirmed");
  });

  it("round-trips rank and acknowledge and recognizes trigger", async () => {
    const definition = fixture();
    const sheets = definitionToSheets(definition);
    const survey = sheets[0].rows;
    expect(survey.find((row) => row[1] === rank.name)?.[0]).toBe("rank issues");
    expect(survey.find((row) => row[1] === confirm.name)?.[0]).toBe("acknowledge");
    const imported = await roundTrip(definition);
    expect(imported.issues).toEqual([]);
    expect(imported.definition.questions.find((question) => question.name === "priorities")).toMatchObject(rank);
    expect(imported.definition.questions.find((question) => question.name === "policy")).toMatchObject(confirm);
    const trigger = survey.find((row) => row[1] === confirm.name)!;
    trigger[0] = "trigger";
    const alias = importWorkbook(await readWorkbook(writeWorkbook(sheets)));
    expect(alias.definition.questions.find((question) => question.name === "policy")?.kind).toBe("acknowledge");
  });
});

describe("Matrix structure", () => {
  it("compiles to one group and ordinary rows with one screen and independent answers", () => {
    const definition = fixture();
    const [matrix] = matricesFor(definition);
    expect(matrix.group).toMatchObject({ appearance: "table-list", name: "matrix" });
    expect(matrix.rows).toHaveLength(3);
    expect(matrix.rows.every((row) => row.kind === "select_one" && row.list === matrix.list)).toBe(true);
    expect(respondentScreens(definition)).toHaveLength(4);
    expect(respondentScreens(definition, {})).toHaveLength(3);
    const answers: Answers = { policy: yes("OK"), priorities: yes(["parking", "lunch", "events"]) };
    expect(respondentScreens(definition, answers).at(-1)).toMatchObject({ kind: "matrix", name: matrix.group.name });
    expect(answerProblem(definition, matrix.rows[0], undefined, answers)).toMatch(/needs an answer/);
    expect(checkSubmission(definition, answers)).toMatchObject({ ok: false, errors: matrix.rows.map(({ name }) => expect.objectContaining({ question: name })) });
    expect(checkSubmission(definition, { ...answers, ...Object.fromEntries(matrix.rows.map(({ name }) => [name, yes("agree")])) })).toMatchObject({
      ok: true, stored: Object.fromEntries(matrix.rows.map(({ name }) => [name, yes("agree")]))
    });
    matrix.rows[1].relevant = "${matrix_row_1} = 'agree'";
    expect(respondentScreens(definition, answers).at(-1)).toMatchObject({ matrix: { rows: [matrix.rows[0], matrix.rows[2]] } });
    expect(pruneAnswers(definition, { ...answers, matrix_row_1: yes("disagree"), matrix_row_2: yes("agree") })).not.toHaveProperty("matrix_row_2");
  });

  it("duplicates and removes the whole Matrix and restores it with its list", () => {
    const original = fixture();
    const matrix = respondentScreens(original).at(-1)!;
    const copy = duplicateBuildItem(original, matrix);
    expect(matricesFor(copy.draft)).toHaveLength(2);
    expect(matricesFor(copy.draft)[1].list).not.toBe(matricesFor(copy.draft)[0].list);
    expect(validateDefinition(copy.draft)).toEqual([]);
    const removed = deleteBuildItem(original, matrix);
    expect(matricesFor(removed)).toHaveLength(0);
    expect(removed.lists.map(({ name }) => name)).toEqual(["grades", "issues"]);
    expect(restoreBuildItem(removed, original, matrix)).toEqual(original);
    const used = { ...original, questions: [...original.questions,
      { kind: "select_one" as const, name: "overall", label: "Overall", required: false, list: "matrix_scale", groups: [] }] };
    expect(deleteBuildItem(used, matrix).lists).toHaveLength(original.lists.length);
  });

  it("recognizes a round-tripped table, preserving exotic tables and unknown appearances", async () => {
    const definition = fixture();
    definition.groups[0].hint = "Choose one answer in each row.";
    const imported = await roundTrip(definition);
    expect(imported.issues).toEqual([]);
    expect(matricesFor(imported.definition)[0].group.hint).toBe(definition.groups[0].hint);
    expect(matricesFor(imported.definition)[0].group.relevant).toBe(definition.groups[0].relevant);
    const row = definition.questions[4];
    expect(isSelect(row)).toBe(true);
    if (!isSelect(row)) throw new Error("expected a select");
    row.appearance = "custom-appearance";
    const exotic = await roundTrip(definition);
    expect(exotic.issues).toEqual([expect.objectContaining({ severity: "warning", column: "appearance" })]);
    expect(matricesFor(exotic.definition)).toHaveLength(0);
    expect(normalizeDefinition(exotic.definition).questions[4]).toMatchObject({ appearance: "custom-appearance" });
    expect(exotic.definition.groups[0].appearance).toBe("table-list");
  });

  it("shows group logic and row dependencies on the composite node, preserving advanced rank expressions", () => {
    const definition = fixture();
    definition.questions.push({
      kind: "note", name: "followup", label: "A follow-up", groups: [],
      relevant: "${matrix_row_1} = 'agree' and selected(${priorities}, 'parking')"
    });
    const map = projectLogic(definition);
    expect(map.order).toEqual(["start", "question:grade", "question:priorities", "question:policy", "section:matrix", "question:followup", "end"]);
    expect(map.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: questionId("policy"), target: "section:matrix", label: "Is confirmed" }),
      expect.objectContaining({ source: "section:matrix", target: "question:followup", label: "First statement → Advanced condition" }),
      expect.objectContaining({ source: "question:priorities", target: "question:followup", label: "Advanced condition" })
    ]));
    expect(readCondition(definition, "${priorities} != ''")).toMatchObject({ kind: "advanced", refs: ["priorities"] });
  });
});

describe("select appearances and choice images", () => {
  it("keeps all supported displays and imported text through normalization and XLSForm", async () => {
    const options = ["", "compact", "minimal", "horizontal", "horizontal-compact", "likert", "columns", "minimal search tags"];
    const definition = fixture();
    definition.groups = [];
    definition.questions = options.map((appearance, i) => ({ kind: "select_one", name: `view_${i}`, label: "Pick one", required: false, list: "grades", groups: [], appearance }));
    definition.settings.breakdowns = [];
    const { definition: imported } = await roundTrip(definition);
    const normalized = normalizeDefinition(imported);
    expect(normalized.questions.filter(isSelect).map((question) => question.appearance ?? "")).toEqual(options);
    expect(normalized.questions.filter(isSelect).map((question) => choiceDisplay(normalized, question))).toEqual([
      "list", "cards", "dropdown", "horizontal", "horizontal", "likert", "advanced", "advanced"
    ]);
  });

  it("exports image filenames and preserves unresolved imports while rejecting URLs", async () => {
    const definition = fixture();
    definition.lists[0].choices[0].image = { mediaId: 42, sourceName: "red wildcat.png" };
    definition.lists[0].choices[1].image = { mediaId: 43 };
    const { definition: imported, issues } = await roundTrip(definition);
    expect(imported.lists[0].choices.map(({ image }) => image)).toEqual([{ sourceName: "red wildcat.png" }, { sourceName: "grades-10.webp" }, undefined]);
    expect(issues.filter(({ column }) => column === "image")).toHaveLength(2);
    expect(definitionToSheets(definition)[1].rows.flat().join(" ")).not.toMatch(/42|43|mediaId/);
    definition.lists[0].choices[0].image = { sourceName: "https://outside.example/photo.png" };
    expect(() => normalizeDefinition(definition)).toThrow(/filename/);
    expect((await roundTrip(definition)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error", column: "image" })]));
  });
});

describe("expanded results", () => {
  it("reports average positions, first places, status counts, matrix row bases and aggregate handoff", () => {
    const definition = fixture();
    const rows: ResponseRow[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1, versionId: 1, sessionId: i < 7 ? "session" : null, mode: i < 7 ? "kiosk" : "public", location: "School", submittedAt: "2026-11-18T00:00:00Z",
      answers: {
        grade: yes(i < 6 ? "9" : "10"),
        priorities: yes(i < 5 ? ["lunch", "parking", "events"] : ["events", "lunch", "parking"]),
        policy: i < 5 ? yes("OK") : i === 5 ? skipped : i === 6 ? { status: "unanswered" } : { status: "not_applicable" },
        matrix_row_1: i < 5 ? yes("agree") : yes("neutral"),
        matrix_row_2: i < 6 ? yes("disagree") : { status: "not_applicable" },
        matrix_row_3: yes("agree")
      }
    }));
    const results = summarize(definition, rows, { minimumGroup: 3, breakdowns: ["grade"] });
    const ranked = results.questions.find(({ kind }) => kind === "rank")!;
    expect(ranked.ranking?.map(({ name }) => name)).toEqual(["lunch", "events", "parking"]);
    expect(ranked.ranking?.[0]).toEqual({ name: "lunch", label: "School lunch", base: 8, averagePosition: 1.4, firstPlaceCount: 5, firstPlacePercent: 62.5, positions: [5, 3, 0] });
    const confirmed = results.questions.find(({ kind }) => kind === "acknowledge")!;
    expect(confirmed.confirmation).toEqual({ confirmed: 5, base: 7 });
    expect(confirmed.base).toMatchObject({ skipped: 1, unanswered: 1, notApplicable: 1 });
    expect(results.matrices[0].rows).toEqual(["matrix_row_1", "matrix_row_2", "matrix_row_3"]);
    const withheld = results.breakdowns.find(({ question }) => question === "matrix_row_1")!.groups;
    expect(withheld.every((group) => group.suppressed && group.base === 0 && Object.values(group.cells).every(({ count, percent }) => count === 0 && percent === null))).toBe(true);
    const data = aggregateHandoff(results, { minimumGroup: 3, compare: results.breakdowns }).rows;
    expect(data.find(({ answer_key }) => answer_key === "lunch")).toMatchObject({ average_position: 1.4, first_place_count: 5, first_place_percent: 62.5, base: 8 });
    expect(data.find(({ question_key }) => question_key === "matrix_row_1")).toHaveProperty("matrix", definition.groups[0].label);
    expect(data.find(({ answer_key }) => answer_key === "OK")).toMatchObject({ count: 5, base: 7, skipped: null });
    expect(data.some(({ group }) => group === "Grade 10")).toBe(false);
    const responseCsv = responsesCsv(definition, rows, new Map([[1, 1]]));
    expect(responseCsv).toContain("lunch parking events,OK,agree,disagree,agree");
    expect(summaryCsv(results)).toContain("School lunch");
    expect(summaryCsv(results)).toContain("1.4,5,62.5,8,5 3 0");
    expect(summarize(definition, rows.filter(({ mode }) => mode === "public"), { minimumGroup: 3 }).questions.find(({ kind }) => kind === "rank")?.ranking?.[0].name).toBe("events");
  });

  it("includes retired Matrix columns in comparisons across versions", () => {
    const definition = fixture();
    const results = summarize(definition, Array.from({ length: 4 }, (_, i): ResponseRow => ({
      id: i + 1, versionId: i < 2 ? 1 : 2, sessionId: null, mode: "public", location: "", submittedAt: "2026-11-18T00:00:00Z",
      answers: { grade: yes("9"), matrix_row_1: yes(i < 2 ? "retired_agreement" : "agree") }
    })), { minimumGroup: 3, breakdowns: ["grade"] });
    expect(results.matrices[0].columns.map(({ name }) => name)).toContain("retired_agreement");
    const cells = results.breakdowns.find(({ question }) => question === "matrix_row_1")?.groups[0].cells;
    expect(cells?.retired_agreement).toEqual({ count: 2, percent: 50 });
    expect(cells?.agree).toEqual({ count: 2, percent: 50 });
    expect(summaryCsv(results)).toMatch(/retired_agreement,retired_agreement,2,50,4,.*Grade,Grade 9/);
  });
});
