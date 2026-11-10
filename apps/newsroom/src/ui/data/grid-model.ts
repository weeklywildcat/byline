import { parseValueText, sameValue, type DataValue, type FieldDefinition, type RecordValues } from "@byline/data";
import { parseDelimited } from "@byline/data/csv";

/**
 * The dataset grid's behavior as pure functions: where a key moves the
 * active cell, and what a pasted block of cells changes. The component only
 * feeds events in and renders the result, so the spreadsheet keyboard path
 * is tested without a browser.
 */

export type CellPosition = { row: number; col: number };
export type GridSize = { rows: number; cols: number };

export type GridKey = { key: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean };

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** The next active cell for a navigation key, or null when the key doesn't move. Tab wraps to the next row. */
export function moveCell(position: CellPosition, key: GridKey, size: GridSize, page = 10): CellPosition | null {
  if (!size.rows || !size.cols) return null;
  const lastRow = size.rows - 1;
  const lastCol = size.cols - 1;
  const mod = key.metaKey || key.ctrlKey;
  switch (key.key) {
    case "ArrowUp": return { row: mod ? 0 : clamp(position.row - 1, lastRow), col: position.col };
    case "ArrowDown": return { row: mod ? lastRow : clamp(position.row + 1, lastRow), col: position.col };
    case "ArrowLeft": return { row: position.row, col: mod ? 0 : clamp(position.col - 1, lastCol) };
    case "ArrowRight": return { row: position.row, col: mod ? lastCol : clamp(position.col + 1, lastCol) };
    case "Home": return mod ? { row: 0, col: 0 } : { row: position.row, col: 0 };
    case "End": return mod ? { row: lastRow, col: lastCol } : { row: position.row, col: lastCol };
    case "PageUp": return { row: clamp(position.row - page, lastRow), col: position.col };
    case "PageDown": return { row: clamp(position.row + page, lastRow), col: position.col };
    case "Tab": {
      if (key.shiftKey) return position.col > 0 ? { row: position.row, col: position.col - 1 } : position.row > 0 ? { row: position.row - 1, col: lastCol } : null;
      return position.col < lastCol ? { row: position.row, col: position.col + 1 } : position.row < lastRow ? { row: position.row + 1, col: 0 } : null;
    }
    case "Enter": return { row: clamp(position.row + (key.shiftKey ? -1 : 1), lastRow), col: position.col };
    default: return null;
  }
}

/** Whether a key press should start editing the active cell with that character (spreadsheet "type to replace"). */
export function startsTyping(key: GridKey): boolean {
  return key.key.length === 1 && !key.metaKey && !key.ctrlKey && key.key !== " ";
}

export type GridRow = { id: string; values: RecordValues; position: number };
export type PastePlan = {
  /** Changes to existing rows: the new values and the values they were pasted over (for conflict checks). */
  changes: Array<{ id: string; values: RecordValues; base: RecordValues }>;
  /** New rows past the end of the grid. */
  additions: RecordValues[];
  /** Cells that are not clearly a value of their field: reported, never coerced. */
  rejected: Array<{ row: number; field: string; text: string; message: string }>;
  /** How many cells will change. */
  cells: number;
};

/** Splits clipboard text into rows of cells: tab-separated from spreadsheets, or a single value. */
export function clipboardCells(text: string): string[][] {
  const trimmed = text.replace(/\r?\n$/, "");
  if (!trimmed.includes("\t") && !trimmed.includes("\n")) return [[trimmed]];
  return parseDelimited(trimmed, { delimiter: "\t", limits: { rows: 5000 } });
}

/**
 * What pasting `cells` at `at` does: fills existing rows from the active
 * cell to the right and down, adds rows below the last one, and skips
 * columns past the last field. Each cell is parsed strictly for its field.
 */
export function planPaste(cells: string[][], at: CellPosition, rows: readonly GridRow[], fields: readonly FieldDefinition[]): PastePlan {
  const plan: PastePlan = { changes: [], additions: [], rejected: [], cells: 0 };
  cells.forEach((line, offset) => {
    const rowIndex = at.row + offset;
    const existing = rows[rowIndex];
    const values: RecordValues = {};
    const base: RecordValues = {};
    line.forEach((text, column) => {
      const field = fields[at.col + column];
      if (!field) return;
      const parsed = parseValueText(field, text);
      if (!parsed.ok) {
        plan.rejected.push({ row: rowIndex + 1, field: field.label, text, message: parsed.message });
        return;
      }
      if (existing ? sameValue(existing.values[field.key], parsed.value) : parsed.value === null) return;
      values[field.key] = parsed.value;
      if (existing) base[field.key] = (existing.values[field.key] ?? null) as DataValue;
      plan.cells++;
    });
    if (!Object.keys(values).length) return;
    if (existing) plan.changes.push({ id: existing.id, values, base });
    else plan.additions.push(values);
  });
  return plan;
}

/** A position between two rows, for "Insert row below" (positions are fractional and never renumbered). */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** Columns' default widths by type, in pixels: enough for typical values, resizable. */
export function defaultColumnWidth(field: FieldDefinition): number {
  switch (field.type) {
    case "boolean": return 96;
    case "integer":
    case "percentage": return 120;
    case "number":
    case "currency": return 136;
    case "date": return 140;
    case "dateTime": return 188;
    case "select": return 156;
    case "longText": return 320;
    case "url": return 220;
    default: return 200;
  }
}
