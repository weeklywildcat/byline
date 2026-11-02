/**
 * Keeps an open live-coverage page current without reloading.
 *
 * The page is complete static HTML; this only re-reads the story's static JSON
 * (`data-feed`, rebuilt on every publish) once a minute while the tab is
 * visible. New updates wait behind a "3 new updates" button so the page never
 * jumps while someone reads; clicking it inserts them, rendered by the same
 * component as the page. When coverage ends the note is shown and checking
 * stops. Framework-free and idempotent; no hydration.
 */

export type LiveFeed = {
  status: "live" | "ended";
  endedLabel: string | null;
  updatedAt: string;
  updatedLabel: string;
  updates: Array<{ id: number; html: string }>;
};

export type LiveUpdatesOptions = {
  intervalMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
};

const DEFAULT_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const started = new WeakSet<HTMLElement>();

/** "Just now", "12 min ago", "3 hr ago"; null after a day (keep the absolute label). */
export function relativeTimeLabel(iso: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : null;
}

/** Feed updates the page does not show yet, newest first. */
export function unseenUpdates(feed: LiveFeed, known: Set<number>) {
  return feed.updates.filter((update) => !known.has(update.id));
}

function isLiveFeed(value: unknown): value is LiveFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Record<string, unknown>;
  return (feed.status === "live" || feed.status === "ended") && Array.isArray(feed.updates);
}

function refreshRelativeTimes(root: HTMLElement, now: number) {
  root.querySelectorAll<HTMLTimeElement>("time[data-live-relative]").forEach((time) => {
    if (!time.dataset.liveAbsolute) time.dataset.liveAbsolute = time.textContent ?? "";
    const relative = relativeTimeLabel(time.dateTime, now);
    time.textContent = relative ?? time.dataset.liveAbsolute;
    if (relative) time.title = time.dataset.liveAbsolute;
  });
}

/** Starts watching a `[data-byline-live]` section. Returns a function that stops it. */
export function startLiveUpdates(root: HTMLElement, options: LiveUpdatesOptions = {}): () => void {
  if (started.has(root) || root.dataset.status !== "live" || !root.dataset.feed) return () => {};
  started.add(root);

  const view = root.ownerDocument.defaultView ?? window;
  const doc = root.ownerDocument;
  const fetchFeed = options.fetch ?? view.fetch.bind(view);
  const now = options.now ?? (() => Date.now());
  const baseInterval = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const list = root.querySelector<HTMLElement>(".article-live-updates");
  const pill = root.querySelector<HTMLElement>(".article-live-new");
  const button = pill?.querySelector<HTMLButtonElement>("button");
  const known = new Set([...root.querySelectorAll<HTMLElement>("[data-update-id]")].map((node) => Number(node.dataset.updateId)));
  let pending: LiveFeed["updates"] = [];
  let latest: LiveFeed | null = null;
  let timer = 0;
  let clock = 0;
  let interval = baseInterval;
  let lastPoll = now();
  let stopped = false;

  const setUpdated = (feed: LiveFeed) => {
    const updated = root.querySelector<HTMLTimeElement>("time[data-live-updated]");
    if (!updated) return;
    updated.dateTime = feed.updatedAt;
    updated.dataset.liveAbsolute = feed.updatedLabel;
    updated.textContent = feed.updatedLabel;
  };

  const insertPending = () => {
    if (!list || pending.length === 0) return;
    const template = doc.createElement("template");
    template.innerHTML = pending.map((update) => update.html).join("");
    const inserted = [...template.content.children] as HTMLElement[];
    inserted.forEach((node) => node.classList.add("article-live-update-new"));
    list.querySelector(".article-live-empty")?.remove();
    list.prepend(template.content);
    pending.forEach((update) => known.add(update.id));
    pending = [];
    if (pill) pill.hidden = true;
    if (latest) setUpdated(latest);
    refreshRelativeTimes(root, now());
    const first = inserted[0];
    if (first) {
      first.tabIndex = -1;
      const reduced = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      first.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
      first.focus?.({ preventScroll: true });
    }
  };

  const showPill = () => {
    if (!pill || !button) return;
    button.textContent = pending.length === 1 ? "1 new update" : `${pending.length} new updates`;
    pill.hidden = false;
  };

  const end = (feed: LiveFeed) => {
    root.dataset.status = "ended";
    root.classList.replace("article-live-live", "article-live-ended");
    const status = root.querySelector<HTMLElement>(".article-live-status");
    if (status) {
      status.replaceChildren();
      const note = doc.createElement("span");
      note.className = "article-live-ended";
      note.textContent = `Live coverage ended${feed.endedLabel ? ` ${feed.endedLabel}` : ""}. Every update is below.`;
      status.append(note);
    }
    doc.querySelectorAll(".article-live-badge").forEach((badge) => badge.remove());
    stop();
  };

  const poll = async () => {
    lastPoll = now();
    try {
      const response = await fetchFeed(root.dataset.feed!, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const feed: unknown = await response.json();
      if (!isLiveFeed(feed) || stopped) return;
      interval = baseInterval;
      latest = feed;
      pending = unseenUpdates(feed, known);
      if (feed.status === "ended") {
        insertPending();
        end(feed);
        return;
      }
      if (pending.length > 0) showPill();
    } catch {
      // A missed check is harmless: back off and try again later.
      interval = Math.min(interval * 2, MAX_BACKOFF_MS);
    }
    schedule();
  };

  const schedule = () => {
    view.clearTimeout(timer);
    if (!stopped && doc.visibilityState !== "hidden") timer = view.setTimeout(poll, interval);
  };

  const onVisibility = () => {
    if (doc.visibilityState === "hidden") {
      view.clearTimeout(timer);
    } else if (now() - lastPoll >= interval) {
      void poll();
    } else {
      schedule();
    }
  };

  function stop() {
    stopped = true;
    view.clearTimeout(timer);
    view.clearInterval(clock);
    doc.removeEventListener("visibilitychange", onVisibility);
    button?.removeEventListener("click", insertPending);
  }

  button?.addEventListener("click", insertPending);
  doc.addEventListener("visibilitychange", onVisibility);
  refreshRelativeTimes(root, now());
  clock = view.setInterval(() => refreshRelativeTimes(root, now()), 60_000);
  schedule();
  return stop;
}
