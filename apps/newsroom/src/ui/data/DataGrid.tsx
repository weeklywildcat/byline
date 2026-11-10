"use client";

import { formatDataValue, parseValueText, valueToText, type DataValue, type DatasetSchema, type FieldDefinition, type QuerySort } from "@byline/data";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Popover, PopoverContent } from "@byline/newsroom-ui/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { instantToLocal, localToInstant } from "../../domain/dates";
import type { DataRow } from "../../data/server";
import { clipboardCells, defaultColumnWidth, moveCell, planPaste, startsTyping, type CellPosition, type PastePlan } from "./grid-model";

/**
 * The dataset grid: a working spreadsheet in Byline's design system. TanStack
 * Table owns column state (order, visibility, sizing, the sort the toolbar
 * shows); the rows arrive already filtered and sorted by the one Data query
 * language (in memory or on the server), so both modes mean the same thing.
 *
 * Keyboard: arrows, Home/End, Page Up/Down and Tab move; Enter or F2 edits
 * and Enter commits and moves down; typing replaces; Escape cancels;
 * Delete clears; Space toggles yes/no; ⌘C/⌘V copy and paste a block from
 * any spreadsheet. Every edit is saved at once, by field, with the value it
 * started from, so a colleague's change to another cell is never overwritten.
 */

type ColumnMeta = { field: FieldDefinition };
export type RelationshipOptions = Record<string, Array<{ value: string; label: string }>>;

export type DataGridProps = {
  schema: DatasetSchema;
  rows: DataRow[];
  hidden: string[];
  sort: QuerySort[];
  onSortChange: (sort: QuerySort[]) => void;
  onHide: (key: string) => void;
  timeZone: string;
  canEditSchema: boolean;
  onEditField: (key: string | null) => void;
  onCommit: (row: DataRow, field: FieldDefinition, value: DataValue) => void;
  onPaste: (plan: PastePlan) => void;
  onToggleIncluded: (row: DataRow) => void;
  onInsertBelow: (row: DataRow) => void;
  onDelete: (row: DataRow) => void;
  onAddRow: () => void;
  relationships: RelationshipOptions;
  /** The first row number shown (server pages start past 1). */
  rowOffset?: number;
  emptyMessage?: ReactNode;
};

const TONES: Record<string, string> = {
  neutral: "bg-muted text-foreground",
  positive: "bg-emerald-500/12 text-emerald-800",
  caution: "bg-warning/12 text-warning",
  negative: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/12 text-sky-800"
};
const NUMERIC = new Set(["integer", "number", "percentage", "currency"]);
const POPOVER_EDITORS = new Set(["select", "relationship", "longText"]);

function editText(field: FieldDefinition, value: DataValue, timeZone: string): string {
  if (value === null) return "";
  if (field.type === "dateTime") return instantToLocal(String(value), timeZone);
  if (field.type === "select" || field.type === "boolean") return valueToText(field, value);
  return String(value);
}

function parseEdit(field: FieldDefinition, text: string, timeZone: string) {
  if (field.type === "dateTime" && text.trim()) {
    try {
      return parseValueText(field, localToInstant(text.trim(), timeZone));
    } catch {
      return { ok: false as const, message: "Enter a date and time." };
    }
  }
  return parseValueText(field, text);
}

export function DataGrid(props: DataGridProps) {
  const { schema, rows, hidden, sort, timeZone, relationships } = props;
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [active, setActive] = useState<CellPosition | null>(null);
  const [editing, setEditing] = useState<{ position: CellPosition; draft: string; error: string | null } | null>(null);
  const grid = useRef<HTMLTableElement | null>(null);

  const visibility = useMemo(() => Object.fromEntries(schema.fields.map((field) => [field.key, !hidden.includes(field.key)])), [schema.fields, hidden]);
  const columns = useMemo<Array<ColumnDef<DataRow>>>(() => schema.fields.map((field) => ({
    id: field.key,
    accessorFn: (row) => row.values[field.key] ?? null,
    header: field.label,
    size: defaultColumnWidth(field),
    minSize: 72,
    maxSize: 640,
    meta: { field } satisfies ColumnMeta
  })), [schema.fields]);
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: { columnVisibility: visibility, columnSizing: sizing, sorting: sort.filter((entry) => !entry.field.startsWith("$")).map((entry) => ({ id: entry.field, desc: entry.direction === "desc" })) },
    onColumnSizingChange: setSizing
  });
  const visibleColumns = table.getVisibleLeafColumns();
  const fields = visibleColumns.map((column) => (column.columnDef.meta as ColumnMeta).field);
  const size = { rows: rows.length, cols: fields.length };

  // Keep the active cell inside the grid as rows and columns come and go.
  useEffect(() => {
    if (!active) return;
    if (!size.rows || !size.cols) return setActive(null);
    if (active.row >= size.rows || active.col >= size.cols) setActive({ row: Math.min(active.row, size.rows - 1), col: Math.min(active.col, size.cols - 1) });
  }, [active, size.rows, size.cols]);

  const cellElement = useCallback((position: CellPosition) => grid.current?.querySelector<HTMLElement>(`[data-cell="${position.row}:${position.col}"]`) ?? null, []);
  const focusCell = useCallback((position: CellPosition | null) => {
    if (!position) return;
    requestAnimationFrame(() => {
      const element = cellElement(position);
      element?.focus({ preventScroll: false });
      element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [cellElement]);

  const select = useCallback((position: CellPosition | null) => {
    setActive(position);
    focusCell(position);
  }, [focusCell]);

  const beginEdit = useCallback((position: CellPosition, initial?: string) => {
    const field = fields[position.col];
    const row = rows[position.row];
    if (!field || !row) return;
    if (field.type === "boolean") {
      props.onCommit(row, field, row.values[field.key] === true ? false : true);
      return;
    }
    setEditing({ position, draft: initial ?? editText(field, row.values[field.key] ?? null, timeZone), error: null });
  }, [fields, rows, props, timeZone]);

  const commit = useCallback((next: CellPosition | null, override?: DataValue) => {
    if (!editing) return true;
    const field = fields[editing.position.col];
    const row = rows[editing.position.row];
    if (!field || !row) {
      setEditing(null);
      return true;
    }
    let value: DataValue;
    if (override !== undefined) value = override;
    else {
      const parsed = parseEdit(field, editing.draft, timeZone);
      if (!parsed.ok) {
        setEditing({ ...editing, error: parsed.message });
        return false;
      }
      value = parsed.value;
    }
    if ((row.values[field.key] ?? null) !== value) props.onCommit(row, field, value);
    setEditing(null);
    select(next ?? editing.position);
    return true;
  }, [editing, fields, rows, props, select, timeZone]);

  const cancel = useCallback(() => {
    if (!editing) return;
    const position = editing.position;
    setEditing(null);
    select(position);
  }, [editing, select]);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (editing || !active) return;
    if ((event.target as HTMLElement).closest("button,[role=menu],input,textarea")) return;
    const key = { key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey };
    const field = fields[active.col];
    const row = rows[active.row];
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      if (event.key === "Enter" && event.shiftKey) return select(moveCell(active, key, size));
      return beginEdit(active);
    }
    if (event.key === " " && field?.type === "boolean") {
      event.preventDefault();
      return beginEdit(active);
    }
    if ((event.key === "Delete" || event.key === "Backspace") && field && row) {
      event.preventDefault();
      if ((row.values[field.key] ?? null) !== null) props.onCommit(row, field, null);
      return;
    }
    if (event.key === "Escape") return;
    const next = moveCell(active, key, size);
    if (next) {
      event.preventDefault();
      return select(next);
    }
    if (field && startsTyping(key) && !POPOVER_EDITORS.has(field.type) && field.type !== "boolean") {
      event.preventDefault();
      beginEdit(active, event.key);
    }
  };

  const onCopy = (event: ClipboardEvent<HTMLTableElement>) => {
    if (editing || !active) return;
    const field = fields[active.col];
    const row = rows[active.row];
    if (!field || !row) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", valueToText(field, row.values[field.key] ?? null));
  };

  const onPaste = (event: ClipboardEvent<HTMLTableElement>) => {
    if (editing || !active) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    props.onPaste(planPaste(clipboardCells(text), active, rows, fields));
  };

  const editingField = editing ? fields[editing.position.col] : null;
  const anchor = editing && editingField && POPOVER_EDITORS.has(editingField.type) ? cellElement(editing.position) : null;

  return (
    <div className="grid min-w-0 gap-0">
      <div className="min-w-0 rounded-lg border bg-background [&_[data-slot=table-container]]:max-h-[calc(100svh-17rem)] [&_[data-slot=table-container]]:min-h-48 [&_[data-slot=table-container]]:overflow-auto">
        <Table
          ref={grid}
          role="grid"
          aria-label="Dataset rows"
          aria-rowcount={rows.length + 1}
          aria-colcount={fields.length + 2}
          className="w-max min-w-full table-fixed border-separate border-spacing-0"
          style={{ width: table.getTotalSize() + 112 }}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onPaste={onPaste}
        >
          <colgroup>
            <col style={{ width: 64 }} />
            {visibleColumns.map((column) => <col key={column.id} style={{ width: column.getSize() }} />)}
            <col style={{ width: 48 }} />
          </colgroup>
          <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
            <TableRow className="hover:bg-transparent" aria-rowindex={1}>
              <TableHead className="sticky left-0 z-30 border-r border-b bg-muted px-2 text-right text-xs text-muted-foreground"><span className="sr-only">Row</span>#</TableHead>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const field = (header.column.columnDef.meta as ColumnMeta).field;
                const sorted = sort.find((entry) => entry.field === field.key);
                return (
                  <TableHead key={header.id} className="group/head relative border-r border-b px-0" aria-sort={sorted ? (sorted.direction === "asc" ? "ascending" : "descending") : undefined}>
                    <ColumnHeader field={field} sorted={sorted?.direction ?? null} canEditSchema={props.canEditSchema}
                      onSort={(direction) => props.onSortChange(direction ? [{ field: field.key, direction }] : [{ field: "$position", direction: "asc" }])}
                      onHide={() => props.onHide(field.key)} onEdit={() => props.onEditField(field.key)} />
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${field.label}`}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onDoubleClick={() => header.column.resetSize()}
                      className={cn("absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-ring/40", header.column.getIsResizing() && "bg-ring opacity-100")}
                    />
                  </TableHead>
                );
              })}
              <TableHead className="border-b px-1">
                {props.canEditSchema ? (
                  <Tooltip>
                    <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Add a field" onClick={() => props.onEditField(null)} />}><Plus /></TooltipTrigger>
                    <TooltipContent>Add a field</TooltipContent>
                  </Tooltip>
                ) : null}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((tableRow, rowIndex) => {
              const row = tableRow.original;
              return (
                <GridRow
                  key={row.id}
                  row={row}
                  rowIndex={rowIndex}
                  number={(props.rowOffset ?? 0) + rowIndex + 1}
                  fields={fields}
                  active={active?.row === rowIndex ? active.col : null}
                  editing={editing?.position.row === rowIndex && !POPOVER_EDITORS.has(fields[editing.position.col]?.type ?? "") ? editing : null}
                  timeZone={timeZone}
                  relationships={relationships}
                  onSelect={(col) => select({ row: rowIndex, col })}
                  onEdit={(col) => beginEdit({ row: rowIndex, col })}
                  onDraft={(draft) => setEditing((current) => (current ? { ...current, draft, error: null } : current))}
                  onCommitKey={(event) => {
                    if (!editing) return;
                    if (event.key === "Escape") {
                      event.preventDefault();
                      return cancel();
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      commit(moveCell(editing.position, { key: event.key, shiftKey: event.shiftKey }, size));
                    }
                  }}
                  onBlurCommit={() => commit(null)}
                  onToggleIncluded={() => props.onToggleIncluded(row)}
                  onInsertBelow={() => props.onInsertBelow(row)}
                  onDelete={() => props.onDelete(row)}
                />
              );
            })}
            {!rows.length ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={fields.length + 2} className="h-28 text-center text-sm text-muted-foreground">{props.emptyMessage ?? "No rows yet."}</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onAddRow} disabled={!fields.length}><Plus data-icon="inline-start" />New row</Button>
        <p className="hidden text-xs text-muted-foreground md:block" aria-hidden="true">
          <kbd className="font-sans">Enter</kbd> edit · <kbd className="font-sans">Tab</kbd> next · <kbd className="font-sans">⌘V</kbd> paste from a spreadsheet · <kbd className="font-sans">Delete</kbd> clear
        </p>
      </div>

      {editing && editingField && anchor ? (
        <PopoverEditor
          anchor={anchor}
          field={editingField}
          draft={editing.draft}
          error={editing.error}
          options={relationships[editingField.key] ?? []}
          onDraft={(draft) => setEditing((current) => (current ? { ...current, draft, error: null } : current))}
          onChoose={(value) => commit(null, value)}
          onSave={() => commit(null)}
          onCancel={cancel}
        />
      ) : null}
    </div>
  );
}

function ColumnHeader({ field, sorted, canEditSchema, onSort, onHide, onEdit }: { field: FieldDefinition; sorted: "asc" | "desc" | null; canEditSchema: boolean; onSort: (direction: "asc" | "desc" | null) => void; onHide: () => void; onEdit: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={cn("flex h-10 w-full min-w-0 items-center gap-1.5 px-2.5 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", NUMERIC.has(field.type) && "flex-row-reverse text-right")} />}>
        <span className="truncate text-foreground">{field.label}</span>
        {field.required ? <span className="text-destructive" aria-label="required">*</span> : null}
        {field.visibility === "private" ? <Lock className="size-3 shrink-0" aria-label="private" /> : null}
        {sorted === "asc" ? <ArrowUp className="size-3 shrink-0 text-foreground" aria-hidden="true" /> : sorted === "desc" ? <ArrowDown className="size-3 shrink-0 text-foreground" aria-hidden="true" /> : null}
        <ChevronDown className={cn("size-3 shrink-0 opacity-0 transition-opacity group-hover/head:opacity-60", NUMERIC.has(field.type) ? "mr-auto" : "ml-auto")} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {field.type !== "longText" ? (
          <>
            <DropdownMenuItem onClick={() => onSort("asc")}><ArrowUp />Sort ascending</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSort("desc")}><ArrowDown />Sort descending</DropdownMenuItem>
            {sorted ? <DropdownMenuItem onClick={() => onSort(null)}>Editor order</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={onHide}><EyeOff />Hide column</DropdownMenuItem>
        {canEditSchema ? <DropdownMenuItem onClick={onEdit}><Pencil />Edit field…</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GridRowProps = {
  row: DataRow;
  rowIndex: number;
  number: number;
  fields: FieldDefinition[];
  active: number | null;
  editing: { position: CellPosition; draft: string; error: string | null } | null;
  timeZone: string;
  relationships: RelationshipOptions;
  onSelect: (col: number) => void;
  onEdit: (col: number) => void;
  onDraft: (draft: string) => void;
  onCommitKey: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlurCommit: () => void;
  onToggleIncluded: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
};

const GridRow = memo(function GridRow({ row, rowIndex, number, fields, active, editing, timeZone, relationships, onSelect, onEdit, onDraft, onCommitKey, onBlurCommit, onToggleIncluded, onInsertBelow, onDelete }: GridRowProps) {
  return (
    <TableRow aria-rowindex={rowIndex + 2} data-row-id={row.id} data-excluded={row.included ? undefined : ""} className={cn("group/row hover:bg-muted/30", !row.included && "text-muted-foreground")}>
      <TableCell className="sticky left-0 z-10 border-r border-b bg-background px-1 text-right text-xs text-muted-foreground tabular-nums group-hover/row:bg-muted">
        <span className="relative flex items-center justify-end gap-1 pr-1">
          {!row.included ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}><EyeOff className="size-3" aria-label="Not published" /></TooltipTrigger>
              <TooltipContent>Kept out of publication</TooltipContent>
            </Tooltip>
          ) : null}
          <span className="transition-opacity group-focus-within/row:opacity-0 group-hover/row:opacity-0">{number}</span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Row ${number} actions`} className="absolute right-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100" />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={onInsertBelow}><Plus />Insert row below</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={row.included} onCheckedChange={onToggleIncluded}>Include when publishing</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />Delete row</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </TableCell>
      {fields.map((field, col) => {
        const value = row.values[field.key] ?? null;
        const isActive = active === col;
        const isEditing = editing?.position.col === col;
        return (
          <TableCell
            key={field.key}
            role="gridcell"
            data-cell={`${rowIndex}:${col}`}
            tabIndex={isActive || (active === null && rowIndex === 0 && col === 0) ? 0 : -1}
            aria-selected={isActive}
            aria-readonly={false}
            onMouseDown={() => onSelect(col)}
            onDoubleClick={() => onEdit(col)}
            className={cn(
              "relative h-9 max-w-0 cursor-cell border-r border-b px-2.5 py-0 align-middle outline-none",
              NUMERIC.has(field.type) && "text-right tabular-nums",
              isActive && "z-[1] bg-primary/5 shadow-[inset_0_0_0_2px_var(--ring)]"
            )}
          >
            {isEditing ? (
              <InlineEditor field={field} draft={editing!.draft} error={editing!.error} onDraft={onDraft} onKeyDown={onCommitKey} onBlur={onBlurCommit} />
            ) : (
              <CellValue field={field} value={value} timeZone={timeZone} relationships={relationships} onToggle={field.type === "boolean" ? () => onEdit(col) : undefined} />
            )}
          </TableCell>
        );
      })}
      <TableCell className="border-b" aria-hidden="true" />
    </TableRow>
  );
});

function CellValue({ field, value, timeZone, relationships, onToggle }: { field: FieldDefinition; value: DataValue; timeZone: string; relationships: RelationshipOptions; onToggle?: () => void }) {
  if (field.type === "boolean") {
    return <Checkbox checked={value === true} onCheckedChange={() => onToggle?.()} tabIndex={-1} aria-label={field.label} className="align-middle" />;
  }
  if (value === null) return null;
  if (field.type === "select") {
    const choice = field.options.choices.find((entry) => entry.value === value);
    return <span className={cn("inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-xs font-medium", TONES[choice?.tone ?? "neutral"])}>{choice?.label ?? String(value)}</span>;
  }
  if (field.type === "relationship") {
    const label = relationships[field.key]?.find((entry) => entry.value === value)?.label;
    return <span className="block truncate">{label ?? <span className="font-mono text-xs text-muted-foreground">{String(value)}</span>}</span>;
  }
  const text = formatDataValue(field, value, { locale: "en-US", timeZone });
  return <span className={cn("block truncate", field.type === "url" && "text-primary underline-offset-2")} title={text.length > 30 ? text : undefined}>{text}</span>;
}

const INPUT_TYPES: Partial<Record<FieldDefinition["type"], string>> = { date: "date", dateTime: "datetime-local", url: "url" };

function InlineEditor({ field, draft, error, onDraft, onKeyDown, onBlur }: { field: FieldDefinition; draft: string; error: string | null; onDraft: (value: string) => void; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void; onBlur: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    if (element.type === "text") element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  return (
    <Tooltip open={Boolean(error)}>
      <TooltipTrigger render={<span className="absolute inset-0 block" />}>
        <input
          ref={input}
          type={INPUT_TYPES[field.type] ?? "text"}
          inputMode={NUMERIC.has(field.type) ? "decimal" : undefined}
          value={draft}
          aria-label={field.label}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            onKeyDown(event);
          }}
          onBlur={onBlur}
          className={cn("absolute inset-0 h-full w-full bg-background px-2.5 text-sm outline-none ring-2 ring-ring ring-inset", NUMERIC.has(field.type) && "text-right tabular-nums", error && "ring-destructive")}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{error}</TooltipContent>
    </Tooltip>
  );
}

function PopoverEditor({ anchor, field, draft, error, options, onDraft, onChoose, onSave, onCancel }: { anchor: HTMLElement; field: FieldDefinition; draft: string; error: string | null; options: Array<{ value: string; label: string }>; onDraft: (value: string) => void; onChoose: (value: DataValue) => void; onSave: () => void; onCancel: () => void }) {
  const choices = field.type === "select" ? field.options.choices.map((choice) => ({ value: choice.value, label: choice.label, tone: choice.tone ?? "neutral" })) : options.map((option) => ({ ...option, tone: "neutral" }));
  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverContent anchor={anchor} align="start" sideOffset={2} className={cn("p-0", field.type === "longText" ? "w-[min(28rem,90vw)]" : "w-64")}>
        {field.type === "longText" ? (
          <div className="grid gap-2 p-3">
            <Textarea
              autoFocus
              value={draft}
              rows={6}
              aria-label={field.label}
              aria-invalid={error ? true : undefined}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onSave();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancel();
                }
              }}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">⌘Enter to save</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button type="button" size="sm" onClick={onSave}>Save</Button>
              </div>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder={field.type === "select" ? "Choose…" : "Find a record…"} autoFocus />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup>
                {choices.map((choice) => (
                  <CommandItem key={choice.value} value={`${choice.label} ${choice.value}`} onSelect={() => onChoose(choice.value)}>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", TONES[choice.tone])}>{choice.label}</span>
                  </CommandItem>
                ))}
                <CommandItem value="__clear__ clear empty" onSelect={() => onChoose(null)} className="text-muted-foreground">Clear</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
