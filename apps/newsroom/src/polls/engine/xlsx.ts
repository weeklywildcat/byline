/**
 * A deliberately small .xlsx reader and writer for survey workbooks.
 *
 * Reading takes only what a survey needs: sheet names and the text of each
 * cell. Formulas are never evaluated (a formula cell contributes the value the
 * spreadsheet saved, and is reported); macros, external links, styles and
 * embedded objects are ignored. The archive is bounded so a hostile file
 * cannot exhaust memory. No dependency: ZIP entries are inflated with the
 * platform's `DecompressionStream`, available in Node and every supported browser.
 *
 * Writing produces a plain, uncompressed (stored) workbook: the blank template,
 * the worked example and "Download as spreadsheet" from Poll Studio.
 */

export type SheetRow = { row: number; cells: string[] };
export type Sheet = { name: string; rows: SheetRow[] };
export type Workbook = { sheets: Sheet[]; formulaCells: Array<{ sheet: string; cell: string }> };

export const XLSX_LIMITS = { fileBytes: 5 * 1024 * 1024, entries: 400, entryBytes: 20 * 1024 * 1024, totalBytes: 40 * 1024 * 1024, rows: 5000, columns: 60 } as const;

export class WorkbookError extends Error {}

/* ------------------------------------------------------------------ ZIP read */

type Entry = { name: string; method: number; compressedSize: number; size: number; offset: number };

function u16(bytes: Uint8Array, at: number) { return bytes[at] | (bytes[at + 1] << 8); }
function u32(bytes: Uint8Array, at: number) { return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0; }

function centralDirectory(bytes: Uint8Array): Entry[] {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new WorkbookError("This file is not an .xlsx workbook.");
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  if (count > XLSX_LIMITS.entries) throw new WorkbookError("This workbook has too many parts.");
  if (count === 0xffff || at === 0xffffffff) throw new WorkbookError("This workbook uses ZIP64, which is not supported. Save it again as a normal .xlsx file.");
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new WorkbookError("This workbook is damaged.");
    const method = u16(bytes, at + 10);
    const compressedSize = u32(bytes, at + 20);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extra = u16(bytes, at + 30);
    const comment = u16(bytes, at + 32);
    const offset = u32(bytes, at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.push({ name, method, compressedSize, size, offset });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new WorkbookError("Part of this workbook is too large to read."); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

async function readEntry(bytes: Uint8Array, entry: Entry, budget: { left: number }): Promise<string> {
  const at = entry.offset;
  if (at + 30 > bytes.length || u32(bytes, at) !== 0x04034b50) throw new WorkbookError("This workbook is damaged.");
  const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.size > XLSX_LIMITS.entryBytes || entry.size > budget.left) throw new WorkbookError("This workbook is too large to read.");
  let data: Uint8Array;
  if (entry.method === 0) data = raw;
  else if (entry.method === 8) data = await inflateRaw(raw, Math.min(XLSX_LIMITS.entryBytes, budget.left));
  else throw new WorkbookError("This workbook uses a compression method Byline cannot read. Save it again as .xlsx.");
  budget.left -= data.byteLength;
  return new TextDecoder().decode(data);
}

/* ------------------------------------------------------------------ XML bits */

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITY[code];
  });
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
  return result;
}

/** The text runs of a shared string or inline string, without phonetic hints. */
function runText(xml: string): string {
  const withoutPhonetics = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetics.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) text += decodeXml(match[1] ?? "");
  return text;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref.toUpperCase())?.[0] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/* ------------------------------------------------------------------ read */

export async function readWorkbook(input: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > XLSX_LIMITS.fileBytes) throw new WorkbookError("This workbook is larger than 5 MB. A survey workbook is usually a few kilobytes.");
  if (bytes.byteLength < 22 || u32(bytes, 0) !== 0x04034b50) throw new WorkbookError("This file is not an .xlsx workbook. Save it as Excel Workbook (.xlsx).");
  const entries = new Map(centralDirectory(bytes).map((entry) => [entry.name, entry]));
  const budget = { left: XLSX_LIMITS.totalBytes };
  const text = async (name: string) => { const entry = entries.get(name); return entry ? readEntry(bytes, entry, budget) : null; };

  const workbookXml = await text("xl/workbook.xml");
  if (!workbookXml) throw new WorkbookError("This file is not an .xlsx workbook (no workbook part). Save it as Excel Workbook (.xlsx).");
  const relsXml = (await text("xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.Id && attrs.Target) targets.set(attrs.Id, attrs.Target);
  }
  const sharedXml = (await text("xl/sharedStrings.xml")) ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((match) => runText(match[1] ?? ""));

  const sheets: Sheet[] = [];
  const formulaCells: Workbook["formulaCells"] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    const name = attrs.name ?? "";
    const target = targets.get(attrs["r:id"] ?? "");
    if (!name || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await text(path.replace(/\/\.\//g, "/"));
    if (xml === null) continue;
    const rows: SheetRow[] = [];
    let implicitRow = 0;
    for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNumber = Number(attributes(rowMatch[1]).r) || implicitRow + 1;
      implicitRow = rowNumber;
      if (rowNumber > XLSX_LIMITS.rows) throw new WorkbookError(`The ${name} sheet has more than ${XLSX_LIMITS.rows} rows.`);
      const cells: string[] = [];
      let implicitColumn = 0;
      for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = attributes(cellMatch[1]);
        const column = attrs.r ? columnIndex(attrs.r) : implicitColumn;
        implicitColumn = column + 1;
        if (column >= XLSX_LIMITS.columns) continue;
        const inner = cellMatch[2] ?? "";
        if (/<f\b/.test(inner)) formulaCells.push({ sheet: name, cell: attrs.r ?? `${columnName(column)}${rowNumber}` });
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = "";
        if (attrs.t === "s") value = shared[Number(raw)] ?? "";
        else if (attrs.t === "inlineStr") value = runText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
        else if (attrs.t === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else if (raw !== undefined) value = decodeXml(raw);
        cells[column] = value;
      }
      for (let i = 0; i < cells.length; i++) cells[i] ??= "";
      rows.push({ row: rowNumber, cells });
    }
    sheets.push({ name, rows });
  }
  if (!sheets.length) throw new WorkbookError("This workbook has no readable sheets.");
  return { sheets, formulaCells };
}

/* ------------------------------------------------------------------ write */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // A fixed timestamp keeps generated workbooks byte-for-byte reproducible.
  const time = 0, date = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
    view.setUint16(10, time, true); view.setUint16(12, date, true); view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true); view.setUint32(22, file.data.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
    local.set(name, 30);
    const header = new Uint8Array(46 + name.length);
    const cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, file.data.length, true); cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    header.set(name, 46);
    parts.push(local, file.data);
    central.push(header);
    offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}

const escapeXml = (text: string) => text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export type WriteSheet = { name: string; rows: string[][]; widths?: number[] };

/** A minimal .xlsx: inline strings, a bold frozen header row, set column widths. */
export function writeWorkbook(sheets: WriteSheet[]): Uint8Array {
  const encoder = new TextEncoder();
  const sheetXml = (sheet: WriteSheet) => {
    const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>` : "";
    const rows = sheet.rows.map((cells, r) => `<row r="${r + 1}">${cells.map((value, c) => (value === "" ? "" : `<c r="${columnName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`)).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) }))
  ];
  return zipStored(files.map((file) => ({ name: file.name, data: encoder.encode(file.data) })));
}
