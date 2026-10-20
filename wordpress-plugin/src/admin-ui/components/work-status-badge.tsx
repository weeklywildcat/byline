import type { ComponentProps } from "react";
import { Badge } from "../ui/badge";
import { cn } from "../lib/utils";

/**
 * Two independent meanings:
 * - hue = what kind of work is being done
 * - intensity = whether someone needs to take the next step
 *
 * Never make hue stand in for urgency, or use color as the only status cue.
 */
export type WorkKind = "reporting" | "editorial" | "production" | "task" | "publication" | "neutral";
export type WorkIntensity = "action" | "active" | "settled";

export const workBadgeColors: Record<WorkKind, Record<WorkIntensity, string>> = {
  reporting: {
    action: "border-orange-800 bg-orange-700 text-white dark:border-orange-500 dark:bg-orange-600 dark:text-white",
    active: "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
    settled: "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
  },
  editorial: {
    action: "border-violet-800 bg-violet-700 text-white dark:border-violet-500 dark:bg-violet-600 dark:text-white",
    active: "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
    settled: "border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"
  },
  production: {
    action: "border-blue-800 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600 dark:text-white",
    active: "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
    settled: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
  },
  task: {
    action: "border-teal-800 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600 dark:text-white",
    active: "border-teal-200 bg-teal-100 text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
    settled: "border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
  },
  publication: {
    action: "border-green-800 bg-green-700 text-white dark:border-green-500 dark:bg-green-600 dark:text-white",
    active: "border-green-200 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
    settled: "border-green-100 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
  },
  neutral: {
    action: "border-slate-800 bg-slate-700 text-white dark:border-slate-500 dark:bg-slate-600 dark:text-white",
    active: "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    settled: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
  }
};

export function WorkStatusBadge({ kind, intensity, className, ...props }: {
  kind: WorkKind;
  intensity: WorkIntensity;
} & Omit<ComponentProps<typeof Badge>, "variant">) {
  return <Badge variant="outline" data-work-kind={kind} data-work-intensity={intensity}
    className={cn("max-w-40 truncate font-medium", workBadgeColors[kind][intensity], className)} {...props} />;
}

/** All source progress remains in the reporting hue, regardless of urgency. */
export function sourceIntensity(status: string): WorkIntensity {
  if (status === "planned" || status === "needs-scheduling") return "action";
  if (status === "interviewed" || status === "declined" || status === "unavailable") return "settled";
  return "active";
}

export function mediaIntensity(status: string): WorkIntensity {
  if (status === "needed") return "action";
  if (status === "done" || status === "selected") return "settled";
  return "active";
}

export function appointmentIntensity(appointment: { status: string; scheduleMode: string; startAt: string | null }): WorkIntensity {
  if (appointment.status === "completed" || appointment.status === "cancelled") return "settled";
  if (appointment.scheduleMode !== "exact" || !appointment.startAt || appointment.status === "tentative") return "action";
  return "active";
}

export function appointmentStatusLabel(appointment: { status: string; scheduleMode: string; startAt: string | null }): string {
  if (appointment.status === "completed") return "Completed";
  if (appointment.status === "cancelled") return "Cancelled";
  if (appointment.scheduleMode !== "exact" || !appointment.startAt) return "Needs scheduling";
  if (appointment.status === "tentative") return "Needs confirmation";
  return "Scheduled";
}

/** A photo shoot belongs to production rather than interview/reporting work. */
export function appointmentKind(appointment: { kind: string }): WorkKind {
  return appointment.kind === "photo" ? "production" : "reporting";
}
