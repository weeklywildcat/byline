"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { presenceLocationFor, PRESENCE_TIMING, type PresenceLocation, type PresenceSnapshot } from "../../domain/presence";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { useShellLayout } from "./layout";
import { startPresence } from "./presence-lifecycle";

const PRESENCE_QUERY = ["byline", "presence"] as const;
type CacheValue = { accountId: string; snapshot: PresenceSnapshot };
type PresenceValue = { snapshot?: PresenceSnapshot; location: PresenceLocation; failed: boolean; refresh: () => void };
const PresenceContext = createContext<PresenceValue | null>(null);
export const usePresence = () => useContext(PresenceContext);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const accountId = account ? String(account.id) : null;
  const { api, admin } = useNewsroomRoutes();
  const pathname = usePathname() ?? "";
  const { collectionId } = useShellLayout();
  const location = useMemo(() => presenceLocationFor(pathname, admin, collectionId), [pathname, admin, collectionId]);
  const client = useQueryClient();
  const { data } = useQuery<CacheValue | null>({ queryKey: PRESENCE_QUERY, queryFn: skipToken });
  const snapshot = data && data.accountId === accountId ? data.snapshot : undefined;
  const [failed, setFailed] = useState(false);
  const current = useRef(location);
  const lifecycle = useRef<ReturnType<typeof startPresence> | null>(null);

  useEffect(() => {
    const previous = current.current;
    current.current = location;
    if (previous.kind !== location.kind || ("targetId" in previous ? previous.targetId : null) !== ("targetId" in location ? location.targetId : null)) {
      lifecycle.current?.moved();
    }
  }, [location]);

  useEffect(() => {
    const cached = client.getQueryData<CacheValue | null>(PRESENCE_QUERY);
    if (cached && cached.accountId !== accountId) client.setQueryData(PRESENCE_QUERY, null);
    setFailed(false);
    if (!accountId) return;
    const runtime = startPresence({
      endpoint: `${api}/byline/presence`,
      location: () => current.current,
      onSnapshot: (snapshot) => {
        setFailed(false);
        client.setQueryData<CacheValue>(PRESENCE_QUERY, { accountId, snapshot });
      },
      onError: () => setFailed(true)
    });
    lifecycle.current = runtime;
    return () => {
      lifecycle.current = null;
      runtime.stop();
    };
  }, [accountId, api, client]);

  return <PresenceContext value={accountId ? {
    snapshot, location, failed,
    refresh: () => {
      const updated = client.getQueryState(PRESENCE_QUERY)?.dataUpdatedAt ?? 0;
      if (failed || Date.now() - updated >= PRESENCE_TIMING.heartbeat) lifecycle.current?.refresh();
    }
  } : null}>{children}</PresenceContext>;
}
