import { consentStates, contentParams, createReadTracker, GTAG_SRC, readConsent, writeConsent, type AnalyticsRuntimeConfig, type ConsentChoice, type ConsentStorage } from "./analytics";

/**
 * The browser's Google tag, when Byline owns it. Exactly one `page_view` per page load (GA's automatic
 * initial pageview is switched off), nothing sent before the reader allows it in "ask" mode, and no
 * reader, account or newsroom data in any event.
 */
export type Gtag = (...args: unknown[]) => void;
export type MeasurementDeps = {
  config: AnalyticsRuntimeConfig;
  gtag: Gtag;
  storage: ConsentStorage;
  loadScript: (src: string) => void;
  page: () => { title: string; href: string };
  /** `ga-disable-<id>`: Google's documented switch that stops a loaded tag collecting. */
  setDisabled: (disabled: boolean) => void;
};

export function createMeasurement(deps: MeasurementDeps) {
  const { config } = deps;
  const content = contentParams(config.content);
  let loaded = false;
  let active = false;
  let configured = false;
  let pageviewSent = false;
  const reads = createReadTracker((event) => track(event));

  function track(name: string, params: Record<string, unknown> = {}): boolean {
    if (!active) return false;
    deps.gtag("event", name, { ...content, ...params });
    return true;
  }

  function enable() {
    if (active) return;
    active = true;
    deps.setDisabled(false);
    if (config.consentMode === "ask" || loaded) deps.gtag("consent", "update", consentStates(true));
    if (!loaded) {
      loaded = true;
      deps.loadScript(GTAG_SRC(config.measurementId));
    }
    if (!configured) {
      configured = true;
      deps.gtag("js", new Date());
      // Byline sends the one pageview itself.
      deps.gtag("config", config.measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    }
    if (!pageviewSent) {
      pageviewSent = true;
      const page = deps.page();
      deps.gtag("event", "page_view", { page_title: page.title, page_location: page.href, ...content });
    }
  }

  function disable() {
    if (!active) return;
    active = false;
    deps.setDisabled(true);
    deps.gtag("consent", "update", consentStates(false));
  }

  return {
    get active() { return active; },
    get consent(): ConsentChoice | null { return readConsent(deps.storage); },
    /** Defaults first, always; then whatever the publication and the reader's earlier choice allow. */
    start(): "collecting" | "waiting" {
      deps.gtag("consent", "default", consentStates(config.consentMode === "always"));
      if (config.consentMode === "always" || readConsent(deps.storage) === "granted") { enable(); return "collecting"; }
      return "waiting";
    },
    allow() { writeConsent(deps.storage, "granted"); enable(); },
    deny() { writeConsent(deps.storage, "denied"); disable(); },
    track,
    progress: (ratio: number) => { if (config.content) reads(ratio); },
    share: (method: string) => { if (config.content) track("share", { method, content_type: config.content.type, item_id: `story:${config.content.id}` }); },
    signUp: (method: string) => void track("sign_up", { method })
  };
}

export type Measurement = ReturnType<typeof createMeasurement>;

/* ------------------------------------------------------------------- page */

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag } & Record<string, unknown>;

/** Reads the page's JSON config and starts measurement. A page without the config script does nothing at all. */
export function startAnalytics(win: AnalyticsWindow = window as unknown as AnalyticsWindow, doc: Document = document): Measurement | null {
  const element = doc.getElementById("byline-analytics-config");
  if (!element) return null;
  let config: AnalyticsRuntimeConfig;
  try { config = JSON.parse(element.textContent ?? "") as AnalyticsRuntimeConfig; } catch { return null; }
  win.dataLayer = win.dataLayer ?? [];
  // gtag.js requires the Arguments object itself on the data layer.
  const gtag: Gtag = win.gtag ?? function gtag() { (win.dataLayer as unknown[]).push(arguments); };
  win.gtag = gtag;
  let storage: ConsentStorage = null;
  try { storage = win.localStorage; } catch { storage = null; }
  const measurement = createMeasurement({
    config, gtag, storage,
    page: () => ({ title: doc.title, href: win.location.href }),
    setDisabled: (disabled) => { win[`ga-disable-${config.measurementId}`] = disabled; },
    loadScript: (src) => {
      const script = doc.createElement("script");
      script.async = true;
      script.src = src;
      doc.head.append(script);
    }
  });
  const state = measurement.start();
  win.addEventListener("byline:read-progress", (event) => measurement.progress((event as CustomEvent<{ progress: number }>).detail?.progress ?? 0));
  win.addEventListener("byline:share", (event) => measurement.share(String((event as CustomEvent<{ method?: string }>).detail?.method ?? "link")));
  win.addEventListener("byline:signup", (event) => measurement.signUp(String((event as CustomEvent<{ method?: string }>).detail?.method ?? "newsletter")));
  // The prompt opens by itself only while the reader hasn't chosen; a "No thanks" is remembered and never asked again.
  if (config.consentMode === "ask") mountConsent(doc, measurement, state === "waiting" && measurement.consent === null);
  return measurement;
}

/**
 * The reader's choice, a small Byline-native surface. It is fixed to the corner (no layout shift), never
 * steals focus on load, comes right after the skip link in tab order, and a footer "Privacy settings"
 * control reopens it so the choice can change later.
 */
export function mountConsent(doc: Document, measurement: Measurement, openAtStart: boolean) {
  const region = doc.createElement("section");
  region.className = "analytics-consent";
  region.setAttribute("aria-label", "Audience analytics");
  region.hidden = true;
  const state = doc.createElement("p");
  state.className = "analytics-consent__state";
  region.innerHTML = `<h2 class="analytics-consent__title">Audience analytics</h2>
<p class="analytics-consent__text">We use Google Analytics to understand how readers use the site.</p>`;
  region.append(state);
  const actions = doc.createElement("div");
  actions.className = "analytics-consent__actions";
  const allow = doc.createElement("button");
  const deny = doc.createElement("button");
  for (const [button, label] of [[allow, "Allow analytics"], [deny, "No thanks"]] as const) {
    button.type = "button";
    button.textContent = label;
    button.className = "analytics-consent__button";
    actions.append(button);
  }
  region.append(actions);
  const skip = doc.querySelector(".skip-link");
  if (skip) skip.after(region); else doc.body.prepend(region);

  let opener: HTMLElement | null = null;
  const describe = () => { state.textContent = measurement.active ? "Analytics are on." : measurement.consent === "denied" ? "Analytics are off." : ""; };
  const close = (restore: boolean) => {
    region.hidden = true;
    if (restore) opener?.focus();
    opener = null;
  };
  allow.addEventListener("click", () => { measurement.allow(); close(true); });
  deny.addEventListener("click", () => { measurement.deny(); close(true); });
  region.addEventListener("keydown", (event) => { if (event.key === "Escape" && opener) close(true); });
  doc.addEventListener("click", (event) => {
    const trigger = (event.target as Element | null)?.closest?.("[data-analytics-privacy]") as HTMLElement | null;
    if (!trigger) return;
    opener = trigger;
    describe();
    region.hidden = false;
    // Opened on purpose, so focus moves to the choice and returns to the control afterwards.
    (measurement.active ? deny : allow).focus();
  });
  if (openAtStart) { describe(); region.hidden = false; }
}
