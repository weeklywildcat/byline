import { PRESENCE_SESSION_ID, PRESENCE_TIMING, type Heartbeat, type PresenceLocation, type PresenceSnapshot } from "../../domain/presence";

const SESSION_KEY = "byline:presence-session";
const HANDOFF_KEY = "byline:presence-handoff";
const REVISION_KEY = "byline:presence-revision";
const SESSION_HANDOFF_GRACE = 150;
const INTERACTION_THROTTLE = 1_000;
const MAX_BACKOFF = 2 * PRESENCE_TIMING.heartbeat;
const INTERACTIONS = ["keydown", "pointerdown", "touchstart", "wheel"] as const;

const randomSessionId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
function readSession() {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    const handoff = id !== null && sessionStorage.getItem(HANDOFF_KEY) === id;
    return { id, handoff };
  } catch { return { id: null, handoff: false }; }
}
function saveSession(id: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch { /* A page-scoped ID still works. */ }
}

/** sessionStorage survives reloads but browsers may copy it when duplicating a tab.
 * Where supported, an exclusive Web Lock lets the duplicate claim a new ID. */
function claimSession(start: (id: string) => void) {
  const { id: saved, handoff } = readSession();
  const initial = saved && PRESENCE_SESSION_ID.test(saved) ? saved : randomSessionId();
  let stopped = false;
  let release: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const use = (id: string) => {
    if (stopped) return;
    saveSession(id);
    start(id);
  };
  const lock = async (id: string, takeHandoff = false): Promise<void> => {
    try {
      // The previous document in this tab can be frozen before its lock is
      // released. A one-use pagehide handoff distinguishes it from a duplicate.
      const options = takeHandoff ? { steal: true } : { signal: AbortSignal.timeout(SESSION_HANDOFF_GRACE) };
      await navigator.locks.request(SESSION_KEY + ":" + id, options, async () => {
        if (stopped) return;
        use(id);
        await held;
      });
    } catch (error) {
      if (stopped) return;
      if (error instanceof DOMException && error.name === "TimeoutError") return lock(randomSessionId());
      use(id);
    }
  };
  if (navigator.locks) void lock(initial, handoff && initial === saved);
  else use(initial);
  return () => { stopped = true; release(); };
}

type LifecycleOptions = {
  endpoint: string;
  location: () => PresenceLocation;
  onSnapshot: (snapshot: PresenceSnapshot) => void;
  onError: () => void;
};

export function startPresence({ endpoint, location, onSnapshot, onError }: LifecycleOptions) {
  let sessionId: string | undefined;
  let disposed = false;
  let revision = 0;
  let request = 0;
  let failures = 0;
  let pending = false;
  let needsHeartbeat = true;
  let lastInteraction = performance.now();
  let idle = false;
  let backgrounded = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => document.visibilityState === "visible";

  function nextRevision() {
    revision++;
    try {
      const previous = Number(sessionStorage.getItem(REVISION_KEY));
      if (Number.isSafeInteger(previous) && previous >= revision && previous < Number.MAX_SAFE_INTEGER) revision = previous + 1;
      sessionStorage.setItem(REVISION_KEY, String(revision));
    } catch { /* In memory is enough when the ID is page scoped. */ }
    return revision;
  }

  function schedule() {
    clearTimeout(pollTimer);
    if (visible() && !disposed) {
      const delay = Math.min(MAX_BACKOFF, PRESENCE_TIMING.heartbeat * Math.max(1, failures));
      pollTimer = setTimeout(() => {
        const state = idle ? (needsHeartbeat ? "away" : undefined) : "active";
        void send(state);
      }, delay);
    }
  }

  async function send(state?: Heartbeat["state"], hidden = false) {
    if (!sessionId || disposed || (!hidden && !visible())) return;
    clearTimeout(pollTimer);
    const current = ++request;
    pending = true;
    let body: Heartbeat | undefined;
    if (state) {
      needsHeartbeat = true;
      body = { sessionId, revision: nextRevision(), state, location: location() };
    }
    try {
      const response = await fetch(endpoint, {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
        // A same-origin keepalive fetch can send strict JSON as the tab is hidden.
        ...(hidden ? { keepalive: true } : { signal: AbortSignal.timeout(10_000) })
      });
      if (!response.ok) throw new Error("Presence request failed");
      const snapshot = hidden ? null : await response.json() as PresenceSnapshot;
      if (disposed || current !== request) return;
      if (body) needsHeartbeat = false;
      failures = 0;
      if (snapshot) onSnapshot(snapshot);
    } catch {
      if (!disposed && current === request) {
        failures++;
        if (!hidden) onError();
      }
    } finally {
      if (!disposed && current === request) {
        pending = false;
        schedule();
      }
    }
  }

  function checkIdle() {
    clearTimeout(idleTimer);
    if (!visible()) return;
    const remaining = PRESENCE_TIMING.idle - (performance.now() - lastInteraction);
    if (remaining > 0) idleTimer = setTimeout(checkIdle, remaining);
    else if (!idle) {
      idle = true;
      void send("away");
    }
  }

  function interact(event: Event) {
    if (!event.isTrusted || !visible()) return;
    const now = performance.now();
    if (!idle && now - lastInteraction < INTERACTION_THROTTLE) return;
    lastInteraction = now;
    if (idle) {
      idle = false;
      checkIdle();
      void send("active");
    }
  }

  function visibilityChanged() {
    if (!sessionId) return;
    clearTimeout(pollTimer);
    clearTimeout(idleTimer);
    if (!visible()) {
      markHidden();
      return;
    }
    backgrounded = false;
    lastInteraction = performance.now();
    idle = false;
    checkIdle();
    void send("active");
  }

  function markHidden() {
    if (sessionId && !backgrounded) {
      backgrounded = true;
      void send("away", true);
    }
  }

  function claim() {
    return claimSession((id) => {
      sessionId = id;
      if (visible()) visibilityChanged();
    });
  }

  // Release the tab's claim during a full navigation, including when this
  // document enters the back/forward cache. A restore claims it again.
  function pageHidden() {
    markHidden();
    if (sessionId) {
      try { sessionStorage.setItem(HANDOFF_KEY, sessionId); } catch { /* Storage is optional. */ }
    }
    stopSession();
    sessionId = undefined;
    request++;
    pending = false;
    clearTimeout(pollTimer);
    clearTimeout(idleTimer);
  }

  function pageShown(event: PageTransitionEvent) {
    if (event.persisted) stopSession = claim();
  }

  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", pageHidden);
  window.addEventListener("pageshow", pageShown);
  for (const event of INTERACTIONS) window.addEventListener(event, interact, { capture: true, passive: true });
  let stopSession = claim();

  return {
    moved() {
      if (!idle) void send("active");
    },
    refresh() {
      if (!pending) void send(needsHeartbeat ? idle ? "away" : "active" : undefined);
    },
    stop() {
      disposed = true;
      stopSession();
      clearTimeout(pollTimer);
      clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", pageHidden);
      window.removeEventListener("pageshow", pageShown);
      for (const event of INTERACTIONS) window.removeEventListener(event, interact, true);
    }
  };
}
