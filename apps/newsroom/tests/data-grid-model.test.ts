import { defaultFieldOptions, type FieldDefinition } from "@byline/data";
import { describe, expect, it } from "vitest";
import { clipboardCells, moveCell, planPaste, positionBetween, startsTyping } from "../src/ui/data/grid-model";

/** The dataset grid's keyboard path and paste planning (docs/byline-data.md#the-dataset-grid), without a browser. */
const size = { rows: 4, cols: 3 };
const f = (key: string, type: FieldDefinition["type"], extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label: key[0].toUpperCase() + key.slice(1), type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;
const fields = [f("name", "text"), f("status", "select", { options: { choices: [{ value: "done", label: "Done" }, { value: "planned", label: "Planned" }] } } as never), f("votes", "integer")];
const rows = [
  { id: "r1", position: 1, values: { name: "North", status: "done", votes: 10 } },
  { id: "r2", position: 2, values: { name: "South", status: null, votes: null } }
];

describe("keyboard movement", () => {
  it("moves with arrows, clamps at the edges, and jumps with the modifier", () => {
    expect(moveCell({ row: 0, col: 0 }, { key: "ArrowDown" }, size)).toEqual({ row: 1, col: 0 });
    expect(moveCell({ row: 0, col: 0 }, { key: "ArrowUp" }, size)).toEqual({ row: 0, col: 0 });
    expect(moveCell({ row: 1, col: 1 }, { key: "ArrowRight", metaKey: true }, size)).toEqual({ row: 1, col: 2 });
    expect(moveCell({ row: 1, col: 1 }, { key: "ArrowDown", ctrlKey: true }, size)).toEqual({ row: 3, col: 1 });
    expect(moveCell({ row: 2, col: 2 }, { key: "Home" }, size)).toEqual({ row: 2, col: 0 });
    expect(moveCell({ row: 2, col: 0 }, { key: "End", metaKey: true }, size)).toEqual({ row: 3, col: 2 });
    expect(moveCell({ row: 0, col: 0 }, { key: "PageDown" }, size)).toEqual({ row: 3, col: 0 });
  });

  it("tabs across and wraps rows, and Enter moves down (Shift+Enter up)", () => {
    expect(moveCell({ row: 0, col: 2 }, { key: "Tab" }, size)).toEqual({ row: 1, col: 0 });
    expect(moveCell({ row: 1, col: 0 }, { key: "Tab", shiftKey: true }, size)).toEqual({ row: 0, col: 2 });
    expect(moveCell({ row: 3, col: 2 }, { key: "Tab" }, size)).toBeNull();
    expect(moveCell({ row: 1, col: 1 }, { key: "Enter" }, size)).toEqual({ row: 2, col: 1 });
    expect(moveCell({ row: 1, col: 1 }, { key: "Enter", shiftKey: true }, size)).toEqual({ row: 0, col: 1 });
    expect(moveCell({ row: 0, col: 0 }, { key: "x" }, size)).toBeNull();
  });

  it("starts typing on a printable key only", () => {
    expect(startsTyping({ key: "a" })).toBe(true);
    expect(startsTyping({ key: "7" })).toBe(true);
    expect(startsTyping({ key: " " })).toBe(false);
    expect(startsTyping({ key: "c", metaKey: true })).toBe(false);
    expect(startsTyping({ key: "ArrowLeft" })).toBe(false);
  });
});

describe("pasting from a spreadsheet", () => {
  it("fills right and down from the active cell, adds rows past the end, and skips columns past the last field", () => {
    const plan = planPaste(clipboardCells("North\tPlanned\t12\textra\nSouth\tDone\t\nEast\tPlanned\t3\n"), { row: 0, col: 0 }, rows, fields);
    expect(plan.changes).toEqual([
      { id: "r1", values: { status: "planned", votes: 12 }, base: { status: "done", votes: 10 } },
      { id: "r2", values: { status: "done" }, base: { status: null } }
    ]);
    expect(plan.additions).toEqual([{ name: "East", status: "planned", votes: 3 }]);
    expect(plan.rejected).toEqual([]);
    expect(plan.cells).toBe(6);
  });

  it("reports cells that aren't values of their field instead of coercing them", () => {
    const plan = planPaste(clipboardCells("Maybe\tlots\n"), { row: 1, col: 1 }, rows, fields);
    expect(plan.changes).toEqual([]);
    expect(plan.rejected.map((entry) => `${entry.row}:${entry.field}`)).toEqual(["2:Status", "2:Votes"]);
  });

  it("treats a single value as one cell", () => {
    expect(clipboardCells("Hello, world")).toEqual([["Hello, world"]]);
    expect(planPaste(clipboardCells("Hello, world"), { row: 1, col: 0 }, rows, fields).changes).toEqual([{ id: "r2", values: { name: "Hello, world" }, base: { name: "South" } }]);
  });

  it("places an inserted row between its neighbors without renumbering", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(4, undefined)).toBe(5);
    expect(positionBetween(undefined, undefined)).toBe(1);
  });
});
