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
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
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
  const raw = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Math.round(value * 1e9) / 1e9);
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
  return model.max === model.min ? 0 : Math.round(((value - model.min) / (model.max - model.min)) * 10000) / 100;
}

/** How a tick reads: no trailing zeros, thousands separated. */
export function formatTick(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
