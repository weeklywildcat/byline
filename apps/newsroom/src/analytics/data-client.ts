import { googleJson, propertyResource, type RequestOptions } from "./google-client";

const DATA = "https://analyticsdata.googleapis.com/v1beta";

/** Google allows at most 5 reports in one batchRunReports call. */
export const MAX_BATCH_REPORTS = 5;

export type DateRangeSpec = { startDate: string; endDate: string; name?: string };
export type FilterSpec = Record<string, unknown>;
export type OrderSpec = { metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean };

/** A report definition the server owns. The browser never supplies one. */
export type ReportSpec = {
  dimensions: readonly string[];
  metrics: readonly string[];
  dateRanges: readonly DateRangeSpec[];
  dimensionFilter?: FilterSpec;
  orderBys?: readonly OrderSpec[];
  limit?: number;
  keepEmptyRows?: boolean;
};

export type ReportRow = { dims: Record<string, string>; metrics: Record<string, number> };
export type ReportTable = { rows: ReportRow[]; rowCount: number };

type RawReport = {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
};

export function parseReport(raw: RawReport | null | undefined): ReportTable {
  const dimensionNames = (raw?.dimensionHeaders ?? []).map((header) => header.name ?? "");
  const metricNames = (raw?.metricHeaders ?? []).map((header) => header.name ?? "");
  const rows = (raw?.rows ?? []).map((row): ReportRow => ({
    dims: Object.fromEntries(dimensionNames.map((name, index) => [name, row.dimensionValues?.[index]?.value ?? ""])),
    metrics: Object.fromEntries(metricNames.map((name, index) => {
      const value = Number(row.metricValues?.[index]?.value);
      return [name, Number.isFinite(value) ? value : 0];
    }))
  }));
  return { rows, rowCount: typeof raw?.rowCount === "number" ? raw.rowCount : rows.length };
}

export function reportBody(spec: ReportSpec) {
  return {
    dimensions: spec.dimensions.map((name) => ({ name })),
    metrics: spec.metrics.map((name) => ({ name })),
    dateRanges: spec.dateRanges,
    ...(spec.dimensionFilter ? { dimensionFilter: spec.dimensionFilter } : {}),
    ...(spec.orderBys?.length ? { orderBys: spec.orderBys } : {}),
    limit: String(spec.limit ?? 1000),
    ...(spec.keepEmptyRows ? { keepEmptyRows: true } : {}),
    returnPropertyQuota: true
  };
}

let lastQuota: { at: string; quota: unknown } | null = null;
/** The latest property quota Google reported, for server-side diagnostics. */
export const quotaDiagnostics = () => lastQuota;
const track = (options: RequestOptions): RequestOptions => ({ ...options, onQuota: (quota) => { lastQuota = { at: new Date().toISOString(), quota }; options.onQuota?.(quota); } });

export async function runReport(token: string, property: string, spec: ReportSpec, options: RequestOptions = {}): Promise<ReportTable> {
  const raw = await googleJson<RawReport>(`${DATA}/${propertyResource(property)}:runReport`, token, { ...track(options), method: "POST", body: reportBody(spec) });
  return parseReport(raw);
}

/** Related reports in one request (at most five). The result is in request order. */
export async function batchRunReports(token: string, property: string, specs: readonly ReportSpec[], options: RequestOptions = {}): Promise<ReportTable[]> {
  if (specs.length === 0) return [];
  if (specs.length > MAX_BATCH_REPORTS) throw new RangeError(`batchRunReports takes at most ${MAX_BATCH_REPORTS} reports.`);
  const raw = await googleJson<{ reports?: RawReport[] }>(`${DATA}/${propertyResource(property)}:batchRunReports`, token, { ...track(options), method: "POST", body: { requests: specs.map(reportBody) } });
  return specs.map((_, index) => parseReport(raw.reports?.[index]));
}

export type RealtimeSpec = { dimensions: readonly string[]; metrics: readonly string[]; limit?: number; orderBys?: readonly OrderSpec[]; minuteRanges?: ReadonlyArray<{ startMinutesAgo: number; endMinutesAgo: number; name?: string }> };

export async function runRealtimeReport(token: string, property: string, spec: RealtimeSpec, options: RequestOptions = {}): Promise<ReportTable> {
  const body = {
    dimensions: spec.dimensions.map((name) => ({ name })),
    metrics: spec.metrics.map((name) => ({ name })),
    limit: String(spec.limit ?? 100),
    ...(spec.orderBys?.length ? { orderBys: spec.orderBys } : {}),
    ...(spec.minuteRanges ? { minuteRanges: spec.minuteRanges } : {}),
    returnPropertyQuota: true
  };
  return parseReport(await googleJson<RawReport>(`${DATA}/${propertyResource(property)}:runRealtimeReport`, token, { ...track(options), method: "POST", body }));
}
