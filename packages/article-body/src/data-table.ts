import { ARTICLE_BLOCK_LIMITS as LIMITS } from "./blocks";
import type { DataTableColumn, DataTableRow } from "./types";

/**
 * The tiny-spreadsheet model behind Data Table. Pure: every edit returns new
 * columns and rows, so the editor's keyboard and paste paths and the tests
 * make the same change. Cells are plain text; there are no formulas, merged
 * cells, colours or per-cell typography.
 */
export type TableData = { columns: DataTableColumn[]; rows: DataTableRow[] };

/** Cells in a row always match the column count: shorter rows are padded, longer ones trimmed. */
export function squareRows(columns: readonly DataTableColumn[], rows: readonly DataTableRow[]): DataTableRow[] {
  return rows.map((row) => ({ id: row.id, cells: Array.from({ length: columns.length }, (_, index) => row.cells[index] ?? "") }));
}

/**
 * Tab- and newline-separated text, as Google Sheets and Excel copy it, as a
 * grid. Quoted cells (a cell with a tab or line break inside) are honoured;
 * a trailing newline does not make a blank row.
 */
export function parseTsv(text: string): string[][] {
  const input = text.replace(/\r\n?/g, "\n");
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      grid.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    grid.push(row);
  }
  return grid.map((cells) => cells.map((value) => value.replace(/\s*\n\s*/g, " ").trim()));
}

/** Whether pasted text is a grid (a tab or a line break) rather than text for one cell. */
export function isTablePaste(text: string): boolean {
  return /[\t\n]/.test(text.replace(/\n+$/, ""));
}

/**
 * Paste a grid with its top-left cell at (`row`, `column`). Rows and columns
 * are added as needed up to the bounds; anything beyond them is left out and
 * reported in `clipped`. Column labels are row -1 (the header).
 */
export function pasteGrid(table: TableData, grid: readonly (readonly string[])[], at: { row: number; column: number }, ids: () => string): TableData & { clipped: boolean } {
  let columns = table.columns.map((column) => ({ ...column }));
  let rows = squareRows(columns, table.rows).map((row) => ({ ...row, cells: [...row.cells] }));
  let clipped = false;
  const width = Math.max(0, ...grid.map((cells) => cells.length));
  const needed = at.column + width;
  while (columns.length < Math.min(needed, LIMITS.tableColumnsMax)) columns = [...columns, { id: ids(), label: "" }];
  if (needed > LIMITS.tableColumnsMax) clipped = true;
  rows = squareRows(columns, rows);
  grid.forEach((cells, offset) => {
    const target = at.row + offset;
    cells.forEach((value, cellOffset) => {
      const column = at.column + cellOffset;
      if (column >= columns.length) return;
      const text = value.slice(0, LIMITS.tableCell);
      if (target < 0) {
        columns[column] = { ...(columns[column] as DataTableColumn), label: text.slice(0, LIMITS.tableCell) };
        return;
      }
      while (rows.length <= target && rows.length < LIMITS.tableRowsMax) rows.push({ id: ids(), cells: Array.from({ length: columns.length }, () => "") });
      const row = rows[target];
      if (!row) {
        clipped = true;
        return;
      }
      row.cells[column] = text;
    });
  });
  return { columns, rows, clipped };
}

export function addColumn(table: TableData, index: number, ids: () => string): TableData | null {
  if (table.columns.length >= LIMITS.tableColumnsMax) return null;
  const at = Math.max(0, Math.min(index, table.columns.length));
  const columns = [...table.columns.slice(0, at), { id: ids(), label: "" }, ...table.columns.slice(at)];
  return { columns, rows: table.rows.map((row) => ({ id: row.id, cells: [...row.cells.slice(0, at), "", ...row.cells.slice(at)] })) };
}

export function removeColumn(table: TableData, index: number): TableData | null {
  if (table.columns.length <= LIMITS.tableColumnsMin || index < 0 || index >= table.columns.length) return null;
  return { columns: table.columns.filter((_, i) => i !== index), rows: table.rows.map((row) => ({ id: row.id, cells: row.cells.filter((_, i) => i !== index) })) };
}

export function moveColumn(table: TableData, index: number, direction: -1 | 1): TableData | null {
  const to = index + direction;
  if (index < 0 || to < 0 || index >= table.columns.length || to >= table.columns.length) return null;
  const swap = <T,>(list: readonly T[]) => {
    const next = [...list];
    [next[index], next[to]] = [next[to] as T, next[index] as T];
    return next;
  };
  return { columns: swap(table.columns), rows: table.rows.map((row) => ({ id: row.id, cells: swap(row.cells) })) };
}

export function addRow(table: TableData, index: number, id: string): TableData | null {
  if (table.rows.length >= LIMITS.tableRowsMax) return null;
  const at = Math.max(0, Math.min(index, table.rows.length));
  return { columns: table.columns, rows: [...table.rows.slice(0, at), { id, cells: table.columns.map(() => "") }, ...table.rows.slice(at)] };
}

export function removeRow(table: TableData, index: number): TableData | null {
  if (index < 0 || index >= table.rows.length || table.rows.length <= 1) return null;
  return { columns: table.columns, rows: table.rows.filter((_, i) => i !== index) };
}

export function moveRow(table: TableData, index: number, direction: -1 | 1): TableData | null {
  const to = index + direction;
  if (index < 0 || to < 0 || index >= table.rows.length || to >= table.rows.length) return null;
  const rows = [...table.rows];
  [rows[index], rows[to]] = [rows[to] as DataTableRow, rows[index] as DataTableRow];
  return { columns: table.columns, rows };
}

/** Where Tab, Shift+Tab and Enter take the caret next, or null at an edge. */
export function nextCell(table: Pick<TableData, "columns" | "rows">, at: { row: number; column: number }, key: "Tab" | "ShiftTab" | "Enter"): { row: number; column: number } | null {
  const columns = table.columns.length;
  if (key === "Enter") return at.row + 1 < table.rows.length ? { row: at.row + 1, column: at.column } : null;
  if (key === "Tab") {
    if (at.column + 1 < columns) return { row: at.row, column: at.column + 1 };
    return at.row + 1 < table.rows.length ? { row: at.row + 1, column: 0 } : null;
  }
  if (at.column > 0) return { row: at.row, column: at.column - 1 };
  return at.row > -1 ? { row: at.row - 1, column: columns - 1 } : null;
}
