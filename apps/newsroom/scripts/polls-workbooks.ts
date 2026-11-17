/**
 * Writes the Wildcat Polls example workbook, blank template and spreadsheet
 * guide from their sources (src/polls/workbooks). Run after changing them:
 *
 *   node --import tsx apps/newsroom/scripts/polls-workbooks.ts
 *
 * tests/polls-workbooks.test.ts fails when a committed file is out of date.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeWorkbook } from "../src/polls/engine/xlsx";
import { EXAMPLE_SHEETS, EXAMPLE_WORKBOOK_FILE, TEMPLATE_SHEETS, TEMPLATE_WORKBOOK_FILE } from "../src/polls/workbooks/example";
import { SPREADSHEET_GUIDE } from "../src/polls/workbooks/guide";

const workbooks = new URL("../src/polls/workbooks/", import.meta.url);
writeFileSync(new URL(EXAMPLE_WORKBOOK_FILE, workbooks), writeWorkbook(EXAMPLE_SHEETS));
writeFileSync(new URL(TEMPLATE_WORKBOOK_FILE, workbooks), writeWorkbook(TEMPLATE_SHEETS));
writeFileSync(new URL("../../../docs/wildcat-polls-xlsform.md", import.meta.url), SPREADSHEET_GUIDE);
console.log(`Wrote ${EXAMPLE_WORKBOOK_FILE}, ${TEMPLATE_WORKBOOK_FILE} and docs/wildcat-polls-xlsform.md in ${fileURLToPath(workbooks)}`);
