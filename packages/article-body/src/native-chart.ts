import { ARTICLE_BLOCK_LIMITS as LIMITS } from "./blocks";
import type { NativeChartData } from "./types";

/**
 * The model behind Chart / Map's native charts. The reporter's data is the
 * Data Table model (`data-table.ts`: TSV paste, add/move/remove rows and
 * columns): the first column names each category, every other column is one
 * series. Cells stay text exactly as typed ("$48,000", "14%"); these helpers
 * read the numbers out of them for drawing. No palette, no formulas.
 */

/** "1,400", "$48,000", "14%", "-3.5", "−2" (a real minus) as a number; blank as null; anything else as NaN. */
export function chartValue(cell: string | undefined): number | null {
  const text = (cell ?? "").trim();
  if (!text) return null;
  const cleaned = text.replace(/[−–]/g, "-").replace(/^\((.*)\)$/, "-$1").replace(/[,\s$€£%]/g, "");
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

export type ChartSeries = { id: string; label: string; values: Array<number | null>; texts: string[] };
export type ChartModel = { categories: Array<{ id: string; label: string }>; series: ChartSeries[]; min: number; max: number; ticks: number[] };

/** The first problem with a chart's data, in the reporter's words, or null when it can be drawn. */
export function chartDataProblem(data: NativeChartData): string | null {
  const series = data.columns.length - 1;
  if (series < 1) return "Add a column of numbers.";
  if (series > LIMITS.chartSeriesMax) return `A chart shows at most ${LIMITS.chartSeriesMax} series of numbers.`;
  if (data.columns.slice(1).some((column) => !column.label.trim())) return "Name every series: each number column needs a header.";
  const rows = data.rows.filter((row) => row.cells.some((cell) => cell.trim()));
  if (rows.length < LIMITS.chartRowsMin) return `A chart needs at least ${LIMITS.chartRowsMin} rows of data.`;
  if (rows.length > LIMITS.chartRowsMax) return `A chart shows at most ${LIMITS.chartRowsMax} rows.`;
  for (const [index, row] of rows.entries()) {
    if (!(row.cells[0] ?? "").trim()) return `Row ${index + 1} needs a label in the first column.`;
    for (let column = 1; column <= series; column += 1) {
      if (Number.isNaN(chartValue(row.cells[column]))) return `Row ${index + 1}, “${data.columns[column]?.label || `column ${column + 1}`}” is not a number.`;
    }
  }
  if (!rows.some((row) => row.cells.slice(1, series + 1).some((cell) => chartValue(cell) !== null))) return "Add at least one number.";
  return null;
}

/** "Nice" round steps for an axis that includes zero. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const low = Math.min(0, min);
  const high = Math.max(0, max);
  if (low === high) return [0, 1];
  const span = high - low;
  const raw = Math.max(Number.MIN_VALUE, Number.isFinite(span) ? span / count : high / count - low / count);
  const magnitude = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw && Number.isFinite(candidate)) ?? raw;
  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  const ticks: number[] = [];
  for (let index = first; index <= last; index += 1) {
    const tick = index * step;
    ticks.push(Number.isFinite(tick) ? tick : index < 0 ? low : high);
  }
  return ticks;
}

/** The data as categories and series with a shared scale (always including zero). Rows without a label are left out. */
export function chartModel(data: NativeChartData): ChartModel {
  const rows = data.rows.filter((row) => (row.cells[0] ?? "").trim());
  const series = data.columns.slice(1, LIMITS.chartSeriesMax + 1).map((column, offset) => ({
    id: column.id,
    label: column.label.trim(),
    texts: rows.map((row) => (row.cells[offset + 1] ?? "").trim()),
    values: rows.map((row) => {
      const value = chartValue(row.cells[offset + 1]);
      return value === null || Number.isNaN(value) ? null : value;
    })
  }));
  const values = series.flatMap((entry) => entry.values.filter((value): value is number => value !== null));
  const ticks = niceTicks(values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 1);
  return { categories: rows.map((row) => ({ id: row.id, label: (row.cells[0] ?? "").trim() })), series, min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 1, ticks };
}

/** A position on the scale as a percentage of the axis, 0-100. */
export function chartPercent(model: Pick<ChartModel, "min" | "max">, value: number): number {
  const span = model.max - model.min;
  if (span === 0) return 0;
  const fraction = Number.isFinite(span)
    ? (value - model.min) / span
    : (value / 2 - model.min / 2) / (model.max / 2 - model.min / 2);
  return Math.round(fraction * 10000) / 100;
}

/** Axis spacing sets the precision. Very small steps use compact scientific labels. */
export function formatTick(value: number, step: number): string {
  if (value === 0) return "0";
  const maximumFractionDigits = Math.max(0, 1 - Math.floor(Math.log10(step)));
  const options: Intl.NumberFormatOptions = maximumFractionDigits > 9
    ? { notation: "scientific", maximumSignificantDigits: 3 }
    : { maximumFractionDigits };
  return new Intl.NumberFormat("en-US", options).format(value);
}
