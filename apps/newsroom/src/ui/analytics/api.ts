"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { AnalyticsProblem } from "../../analytics/model";
import type { ConnectionDto, VerifyDto } from "../../analytics/endpoints";
import { deleteJson, getJson, patchJson, postJson } from "../story/api";
import { useNewsroomRoutes } from "../shell/account";

export type { ConnectionDto, VerifyDto };
export type Envelope<T> = { data: T | null; problem: AnalyticsProblem | null };

export const analyticsKeys = {
  all: ["byline", "analytics"] as const,
  connection: () => [...analyticsKeys.all, "connection"] as const,
  options: (property: string) => [...analyticsKeys.all, "options", property] as const,
  report: (kind: string, search: string) => [...analyticsKeys.all, "report", kind, search] as const
};

export const fetchConnection = (api: string) => getJson<ConnectionDto>(api, "/byline/analytics/connection");
export const selectStream = (api: string, body: { property: string; stream: string }) => postJson<ConnectionDto>(api, "/byline/analytics/select", body);
export const saveMeasurement = (api: string, body: { trackingMode: "external" | "byline"; consentMode?: "always" | "ask"; publish?: boolean }) =>
  patchJson<{ connection: ConnectionDto; published: { changed: boolean; revision: number | null } | null }>(api, "/byline/analytics/measurement", body);
export const verifyConnection = (api: string) => postJson<VerifyDto>(api, "/byline/analytics/verify", {});
export const disconnectGoogle = (api: string) => deleteJson<{ revoked: boolean; publicationUpdated: boolean; connection: ConnectionDto }>(api, "/byline/analytics/connection", {});

export type RangeParams = { preset: string; start: string; end: string };

export function searchFor(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  return search.toString();
}

/**
 * One report as the screens see it: cached data shows immediately (a refetch never blanks it), the
 * server cache decides whether Google is asked again, and Refresh asks for a fresh answer.
 */
export function useReport<T>(kind: string, search: string, options: { poll?: number; path?: string } = {}) {
  const { api } = useNewsroomRoutes();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const path = options.path ?? `/byline/analytics/${kind}`;
  const key = analyticsKeys.report(options.path ?? kind, search);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getJson<Envelope<T>>(api, `${path}${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
    // React Query pauses interval refetching while the tab is hidden, so Realtime only polls when visible.
    refetchInterval: options.poll,
    refetchIntervalInBackground: false
  });
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      client.setQueryData(key, await getJson<Envelope<T>>(api, `${path}?${search ? `${search}&` : ""}refresh=1`));
    } finally {
      setRefreshing(false);
    }
  }, [api, client, key, path, search]);
  return { ...query, refresh, refreshing };
}

export type AccountOption = { account: string; displayName: string; properties: Array<{ property: string; propertyId: string; displayName: string }> };
export type StreamOption = { stream: string; displayName: string; defaultUri: string; hostname: string; measurementId: string; recommended: boolean };
export type OptionsDto =
  | { problem: AnalyticsProblem }
  | { accounts: AccountOption[]; property: { property: string; displayName: string; timeZone: string } | null; streams: StreamOption[]; recommended: string | null; timeZoneWarning: string | null; selected: { property: string | null; stream: string | null } };

export const fetchOptions = (api: string, property?: string) => getJson<OptionsDto>(api, `/byline/analytics/options${property ? `?property=${encodeURIComponent(property)}` : ""}`);
