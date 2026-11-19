import type { Change, ResolvedRange } from "../../analytics/model";

export const formatCount = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—");

/** Average engagement per active user: "45s", "1m 24s", "1h 02m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export const formatPercent = (ratio: number | null | undefined, digits = 0) => (typeof ratio === "number" && Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : "—");

export type ChangeView = { text: string; tone: "up" | "down" | "flat" | "new" | "none"; label: string };

/**
 * A comparison as words. Never a fake ∞%: a missing or zero previous period is "New" (when there is
 * something now) or nothing at all.
 */
export function describeChange(change: Change | null | undefined): ChangeView {
  if (!change || change.current === null || change.previous === null) return { text: "", tone: "none", label: "No comparison available" };
  if (change.previous === 0) return change.current > 0 ? { text: "New", tone: "new", label: "No views in the previous period" } : { text: "", tone: "none", label: "No comparison available" };
  const ratio = change.ratio ?? 0;
  const percent = Math.abs(ratio * 100);
  if (percent < 0.5) return { text: "No change", tone: "flat", label: "No change from the previous period" };
  const text = `${ratio > 0 ? "+" : "−"}${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`;
  return { text, tone: ratio > 0 ? "up" : "down", label: `${ratio > 0 ? "Up" : "Down"} ${text.slice(1)} from the previous period` };
}

const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayWithYear = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function rangeLabel(range: ResolvedRange | null | undefined): string {
  if (!range) return "";
  return range.start === range.end ? dayWithYear(range.start) : `${day(range.start)} – ${dayWithYear(range.end)}`;
}

export const chartDay = (value: string) => day(value);

/** "Updated just now / 3 min ago". */
export function updatedLabel(fetchedAt: string | null | undefined, now: number = Date.now()): string {
  if (!fetchedAt) return "";
  const seconds = Math.max(0, Math.round((now - Date.parse(fetchedAt)) / 1000));
  if (seconds < 45) return "Updated just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${Math.round(minutes / 60)} hr ago`;
}

/** A short textual summary a screen reader (or anyone) can use instead of a chart's hover. */
export function seriesSummary(points: Array<{ date: string; views: number }>): string {
  if (!points.length) return "No data.";
  const total = points.reduce((sum, point) => sum + point.views, 0);
  const peak = points.reduce((best, point) => (point.views > best.views ? point : best), points[0]!);
  return `${formatCount(total)} views over ${points.length} day${points.length === 1 ? "" : "s"}. Most views: ${formatCount(peak.views)} on ${day(peak.date)}.`;
}
