import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileExpression, evaluateCondition, ExpressionError, parseExpression } from "../src/polls/engine/expression";
import { answerProblem, checkSubmission, describeCondition, pruneAnswers, screensFor, visibleQuestionNames } from "../src/polls/engine/logic";
import { csvCell, fieldworkRow, responsesCsv, summarize, summaryCsv, type ResponseRow } from "../src/polls/engine/results";
import type { Answers, SurveyDefinition } from "../src/polls/engine/types";
import { definitionToSheets, hasErrors, importWorkbook, validateDefinition } from "../src/polls/engine/xlsform";
import { readWorkbook, writeWorkbook, WorkbookError } from "../src/polls/engine/xlsx";
import { EXAMPLE_SHEETS, TEMPLATE_SHEETS } from "../src/polls/workbooks/example";
import { SPREADSHEET_GUIDE } from "../src/polls/workbooks/guide";

const read = (path: string) => new Uint8Array(readFileSync(new URL(path, import.meta.url)));
const example = async () => importWorkbook(await readWorkbook(read("../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx")));
const yes = (value: string | string[] | number) => ({ status: "answered" as const, value });

describe("expressions", () => {
  const value = (answers: Record<string, string | number>) => (name: string) => answers[name] ?? "";
  const run = (source: string, answers: Record<string, string | number> = {}, dot?: string | number) => evaluateCondition(compileExpression(source), { value: value(answers), dot });

  it("compares choices, numbers and empties the XLSForm way", () => {
    expect(run("${a} = 'yes'", { a: "yes" })).toBe(true);
    expect(run("${a} = 'yes'", {})).toBe(false);
    expect(run("${a} != ''", { a: "no" })).toBe(true);
    expect(run("${n} > 3", { n: 4 })).toBe(true);
    expect(run("${n} > 3", {})).toBe(false);
    expect(run("${n} >= 3 and ${n} <= 5 or ${a} = 'x'", { n: 6, a: "x" })).toBe(true);
    expect(run("not(${a} = 'yes')", { a: "yes" })).toBe(false);
    expect(run("${n} mod 2 = 0", { n: 4 })).toBe(true);
    expect(run("-${n} < 0", { n: 2 })).toBe(true);
  });

  it("tests multiple-choice membership and counts", () => {
    expect(run("selected(${m}, 'b')", { m: "a b c" })).toBe(true);
    expect(run("selected(${m}, 'bc')", { m: "a b c" })).toBe(false);
    expect(run("count-selected(${m}) > 2", { m: "a b c" })).toBe(true);
    expect(run("not(selected(., 'none') and count-selected(.) > 1)", {}, "none a")).toBe(false);
    expect(run("string-length(.) <= 3", {}, "abcd")).toBe(false);
  });

  it("accepts curly quotes a spreadsheet inserted", () => {
    expect(run("${a} = ‘yes’", { a: "yes" })).toBe(true);
  });

  it("refuses anything outside the grammar, with a position", () => {
    for (const source of ["${a} = = 'b'", "alert(1)", "${a} = yes", "${a", "selected('x', 'y')", "${a} == 'b'", "foo()", "1 < 2 < 3", "'open", "a; drop table"]) {
      expect(() => parseExpression(source), source).toThrow(ExpressionError);
    }
    expect(() => parseExpression("(".repeat(50) + "1" + ")".repeat(50))).toThrow(/nested/);
  });

  it("lists references and compared choices", () => {
    const parsed = parseExpression("selected(${m}, 'b') or ${a} = 'yes'");
    expect(parsed.refs.sort()).toEqual(["a", "m"]);
    expect(parsed.selectedRefs).toEqual(expect.arrayContaining([{ question: "m", choice: "b" }, { question: "a", choice: "yes" }]));
  });
});

describe("the example survey", () => {
  it("is the committed workbook, generated from its source", () => {
    expect(Buffer.from(read("../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx")).equals(Buffer.from(writeWorkbook(EXAMPLE_SHEETS)))).toBe(true);
    expect(Buffer.from(read("../src/polls/workbooks/wildcat-polls-template.xlsx")).equals(Buffer.from(writeWorkbook(TEMPLATE_SHEETS)))).toBe(true);
    expect(readFileSync(new URL("../../../docs/wildcat-polls-xlsform.md", import.meta.url), "utf8")).toBe(SPREADSHEET_GUIDE);
  });

  it("imports with no errors through the spreadsheet importer", async () => {
    const { definition, issues } = await example();
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(definition.settings.title).toBe("AI at Ninety Six High School");
    expect(definition.settings.breakdowns).toEqual(["grade"]);
    expect(definition.questions.map((q) => q.name)).toContain("ai_purpose");
    expect(definition.groups.map((g) => g.name)).toEqual(["about_you", "posters", "artwork", "book_reports"]);
  });

  it("imports the same workbook after a spreadsheet app re-saves it (shared strings, compression, a formula)", async () => {
    const workbook = await readWorkbook(read("./fixtures/polls/resaved-example.xlsx"));
    expect(workbook.formulaCells).toEqual([{ sheet: "survey", cell: "K3" }]);
    const { definition, issues } = importWorkbook(workbook);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((issue) => issue.message.includes("K3 is a formula"))).toBe(true);
    expect(definition).toEqual((await example()).definition);
  });

  it("follows the book report branch and clears answers that stop applying", async () => {
    const { definition } = await example();
    const base: Answers = { grade: yes("10"), ai_posters_seen: yes("no"), protest_posters_seen: yes("yes"), book_report: yes("no") };
    expect(visibleQuestionNames(definition, base).has("used_ai")).toBe(false);
    expect(visibleQuestionNames(definition, base).has("ai_posters_clear")).toBe(false);
    const withReport: Answers = { ...base, book_report: yes("yes"), used_ai: yes("yes"), ai_purpose: yes(["brainstorm", "grammar"]) };
    expect(screensFor(definition, withReport).map((q) => q.name)).toEqual(expect.arrayContaining(["used_ai", "ai_purpose", "ai_permitted"]));
    // Changing the first answer hides the chain, and its answers go with it.
    const changed = pruneAnswers(definition, { ...withReport, book_report: yes("no") });
    expect(Object.keys(changed)).not.toContain("used_ai");
    expect(Object.keys(changed)).not.toContain("ai_purpose");
  });

  it("enforces the 'Prefer not to say' constraint and required questions", async () => {
    const { definition } = await example();
    const purpose = definition.questions.find((q) => q.name === "ai_purpose")!;
    expect(answerProblem(definition, purpose, yes(["prefer_not", "grammar"]), {})).toMatch(/can’t be combined/);
    expect(answerProblem(definition, purpose, yes(["prefer_not"]), {})).toBeNull();
    const grade = definition.questions.find((q) => q.name === "grade")!;
    expect(answerProblem(definition, grade, { status: "skipped" }, {})).toMatch(/needs an answer/);
  });
});

describe("the server's submission check", () => {
  it("stores skipped, unanswered and not applicable as different facts", async () => {
    const { definition } = await example();
    const check = checkSubmission(definition, { grade: yes("11"), gender: { status: "skipped" }, ai_posters_seen: yes("yes"), protest_posters_seen: yes("unsure"), book_report: yes("no") });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.stored.gender).toEqual({ status: "skipped" });
    expect(check.stored.ai_posters_clear).toEqual({ status: "unanswered" });
    expect(check.stored.used_ai).toEqual({ status: "not_applicable" });
    expect(check.stored.grade).toEqual(yes("11"));
  });

  it("refuses hidden answers, unknown questions, wrong shapes and missing required answers", async () => {
    const { definition } = await example();
    const ok = { grade: yes("11"), ai_posters_seen: yes("no"), protest_posters_seen: yes("no"), book_report: yes("no") };
    expect(checkSubmission(definition, ok).ok).toBe(true);
    expect(checkSubmission(definition, { ...ok, used_ai: yes("yes") }).ok).toBe(false);
    expect(checkSubmission(definition, { ...ok, injected: yes("x") }).ok).toBe(false);
    expect(checkSubmission(definition, { ...ok, grade: yes("13") }).ok).toBe(false);
    expect(checkSubmission(definition, { ...ok, grade: { status: "answered", value: "11", extra: true } }).ok).toBe(false);
    expect(checkSubmission(definition, { ...ok, ai_comfort: yes(2.5) }).ok).toBe(false);
    expect(checkSubmission(definition, { ...ok, closing_note: yes("x") }).ok).toBe(false);
    const { grade: _grade, ...missing } = ok;
    expect(checkSubmission(definition, missing).ok).toBe(false);
    expect(checkSubmission(definition, "nope").ok).toBe(false);
  });
});

describe("the importer's errors", () => {
  it("points at the sheet and row of every problem", async () => {
    const { issues } = importWorkbook(await readWorkbook(read("./fixtures/polls/broken.xlsx")));
    const errors = issues.filter((issue) => issue.severity === "error");
    const at = (row: number, text: RegExp) => expect(errors.some((issue) => issue.sheet === "survey" && issue.row === row && text.test(issue.message)), `row ${row} ${text}`).toBe(true);
    at(2, /asked later/);
    at(4, /no choice list named "maybe"/);
    at(4, /"perhaps" is not a choice/);
    at(5, /used twice/);
    at(6, /inside the group/);
    at(9, /Calculations are not supported/);
    at(10, /relevant:/);
    at(11, /never closed/);
    expect(errors.some((issue) => issue.sheet === "choices" && issue.row === 4 && /already has a choice/.test(issue.message))).toBe(true);
  });

  it("detects circular conditions in a definition from the editor", async () => {
    const { definition } = await example();
    const looped: SurveyDefinition = { ...definition, questions: definition.questions.map((q) => (q.name === "grade" ? { ...q, relevant: "${grade} = '9'" } : q)) };
    expect(validateDefinition(looped).some((issue) => /own answer|circle/.test(issue.message))).toBe(true);
  });

  it("refuses files that are not workbooks, and oversized ones", async () => {
    await expect(readWorkbook(new TextEncoder().encode("type,name\ntext,q"))).rejects.toThrow(WorkbookError);
    await expect(readWorkbook(new Uint8Array(6 * 1024 * 1024))).rejects.toThrow(/5 MB/);
  });

  it("round-trips a definition through the spreadsheet format", async () => {
    const { definition } = await example();
    const again = importWorkbook(await readWorkbook(writeWorkbook(definitionToSheets(definition))));
    expect(hasErrors(again.issues)).toBe(false);
    const strip = (d: SurveyDefinition) => JSON.parse(JSON.stringify(d, (key, value) => (key === "source" ? undefined : value)));
    expect(strip(again.definition)).toEqual(strip(definition));
  });

  it("describes conditions in words for the review", async () => {
    const { definition } = await example();
    expect(describeCondition(definition, "${book_report} = 'yes'")).toBe("“Have you been assigned a book report this year?” is “Yes”");
  });
});

describe("results", () => {
  const row = (id: number, answers: Record<string, unknown>, extra: Partial<ResponseRow> = {}): ResponseRow => ({ id, versionId: 1, sessionId: "s1", mode: "kiosk", location: "Cafeteria", submittedAt: `2026-11-1${id % 10}T12:00:00.000Z`, answers: answers as ResponseRow["answers"], ...extra });

  it("uses each question's own base and keeps skipped, unanswered and hidden apart", async () => {
    const { definition } = await example();
    const rows = [
      row(1, { grade: yes("9"), used_ai: yes("yes"), ai_purpose: yes(["brainstorm", "grammar"]) }),
      row(2, { grade: yes("9"), used_ai: yes("no"), ai_purpose: { status: "not_applicable" } }),
      row(3, { grade: yes("10"), used_ai: { status: "skipped" }, ai_purpose: { status: "not_applicable" } }),
      row(4, { grade: yes("10"), used_ai: { status: "not_applicable" }, ai_purpose: { status: "not_applicable" } })
    ];
    const results = summarize(definition, rows, { minimumGroup: 2 });
    const usedAi = results.questions.find((q) => q.name === "used_ai")!;
    expect(usedAi.base).toEqual({ total: 4, shown: 3, answered: 2, skipped: 1, unanswered: 0, notApplicable: 1 });
    expect(usedAi.choices?.find((c) => c.name === "yes")).toMatchObject({ count: 1, percent: 50 });
    const purpose = results.questions.find((q) => q.name === "ai_purpose")!;
    expect(purpose.base.answered).toBe(1);
    expect(purpose.choices?.find((c) => c.name === "grammar")?.percent).toBe(100);
    expect(purpose.multiple).toBe(true);
  });

  it("withholds breakdown groups smaller than the minimum", async () => {
    const { definition } = await example();
    const rows = [1, 2, 3, 4, 5, 6].map((id) => row(id, { grade: yes(id <= 5 ? "9" : "12"), book_report: yes(id % 2 ? "yes" : "no") }));
    const results = summarize(definition, rows, { minimumGroup: 5 });
    const byGrade = results.breakdowns.find((entry) => entry.question === "book_report")!;
    expect(byGrade.groups.find((group) => group.name === "12")).toMatchObject({ base: 0, suppressed: true, cells: { yes: { percent: null } } });
    // The only other group is withheld too: the overall result minus it would give the small group away.
    expect(byGrade.groups.find((group) => group.name === "9")).toMatchObject({ base: 0, suppressed: true, cells: { yes: { count: 0, percent: null } } });
  });

  it("reports approach rates only when enough people were approached", () => {
    expect(fieldworkRow("s", "S", { started: 2, declined: 1, completed: 2, abandoned: 0 }, 5)).toMatchObject({ approached: 3, reliable: false, declineRate: null });
    expect(fieldworkRow("s", "S", { started: 8, declined: 2, completed: 6, abandoned: 2 }, 5)).toMatchObject({ approached: 10, declineRate: 20, completionRate: 75 });
  });

  it("exports CSV that spreadsheets cannot read as formulas, with explicit status tokens", async () => {
    const { definition } = await example();
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    const csv = responsesCsv(definition, [row(1, { grade: yes("9"), gender: { status: "skipped" }, used_ai: { status: "not_applicable" }, ai_purpose: yes(["grammar"]), anything_else: yes("-1 is fine") })], new Map([[1, 1]]));
    expect(csv).toContain("[skipped]");
    expect(csv).toContain("[not applicable]");
    expect(csv).toContain("'-1 is fine");
    expect(csv.split("\r\n")[0]).toContain("ai_purpose/grammar");
    const summary = summaryCsv(summarize(definition, [row(1, { grade: yes("9") })], { minimumGroup: 5 }));
    expect(summary).not.toContain("-1 is fine");
  });
});
