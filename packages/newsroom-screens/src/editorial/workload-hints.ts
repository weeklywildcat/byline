import { useQuery } from "@tanstack/react-query";
import type { ContributorEntry } from "./editorial-model";

/**
 * Advisory workload text for the people pickers (docs/newsroom-roles.md#workload):
 * "2 active Stories · 1 review · 1 due this week", keyed by user id. Facts only —
 * a picker shows it as quiet secondary text and never disables, hides, orders
 * or colours anyone because of it. Hosts that cannot (or may not) supply it
 * leave `getWorkloadHints` undefined and the pickers are unchanged.
 */
export type WorkloadHints = Record<string, string>;
export type GetWorkloadHints = () => Promise<WorkloadHints>;

/** One cached copy shared by every picker on screen; story changes invalidate it with the rest of the story data. */
export const workloadHintsKey = ["byline", "workload-hints"] as const;

export function useWorkloadHints(getHints: GetWorkloadHints | undefined, enabled = true): WorkloadHints | undefined {
  const hints = useQuery({ queryKey: workloadHintsKey, queryFn: () => getHints!(), enabled: enabled && Boolean(getHints), staleTime: 60_000, retry: false });
  return hints.data;
}

/** Hints only describe newsroom users; guest writers have no workload. */
export function hintFor(person: Pick<ContributorEntry, "id" | "kind">, hints: WorkloadHints | undefined): string | undefined {
  return person.kind === "user" ? hints?.[String(person.id)] || undefined : undefined;
}
