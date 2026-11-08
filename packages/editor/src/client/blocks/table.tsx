"use client";

import { addColumn, addRow, ARTICLE_BLOCK_LIMITS as LIMITS, isTablePaste, moveColumn, moveRow, nextCell, parseTsv, pasteGrid, removeColumn, removeRow, squareRows, type TableData } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { DataTableView } from "@byline/ui/article-body";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Ellipsis, Plus, Rows3, Trash2 } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { newRowId } from "../../fields";
import { BlockShell, SettingsSurface, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { ChoiceToggle } from "./parts";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

/**
 * Data Table, a tiny spreadsheet: click a cell and type; Tab, Shift+Tab and
 * Enter move between cells; rows and columns add, move and remove; a copied
 * block of cells from Sheets or Excel pastes into the grid. No formulas,
 * merges, colours or per-cell typography: the model is `@byline/article-body`'s
 * pure table operations, so the keyboard, paste and tests make the same change.
 */
export function DataTableEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("dataTable", node);
  const issues = useReadiness("dataTable", id, node.fields);
  const announce = useAnnounce();
  const first = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, first);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const readOnly = !node.editable;
  const table: TableData = { columns: fields.columns, rows: squareRows(fields.columns, fields.rows) };
  const root = () => node.editor.getElementByKey(nodeKey);
  const focusCell = (row: number, column: number, now = false) => focusIn(root(), `[data-cell="${row},${column}"] .byline-field`, now);
  const apply = (next: TableData | null, message: string, focus?: { row: number; column: number }) => {
    if (!next) return false;
    set({ columns: next.columns, rows: next.rows });
    announce(message);
    if (focus) focusCell(focus.row, focus.column);
    return true;
  };

  const setHeader = (index: number, label: string) => set({ columns: table.columns.map((column, i) => (i === index ? { ...column, label } : column)), rows: table.rows });
  const setCell = (rowIndex: number, column: number, value: string) => set({ columns: table.columns, rows: table.rows.map((row, i) => (i === rowIndex ? { ...row, cells: row.cells.map((cell, c) => (c === column ? value : cell)) } : row)) });

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
    // At the last cell, Tab leaves the table for the next field on the page, and Enter adds a row below.
    if (!target) {
      if (key === "Enter" && table.rows.length < LIMITS.tableRowsMax) {
        event.preventDefault();
        apply(addRow(table, table.rows.length, newRowId()), "Row added.", { row: table.rows.length, column });
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
    const result = pasteGrid(table, grid, { row, column }, newRowId);
    set({ columns: result.columns, rows: result.rows });
    announce(`Pasted ${grid.length} ${grid.length === 1 ? "row" : "rows"}.`);
    if (result.clipped) toast(`A table holds ${LIMITS.tableColumnsMax} columns and ${LIMITS.tableRowsMax} rows. The rest was left out.`);
  };

  // "Paste table": the whole pasted block becomes the table, its first row the headers.
  const usePasted = () => {
    const grid = parseTsv(pasted);
    if (!grid.length) return;
    const width = Math.max(...grid.map((cells) => cells.length));
    const columns = Array.from({ length: Math.min(Math.max(width, LIMITS.tableColumnsMin), LIMITS.tableColumnsMax) }, (_, index) => ({ id: newRowId(), label: grid[0]?.[index] ?? "" }));
    const result = pasteGrid({ columns, rows: [] }, grid.slice(1), { row: 0, column: 0 }, newRowId);
    set({ columns: result.columns, rows: result.rows });
    announce(`Table pasted: ${result.columns.length} columns, ${result.rows.length} rows.`);
    setPasted("");
    setPasteOpen(false);
    if (result.clipped || grid.length - 1 > LIMITS.tableRowsMax) toast(`A table holds ${LIMITS.tableColumnsMax} columns and ${LIMITS.tableRowsMax} rows. The rest was left out.`);
  };

  const cell = (row: number, column: number, value: string, label: string, header = false) => (
    <span data-cell={`${row},${column}`}>
      <InlineText
        inputRef={row === -1 && column === 0 ? first : undefined}
        label={label}
        placeholder={header ? "Header" : ""}
        value={value}
        maxLength={LIMITS.tableCell}
        readOnly={readOnly}
        onKeyDown={(event) => onKeyDown(event, row, column)}
        onPaste={(event) => onPaste(event, row, column)}
        onChange={(next) => (header ? setHeader(column, next) : setCell(row, column, next))}
      />
    </span>
  );

  return (
    <BlockShell
      type="dataTable"
      node={node}
      issues={issues}
      actions={
        <>
          <ButtonGroup>
            <ToolTextButton label="Add row" icon={<Rows3 />} disabled={table.rows.length >= LIMITS.tableRowsMax} onClick={() => apply(addRow(table, table.rows.length, newRowId()), "Row added.", { row: table.rows.length, column: 0 })} />
            <ToolTextButton label="Add column" icon={<Plus />} disabled={table.columns.length >= LIMITS.tableColumnsMax} onClick={() => apply(addColumn(table, table.columns.length, newRowId), "Column added.", { row: -1, column: table.columns.length })} />
          </ButtonGroup>
          <SettingsSurface
            open={pasteOpen}
            onOpenChange={setPasteOpen}
            title="Paste a table"
            description="Copy cells in Google Sheets or Excel and paste them here. The first row becomes the headers and replaces the table."
            trigger={<Button type="button" variant="ghost" size="sm"><ClipboardPaste />Paste table</Button>}
          >
            <Textarea aria-label="Pasted table" rows={6} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="Paste copied cells here" />
            <Button type="button" size="sm" disabled={!pasted.trim()} onClick={usePasted}>Use this table</Button>
          </SettingsSurface>
          <ChoiceToggle label="Presentation" value={fields.presentation} options={[{ value: "standard", label: "Standard" }, { value: "comparison", label: "Comparison" }]} onChange={(presentation) => set({ presentation })} />
          <label className="byline-confirm" data-byline-chrome="">
            <Checkbox checked={fields.rowHeaders} disabled={readOnly} onCheckedChange={(checked) => set({ rowHeaders: checked === true })} aria-label="First column names each row" />
            <span>First column names each row</span>
          </label>
        </>
      }
    >
      <DataTableView
        title={<InlineText label="Table title" placeholder="What the table shows" value={fields.title} maxLength={LIMITS.tableTitle} readOnly={readOnly} onChange={(title) => set({ title })} />}
        description={<InlineText label="Description (optional)" placeholder="A sentence on what is measured (optional)" value={fields.description} maxLength={LIMITS.tableDescription} readOnly={readOnly} multiline onChange={(description) => set({ description })} />}
        presentation={fields.presentation}
        rowHeaders={fields.rowHeaders}
        columns={table.columns.map((column, index) => ({
          key: column.id,
          header: (
            <span className="byline-table-header">
              {cell(-1, index, column.label, `Column ${index + 1} header`, true)}
              {readOnly ? null : (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Column ${index + 1} actions`} data-byline-chrome="" />}><Ellipsis /></DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem disabled={index === 0} onClick={() => apply(moveColumn(table, index, -1), `Column moved to ${index} of ${table.columns.length}.`, { row: -1, column: index - 1 })}><ArrowLeft />Move left</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === table.columns.length - 1} onClick={() => apply(moveColumn(table, index, 1), `Column moved to ${index + 2} of ${table.columns.length}.`, { row: -1, column: index + 1 })}><ArrowRight />Move right</DropdownMenuItem>
                    <DropdownMenuItem disabled={table.columns.length >= LIMITS.tableColumnsMax} onClick={() => apply(addColumn(table, index, newRowId), "Column added.", { row: -1, column: index })}><Plus />Add column before</DropdownMenuItem>
                    <DropdownMenuItem disabled={table.columns.length >= LIMITS.tableColumnsMax} onClick={() => apply(addColumn(table, index + 1, newRowId), "Column added.", { row: -1, column: index + 1 })}><Plus />Add column after</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" disabled={table.columns.length <= LIMITS.tableColumnsMin} onClick={() => apply(removeColumn(table, index), "Column removed.", { row: -1, column: Math.max(0, index - 1) })}><Trash2 />Remove column</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </span>
          )
        }))}
        rows={table.rows.map((row, rowIndex) => ({
          key: row.id,
          cells: row.cells.map((value, column) => cell(rowIndex, column, value, `Row ${rowIndex + 1}, ${table.columns[column]?.label || `column ${column + 1}`}`)),
          actions: readOnly ? null : (
            <td className="byline-table-row-actions" data-byline-chrome="">
              <ButtonGroup aria-label={`Row ${rowIndex + 1} actions`}>
                <ToolButton label="Move row up" disabled={rowIndex === 0} onClick={() => apply(moveRow(table, rowIndex, -1), `Row moved to ${rowIndex} of ${table.rows.length}.`, { row: rowIndex - 1, column: 0 })}><ArrowUp /></ToolButton>
                <ToolButton label="Move row down" disabled={rowIndex === table.rows.length - 1} onClick={() => apply(moveRow(table, rowIndex, 1), `Row moved to ${rowIndex + 2} of ${table.rows.length}.`, { row: rowIndex + 1, column: 0 })}><ArrowDown /></ToolButton>
                <ToolButton label="Add row below" disabled={table.rows.length >= LIMITS.tableRowsMax} onClick={() => apply(addRow(table, rowIndex + 1, newRowId()), "Row added.", { row: rowIndex + 1, column: 0 })}><Plus /></ToolButton>
                <ToolButton label="Remove row" disabled={table.rows.length <= 1} onClick={() => apply(removeRow(table, rowIndex), "Row removed.", { row: Math.max(0, rowIndex - 1), column: 0 })}><Trash2 /></ToolButton>
              </ButtonGroup>
            </td>
          )
        }))}
        footer={
          <>
            <p><InlineText label="Source" placeholder="Source" value={fields.source} maxLength={LIMITS.tableSource} readOnly={readOnly} onChange={(source) => set({ source })} /></p>
            <p><InlineText label="Notes (optional)" placeholder="Notes (optional)" value={fields.notes} maxLength={LIMITS.tableNotes} readOnly={readOnly} multiline onChange={(notes) => set({ notes })} /></p>
          </>
        }
      />
    </BlockShell>
  );
}
