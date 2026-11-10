import { parseValueText, valueToText, type DataValue, type FieldDefinition, type RecordValues } from "./fields";

/**
 * CSV for Byline Data: RFC 4180 parsing with hard limits, a mapping preview
 * that reports every problem instead of coercing, and an export that defuses
 * spreadsheet formula injection.
 */

export const CSV_LIMITS = { bytes: 5 * 1024 * 1024, rows: 10_000, columns: 60, cell: 10_000 } as const;

export class CsvError extends Error {}

/** Parses CSV (or tab-separated clipboard text) into rows of cells. Throws `CsvError` past a limit or on a malformed quote. */
export function parseDelimited(text: string, options: { delimiter?: "," | "\t"; limits?: Partial<typeof CSV_LIMITS> } = {}): string[][] {
  const limits = { ...CSV_LIMITS, ...options.limits };
  if (text.length > limits.bytes) throw new CsvError(`The file is larger than ${Math.round(limits.bytes / 1024 / 1024)} MB.`);
  const input = text.replace(/^﻿/, "");
  const delimiter = options.delimiter ?? (input.split("\n", 1)[0]?.includes("\t") && !input.split("\n", 1)[0]?.includes(",") ? "\t" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  const pushCell = () => {
    if (cell.length > limits.cell) throw new CsvError(`A cell in row ${rows.length + 1} is longer than ${limits.cell} characters.`);
    row.push(cell);
    if (row.length > limits.columns) throw new CsvError(`Row ${rows.length + 1} has more than ${limits.columns} columns.`);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    if (rows.length > limits.rows + 1) throw new CsvError(`The file has more than ${limits.rows} rows.`);
    row = [];
  };
  while (index < input.length) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index++;
        continue;
      }
      cell += char;
      index++;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      index++;
    } else if (char === delimiter) {
      pushCell();
      index++;
    } else if (char === "\n" || char === "\r") {
      pushRow();
      index += char === "\r" && input[index + 1] === "\n" ? 2 : 1;
    } else {
      cell += char;
      index++;
    }
  }
  if (quoted) throw new CsvError("A quoted cell is never closed.");
  if (cell !== "" || row.length) pushRow();
  return rows;
}

/* --------------------------------------------------------------- import */

export type ColumnMapping = Array<string | null>;

/** A first guess at which field each column fills, by label or key (case-insensitive). */
export function guessColumnMapping(header: readonly string[], fields: readonly FieldDefinition[]): ColumnMapping {
  const used = new Set<string>();
  const norm = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return header.map((column) => {
    const match = fields.find((field) => !used.has(field.key) && (norm(field.label) === norm(column) || norm(field.key) === norm(column)));
    if (!match) return null;
    used.add(match.key);
    return match.key;
  });
}

export type ImportRowIssue = { row: number; column: string; message: string };
export type ImportPreview = { rows: RecordValues[]; issues: ImportRowIssue[]; mapped: string[]; ignored: string[] };

/**
 * Maps data rows (the header excluded) to typed values. Every cell that is
 * not clearly a value of its field becomes a row issue; nothing is guessed.
 * Unmapped columns are ignored and reported.
 */
export function previewImport(header: readonly string[], dataRows: readonly string[][], mapping: ColumnMapping, fields: readonly FieldDefinition[]): ImportPreview {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const targets = mapping.map((key) => (key ? byKey.get(key) ?? null : null));
  const seen = new Set<string>();
  for (const key of mapping) {
    if (!key) continue;
    if (seen.has(key)) throw new CsvError(`Two columns are mapped to ${byKey.get(key)?.label ?? key}.`);
    seen.add(key);
  }
  const issues: ImportRowIssue[] = [];
  const rows = dataRows.map((cells, rowIndex) => {
    const values: RecordValues = {};
    targets.forEach((field, column) => {
      if (!field) return;
      const result = parseValueText(field, cells[column] ?? "");
      if (result.ok) values[field.key] = result.value;
      else issues.push({ row: rowIndex + 2, column: header[column] ?? `Column ${column + 1}`, message: result.message });
    });
    return values;
  });
  return {
    rows,
    issues,
    mapped: targets.flatMap((field) => (field ? [field.label] : [])),
    ignored: header.filter((_, column) => !targets[column])
  };
}

/* --------------------------------------------------------------- export */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/** A cell that Excel, Sheets or Numbers could read as a formula is prefixed with an apostrophe. */
export function defuseSpreadsheetFormula(text: string): string {
  return FORMULA_PREFIX.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}

function quote(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return `${rows.map((row) => row.map((cell) => quote(defuseSpreadsheetFormula(cell))).join(",")).join("\r\n")}\r\n`;
}

/** A dataset (or a release) as CSV: labels as the header, then each row's text values. */
export function datasetToCsv(fields: readonly FieldDefinition[], records: ReadonlyArray<{ values: Record<string, DataValue> }>): string {
  return serializeCsv([fields.map((field) => field.label), ...records.map((record) => fields.map((field) => valueToText(field, record.values[field.key] ?? null)))]);
}
