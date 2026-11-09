"use client";

import { addRow, isTablePaste, moveColumn, moveRow, nextCell, parseTsv, pasteGrid, squareRows, type TableBounds, type TableData } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ClipboardPaste } from "lucide-react";
import { useState, type ClipboardEvent, type KeyboardEvent, type Ref } from "react";
import { toast } from "sonner";
import { newRowId } from "../../fields";
import { SettingsSurface } from "../chrome";
import { InlineText } from "../fields";
import { focusIn } from "./shared";

/**
 * The editing behaviour of a small grid of cells, shared by Data Table and
 * Chart / Map's native charts: typed cells, Tab / Shift+Tab / Enter between
 * cells, Alt+Shift+arrows to move rows and columns, pasting copied cells from
 * Sheets or Excel at the caret, and "Paste table" for a whole block. All of it
 * is `@byline/article-body`'s pure table model within the caller's bounds.
 */
export function useGridEditing({ table: stored, bounds, cellMax, root, announce, write, firstRef }: {
  table: TableData;
  bounds: TableBounds;
  cellMax: number;
  root: () => HTMLElement | null;
  announce: (message: string) => void;
  write: (table: TableData) => void;
  firstRef?: Ref<HTMLTextAreaElement>;
}) {
  const table: TableData = { columns: stored.columns, rows: squareRows(stored.columns, stored.rows) };
  const limitsText = `${bounds.columnsMax} columns and ${bounds.rowsMax} rows`;
  const focusCell = (row: number, column: number, now = false) => focusIn(root(), `[data-cell="${row},${column}"] .byline-field`, now);
  const apply = (next: TableData | null, message: string, focus?: { row: number; column: number }) => {
    if (!next) return false;
    write(next);
    announce(message);
    if (focus) focusCell(focus.row, focus.column);
    return true;
  };
  const setHeader = (index: number, label: string) => write({ columns: table.columns.map((column, i) => (i === index ? { ...column, label } : column)), rows: table.rows });
  const setCell = (rowIndex: number, column: number, value: string) => write({ columns: table.columns, rows: table.rows.map((row, i) => (i === rowIndex ? { ...row, cells: row.cells.map((cell, c) => (c === column ? value : cell)) } : row)) });

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, row: number, column: number) => {
    if (event.altKey && event.shiftKey && row >= 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      apply(moveRow(table, row, direction), `Row moved to ${row + direction + 1} of ${table.rows.length}.`, { row: row + direction, column });
      return;
    }
    if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      apply(moveColumn(table, column, direction), `Column moved to ${column + direction + 1} of ${table.columns.length}.`, { row, column: column + direction });
      return;
    }
    const key = event.key === "Tab" ? (event.shiftKey ? "ShiftTab" : "Tab") : event.key === "Enter" && !event.shiftKey ? "Enter" : null;
    if (!key) return;
    const target = nextCell(table, { row, column }, key);
    // At the last cell, Tab leaves the grid for the next field on the page, and Enter adds a row below.
    if (!target) {
      if (key === "Enter" && table.rows.length < bounds.rowsMax) {
        event.preventDefault();
        apply(addRow(table, table.rows.length, newRowId(), bounds), "Row added.", { row: table.rows.length, column });
      }
      return;
    }
    event.preventDefault();
    focusCell(target.row, target.column, true);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>, row: number, column: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!isTablePaste(text)) return;
    event.preventDefault();
    const grid = parseTsv(text);
    const result = pasteGrid(table, grid, { row, column }, newRowId, bounds);
    write({ columns: result.columns, rows: result.rows });
    announce(`Pasted ${grid.length} ${grid.length === 1 ? "row" : "rows"}.`);
    if (result.clipped) toast(`This holds ${limitsText}. The rest was left out.`);
  };

  /** A whole pasted block: its first row becomes the headers and it replaces the grid. */
  const replaceWith = (text: string) => {
    const grid = parseTsv(text);
    if (!grid.length) return false;
    const width = Math.max(...grid.map((cells) => cells.length));
    const columns = Array.from({ length: Math.min(Math.max(width, bounds.columnsMin), bounds.columnsMax) }, (_, index) => ({ id: newRowId(), label: (grid[0]?.[index] ?? "").slice(0, cellMax) }));
    const result = pasteGrid({ columns, rows: [] }, grid.slice(1), { row: 0, column: 0 }, newRowId, bounds);
    write({ columns: result.columns, rows: result.rows });
    announce(`Pasted: ${result.columns.length} columns, ${result.rows.length} rows.`);
    if (result.clipped || width > bounds.columnsMax || grid.length - 1 > bounds.rowsMax) toast(`This holds ${limitsText}. The rest was left out.`);
    return true;
  };

  const cell = (row: number, column: number, value: string, label: string, readOnly: boolean, header = false, placeholder?: string) => (
    <span data-cell={`${row},${column}`}>
      <InlineText
        inputRef={row === -1 && column === 0 ? firstRef : undefined}
        label={label}
        placeholder={placeholder ?? (header ? "Header" : "")}
        value={value}
        maxLength={cellMax}
        readOnly={readOnly}
        onKeyDown={(event) => onKeyDown(event, row, column)}
        onPaste={(event) => onPaste(event, row, column)}
        onChange={(next) => (header ? setHeader(column, next) : setCell(row, column, next))}
      />
    </span>
  );

  return { table, apply, cell, replaceWith };
}

/** "Paste table": paste a block of cells copied from Sheets or Excel. */
export function PasteTableSetting({ description, onPaste }: { description: string; onPaste: (text: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  return (
    <SettingsSurface
      open={open}
      onOpenChange={setOpen}
      title="Paste a table"
      description={description}
      trigger={<Button type="button" variant="ghost" size="sm"><ClipboardPaste />Paste table</Button>}
    >
      <Textarea aria-label="Pasted table" rows={6} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="Paste copied cells here" />
      <Button type="button" size="sm" disabled={!pasted.trim()} onClick={() => {
        if (!onPaste(pasted)) return;
        setPasted("");
        setOpen(false);
      }}>Use this table</Button>
    </SettingsSurface>
  );
}
