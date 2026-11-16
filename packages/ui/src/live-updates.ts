/**
 * A visible live page polls the newsroom's public feed (`data-source`) so an
 * update appears before the next deploy, falling back to the static
 * `data-feed` when the newsroom is unreachable. Once coverage ends, polling
 * stops and the static page is the archive.
 */
import { normalizeLiveCoverage } from "@byline/core";
import { createArticleLiveView, createLiveFeed, type LiveFeed } from "./live-feed";
export type { LiveFeed } from "./live-feed";

export type LiveUpdatesOptions = { intervalMs?: number; fetch?: typeof fetch; now?: () => number };
const DEFAULT_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const started = new WeakSet<HTMLElement>();

export function relativeTimeLabel(iso: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then) || then > now + 60_000) return null;
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : null;
}

export function unseenUpdates(feed: LiveFeed, known: Set<number>) {
  const seen = new Set(known);
  return feed.updates.filter((update) => {
    if (seen.has(update.id)) return false;
    seen.add(update.id);
    return true;
  });
}

function isEntry(value: unknown): value is LiveFeed["updates"][number] {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return Number.isSafeInteger(entry.id) && Number(entry.id) > 0 && typeof entry.html === "string";
}
function isLiveFeed(value: unknown): value is LiveFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Record<string, unknown>;
  return (feed.status === "live" || feed.status === "ended") && typeof feed.updatedAt === "string"
    && typeof feed.updatedLabel === "string" && (feed.endedLabel === null || typeof feed.endedLabel === "string")
    && (feed.keyPoints == null || isEntry(feed.keyPoints)) && Array.isArray(feed.updates) && feed.updates.every(isEntry);
}

/** The newsroom's projection, rendered exactly as the static page renders it. */
export function feedFromSource(value: unknown, options: { postId: string; locale: string; timeZone: string; feedUrl: string }): LiveFeed | null {
  const live = normalizeLiveCoverage(value);
  if (!live) return null;
  return createLiveFeed(createArticleLiveView(live, {
    postId: options.postId, locale: options.locale, timeZone: options.timeZone, feedUrl: options.feedUrl,
    // The same profile route the snapshot's live view uses.
    authorHref: (slug) => `/author/${slug}/`
  }));
}

/** A prepared file the next deploy has not brought yet, from the newsroom that names it. */
export function sourceMediaUrl(source: string, src: string, pageOrigin: string): string | null {
  let url: URL;
  try { url = new URL(src, pageOrigin); } catch { return null; }
  if (url.origin !== pageOrigin || !url.pathname.startsWith("/_byline/media/")) return null;
  return `${source}/media?path=${encodeURIComponent(url.pathname)}`;
}

function refreshRelativeTimes(root: HTMLElement, now: number) {
  root.querySelectorAll<HTMLTimeElement>("time[data-live-relative]").forEach((time) => {
    if (!time.dataset.liveAbsolute) time.dataset.liveAbsolute = time.textContent ?? "";
    const relative = relativeTimeLabel(time.dateTime, now);
    time.textContent = relative ?? time.dataset.liveAbsolute;
    time.title = time.dataset.liveAbsolute;
  });
}

/** Stops network/clock activity on completion; the final updates button remains usable. */
export function startLiveUpdates(root: HTMLElement, options: LiveUpdatesOptions = {}): () => void {
  if (started.has(root) || root.dataset.status !== "live" || !root.dataset.feed) return () => {};
  const list = root.querySelector<HTMLElement>(".article-live-updates");
  const pill = root.querySelector<HTMLElement>(".article-live-new");
  const button = pill?.querySelector<HTMLButtonElement>("button");
  if (!list || !pill || !button) return () => {};
  started.add(root);
  const view = root.ownerDocument.defaultView ?? window;
  const doc = root.ownerDocument;
  const fetchFeed = options.fetch ?? view.fetch.bind(view);
  const now = options.now ?? (() => Date.now());
  const baseInterval = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const known = new Set([...list.querySelectorAll<HTMLElement>("[data-update-id]")].map((node) => Number(node.dataset.updateId)));
  const signatures = new Map([...list.children].filter((node) => node.hasAttribute("data-update-id")).map((node) => [Number((node as HTMLElement).dataset.updateId), node.outerHTML]));
  let keyPointsHtml = root.querySelector(".article-live-key-points")?.innerHTML ?? "";
  let latest: LiveFeed | null = null;
  let timer = 0;
  let clock = 0;
  let interval = baseInterval;
  let lastPoll = now();
  let stopped = false;
  let inFlight = false;
  const controller = new AbortController();
  const source = root.dataset.source && root.dataset.locale && root.dataset.timeZone
    ? { url: root.dataset.source, locale: root.dataset.locale, timeZone: root.dataset.timeZone }
    : null;
  const pageOrigin = view.location?.origin ?? "";
  const onImageError = (event: Event) => {
    const image = event.target;
    if (!source || !(image instanceof view.HTMLImageElement) || image.dataset.liveSource) return;
    const fallback = sourceMediaUrl(source.url, image.getAttribute("src") ?? "", pageOrigin);
    if (!fallback) return;
    image.dataset.liveSource = "1";
    image.src = fallback;
  };
  const request = (url: string) => fetchFeed(url, {
    cache: "no-store", credentials: "omit", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
  }).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<unknown>;
  });
  const readFeed = async (): Promise<unknown> => {
    if (source) {
      try {
        const feed = feedFromSource(await request(source.url), { postId: root.dataset.bylineLive ?? "", locale: source.locale, timeZone: source.timeZone, feedUrl: root.dataset.feed! });
        if (feed) return feed;
      } catch (error) {
        if (controller.signal.aborted) throw error;
      }
    }
    return request(root.dataset.feed!);
  };
  const canonicalHtml = (html: string) => {
    const template = doc.createElement("template");
    template.innerHTML = html;
    return template.innerHTML;
  };

  const applyPending = () => {
    if (!latest) return;
    const firstNew = unseenUpdates(latest, known)[0]?.id;
    const template = doc.createElement("template");
    template.innerHTML = latest.updates.map((update) => update.html).join("");
    list.replaceChildren(template.content);
    if (latest.updates.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "article-live-empty";
      empty.textContent = "Updates will appear here.";
      list.append(empty);
    }
    known.clear(); signatures.clear();
    latest.updates.forEach((update) => { known.add(update.id); signatures.set(update.id, canonicalHtml(update.html)); });
    let keyPoints = root.querySelector<HTMLElement>(".article-live-key-points");
    if (latest.keyPoints) {
      if (!keyPoints) {
        keyPoints = doc.createElement("aside"); keyPoints.className = "article-live-key-points";
        keyPoints.setAttribute("aria-label", "Key points"); pill.before(keyPoints);
      }
      keyPoints.innerHTML = latest.keyPoints.html;
    } else keyPoints?.remove();
    keyPointsHtml = canonicalHtml(latest.keyPoints?.html ?? "");
    pill.hidden = true;
    if (root.dataset.status === "ended") {
      const status = root.querySelector(".article-live-status");
      if (status) status.textContent = `Live coverage ended${latest.endedLabel ? ` ${latest.endedLabel}` : ""}. Every update is below.`;
    }
    const updated = root.querySelector<HTMLTimeElement>("time[data-live-updated]");
    if (updated) {
      updated.dateTime = latest.updatedAt; updated.dataset.liveAbsolute = latest.updatedLabel;
      updated.textContent = latest.updatedLabel;
    }
    refreshRelativeTimes(root, now());
    const first = list.querySelector<HTMLElement>(firstNew ? `[data-update-id="${firstNew}"]` : "[data-update-id]")
      ?? root.querySelector<HTMLElement>(".article-live-heading");
    if (first) {
      first.tabIndex = -1;
      const reduced = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      first.scrollIntoView?.({ behavior: reduced ? "instant" : "smooth", block: "start" });
      first.focus({ preventScroll: true });
    }
  };

  const poll = async () => {
    if (stopped || inFlight || doc.visibilityState === "hidden") return;
    inFlight = true;
    lastPoll = now();
    try {
      const feed = await readFeed();
      if (stopped) return;
      if (!isLiveFeed(feed)) throw new Error("Invalid live feed");
      // A repeated ID must never become a repeated DOM anchor.
      feed.updates = feed.updates.filter((update, index, updates) => updates.findIndex((other) => other.id === update.id) === index);
      interval = baseInterval;
      latest = feed;
      const count = unseenUpdates(feed, known).length;
      const changed = feed.updates.length !== known.size || feed.updates.some((update) => signatures.get(update.id) !== canonicalHtml(update.html))
        || keyPointsHtml !== canonicalHtml(feed.keyPoints?.html ?? "");
      pill.hidden = !changed;
      button.textContent = count ? `${count} new update${count === 1 ? "" : "s"}` : "Coverage updated";
      if (feed.status === "ended") {
        root.dataset.status = "ended";
        root.classList.replace("article-live-live", "article-live-ended");
        const status = root.querySelector<HTMLElement>(".article-live-status");
        if (status) status.textContent = `Live coverage ended${feed.endedLabel ? ` ${feed.endedLabel}` : ""}.${changed ? " Show the latest updates below." : " Every update is below."}`;
        const heading = root.querySelector(".article-live-heading");
        if (heading) heading.textContent = "Updates";
        doc.querySelectorAll(".article-live-badge").forEach((badge) => badge.remove());
        stopPolling();
      }
    } catch {
      interval = Math.min(interval * 2, MAX_BACKOFF_MS);
    } finally {
      inFlight = false;
      schedule();
    }
  };
  const schedule = () => {
    view.clearTimeout(timer);
    if (!stopped && doc.visibilityState !== "hidden") timer = view.setTimeout(poll, interval);
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") view.clearTimeout(timer);
    else if (now() - lastPoll >= interval) void poll();
    else schedule();
  };
  function stopPolling() {
    stopped = true;
    view.clearTimeout(timer); view.clearInterval(clock);
    doc.removeEventListener("visibilitychange", onVisibility);
  }
  button.addEventListener("click", applyPending);
  // Image errors do not bubble, so listen while capturing.
  root.addEventListener("error", onImageError, true);
  doc.addEventListener("visibilitychange", onVisibility);
  refreshRelativeTimes(root, now());
  clock = view.setInterval(() => refreshRelativeTimes(root, now()), 60_000);
  schedule();
  return () => {
    stopPolling(); controller.abort(); started.delete(root);
    button.removeEventListener("click", applyPending); root.removeEventListener("error", onImageError, true);
  };
}
