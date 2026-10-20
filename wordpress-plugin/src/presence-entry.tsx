import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { AdminRoot } from "./admin-ui/components/admin-root";
import { PresencePanel } from "./presence/PresencePanel";
import type { PresenceLocation, PresencePayload } from "./presence/presence-model";
import "./presence/style.css";

type PresenceConfig = {
  location: PresenceLocation;
  recentSeconds: number;
  initial: PresencePayload;
};

type HeartbeatData = Record<string, unknown>;
type JQueryDocument = {
  on: (events: string, handler: (event: unknown, data: HeartbeatData) => void) => void;
  off: (events: string, handler: (event: unknown, data: HeartbeatData) => void) => void;
};
type JQueryLike = (target: Document) => JQueryDocument;

type PresenceWindow = Window & {
  bylinePresence?: PresenceConfig;
  jQuery?: JQueryLike;
};

const presenceWindow = window as PresenceWindow;
const heartbeat = () => (window as unknown as { wp?: { heartbeat?: { connectNow?: () => void } } }).wp?.heartbeat;

function isPresencePayload(value: unknown): value is PresencePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PresencePayload;
  return Number.isFinite(candidate.serverTime) && Array.isArray(candidate.people);
}

function tabSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function PresenceRuntime({ mount, config }: { mount: HTMLElement; config: PresenceConfig }) {
  const [payload, setPayload] = useState(config.initial);
  const [clock, setClock] = useState(config.initial.serverTime || Math.floor(Date.now() / 1000));
  const sessionId = useRef(tabSessionId());
  const lastInteraction = useRef(Date.now());

  useEffect(() => {
    const jquery = presenceWindow.jQuery;
    if (!jquery) return undefined;
    const documentEvents = jquery(document);
    const activity = () => { lastInteraction.current = Date.now(); };
    const state = () => document.visibilityState === "visible" && Date.now() - lastInteraction.current < 120_000 ? "active" : "away";
    const send = (_event: unknown, data: HeartbeatData) => {
      data.bylinePresence = { state: state(), sessionId: sessionId.current, location: config.location };
    };
    const tick = (_event: unknown, data: HeartbeatData) => {
      if (isPresencePayload(data.bylinePresence)) {
        setPayload(data.bylinePresence);
        setClock(data.bylinePresence.serverTime);
      }
    };
    const wake = () => {
      activity();
      heartbeat()?.connectNow?.();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") activity();
      heartbeat()?.connectNow?.();
    };

    documentEvents.on("heartbeat-send.bylinePresence", send);
    documentEvents.on("heartbeat-tick.bylinePresence", tick);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity, true);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", visibility);
    heartbeat()?.connectNow?.();

    return () => {
      documentEvents.off("heartbeat-send.bylinePresence", send);
      documentEvents.off("heartbeat-tick.bylinePresence", tick);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity, true);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [config.location]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock((value) => value + 60), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return createPortal(<PresencePanel people={payload.people} now={clock} currentLocation={config.location} recentSeconds={config.recentSeconds} />, mount);
}

const mount = document.getElementById("byline-presence-root");
const config = presenceWindow.bylinePresence;
if (mount && config) {
  const host = document.createElement("div");
  host.id = "byline-presence-app";
  document.body.appendChild(host);
  createRoot(host).render(<AdminRoot toaster={false}><PresenceRuntime mount={mount} config={config} /></AdminRoot>);
}
