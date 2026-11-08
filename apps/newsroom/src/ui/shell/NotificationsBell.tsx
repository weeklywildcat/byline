"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Bell, Settings2 } from "lucide-react";
import { usePreferences } from "@payloadcms/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { atLeast } from "../../access/user";
import {
  defaultNotificationPreferences, NOTIFICATION_KINDS, NOTIFICATION_LABELS, NOTIFICATION_PREFERENCES_KEY, relativeTime, resolveNotificationPreferences,
  type NotificationChannel, type NotificationKind, type NotificationPreferences
} from "../../domain/notifications";
import type { InboxResponse } from "../../newsroom/notifications";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { ShellLink } from "./navigation";

const POLL_MS = 60_000;

/**
 * The header's notifications: an unread count, the person's inbox, and what
 * they choose to receive (Payload Preferences, `byline:notifications:preferences:v1`).
 * Polls once a minute while the tab is visible and refreshes when it is
 * opened; it never blocks the shell and shows nothing if the inbox is unreachable.
 */
export function NotificationsBell() {
  const account = useNewsroomAccount();
  const { api } = useNewsroomRoutes();
  const { getPreference, setPreference } = usePreferences();
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences());
  const [failed, setFailed] = useState(false);
  const loadedPreferences = useRef(false);
  const accountId = account?.id ?? null;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${api}/byline/notifications?limit=20`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setInbox((await response.json()) as InboxResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    if (accountId === null) return;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accountId, load]);

  useEffect(() => {
    if (!settings || loadedPreferences.current) return;
    loadedPreferences.current = true;
    void getPreference<unknown>(NOTIFICATION_PREFERENCES_KEY).then((stored) => setPreferences(resolveNotificationPreferences(stored)), () => undefined);
  }, [settings, getPreference]);

  if (!account) return null;
  const unread = inbox?.unread ?? 0;
  const kinds = NOTIFICATION_KINDS.filter((kind) => kind !== "publishingFailures" || atLeast(account, "editor"));

  /** Marks what the person can see as read (never a notification that arrived after the list loaded); `refresh` then shows any that remain. */
  const markRead = async (body: { ids: number[] } | { all: true }, refresh = false) => {
    setInbox((current) => current && ({
      ...current,
      unread: "all" in body ? 0 : Math.max(0, current.unread - current.items.filter((item) => body.ids.includes(item.id) && !item.readAt).length),
      items: current.items.map((item) => ("all" in body || body.ids.includes(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item))
    }));
    try {
      await fetch(`${api}/byline/notifications/read`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (refresh) void load();
    } catch {
      void load();
    }
  };

  const choose = (channel: NotificationChannel, kind: NotificationKind, value: boolean) => {
    const next = { ...preferences, [channel]: { ...preferences[channel], [kind]: value } };
    setPreferences(next);
    void setPreference(NOTIFICATION_PREFERENCES_KEY, next, true);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { void load(); } else setSettings(false); }}>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} />}>
        <Bell aria-hidden="true" />
        {unread > 0 ? <Badge className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums">{unread > 99 ? "99+" : unread}</Badge> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <PopoverHeader className="flex flex-row items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <PopoverTitle className="text-sm leading-tight">{settings ? "Notification settings" : "Notifications"}</PopoverTitle>
            <PopoverDescription className="sr-only">{settings ? "Choose what Byline tells you about." : "Your recent newsroom notifications."}</PopoverDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!settings && unread > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => void markRead({ ids: (inbox?.items ?? []).filter((item) => !item.readAt).map((item) => item.id) }, true)}>Mark all read</Button> : null}
            <Button type="button" variant={settings ? "secondary" : "ghost"} size="icon-sm" aria-label={settings ? "Back to notifications" : "Notification settings"} aria-pressed={settings} onClick={() => setSettings((current) => !current)}>
              <Settings2 aria-hidden="true" />
            </Button>
          </div>
        </PopoverHeader>

        {settings ? (
          <div className="max-h-96 overflow-y-auto px-3 py-2">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 text-sm">
              <span />
              <span className="text-xs text-muted-foreground">In Byline</span>
              <span className="text-xs text-muted-foreground">Email</span>
              {kinds.map((kind) => (
                <div key={kind} className="contents">
                  <div className="min-w-0">
                    <div className="font-medium">{NOTIFICATION_LABELS[kind].label}</div>
                    <div className="text-xs text-muted-foreground">{NOTIFICATION_LABELS[kind].description}</div>
                  </div>
                  <Checkbox checked={preferences.inApp[kind]} onCheckedChange={(value) => choose("inApp", kind, value === true)} aria-label={`${NOTIFICATION_LABELS[kind].label}: in Byline`} />
                  <Checkbox checked={preferences.email[kind]} disabled={inbox ? !inbox.emailConfigured : false} onCheckedChange={(value) => choose("email", kind, value === true)} aria-label={`${NOTIFICATION_LABELS[kind].label}: by email`} />
                </div>
              ))}
            </div>
            {inbox && !inbox.emailConfigured ? <p className="mt-3 text-xs text-muted-foreground">Email isn't set up for this newsroom yet, so notifications appear here only.</p> : null}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto" role="list" aria-label="Notifications">
            {failed && !inbox ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Notifications couldn't load. They'll retry shortly.</p> : null}
            {inbox && !inbox.items.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p> : null}
            {inbox?.items.map((item) => {
              const body = (
                <>
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.readAt ? "text-muted-foreground" : "font-medium"}`}>{item.text}</span>
                    {item.items.length ? (
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {item.items.slice(0, 5).map((entry, index) => <li key={index}>{entry.title} · {entry.when}</li>)}
                        {item.items.length > 5 ? <li>and {item.items.length - 5} more</li> : null}
                      </ul>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground"><span className="sr-only">{item.readAt ? "Read, " : "Unread, "}</span>{relativeTime(item.createdAt)}</span>
                  </span>
                </>
              );
              const className = "flex items-start gap-2 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";
              return item.href ? (
                <ShellLink key={item.id} role="listitem" href={item.href} className={className} onClick={() => { if (!item.readAt) void markRead({ ids: [item.id] }); setOpen(false); }}>{body}</ShellLink>
              ) : (
                <button key={item.id} type="button" role="listitem" className={`${className} w-full`} onClick={() => { if (!item.readAt) void markRead({ ids: [item.id] }); }}>{body}</button>
              );
            })}
            {inbox?.hasMore ? <p className="px-3 py-2 text-center text-xs text-muted-foreground">Showing your 20 most recent.</p> : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
