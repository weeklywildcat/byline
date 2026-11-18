import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aggregateHandoff, HANDOFF_FIELDS } from "../src/polls/engine/handoff";
import { compareOptions, responseTimeline, summarize, type ResponseRow } from "../src/polls/engine/results";
import type { SurveyDefinition } from "../src/polls/engine/types";
import { importWorkbook } from "../src/polls/engine/xlsform";
import { readWorkbook } from "../src/polls/engine/xlsx";
import { legacyPublicPollPath, pairingPath, publicPollPath, PUBLIC_POLL_KEY } from "../src/polls/links";
import {
  formatPairingCode, hashPairingCode, newPairingCode, normalizePairingCode, PAIRING_DEFAULT_MS, PAIRING_FAILURES_PER_WINDOW, PAIRING_MAX_MS, PAIRING_MIN_MS,
  PAIRING_WINDOW_MS, pairingExpiry, pairingWindow
} from "../src/polls/pairing";
import { collectionPeriods, DEFAULT_COLLECTION_PERIODS } from "../src/polls/periods";
import { hasStableLength } from "../src/ui/polls/runner/SurveyRunner";
import { fieldDefinitionSchema } from "../../../packages/data/src/schema";

/**
 * The Wildcat Polls UX pass (docs/wildcat-polls.md): device pairing codes,
 * canonical links, results over time, Compare by, small-group suppression
 * that can't be undone by subtraction, and the aggregates-only Data handoff.
 */

const example = async () => importWorkbook(await readWorkbook(new Uint8Array(readFileSync(new URL("../src/polls/workbooks/ai-at-ninety-six-high-school.xlsx", import.meta.url)))));
const yes = (value: string | string[] | number) => ({ status: "answered" as const, value });
const row = (id: number, answers: Record<string, unknown>, extra: Partial<ResponseRow> = {}): ResponseRow => ({ id, versionId: 1, sessionId: "s1", mode: "kiosk", location: "Cafeteria", submittedAt: "2026-11-12T15:00:00.000Z", answers: answers as ResponseRow["answers"], ...extra });

describe("pairing codes", () => {
  it("are six digits, uniformly drawn, shown as two groups of three", () => {
    const codes = new Set(Array.from({ length: 2000 }, newPairingCode));
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(1990);
    expect(formatPairingCode("048213")).toBe("048 213");
  });

  it("accept what people type, and nothing else", () => {
    expect(normalizePairingCode("048 213")).toBe("048213");
    expect(normalizePairingCode(" 048-213 ")).toBe("048213");
    expect(normalizePairingCode("04821")).toBeNull();
    expect(normalizePairingCode("0482134")).toBeNull();
    expect(normalizePairingCode("04821a")).toBeNull();
    expect(normalizePairingCode(482213)).toBeNull();
    expect(normalizePairingCode("1".repeat(100))).toBeNull();
  });

  it("are kept only as a keyed hash", () => {
    const hash = hashPairingCode("secret-a", "048213");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("048213");
    expect(hashPairingCode("secret-a", "048213")).toBe(hash);
    // Without the newsroom's secret, the hash can't be matched against the million possible codes.
    expect(hashPairingCode("secret-b", "048213")).not.toBe(hash);
  });

  it("last as long as asked, between five minutes and two days", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(pairingExpiry(now, undefined).getTime() - now.getTime()).toBe(PAIRING_DEFAULT_MS);
    expect(pairingExpiry(now, 90).getTime() - now.getTime()).toBe(90 * 60_000);
    expect(pairingExpiry(now, 1).getTime() - now.getTime()).toBe(PAIRING_MIN_MS);
    expect(pairingExpiry(now, 60 * 24 * 30).getTime() - now.getTime()).toBe(PAIRING_MAX_MS);
    expect(PAIRING_MAX_MS).toBe(2 * 24 * 60 * 60 * 1000);
    expect(pairingExpiry(now, "nonsense").getTime() - now.getTime()).toBe(PAIRING_DEFAULT_MS);
  });

  it("throttle failed claims tightly enough for a code left live for two days", () => {
    const guesses = (PAIRING_MAX_MS / PAIRING_WINDOW_MS) * PAIRING_FAILURES_PER_WINDOW;
    expect(guesses / 1_000_000).toBeLessThan(0.01);
    expect(pairingWindow(new Date("2026-11-17T12:09:59Z")).toISOString()).toBe("2026-11-17T12:00:00.000Z");
  });
});

describe("respondent links", () => {
  it("have one canonical public address and keep the first one working", () => {
    expect(publicPollPath("abc12345xyz")).toBe("/poll/abc12345xyz");
    expect(legacyPublicPollPath("abc12345xyz")).toBe("/polls/s/abc12345xyz");
    expect(PUBLIC_POLL_KEY.test("abc12345xyz")).toBe(true);
    expect(PUBLIC_POLL_KEY.test("../admin")).toBe(false);
  });

  it("put a pairing code in the fragment, which never reaches the server", () => {
    expect(pairingPath("048 213")).toBe("/poll#048213");
  });

  it("serve both public addresses from the same app", () => {
    const canonical = readFileSync(new URL("../src/app/(polls)/poll/[key]/page.tsx", import.meta.url), "utf8");
    const legacy = readFileSync(new URL("../src/app/(polls)/polls/s/[key]/page.tsx", import.meta.url), "utf8");
    for (const page of [canonical, legacy]) {
      expect(page).toContain("<PublicPollApp");
      expect(page).toContain("PUBLIC_POLL_KEY.test(key)");
    }
  });
});

describe("collection periods", () => {
  it("come from one boundary", () => {
    expect(collectionPeriods()).toEqual([...DEFAULT_COLLECTION_PERIODS]);
    const ui = readFileSync(new URL("../src/ui/polls/Fieldwork.tsx", import.meta.url), "utf8");
    expect(ui).not.toContain("Lunch A");
  });
});

describe("progress", () => {
  it("states a total only when nothing is conditional", async () => {
    const { definition } = await example();
    expect(hasStableLength(definition)).toBe(false);
    const flat: SurveyDefinition = { ...definition, questions: definition.questions.map(({ relevant: _relevant, ...question }) => question as typeof question), groups: definition.groups.map(({ relevant: _relevant, ...group }) => group as typeof group) };
    expect(hasStableLength(flat)).toBe(true);
  });
});

describe("results", () => {
  it("count responses per day in the newsroom's timezone, filling quiet days", () => {
    const timeline = responseTimeline([
      { submittedAt: "2026-11-10T03:00:00.000Z", mode: "kiosk" }, // Nov 9 in New York
      { submittedAt: "2026-11-10T15:00:00.000Z", mode: "public" },
      { submittedAt: "2026-11-12T15:00:00.000Z", mode: "kiosk" }
    ], "America/New_York");
    expect(timeline).toEqual([
      { day: "2026-11-09", kiosk: 1, public: 0 },
      { day: "2026-11-10", kiosk: 0, public: 1 },
      { day: "2026-11-11", kiosk: 0, public: 0 },
      { day: "2026-11-12", kiosk: 1, public: 0 }
    ]);
  });

  it("compare only by configured single-choice questions", async () => {
    const { definition } = await example();
    const options = compareOptions({ ...definition, settings: { ...definition.settings, breakdowns: ["grade", "anything_else", "missing"] } });
    expect(options.map((option) => option.name)).toEqual(["grade"]);
  });

  it("withhold a second group when one alone would be recoverable by subtraction", async () => {
    const { definition } = await example();
    const rows = Array.from({ length: 14 }, (_v, i) => row(i + 1, { grade: yes(i < 1 ? "9" : i < 7 ? "10" : "11"), book_report: yes(i % 2 ? "yes" : "no") }));
    const [byGrade] = summarize(definition, rows, { minimumGroup: 5, breakdowns: ["grade"] }).breakdowns.filter((entry) => entry.question === "book_report");
    const group = (name: string) => byGrade.groups.find((entry) => entry.name === name)!;
    expect(group("9").suppressed).toBe(true);
    // 10th (6 people) is the smallest other group with anyone in it, so it is withheld too; 11th (7) is shown.
    expect(group("10")).toMatchObject({ suppressed: true, base: 0 });
    expect(group("11")).toMatchObject({ suppressed: false, base: 7 });
    for (const withheld of [group("9"), group("10")]) for (const cell of Object.values(withheld.cells)) expect(cell).toEqual({ count: 0, percent: null });
  });

  it("leave two withheld groups alone: they can't be split", async () => {
    const { definition } = await example();
    const rows = Array.from({ length: 16 }, (_v, i) => row(i + 1, { grade: yes(i < 2 ? "9" : i < 4 ? "10" : "11"), book_report: yes("yes") }));
    const [byGrade] = summarize(definition, rows, { minimumGroup: 5, breakdowns: ["grade"] }).breakdowns.filter((entry) => entry.question === "book_report");
    expect(byGrade.groups.filter((group) => group.suppressed).map((group) => group.name).sort()).toEqual(["10", "12", "9", "prefer_not"]);
    expect(byGrade.groups.find((group) => group.name === "11")).toMatchObject({ suppressed: false, base: 12 });
  });
});

describe("the Data handoff", () => {
  const rowsFor = () => Array.from({ length: 12 }, (_v, i) => row(i + 1, {
    grade: yes(i < 6 ? "10" : i < 11 ? "11" : "9"),
    book_report: yes(i % 3 ? "yes" : "no"),
    anything_else: yes(`My name is Student ${i + 1}`)
  }));

  it("holds aggregates only: no written answers, no respondent", async () => {
    const { definition } = await example();
    const results = summarize(definition, rowsFor(), { minimumGroup: 5, breakdowns: ["grade"] });
    const handoff = aggregateHandoff(results, { minimumGroup: 5, compare: results.breakdowns });
    const text = JSON.stringify(handoff);
    expect(text).not.toContain("Student");
    expect(handoff.rows.some((entry) => entry.question_key === "anything_else")).toBe(false);
    expect(handoff.rows.every((entry) => !("responseId" in entry) && !("id" in entry))).toBe(true);
    const book = handoff.rows.filter((entry) => entry.question_key === "book_report" && entry.compare_by === null);
    expect(book.map((entry) => [entry.answer_key, entry.count, entry.base])).toEqual(expect.arrayContaining([["yes", 8, 12], ["no", 4, 12]]));
  });

  it("leaves out questions and groups too small to report", async () => {
    const { definition } = await example();
    const results = summarize(definition, rowsFor(), { minimumGroup: 5, breakdowns: ["grade"] });
    const handoff = aggregateHandoff(results, { minimumGroup: 5, compare: results.breakdowns });
    const groups = new Set(handoff.rows.filter((entry) => entry.compare_by).map((entry) => entry.group));
    expect(groups.has("9th grade")).toBe(false);
    // 9th (1 person) is withheld, so the smallest other group (11th, 5) is too: only 10th remains.
    expect([...groups]).toEqual(["10th grade"]);
    const tiny = aggregateHandoff(summarize(definition, rowsFor().slice(0, 3), { minimumGroup: 5 }), { minimumGroup: 5 });
    expect(tiny.rows).toEqual([]);
    expect(tiny.withheld.length).toBeGreaterThan(0);
  });

  it("describes its fields in Data's own schema", () => {
    for (const field of HANDOFF_FIELDS) expect(fieldDefinitionSchema.safeParse(field).success, field.key).toBe(true);
  });
});
