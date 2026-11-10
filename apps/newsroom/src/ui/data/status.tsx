"use client";

import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import type { DatasetPublication, ProjectPublication } from "../../data/server";

const DATASET: Record<DatasetPublication, { label: string; tone: "neutral" | "done" | "attention" }> = {
  unpublished: { label: "Not published", tone: "neutral" },
  published: { label: "Published", tone: "done" },
  changed: { label: "Unpublished changes", tone: "attention" }
};
const PROJECT: Record<ProjectPublication, { label: string; tone: "neutral" | "done" | "attention" }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "done" },
  changed: { label: "Unpublished changes", tone: "attention" }
};

/** Working vs published, in the newsroom's three looks: plain, finished, needs a person. */
export function DatasetStatus({ publication }: { publication: DatasetPublication }) {
  const { label, tone } = DATASET[publication];
  return <StatusBadge tone={tone} data-data-status={publication}>{label}</StatusBadge>;
}

export function ProjectStatus({ publication }: { publication: ProjectPublication }) {
  const { label, tone } = PROJECT[publication];
  return <StatusBadge tone={tone} data-data-status={publication}>{label}</StatusBadge>;
}

/** "Nov 10, 4:12 PM" in the newsroom's timezone, never the browser's. */
export function formatWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "4 minutes ago", for edits. */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  const format = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "just now";
  if (Math.abs(seconds) < 3600) return format.format(-Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86_400) return format.format(-Math.round(seconds / 3600), "hour");
  return format.format(-Math.round(seconds / 86_400), "day");
}

export const shortSha = (sha: string) => sha.slice(0, 7);
