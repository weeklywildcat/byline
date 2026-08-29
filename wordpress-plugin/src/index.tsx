import apiFetch from "@wordpress/api-fetch";
import {
  Button,
  Card,
  CardBody,
  Notice,
  SelectControl,
  Spinner,
  TextareaControl,
  TextControl,
  ToggleControl
} from "@wordpress/components";
import { Component, createRoot, lazy, Suspense, useEffect, useState } from "@wordpress/element";
// The publication stylesheet is also the stable stylesheet URL used by the
// Studio preview iframe. Keep this small shared surface in the admin entry;
// the much heavier Puck editor CSS remains lazy with Studio.
import "@byline/theme-weekly-wildcat/styles.css";
import {
  ADMIN_PAGE_SLUGS,
  INTEGRATION_TABS,
  PUBLICATION_TABS,
  SETTINGS_TABS,
  adminScreenRoute,
  legacyHashDestination,
  normalizeAdminPage,
  normalizeAdminRoute,
  normalizeAdminTab,
  normalizeStudioView
} from "./admin-routing";
import { contrastRatio } from "./contrast";
import { createNavigationItem, moveItem, navigationConflictKey, sectionSlugForName } from "./settings-model";
import { PlanningApp, createPlanningFetchers, type PlanningView } from "./planning";
import { NewsletterApp, createNewsletterFetchers } from "./newsletters";
import type { NewsletterBranding } from "./newsletters/render";
import { stripMarkupForText } from "./safe-text";
import type { ReactNode } from "react";
import { AdminNavigation, HomeApp, createHomeFetchers, storiesViewFromRoute } from "./home";
import { DoctorApp, type DoctorActionId, type DoctorActionResponse, type DoctorDiagnostics } from "./doctor";
import "./style.css";

// Studio pulls in Puck and the preview themes, so keep that sizeable editor
// out of the common admin entrypoint. The shared promise makes the edit and
// revisions views reuse one chunk if an editor navigates between them.
type StudioModule = typeof import("./studio");
let studioModulePromise: Promise<StudioModule> | null = null;
const loadStudioModule = () => studioModulePromise || (studioModulePromise = import("./studio"));
const BylineDesignRevisions = lazy(() => loadStudioModule().then(({ BylineDesignRevisions }) => ({ default: BylineDesignRevisions })));
const BylineStudio = lazy(() => loadStudioModule().then(({ BylineStudio }) => ({ default: BylineStudio })));

type BylineAdminConfig = {
  page: string;
  tab: string;
  view: string;
  restPath: string;
  publicationPath: string;
  diagnosticsPath: string;
  healthPath: string;
  deploymentPath: string;
  discordPath: string;
  nonce: string;
  pluginVersion: string;
  previewStylesheetUrl: string;
  planningPath?: string;
  tasksPath?: string;
  readinessPath?: string;
  mediaPath?: string;
  coveragePath?: string;
  feedbackPath?: string;
  distributionPath?: string;
  newsletterPath?: string;
  analyticsPath?: string;
  contentHealthPath?: string;
  currentUserId?: number;
  capabilities: {
    manage: boolean;
    editDesign: boolean;
    publishDesign: boolean;
    manageIntegrations: boolean;
    editPosts?: boolean;
    editOthersPosts?: boolean;
  };
  features: Record<string, boolean>;
  themeIds: string[];
  urls: AdminUrls;
  legacyRoutes: Record<string, string>;
  nativeUrls: Record<string, string>;
};

type ProtocolManifest = {
  protocolVersion: number;
  pluginVersion: string;
  publicationSchemaVersion: number;
  designSchemaVersion: number;
  themeApiVersion: number;
};

type PublicationConfig = {
  schemaVersion: 1;
  revision: number;
  identity: Record<"name" | "shortName" | "description" | "organizationName" | "tagline", string>;
  location: Record<"display" | "city" | "region" | "country" | "address", string>;
  locale: string;
  timezone: string;
  urls: Record<"publicSite" | "cms" | "contact", string>;
  branding: {
    masthead: PublicationAsset;
    logo: PublicationAsset;
    organizationLogo: PublicationAsset;
    icons: PublicationAsset[];
    defaultSocialImage: PublicationAsset;
  };
  appearance: { theme: string; tokenOverrides: Record<string, string> };
  sections: Array<{ name: string; slug: string; description: string; active: boolean }>;
  navigation: Array<{
    label: string;
    url: string;
    locations: Array<"header" | "footer">;
    group?: string;
    feature?: string;
  }>;
  social: Array<{ service: string; label: string; url: string }>;
  features: Record<string, boolean>;
  licensing: Record<"copyrightNotice" | "imageLicenseUrl" | "acquireLicensePage", string>;
  seo: {
    defaultTitle: string;
    defaultDescription: string;
    organizationType: "Organization" | "NewsMediaOrganization";
  };
};

type PublicationAsset = { url: string; alt: string; width: number | null; height: number | null };

type NavigationPage = { id: number; title?: { rendered?: string }; link: string };

type AdminUrls = {
  dashboard: string;
  planning: {
    today: string;
    stories: string;
    calendar: string;
    media: string;
    coverage: string;
    performance: string;
    contentHealth: string;
    feedback: string;
  };
  studio: string;
  studioRevisions: string;
  theme: string;
  publication: Record<(typeof PUBLICATION_TABS)[number], string>;
  integrations: Record<(typeof INTEGRATION_TABS)[number], string>;
  settings: Record<(typeof SETTINGS_TABS)[number], string>;
  polls: string;
  teams: string;
  newsletters: {
    issues: string;
    settings: string;
  };
};

declare global {
  interface Window {
    bylineAdmin?: BylineAdminConfig;
  }
}

const config = window.bylineAdmin;

if (config?.nonce) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
}

function adminUrl(url: string | undefined) {
  return url || config?.urls.dashboard || "admin.php?page=byline";
}

function safeRequestError(error: unknown, fallback: string): string {
  const candidate = error && typeof error === "object" && "message" in error
    ? (error as { message?: unknown }).message
    : undefined;
  if (typeof candidate !== "string") return fallback;

  const message = stripMarkupForText(candidate);
  if (!message || message === "[object Object]" || message.length > 240 || /(?:stack trace|fatal error|password|token|secret|authorization|sqlstate)/i.test(message)) {
    return fallback;
  }
  return message;
}

function useUnsavedChangesPrompt(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return undefined;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const href = target?.getAttribute("href") || "";
      if (!target || !href || href.startsWith("#") || target.getAttribute("target")) return;
      if (!window.confirm("You have unsaved Byline changes. Leave this page without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty]);
}

function LoadingState({ label = "Loading Byline…" }: { label?: string }) {
  return (
    <div className="byline-loading-state" role="status" aria-live="polite">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

function publicationDraftErrors(draft: PublicationConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  const add = (field: string, message: string) => { if (!errors[field]) errors[field] = message; };
  for (const [key, label] of [["name", "Publication name"], ["shortName", "Short name"], ["description", "Description"]] as const) {
    if (!draft.identity[key].trim()) add(`identity.${key}`, `${label} is required.`);
    if (draft.identity[key].length > (key === "description" ? 500 : key === "name" ? 120 : 80)) {
      add(`identity.${key}`, `${label} is too long.`);
    }
  }
  for (const key of ["publicSite", "cms"] as const) {
    try {
      const url = new URL(draft.urls[key]);
      if (!/^https?:$/.test(url.protocol) || !url.hostname) add(`urls.${key}`, "Use a complete http or https URL.");
    } catch {
      add(`urls.${key}`, "Use a complete http or https URL.");
    }
  }
  if (draft.urls.contact && !draft.urls.contact.startsWith("/") && !/^https?:\/\//i.test(draft.urls.contact)) {
    add("urls.contact", "Use a site path or complete http(s) URL.");
  }
  if (!(config?.themeIds || []).includes(draft.appearance.theme)) add("appearance.theme", "Choose an installed Byline theme.");
  for (const [index, item] of draft.sections.entries()) {
    if (!item.name.trim()) add(`sections.${index}.name`, "Section names cannot be empty.");
    if (item.name.length > 80) add(`sections.${index}.name`, "Section names must be 80 characters or fewer.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) add(`sections.${index}.slug`, "Use lowercase letters, numbers, and hyphens.");
  }
  const navigationKeys = new Set<string>();
  for (const [index, item] of draft.navigation.entries()) {
    if (!item.label.trim()) add(`navigation.${index}.label`, "Navigation labels cannot be empty.");
    if (item.label.length > 80) add(`navigation.${index}.label`, "Navigation labels must be 80 characters or fewer.");
    if (!item.url.trim() || (!item.url.startsWith("/") && !/^https?:\/\//i.test(item.url))) add(`navigation.${index}.url`, "Use a site path or complete http(s) URL.");
    if (!item.locations.length) add(`navigation.${index}.locations`, "Choose a header or footer placement.");
    const key = navigationConflictKey(item);
    if (navigationKeys.has(key)) add(`navigation.${index}`, "This navigation item is duplicated.");
    navigationKeys.add(key);
  }
  for (const [index, item] of draft.social.entries()) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.service.trim().toLowerCase())) add(`social.${index}.service`, "Use a simple service name such as instagram.");
    if (!item.label.trim()) add(`social.${index}.label`, "Social link labels cannot be empty.");
    if (item.label.length > 80) add(`social.${index}.label`, "Social link labels must be 80 characters or fewer.");
    try {
      const url = new URL(item.url);
      if (!/^https?:$/.test(url.protocol) || !url.hostname) add(`social.${index}.url`, "Use a complete http or https URL.");
    } catch {
      add(`social.${index}.url`, "Use a complete http or https URL.");
    }
  }
  for (const [key, value] of Object.entries(draft.appearance.tokenOverrides)) {
    if (["accent", "link", "background", "surface", "text"].includes(key) && !/^#[0-9a-f]{6}$/i.test(value)) {
      add(`appearance.tokenOverrides.${key}`, "Use a six-digit hex color such as #008b95.");
    }
  }
  return errors;
}

function fieldHelp(message: string | undefined, fallback?: string) {
  return message ? <span className="byline-field-error">{message}</span> : fallback;
}

function moveIndexedState<T>(state: Record<number, T>, index: number, direction: -1 | 1): Record<number, T> {
  const other = index + direction;
  const next = { ...state };
  const current = next[index];
  const adjacent = next[other];
  if (adjacent === undefined) delete next[index];
  else next[index] = adjacent;
  if (current === undefined) delete next[other];
  else next[other] = current;
  return next;
}

function removeIndexedState<T>(state: Record<number, T>, index: number): Record<number, T> {
  const next: Record<number, T> = {};
  Object.entries(state).forEach(([key, value]) => {
    const oldIndex = Number(key);
    if (oldIndex !== index) next[oldIndex > index ? oldIndex - 1 : oldIndex] = value;
  });
  return next;
}

type AdminTab = { id: string; label: string; href: string };

function AdminLocalTabs({ label, active, tabs }: { label: string; active: string; tabs: AdminTab[] }) {
  return (
    <nav className="nav-tab-wrapper byline-admin-tabs" aria-label={`${label} sections`}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          className={`nav-tab${active === tab.id ? " nav-tab-active" : ""}`}
          href={tab.href}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function publicationTabs(): AdminTab[] {
  const labels: Record<(typeof PUBLICATION_TABS)[number], string> = {
    identity: "Identity",
    branding: "Branding",
    navigation: "Navigation",
    features: "Features",
    social: "Social"
  };
  return PUBLICATION_TABS.map((id) => ({
    id,
    label: labels[id],
    href: adminUrl(config?.urls.publication[id])
  }));
}

function integrationTabs(): AdminTab[] {
  const tabs: AdminTab[] = [
    { id: "deployment", label: "Deployment", href: adminUrl(config?.urls.integrations.deployment) }
  ];
  if (config?.features.discord) {
    tabs.unshift({ id: "discord", label: "Discord", href: adminUrl(config?.urls.integrations.discord) });
  }
  return tabs;
}

function settingsTabs(): AdminTab[] {
  const labels: Record<(typeof SETTINGS_TABS)[number], string> = {
    access: "Access",
    api: "API",
    compatibility: "Compatibility",
    diagnostics: "Diagnostics"
  };
  return SETTINGS_TABS.map((id) => ({
    id,
    label: labels[id],
    href: adminUrl(config?.urls.settings[id])
  }));
}

function planningTabs(): AdminTab[] {
  return [
    { id: "today", label: "Today", href: adminUrl(config?.urls.planning?.today) },
    { id: "stories", label: "Stories", href: adminUrl(config?.urls.planning?.stories) },
    { id: "calendar", label: "Calendar", href: adminUrl(config?.urls.planning?.calendar) },
    { id: "media", label: "Media Desk", href: adminUrl(config?.urls.planning?.media) },
    { id: "coverage", label: "Coverage", href: adminUrl(config?.urls.planning?.coverage) },
    { id: "performance", label: "Performance", href: adminUrl(config?.urls.planning?.performance) },
    { id: "content-health", label: "Content Health", href: adminUrl(config?.urls.planning?.contentHealth) },
    { id: "feedback", label: "Feedback", href: adminUrl(config?.urls.planning?.feedback) }
  ];
}

function planningViewForTab(tab: string, requestedView = ""): PlanningView {
  if (tab === "stories") {
    const routeView = storiesViewFromRoute(requestedView);
    if (routeView) return routeView;
  }
  switch (tab) {
    case "today": return "board";
    case "calendar": return "calendar";
    case "media": return "media";
    case "coverage": return "coverage";
    case "performance": return "performance";
    case "contentHealth":
    case "content-health": return "content-health";
    case "feedback": return "feedback";
    default: return "board";
  }
}

function newsletterTabs(): AdminTab[] {
  const labels: Record<keyof AdminUrls["newsletters"], string> = {
    issues: "Issues",
    settings: "Settings"
  };

  return (Object.keys(labels) as Array<keyof AdminUrls["newsletters"]>).map((id) => ({
    id,
    label: labels[id],
    href: adminUrl(config?.urls.newsletters?.[id])
  }));
}

function adminProtectedRequest<T>({ path, method, data }: { path: string; method?: "GET" | "POST" | "DELETE"; data?: unknown }): Promise<T> {
  return apiFetch({ path, method, data }) as Promise<T>;
}

function homeActionUrls() {
  const canManage = Boolean(config?.capabilities.manage);
  const canEditPosts = Boolean(config && config.capabilities.editPosts !== false);
  return {
    dashboard: canManage ? adminUrl(config?.urls.dashboard) : undefined,
    planning: canEditPosts ? adminUrl(config?.urls.planning?.stories) : undefined,
    contentHealth: canEditPosts || canManage ? adminUrl(config?.urls.planning?.contentHealth) : undefined,
    feedback: config?.capabilities.editOthersPosts || canManage ? adminUrl(config?.urls.planning?.feedback) : undefined,
    deployment: config?.capabilities.manageIntegrations ? adminUrl(config?.urls.integrations?.deployment) : undefined,
    doctor: canManage ? adminUrl(config?.urls.settings?.diagnostics) : undefined
  };
}

function newsletterBranding(publication: PublicationConfig | null): NewsletterBranding {
  const accentColor = publication?.appearance.tokenOverrides.accent || publication?.appearance.tokenOverrides.link;
  return {
    publicationName: publication?.identity.name || publication?.identity.shortName || "Publication",
    accentColor,
    logoUrl: publication?.branding.logo.url || publication?.branding.masthead.url || null
  };
}

function MediaAssetControl({
  label,
  asset,
  onChange
}: {
  label: string;
  asset: PublicationAsset;
  onChange: (asset: PublicationAsset) => void;
}) {
  const chooseImage = () => {
    if (!window.wp?.media) return;
    const frame = window.wp.media({
      title: `Choose ${label.toLowerCase()}`,
      button: { text: "Use this image" },
      library: { type: "image" },
      multiple: false
    });
    frame.on("select", () => {
      const selected = frame.state().get("selection").first().toJSON();
      onChange({
        url: typeof selected.url === "string" ? selected.url : "",
        alt: typeof selected.alt === "string" ? selected.alt : asset.alt,
        width: typeof selected.width === "number" ? selected.width : null,
        height: typeof selected.height === "number" ? selected.height : null
      });
    });
    frame.open();
  };

  return (
    <fieldset>
      <legend>{label}</legend>
      {asset.url ? (
        <div className="byline-media-asset-preview">
          <img src={asset.url} alt="" />
          <div>
            <strong>{asset.url.split("/").pop() || label}</strong>
            {asset.width && asset.height ? <span>{asset.width}×{asset.height}</span> : <span>Preview loaded from Media Library</span>}
          </div>
        </div>
      ) : <p className="byline-empty-state">No {label.toLowerCase()} selected.</p>}
      <TextControl label="Alternative text" value={asset.alt} onChange={(alt) => onChange({ ...asset, alt })} />
      <div className="byline-settings-actions">
        <Button variant="secondary" onClick={chooseImage}>{asset.url ? "Replace" : "Choose from Media Library"}</Button>
        {asset.url ? <Button variant="link" isDestructive onClick={() => onChange({ url: "", alt: "", width: null, height: null })}>Remove</Button> : null}
      </div>
      <details className="byline-advanced-details">
        <summary>Advanced: manual image URL</summary>
        <TextControl label="Image URL" value={asset.url} onChange={(url) => onChange({ ...asset, url })} />
      </details>
    </fieldset>
  );
}

function PublicationSettings({
  route,
  publication,
  onSaved
}: {
  route: string;
  publication: PublicationConfig | null;
  onSaved: (publication: PublicationConfig) => void;
}) {
  const [draft, setDraft] = useState(publication);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [sectionSlugModes, setSectionSlugModes] = useState<Record<number, "auto" | "manual">>({});
  const [originalSectionSlugs, setOriginalSectionSlugs] = useState<Record<number, string>>({});
  const [newNavigationTarget, setNewNavigationTarget] = useState("");
  const [footerGroupEditors, setFooterGroupEditors] = useState<Record<number, boolean>>({});
  const [navigationPages, setNavigationPages] = useState<NavigationPage[]>([]);

  useEffect(() => {
    setDraft(publication);
    const modes: Record<number, "auto" | "manual"> = {};
    const originals: Record<number, string> = {};
    publication?.sections.forEach((section, index) => {
      originals[index] = section.slug;
      // Existing records are established URLs. Only newly-added rows opt into
      // name-driven slug generation automatically.
      modes[index] = section.slug ? "manual" : "auto";
    });
    setSectionSlugModes(modes);
    setOriginalSectionSlugs(originals);
    setFooterGroupEditors({});
  }, [publication]);

  useEffect(() => {
    if (route !== "/publication/navigation") return undefined;
    let cancelled = false;
    apiFetch<NavigationPage[]>({ path: "/wp/v2/pages?per_page=100&_fields=id,title,link" })
      .then((pages) => {
        if (!cancelled) setNavigationPages(Array.isArray(pages) ? pages : []);
      })
      .catch(() => {
        // The section and custom URL pickers remain useful if the current
        // account cannot list pages through the native WordPress endpoint.
        if (!cancelled) setNavigationPages([]);
      });
    return () => { cancelled = true; };
  }, [route]);

  const dirty = Boolean(draft && publication && JSON.stringify(draft) !== JSON.stringify(publication));
  useUnsavedChangesPrompt(dirty);

  useEffect(() => {
    if (dirty) {
      setMessage("");
      setSaveError("");
    }
  }, [dirty, draft]);

  if (!draft) return <LoadingState label="Loading publication settings…" />;

  const navigationSections = draft.sections.filter((section) => section.active && section.slug);
  const addNavigationItem = () => {
    const item = createNavigationItem(
      newNavigationTarget,
      navigationSections,
      navigationPages.map((page) => ({
        id: page.id,
        title: page.title?.rendered ? stripMarkupForText(page.title.rendered) || `Page ${page.id}` : `Page ${page.id}`,
        url: page.link
      }))
    );
    if (!item) return;
    setDraft({ ...draft, navigation: [...draft.navigation, item] });
    setNewNavigationTarget("");
  };
  const moveNavigation = (index: number, direction: -1 | 1) => {
    setDraft({ ...draft, navigation: moveItem(draft.navigation, index, direction) });
    setFooterGroupEditors((editors) => moveIndexedState(editors, index, direction));
  };
  const removeNavigation = (index: number) => {
    setDraft({ ...draft, navigation: draft.navigation.filter((_, itemIndex) => itemIndex !== index) });
    setFooterGroupEditors((editors) => removeIndexedState(editors, index));
  };

  const save = async () => {
    const nextValidationErrors = publicationDraftErrors(draft);
    setValidationErrors(nextValidationErrors);
    if (Object.keys(nextValidationErrors).length) {
      setSaveError("Fix the highlighted fields before saving publication settings.");
      setMessage("");
      window.setTimeout(() => {
        const firstError = document.querySelector<HTMLElement>(".byline-field-error");
        const control = firstError?.closest(".components-base-control")?.querySelector<HTMLElement>("input, textarea, select, button");
        control?.scrollIntoView({ behavior: "smooth", block: "center" });
        control?.focus();
      }, 0);
      return;
    }

    setSaving(true);
    setMessage("");
    setSaveError("");
    try {
      const saved = await apiFetch<PublicationConfig>({
        path: config?.publicationPath || "/byline/v1/publication",
        method: "PUT",
        data: draft
      });
      setDraft(saved);
      onSaved(saved);
      setValidationErrors({});
      setMessage("Publication settings saved.");
    } catch (error) {
      setSaveError(safeRequestError(error, "Could not save publication settings. Check your access and try again."));
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <div className="byline-settings-actions">
      <Button variant="primary" isBusy={saving} disabled={saving || !config?.capabilities.manage || !dirty} onClick={save}>
        Save publication
      </Button>
      <span aria-live="polite">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}</span>
      {!dirty && !saving ? (
        <details className="byline-advanced-details byline-settings-details">
          <summary>Advanced details</summary>
          <span>Configuration revision {draft.revision} · compatibility schema {draft.schemaVersion}</span>
        </details>
      ) : null}
    </div>
  );

  let fields;

  if (route === "/design/theme") {
    const colorTokens = [
      ["accent", "Accent"],
      ["link", "Links"],
      ["background", "Page background"],
      ["surface", "Surface"],
      ["text", "Text"]
    ] as const;
    const themeDefaults: Record<string, { background: string; text: string; accent: string }> = {
      "byline-editorial": { background: "#f8f5ef", text: "#191714", accent: "#9a2725" },
      "byline-magazine": { background: "#f4f1ec", text: "#171717", accent: "#d94b32" },
      "byline-modern": { background: "#f7f9fa", text: "#14212b", accent: "#008b95" },
      "weekly-wildcat": { background: "#fbfaf7", text: "#151515", accent: "#b11f24" }
    };
    const defaults = themeDefaults[draft.appearance.theme] || themeDefaults["byline-modern"];
    const background = draft.appearance.tokenOverrides.background || defaults.background;
    const textColor = draft.appearance.tokenOverrides.text || defaults.text;
    const accent = draft.appearance.tokenOverrides.accent || defaults.accent;
    const textContrast = contrastRatio(textColor, background);
    const accentContrast = contrastRatio(accent, background);
    const fontPairings: Record<string, Record<string, string>> = {
      editorial: {
        fontDisplay: "Georgia, 'Times New Roman', serif",
        fontHeadline: "Georgia, 'Times New Roman', serif",
        fontBody: "Georgia, 'Times New Roman', serif",
        fontUI: "Arial, Helvetica, sans-serif",
        fontEditorial: "Georgia, 'Times New Roman', serif"
      },
      modern: {
        fontDisplay: "Arial, Helvetica, sans-serif",
        fontHeadline: "Arial, Helvetica, sans-serif",
        fontBody: "Arial, Helvetica, sans-serif",
        fontUI: "Arial, Helvetica, sans-serif",
        fontEditorial: "Georgia, 'Times New Roman', serif"
      },
      contrast: {
        fontDisplay: "Arial Black, Arial, Helvetica, sans-serif",
        fontHeadline: "Arial, Helvetica, sans-serif",
        fontBody: "Georgia, 'Times New Roman', serif",
        fontUI: "Arial, Helvetica, sans-serif",
        fontEditorial: "Georgia, 'Times New Roman', serif"
      }
    };
    const fontPairing = (Object.entries(fontPairings).find(([, tokens]) =>
      Object.entries(tokens).every(([key, value]) => draft.appearance.tokenOverrides[key] === value)
    )?.[0] || "theme") as "theme" | "editorial" | "modern" | "contrast";
    fields = (
      <>
        <Notice status="info" isDismissible={false}>
          Theme changes keep existing layouts and take effect on the next static build. All current first-party themes support the core Byline blocks.
        </Notice>
        {textContrast !== null && textContrast < 4.5 ? (
          <Notice status="warning" isDismissible={false}>Body text contrast is {textContrast.toFixed(2)}:1. Aim for at least 4.5:1.</Notice>
        ) : null}
        {accentContrast !== null && accentContrast < 3 ? (
          <Notice status="warning" isDismissible={false}>Accent contrast is {accentContrast.toFixed(2)}:1. Some links and controls may be difficult to see.</Notice>
        ) : null}
        <SelectControl
          label="Theme"
          help={fieldHelp(validationErrors["appearance.theme"])}
          value={draft.appearance.theme as "byline-editorial" | "byline-magazine" | "byline-modern" | "weekly-wildcat"}
          options={(config?.themeIds || Object.keys(themeDefaults)).map((theme) => ({
            label: theme.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ").replace(/^Byline /, ""),
            value: theme
          }))}
          onChange={(theme) => setDraft({ ...draft, appearance: { ...draft.appearance, theme } })}
        />
        <div className="byline-settings-grid">
          <SelectControl
            label="Font pairing"
            value={fontPairing}
            options={[
              { label: "Theme default", value: "theme" },
              { label: "Editorial serif", value: "editorial" },
              { label: "Modern sans", value: "modern" },
              { label: "Display and serif contrast", value: "contrast" }
            ]}
            onChange={(pairing) => {
              const tokenOverrides = { ...draft.appearance.tokenOverrides };
              for (const key of ["fontDisplay", "fontHeadline", "fontBody", "fontUI", "fontEditorial"]) delete tokenOverrides[key];
              if (pairing !== "theme") Object.assign(tokenOverrides, fontPairings[pairing]);
              setDraft({ ...draft, appearance: { ...draft.appearance, tokenOverrides } });
            }}
          />
          <SelectControl
            label="Layout density"
            value={(draft.appearance.tokenOverrides.density || "theme") as "theme" | "compact" | "comfortable" | "spacious"}
            options={[
              { label: "Theme default", value: "theme" },
              { label: "Compact", value: "compact" },
              { label: "Comfortable", value: "comfortable" },
              { label: "Spacious", value: "spacious" }
            ]}
            onChange={(density) => {
              const tokenOverrides = { ...draft.appearance.tokenOverrides };
              if (density === "theme") delete tokenOverrides.density;
              else tokenOverrides.density = density;
              setDraft({ ...draft, appearance: { ...draft.appearance, tokenOverrides } });
            }}
          />
        </div>
        <h3>Appearance colors</h3>
        <p>Choose a color or enter an exact six-digit hex value. Leave a field empty to use the theme default.</p>
        <div className="byline-settings-grid">
          {colorTokens.map(([key, label]) => {
            const value = draft.appearance.tokenOverrides[key] || "";
            const fallback = key === "accent" ? defaults.accent : key === "text" ? defaults.text : defaults.background;
            const pickerValue = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
            const updateColor = (nextValue: string) => {
              const tokenOverrides = { ...draft.appearance.tokenOverrides };
              if (nextValue) tokenOverrides[key] = nextValue;
              else delete tokenOverrides[key];
              setDraft({ ...draft, appearance: { ...draft.appearance, tokenOverrides } });
            };
            return (
              <div className="byline-color-control" key={key}>
                <label>
                  <span>{label}</span>
                  <input
                    type="color"
                    aria-label={`${label} color picker`}
                    value={pickerValue}
                    onChange={(event) => updateColor(event.target.value)}
                  />
                </label>
                <TextControl
                  label={`${label} hex`}
                  help={fieldHelp(validationErrors[`appearance.tokenOverrides.${key}`])}
                  value={value}
                  placeholder="#000000"
                  onChange={updateColor}
                />
                {value ? <Button variant="link" onClick={() => updateColor("")}>Use theme default</Button> : null}
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (route === "/publication/identity") {
    const identityFields: Array<[keyof PublicationConfig["identity"], string]> = [
      ["name", "Publication name"],
      ["shortName", "Short name"],
      ["organizationName", "Organization or school"],
      ["tagline", "Tagline"]
    ];
    const locationFields: Array<[keyof PublicationConfig["location"], string]> = [
      ["display", "Display location"],
      ["city", "City"],
      ["region", "Region or state"],
      ["country", "Country code"],
      ["address", "Postal address"]
    ];

    fields = (
      <>
        <div className="byline-settings-grid">
          {identityFields.map(([key, label]) => (
            <TextControl
              key={key}
              label={label}
              help={fieldHelp(validationErrors[`identity.${key}`])}
              value={draft.identity[key]}
              onChange={(value) => setDraft({ ...draft, identity: { ...draft.identity, [key]: value } })}
            />
          ))}
        </div>
        <TextareaControl
          label="Description"
          help={fieldHelp(validationErrors["identity.description"])}
          value={draft.identity.description}
          onChange={(value) => setDraft({ ...draft, identity: { ...draft.identity, description: value } })}
        />
        <h3>Location and language</h3>
        <div className="byline-settings-grid">
          {locationFields.map(([key, label]) => (
            <TextControl
              key={key}
              label={label}
              value={draft.location[key]}
              onChange={(value) => setDraft({ ...draft, location: { ...draft.location, [key]: value } })}
            />
          ))}
          <TextControl label="Locale" value={draft.locale} onChange={(locale) => setDraft({ ...draft, locale })} />
          <TextControl label="Timezone" value={draft.timezone} onChange={(timezone) => setDraft({ ...draft, timezone })} />
        </div>
        <h3>Public URLs</h3>
        <div className="byline-settings-grid">
          {(["publicSite", "cms", "contact"] as const).map((key) => (
            <TextControl
              key={key}
              label={{ publicSite: "Public site", cms: "WordPress CMS", contact: "Contact page" }[key]}
              help={fieldHelp(validationErrors[`urls.${key}`], key === "contact" ? "Use a site path or complete http(s) URL." : "Use a complete http(s) URL.")}
              value={draft.urls[key]}
              onChange={(value) => setDraft({ ...draft, urls: { ...draft.urls, [key]: value } })}
            />
          ))}
        </div>
        <h3>Copyright and licensing</h3>
        <div className="byline-settings-grid">
          {(["copyrightNotice", "imageLicenseUrl", "acquireLicensePage"] as const).map((key) => (
            <TextControl
              key={key}
              label={{ copyrightNotice: "Copyright notice", imageLicenseUrl: "Image license URL", acquireLicensePage: "License request page" }[key]}
              value={draft.licensing[key]}
              onChange={(value) => setDraft({ ...draft, licensing: { ...draft.licensing, [key]: value } })}
            />
          ))}
        </div>
        <h3>Search and sharing defaults</h3>
        <div className="byline-settings-grid">
          <TextControl label="Default page title" value={draft.seo.defaultTitle} onChange={(defaultTitle) => setDraft({ ...draft, seo: { ...draft.seo, defaultTitle } })} />
          <SelectControl
            label="Organization schema type"
            value={draft.seo.organizationType}
            options={[
              { label: "News media organization", value: "NewsMediaOrganization" },
              { label: "Organization", value: "Organization" }
            ]}
            onChange={(organizationType) => setDraft({
              ...draft,
              seo: { ...draft.seo, organizationType: organizationType as PublicationConfig["seo"]["organizationType"] }
            })}
          />
        </div>
        <TextareaControl label="Default search description" value={draft.seo.defaultDescription} onChange={(defaultDescription) => setDraft({ ...draft, seo: { ...draft.seo, defaultDescription } })} />
      </>
    );
  } else if (route === "/publication/branding") {
    const assets: Array<[keyof Omit<PublicationConfig["branding"], "icons">, string]> = [
      ["masthead", "Masthead"],
      ["logo", "Logo"],
      ["organizationLogo", "Organization logo"],
      ["defaultSocialImage", "Default social image"]
    ];
    fields = (
      <div className="byline-repeat-list">
        {assets.map(([key, label]) => {
          const asset = draft.branding[key];
          return (
            <MediaAssetControl key={key} label={label} asset={asset} onChange={(nextAsset) => setDraft({
              ...draft,
              branding: { ...draft.branding, [key]: nextAsset }
            })} />
          );
        })}
        <h3>Favicon and app icons</h3>
        {draft.branding.icons.map((icon, index) => (
          <MediaAssetControl key={`${index}-${icon.url}`} label={`Icon ${index + 1}`} asset={icon} onChange={(nextIcon) => {
            const icons = [...draft.branding.icons];
            icons[index] = nextIcon;
            setDraft({ ...draft, branding: { ...draft.branding, icons } });
          }} />
        ))}
        <Button variant="secondary" onClick={() => setDraft({
          ...draft,
          branding: { ...draft.branding, icons: [...draft.branding.icons, { url: "", alt: "", width: null, height: null }] }
        })}>Add icon</Button>
      </div>
    );
  } else if (route === "/publication/navigation") {
    fields = (
      <>
        <h3>Sections</h3>
        <p>Sections define the publication's editorial taxonomy. Navigation controls where readers see links to them.</p>
        <div className="byline-repeat-list">
          {draft.sections.map((section, index) => (
            <fieldset key={`${index}-${section.slug}`}>
              <legend>Section {index + 1}</legend>
              <div className="byline-settings-grid">
                <TextControl label="Name" value={section.name} onChange={(name) => {
                  const sections = [...draft.sections];
                  sections[index] = {
                    ...section,
                    name,
                    slug: sectionSlugForName(name, section.slug, sectionSlugModes[index] ?? "manual")
                  };
                  setDraft({ ...draft, sections });
                }} help={fieldHelp(validationErrors[`sections.${index}.name`])} />
                <TextControl label="Slug" help={fieldHelp(
                  validationErrors[`sections.${index}.slug`],
                  originalSectionSlugs[index] && section.slug !== originalSectionSlugs[index]
                    ? "Changing this slug may affect existing links."
                    : undefined
                )} value={section.slug} onChange={(slug) => {
                  const sections = [...draft.sections];
                  sections[index] = { ...section, slug };
                  setDraft({ ...draft, sections });
                  setSectionSlugModes((modes) => ({ ...modes, [index]: "manual" }));
                }} />
              </div>
              <TextareaControl label="Description" value={section.description} onChange={(description) => {
                const sections = [...draft.sections];
                sections[index] = { ...section, description };
                setDraft({ ...draft, sections });
              }} />
              <ToggleControl label="Active" checked={section.active} onChange={(active) => {
                const sections = [...draft.sections];
                sections[index] = { ...section, active };
                setDraft({ ...draft, sections });
              }} />
              <Button variant="link" isDestructive onClick={() => {
                setDraft({ ...draft, sections: draft.sections.filter((_, sectionIndex) => sectionIndex !== index) });
                setSectionSlugModes((modes) => removeIndexedState(modes, index));
                setOriginalSectionSlugs((originals) => removeIndexedState(originals, index));
              }}>Remove section</Button>
            </fieldset>
          ))}
        </div>
        <Button variant="secondary" onClick={() => {
          const index = draft.sections.length;
          setDraft({ ...draft, sections: [...draft.sections, { name: "", slug: "", description: "", active: true }] });
          setSectionSlugModes((modes) => ({ ...modes, [index]: "auto" }));
        }}>Add section</Button>
        <h3>Navigation</h3>
        <p>Use the arrows to reorder items. Section links are generated from your active sections; custom URLs remain supported.</p>
        <ol className="byline-repeat-list byline-navigation-list">
          {draft.navigation.map((item, index) => (
            <li className="byline-navigation-row" key={`${index}-${item.label}`}>
              <div className="byline-navigation-row-header">
                <strong>{item.label || `Navigation item ${index + 1}`}</strong>
                <div className="byline-navigation-order" aria-label={`Reorder ${item.label || `navigation item ${index + 1}`}`}>
                  <Button
                    icon="arrow-up-alt2"
                    label="Move up"
                    showTooltip
                    variant="tertiary"
                    disabled={index === 0}
                    onClick={() => moveNavigation(index, -1)}
                  />
                  <Button
                    icon="arrow-down-alt2"
                    label="Move down"
                    showTooltip
                    variant="tertiary"
                    disabled={index === draft.navigation.length - 1}
                    onClick={() => moveNavigation(index, 1)}
                  />
                </div>
              </div>
              <div className="byline-settings-grid">
                <TextControl label="Label" help={fieldHelp(validationErrors[`navigation.${index}.label`])} value={item.label} onChange={(label) => {
                  const navigation = [...draft.navigation];
                  navigation[index] = { ...item, label };
                  setDraft({ ...draft, navigation });
                }} />
                <TextControl label="URL" help={fieldHelp(validationErrors[`navigation.${index}.url`])} value={item.url} onChange={(url) => {
                  const navigation = [...draft.navigation];
                  navigation[index] = { ...item, url };
                  setDraft({ ...draft, navigation });
                }} />
                <SelectControl
                  label="Placement"
                  help={fieldHelp(validationErrors[`navigation.${index}.locations`])}
                  value={item.locations.length === 2 ? "both" : item.locations[0] || "header"}
                  options={[
                    { label: "Header", value: "header" },
                    { label: "Footer", value: "footer" },
                    { label: "Header and footer", value: "both" }
                  ]}
                  onChange={(placement) => {
                    const navigation = [...draft.navigation];
                    navigation[index] = {
                      ...item,
                      locations: placement === "both" ? ["header", "footer"] : [placement as "header" | "footer"]
                    };
                    setDraft({ ...draft, navigation });
                  }}
                />
                {item.locations.includes("footer") ? (
                  <>
                    <SelectControl
                      label="Footer group"
                      value={footerGroupEditors[index] ? "__new__" : item.group || ""}
                      options={[
                        { label: "No group", value: "" },
                        ...Array.from(new Set(draft.navigation.map((candidate) => candidate.group).filter(Boolean))).map((group) => ({ label: String(group), value: String(group) })),
                        { label: "Create a new group…", value: "__new__" }
                      ]}
                      onChange={(group) => {
                        if (group === "__new__") {
                          setFooterGroupEditors((editors) => ({ ...editors, [index]: true }));
                          return;
                        }
                        const navigation = [...draft.navigation];
                        navigation[index] = { ...item, group };
                        setDraft({ ...draft, navigation });
                        setFooterGroupEditors((editors) => ({ ...editors, [index]: false }));
                      }}
                    />
                    {footerGroupEditors[index] ? (
                      <TextControl
                        label="New footer group"
                        value={item.group || ""}
                        onChange={(group) => {
                          const navigation = [...draft.navigation];
                          navigation[index] = { ...item, group };
                          setDraft({ ...draft, navigation });
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
              <Button variant="link" isDestructive onClick={() => removeNavigation(index)}>Remove item</Button>
            </li>
          ))}
        </ol>
        <div className="byline-navigation-add">
          <SelectControl
            label="Add a navigation item"
            value={newNavigationTarget}
            options={[
              { label: "Choose a section, page, or custom URL", value: "" },
              ...navigationSections.map((section) => ({ label: `Section: ${section.name}`, value: `section:${section.slug}` })),
              ...navigationPages.map((page) => ({
                label: `Page: ${page.title?.rendered ? stripMarkupForText(page.title.rendered) || `Page ${page.id}` : `Page ${page.id}`}`,
                value: `page:${page.id}`
              })),
              { label: "Custom URL", value: "__custom__" }
            ]}
            onChange={setNewNavigationTarget}
          />
          <Button variant="secondary" disabled={!newNavigationTarget} onClick={addNavigationItem}>Add item</Button>
        </div>
      </>
    );
  } else if (route === "/publication/features") {
    const featureDescriptions: Record<string, string> = {
      sports: "Show sports schedules, scores, rosters, and sports navigation.",
      polls: "Enable newsroom polls and their public voting surfaces.",
      events: "Show the publication events calendar and event blocks.",
      newsletter: "Enable newsletter signup blocks and navigation links."
    };
    const featureEntries = Object.entries(draft.features).filter(([feature]) => featureDescriptions[feature]);
    fields = (
      <>
        <p>Features control which optional newsroom modules are active. Turning one off hides its public surfaces but keeps its existing content safe in WordPress.</p>
        <div className="byline-toggle-grid">
          {featureEntries.map(([feature, enabled]) => (
            <div className="byline-feature-setting" key={feature}>
              <ToggleControl
                label={feature.charAt(0).toUpperCase() + feature.slice(1)}
                checked={enabled}
                onChange={(checked) => {
                  if (!checked && !window.confirm(`${feature.charAt(0).toUpperCase() + feature.slice(1)} content will be hidden, not deleted. Continue?`)) return;
                  setDraft({ ...draft, features: { ...draft.features, [feature]: checked } });
                }}
              />
              <p className="byline-field-note">{featureDescriptions[feature]}</p>
            </div>
          ))}
        </div>
      </>
    );
  } else {
    fields = (
      <>
        <div className="byline-repeat-list">
          {draft.social.map((item, index) => (
            <fieldset key={`${index}-${item.service}`}>
              <legend>Social link {index + 1}</legend>
              <div className="byline-settings-grid">
                {(["service", "label", "url"] as const).map((key) => (
                  <TextControl key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} help={fieldHelp(validationErrors[`social.${index}.${key}`] || (validationErrors[`social.${index}`] && key === "service" ? validationErrors[`social.${index}`] : undefined))} value={item[key]} onChange={(value) => {
                    const social = [...draft.social];
                    social[index] = { ...item, [key]: value };
                    setDraft({ ...draft, social });
                  }} />
                ))}
              </div>
              <Button variant="link" isDestructive onClick={() => setDraft({
                ...draft,
                social: draft.social.filter((_, itemIndex) => itemIndex !== index)
              })}>Remove link</Button>
            </fieldset>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setDraft({
          ...draft,
          social: [...draft.social, { service: "", label: "", url: "https://" }]
        })}>Add social link</Button>
      </>
    );
  }

  return (
    <Card>
      <CardBody className="byline-settings-card">
        {saveError ? <Notice status="error" isDismissible={false}>{saveError}</Notice> : null}
        {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}
        {fields}
        {actions}
      </CardBody>
    </Card>
  );
}

type DeploymentStatus = {
  provider: string;
  providerLabel: string;
  configured: boolean;
  method: "POST";
  lastTriggeredAt: string;
  lastStatus: string;
  pending: boolean;
};

function DeploymentSettings() {
  const path = config?.deploymentPath || "/byline/v1/admin/deployment";
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [clearHook, setClearHook] = useState(false);
  const [operation, setOperation] = useState<"idle" | "saving" | "deploying">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = hookUrl.trim() !== "" || clearHook;

  useUnsavedChangesPrompt(dirty);

  const refresh = () => apiFetch<DeploymentStatus>({ path }).then(setStatus);
  useEffect(() => {
    refresh().catch((requestError) => setError(safeRequestError(requestError, "Byline could not load deployment settings. Try again or contact support.")));
  }, []);

  const save = async () => {
    if (hookUrl.trim() !== "") {
      try {
        const url = new URL(hookUrl);
        if (url.protocol !== "https:" || !url.hostname) throw new Error("invalid");
      } catch {
        setError("Enter a complete HTTPS deploy-hook URL.");
        return;
      }
    }

    setOperation("saving");
    setError("");
    setMessage("");
    try {
      const next = await apiFetch<DeploymentStatus>({
        path,
        method: "PUT",
        data: { provider: "generic-hook", hookUrl, clearHook }
      });
      setStatus(next);
      setHookUrl("");
      setClearHook(false);
      setMessage("Deployment settings saved. The private hook URL was not returned to the browser.");
    } catch (requestError) {
      setError(safeRequestError(requestError, "Byline could not save the deploy hook. Enter a valid HTTPS URL and try again."));
    } finally {
      setOperation("idle");
    }
  };

  const trigger = async () => {
    setOperation("deploying");
    setError("");
    setMessage("");
    try {
      const next = await apiFetch<DeploymentStatus>({ path: `${path}/trigger`, method: "POST" });
      setStatus(next);
      setMessage(next.lastStatus.startsWith("HTTP 2") ? "Deployment hook accepted the request." : `Deployment completed with status: ${next.lastStatus}.`);
    } catch (requestError) {
      setError(safeRequestError(requestError, "The deploy-hook request failed. The saved URL remains private and unchanged."));
    } finally {
      setOperation("idle");
    }
  };

  if (!status && !error) return <LoadingState label="Loading deployment settings…" />;

  return (
    <Card>
      <CardBody className="byline-settings-card">
        {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
        {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}
        <p>Byline sends an HTTPS POST after content or design changes. It works with Cloudflare, Netlify, Vercel, GitHub Actions, and any compatible build hook.</p>
        {status ? (
          <dl className="byline-diagnostics-list">
            <div><dt>Provider</dt><dd>{status.providerLabel}</dd></div>
            <div><dt>Hook</dt><dd>{status.configured ? "Configured (hidden)" : "Not configured"}</dd></div>
            <div><dt>Last trigger</dt><dd>{status.lastTriggeredAt}</dd></div>
            <div><dt>Last status</dt><dd>{status.lastStatus}</dd></div>
            <div><dt>Pending</dt><dd>{status.pending ? "Yes — changes are coalesced" : "No"}</dd></div>
          </dl>
        ) : null}
        <TextControl
          type="password"
          autoComplete="new-password"
          label={status?.configured ? "Replace private deploy-hook URL" : "Private deploy-hook URL"}
          help={status?.configured ? "Leave blank to retain the saved URL." : "HTTPS is required. The URL is stored only in WordPress."}
          value={hookUrl}
          onChange={setHookUrl}
        />
        {status?.configured ? <ToggleControl label="Remove the saved hook" checked={clearHook} onChange={setClearHook} /> : null}
        <div className="byline-settings-actions">
          <Button variant="primary" isBusy={operation === "saving"} disabled={operation !== "idle" || !config?.capabilities.manageIntegrations || !dirty} onClick={save}>Save deployment</Button>
          <Button variant="secondary" isBusy={operation === "deploying"} disabled={operation !== "idle" || !status?.configured || !config?.capabilities.manageIntegrations} onClick={trigger}>Trigger now</Button>
          <span aria-live="polite">{operation === "saving" ? "Saving…" : operation === "deploying" ? "Triggering deployment…" : dirty ? "Unsaved changes" : "Saved ✓"}</span>
        </div>
      </CardBody>
    </Card>
  );
}

type DiscordChoice = { id: string; name: string };

type DiscordPayload = {
  settings: {
    values: {
      clientId: string;
      guildId: string;
      storyboardChannelId: string;
      announcementsChannelId: string;
      staffRoleId: string;
      botUrl: string;
      announcePublished: boolean;
      reconcileMinutes: number;
    };
    sources: Record<string, "wordpress" | "environment" | "unset">;
    secrets: { botToken: boolean; clientSecret: boolean };
    bridgeSecretConfigured: boolean;
    reconcileChoices: number[];
  };
  status: {
    botConnected: boolean;
    discordConnected: boolean;
    guildFound: boolean;
    storyboardFound: boolean;
    announcementsFound: boolean;
    lastSyncAt: string;
    source: "bot" | "wordpress";
    message: string;
  };
  directory: {
    available: boolean;
    error: string;
    guilds: DiscordChoice[];
    forums: DiscordChoice[];
    textChannels: DiscordChoice[];
    roles: DiscordChoice[];
  };
  sync?: { ok: boolean; error: string };
};

type DiscordDraft = DiscordPayload["settings"]["values"];

const DISCORD_STATUS_ROWS: Array<{ key: keyof DiscordPayload["status"]; label: string }> = [
  { key: "botConnected", label: "Bot connected" },
  { key: "discordConnected", label: "Discord connected" },
  { key: "guildFound", label: "Server found" },
  { key: "storyboardFound", label: "Storyboard found" },
  { key: "announcementsFound", label: "Announcements found" }
];

function environmentHelp(source: string | undefined) {
  return source === "environment" ? "Currently set by the environment. Saving a value here overrides it." : undefined;
}

/**
 * Discord pickers fall back to a plain ID field whenever the bot token cannot
 * list the server, so a newsroom can still finish setup by hand.
 */
function DiscordChoiceField({
  label,
  help,
  emptyLabel,
  choices,
  available,
  value,
  onChange
}: {
  label: string;
  help?: string;
  emptyLabel: string;
  choices: DiscordChoice[];
  available: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  if (!available || !choices.length) {
    return <TextControl label={label} help={help || "Paste a Discord ID until Byline can list this server."} value={value} onChange={onChange} />;
  }
  const known = choices.some((choice) => choice.id === value);
  const options = [
    { label: emptyLabel, value: "" },
    ...choices.map((choice) => ({ label: choice.name || choice.id, value: choice.id })),
    ...(value && !known ? [{ label: `${value} (not visible to the bot)`, value }] : [])
  ];
  return <SelectControl label={label} help={help} value={value} options={options} onChange={onChange} />;
}

function DiscordSettings() {
  const path = config?.discordPath || "/byline/v1/admin/discord";
  const [payload, setPayload] = useState<DiscordPayload | null>(null);
  const [draft, setDraft] = useState<DiscordDraft | null>(null);
  const [botToken, setBotToken] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [clearBotToken, setClearBotToken] = useState(false);
  const [clearClientSecret, setClearClientSecret] = useState(false);
  const [operation, setOperation] = useState<"idle" | "saving" | "testing" | "syncing">("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = Boolean(config?.capabilities.manageIntegrations);

  const applyServerPayload = (next: DiscordPayload) => {
    setPayload(next);
  };

  const applySavedPayload = (next: DiscordPayload) => {
    setPayload(next);
    setDraft(next.settings.values);
    setBotToken("");
    setClientSecret("");
    setClearBotToken(false);
    setClearClientSecret(false);
  };

  useEffect(() => {
    apiFetch<DiscordPayload>({ path })
      .then(applySavedPayload)
      .catch(() => setError("Byline could not load the Discord settings."));
  }, []);

  const update = (patch: Partial<DiscordDraft>) => {
    setMessage("");
    setError("");
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };
  const updateSecret = (setter: (value: string) => void, value: string) => {
    setMessage("");
    setError("");
    setter(value);
  };

  const run = async (
    label: string,
    nextOperation: "saving" | "testing" | "syncing",
    request: () => Promise<DiscordPayload>,
    success: (next: DiscordPayload) => string,
    applyDraft = false
  ) => {
    setOperation(nextOperation);
    setError("");
    setMessage("");
    try {
      const next = await request();
      if (applyDraft) applySavedPayload(next);
      else applyServerPayload(next);
      setMessage(success(next));
    } catch (requestError) {
      setError(safeRequestError(requestError, `Byline could not ${label}.`));
    } finally {
      setOperation("idle");
    }
  };

  const save = () =>
    run(
      "save the Discord settings",
      "saving",
      () =>
        apiFetch<DiscordPayload>({
          path,
          method: "PUT",
          data: { ...draft, botToken, clientSecret, clearBotToken, clearClientSecret }
        }),
      () => "Discord settings saved. Secrets are stored in WordPress and are never returned to the browser.",
      true
    );

  const test = () =>
    run(
      "reach Discord",
      "testing",
      () => apiFetch<DiscordPayload>({ path: `${path}/test`, method: "POST" }),
      (next) => (next.status.discordConnected ? "Discord answered. The status below is current." : `Discord could not be reached: ${next.status.message}`)
    );

  const syncNow = () =>
    run(
      "ask the bot to reconcile",
      "syncing",
      () => apiFetch<DiscordPayload>({ path: `${path}/sync`, method: "POST" }),
      (next) => (next.sync?.ok ? "The bot reconciled every active story." : `The bot did not run: ${next.sync?.error || "no response"}`)
    );

  const dirty = Boolean(payload && draft && (
    JSON.stringify(draft) !== JSON.stringify(payload.settings.values)
      || botToken
      || clientSecret
      || clearBotToken
      || clearClientSecret
  ));
  useUnsavedChangesPrompt(dirty);

  if (!payload || !draft) return error ? <Notice status="error" isDismissible={false}>{error}</Notice> : <Spinner />;

  const { settings, status, directory } = payload;
  const sources = settings.sources;

  return (
    <Card>
      <CardBody className="byline-settings-card">
        {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
        {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}

        <div>
          <h3>Status</h3>
          <dl className="byline-diagnostics-list">
            {DISCORD_STATUS_ROWS.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd className={status[row.key] ? "byline-status-ok" : "byline-status-off"}>
                  <span aria-hidden="true">{status[row.key] ? "●" : "○"}</span> {status[row.key] ? "Yes" : "No"}
                </dd>
              </div>
            ))}
            <div><dt>Last sync</dt><dd>{status.lastSyncAt}</dd></div>
            <div><dt>Reported by</dt><dd>{status.source === "bot" ? "The running bot" : "WordPress"}</dd></div>
          </dl>
          <p className="byline-field-note">{status.message}</p>
          {!settings.bridgeSecretConfigured ? (
            <Notice status="warning" isDismissible={false}>
              No bridge secret is set. Define BYLINE_DISCORD_BRIDGE_SECRET for both WordPress and the bot before they can talk to each other.
            </Notice>
          ) : null}
          <div className="byline-settings-actions">
            <Button variant="secondary" isBusy={operation === "testing"} disabled={operation !== "idle" || !editable} onClick={test}>Test connection</Button>
            <Button variant="secondary" isBusy={operation === "syncing"} disabled={operation !== "idle" || !editable || !draft.botUrl} onClick={syncNow}>Sync now</Button>
            <span aria-live="polite">
              {operation === "testing" ? "Testing connection…" : operation === "syncing" ? "Syncing stories…" : ""}
            </span>
          </div>
        </div>

        <div>
          <h3>Discord application</h3>
          <div className="byline-settings-grid">
            <TextControl
              label="Application / Client ID"
              help={environmentHelp(sources.clientId)}
              value={draft.clientId}
              onChange={(clientId: string) => update({ clientId })}
            />
            <TextControl
              label="Bot service URL"
              help={environmentHelp(sources.botUrl) || "Where the Byline Discord bot listens. HTTPS, or HTTP on localhost."}
              value={draft.botUrl}
              onChange={(botUrl: string) => update({ botUrl })}
            />
            <TextControl
              type="password"
              autoComplete="new-password"
              label={settings.secrets.botToken ? "Replace bot token" : "Bot token"}
              help={settings.secrets.botToken ? "Stored. Leave blank to keep it." : environmentHelp(sources.botToken)}
              value={botToken}
              onChange={(value: string) => updateSecret(setBotToken, value)}
            />
            <TextControl
              type="password"
              autoComplete="new-password"
              label={settings.secrets.clientSecret ? "Replace client secret" : "Client secret"}
              help={settings.secrets.clientSecret ? "Stored. Leave blank to keep it." : environmentHelp(sources.clientSecret)}
              value={clientSecret}
              onChange={(value: string) => updateSecret(setClientSecret, value)}
            />
          </div>
          {settings.secrets.botToken ? <ToggleControl label="Remove the saved bot token" checked={clearBotToken} onChange={(value) => { setMessage(""); setClearBotToken(value); }} /> : null}
          {settings.secrets.clientSecret ? <ToggleControl label="Remove the saved client secret" checked={clearClientSecret} onChange={(value) => { setMessage(""); setClearClientSecret(value); }} /> : null}
        </div>

        <div>
          <h3>Server</h3>
          {directory.error ? <Notice status="warning" isDismissible={false}>{directory.error}</Notice> : null}
          <div className="byline-settings-grid">
            <DiscordChoiceField
              label="Discord server"
              emptyLabel="Select a server"
              help={environmentHelp(sources.guildId)}
              choices={directory.guilds}
              available={directory.available}
              value={draft.guildId}
              onChange={(guildId: string) => update({ guildId })}
            />
            <DiscordChoiceField
              label="Storyboard forum"
              emptyLabel="Select a forum channel"
              help={environmentHelp(sources.storyboardChannelId) || "Save the server first to list its forum channels."}
              choices={directory.forums}
              available={directory.available}
              value={draft.storyboardChannelId}
              onChange={(storyboardChannelId: string) => update({ storyboardChannelId })}
            />
            <DiscordChoiceField
              label="Announcements channel"
              emptyLabel="Select a text channel"
              help={environmentHelp(sources.announcementsChannelId)}
              choices={directory.textChannels}
              available={directory.available}
              value={draft.announcementsChannelId}
              onChange={(announcementsChannelId: string) => update({ announcementsChannelId })}
            />
            <DiscordChoiceField
              label="Staff role"
              emptyLabel="No role mention"
              help={environmentHelp(sources.staffRoleId)}
              choices={directory.roles}
              available={directory.available}
              value={draft.staffRoleId}
              onChange={(staffRoleId: string) => update({ staffRoleId })}
            />
          </div>
        </div>

        <div>
          <h3>Behavior</h3>
          <ToggleControl
            label="Post published stories to announcements"
            checked={draft.announcePublished}
            onChange={(announcePublished: boolean) => update({ announcePublished })}
          />
          <SelectControl
            label="Reconciliation interval"
            value={String(draft.reconcileMinutes)}
            // An interval inherited from the environment need not be one Byline offers; show it rather than blanking the field.
            options={Array.from(new Set([...settings.reconcileChoices, draft.reconcileMinutes]))
              .sort((left, right) => left - right)
              .map((minutes) => ({ label: minutes === 1 ? "1 minute" : `${minutes} minutes`, value: String(minutes) }))}
            onChange={(value: string) => update({ reconcileMinutes: Number(value) })}
          />
          <p className="byline-field-note">The bot reads these settings from WordPress when it starts.</p>
        </div>

        <div className="byline-settings-actions">
          <Button variant="primary" isBusy={operation === "saving"} disabled={operation !== "idle" || !editable || !dirty} onClick={save}>Save Discord settings</Button>
          <span aria-live="polite">{operation === "saving" ? "Saving…" : dirty ? "Unsaved changes" : "Saved ✓"}</span>
        </div>
      </CardBody>
    </Card>
  );
}

function OperationalInfo({ route, protocol }: { route: string; protocol: ProtocolManifest | null }) {
  const legacyUrl = config?.nativeUrls.legacySettings;
  const content: Record<string, { title: string; body: string; legacy?: boolean }> = {
    "/advanced/access": {
      title: "Capability-based access",
      body: `Manage publication: ${config?.capabilities.manage ? "allowed" : "not allowed"}; edit designs: ${config?.capabilities.editDesign ? "allowed" : "not allowed"}; publish designs: ${config?.capabilities.publishDesign ? "allowed" : "not allowed"}; manage integrations: ${config?.capabilities.manageIntegrations ? "allowed" : "not allowed"}.`
    },
    "/advanced/api": {
      title: "Versioned API",
      body: protocol
        ? `REST namespace byline/v1 · protocol ${protocol.protocolVersion} · publication schema ${protocol.publicationSchemaVersion} · design schema ${protocol.designSchemaVersion} · theme API ${protocol.themeApiVersion}.`
        : "Byline exposes versioned public and capability-protected REST contracts under byline/v1."
    },
    "/advanced/compatibility": {
      title: "Legacy compatibility",
      body: "The installed plugin path, update source, release ZIP, CPTs, metadata, and weekly-wildcat/v1 aliases remain intact while canonical Byline contracts are adopted.",
      legacy: true
    }
  };
  const item = content[route];
  if (!item) return null;
  return (
    <Card>
      <CardBody>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        {item.legacy && legacyUrl ? <Button variant="secondary" href={legacyUrl}>Open compatible native settings</Button> : null}
      </CardBody>
    </Card>
  );
}

function AdminPageFrame({
  title,
  tabs,
  activeTab,
  activeRoute,
  error,
  children
}: {
  title: string;
  tabs?: AdminTab[];
  activeTab?: string;
  activeRoute?: string;
  error: string;
  children: ReactNode;
}) {
  return (
    <main className="byline-admin-main">
      <AdminNavigation
        urls={config?.urls || {}}
        capabilities={config?.capabilities || {}}
        features={config?.features || {}}
        activeRoute={activeRoute}
      />
      <header className="byline-admin-header">
        <h1>{title}</h1>
      </header>
      {tabs && activeTab ? <AdminLocalTabs label={title} active={activeTab} tabs={tabs} /> : null}
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      {children}
    </main>
  );
}

type AdminErrorBoundaryProps = { children: ReactNode };
type AdminErrorBoundaryState = { hasError: boolean };

class AdminErrorBoundary extends Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  state: AdminErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AdminErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="byline-admin-app">
        <main className="byline-admin-main">
          <Card>
            <CardBody>
              <Notice status="error" isDismissible={false}>Something went wrong while loading Byline.</Notice>
              <p>Reload the screen and, if the problem continues, open Diagnostics and share the support report with an administrator.</p>
              <div className="byline-settings-actions">
                <Button variant="primary" onClick={() => window.location.reload()}>Retry</Button>
                {config?.urls.settings.diagnostics ? <Button variant="secondary" href={adminUrl(config.urls.settings.diagnostics)}>Open Diagnostics</Button> : null}
              </div>
            </CardBody>
          </Card>
        </main>
      </div>
    );
  }
}

function Screen({
  page,
  tab,
  view,
  protocol,
  publication,
  error,
  onPublicationSaved
}: {
  page: string;
  tab: string;
  view: string;
  protocol: ProtocolManifest | null;
  publication: PublicationConfig | null;
  error: string;
  onPublicationSaved: (publication: PublicationConfig) => void;
}) {
  if (page === ADMIN_PAGE_SLUGS.dashboard) {
    return (
      <AdminPageFrame title="Home" activeRoute="/dashboard" error={error}>
        <HomeApp
          fetchers={createHomeFetchers(adminProtectedRequest, {
            health: config?.healthPath,
            contentHealth: config?.contentHealthPath,
            feedback: config?.feedbackPath,
            deployment: config?.deploymentPath
          }, config?.capabilities)}
          currentUserId={config?.currentUserId}
          actionUrls={homeActionUrls()}
        />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.planning) {
    const activeTab = normalizeAdminTab(page, tab);
    if (activeTab === "today") {
      return (
        <AdminPageFrame title="Today" tabs={planningTabs()} activeTab={activeTab} activeRoute="/home" error={error}>
          <HomeApp
            fetchers={createHomeFetchers(adminProtectedRequest, {
              health: config?.healthPath,
              contentHealth: config?.contentHealthPath,
              feedback: config?.feedbackPath,
              deployment: config?.deploymentPath
            }, config?.capabilities)}
            currentUserId={config?.currentUserId}
            actionUrls={homeActionUrls()}
          />
        </AdminPageFrame>
      );
    }
    return (
      <AdminPageFrame title="Planning" tabs={planningTabs()} activeTab={activeTab} activeRoute={`/planning/${activeTab}`} error={error}>
        <PlanningApp
          fetchers={createPlanningFetchers(adminProtectedRequest)}
          initialView={planningViewForTab(activeTab, config?.view)}
          rememberStoriesView={activeTab === "stories" && !storiesViewFromRoute(config?.view)}
          currentUserId={config?.currentUserId}
        />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.newsletters) {
    const activeTab = normalizeAdminTab(page, tab);
    return (
      <AdminPageFrame title="Newsletters" tabs={newsletterTabs()} activeTab={activeTab} activeRoute={`/newsletters/${activeTab}`} error={error}>
        <NewsletterApp
          fetchers={createNewsletterFetchers(adminProtectedRequest)}
          initialView={activeTab === "settings" ? "settings" : "list"}
          branding={newsletterBranding(publication)}
        />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.publication) {
    const activeTab = normalizeAdminTab(page, tab);
    return (
      <AdminPageFrame title="Publication" tabs={publicationTabs()} activeTab={activeTab} activeRoute={`/publication/${activeTab}`} error={error}>
        <PublicationSettings route={adminScreenRoute(page, activeTab)} publication={publication} onSaved={onPublicationSaved} />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.theme) {
    return (
      <AdminPageFrame title="Theme" activeRoute="/design/theme" error={error}>
        <PublicationSettings route="/design/theme" publication={publication} onSaved={onPublicationSaved} />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.integrations) {
    const availableTabs = integrationTabs();
    const requestedTab = normalizeAdminTab(page, tab);
    const activeTab = availableTabs.some((availableTab) => availableTab.id === requestedTab)
      ? requestedTab
      : availableTabs[0]?.id || "deployment";
    const route = adminScreenRoute(page, activeTab);
    return (
      <AdminPageFrame title="Integrations" tabs={integrationTabs()} activeTab={activeTab} activeRoute={route} error={error}>
        {route === "/integrations/deployment" ? <DeploymentSettings /> : <DiscordSettings />}
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.settings) {
    const activeTab = normalizeAdminTab(page, tab);
    const route = adminScreenRoute(page, activeTab);
    return (
      <AdminPageFrame title="Settings" tabs={settingsTabs()} activeTab={activeTab} activeRoute={route} error={error}>
        {route === "/advanced/diagnostics" ? (
          <DoctorApp
            fetchers={{
              getDiagnostics: () => apiFetch<DoctorDiagnostics>({ path: config?.diagnosticsPath || "/byline/v1/admin/diagnostics" }),
              runAction: (action: DoctorActionId) => apiFetch<DoctorActionResponse>({
                path: config?.diagnosticsPath || "/byline/v1/admin/diagnostics",
                method: "POST",
                data: { action }
              })
            }}
            urls={{
              deployment: adminUrl(config?.urls.integrations?.deployment),
              publication: adminUrl(config?.urls.publication?.identity),
              branding: adminUrl(config?.urls.publication?.branding),
              theme: adminUrl(config?.urls.theme),
              studio: adminUrl(config?.urls.studio),
              doctor: adminUrl(config?.urls.settings?.diagnostics)
            }}
            canManageIntegrations={Boolean(config?.capabilities.manageIntegrations)}
          />
        ) : <OperationalInfo route={route} protocol={protocol} />}
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.studio) {
    const activeView = normalizeStudioView(view);
    const studioTabs: AdminTab[] = [
      { id: "editor", label: "Edit", href: adminUrl(config?.urls.studio) },
      { id: "revisions", label: "Revisions", href: adminUrl(config?.urls.studioRevisions) }
    ];

    if (activeView === "revisions") {
      return (
        <AdminPageFrame title="Studio" tabs={studioTabs} activeTab={activeView} error={error}>
          <Suspense fallback={<LoadingState label="Loading Studio…" />}>
            <BylineDesignRevisions
              canEdit={Boolean(config?.capabilities.editDesign)}
              backUrl={adminUrl(config?.urls.dashboard)}
              studioUrl={adminUrl(config?.urls.studio)}
            />
          </Suspense>
        </AdminPageFrame>
      );
    }

    // The editor is deliberately not wrapped in the admin page frame. A visual
    // page builder needs the whole viewport, and the frame's heading, tab bar
    // and wp-admin padding are exactly what was squeezing the canvas into a
    // narrow column. Studio provides its own toolbar and its own way out.
    return (
      <Suspense fallback={<LoadingState label="Loading Studio…" />}>
        <BylineStudio
          canEdit={Boolean(config?.capabilities.editDesign)}
          canPublish={Boolean(config?.capabilities.publishDesign)}
          publicationTheme={publication?.appearance.theme || "weekly-wildcat"}
          previewStylesheetUrl={config?.previewStylesheetUrl || ""}
          tokenOverrides={publication?.appearance.tokenOverrides || {}}
          backUrl={adminUrl(config?.urls.dashboard)}
          features={{
            polls: publication?.features.polls !== false,
            events: publication?.features.events !== false,
            sports: publication?.features.sports !== false,
            newsletter: publication?.features.newsletter !== false
          }}
          publicationShortName={publication?.identity.shortName || "Newsroom"}
          publicationName={publication?.identity.name}
          organizationName={publication?.identity.organizationName}
          contactHref={publication?.urls.contact}
          social={publication?.social}
          calendarHeading={
            publication?.appearance.theme === "weekly-wildcat"
              ? "At NSHS"
              : `At ${publication?.identity.organizationName || publication?.identity.shortName || "school"}`
          }
          publicSiteUrl={publication?.urls.publicSite}
        />
      </Suspense>
    );
  }

  return (
    <AdminPageFrame title="Byline" error={error}>
      <Card>
        <CardBody>
          <p>This Byline section is unavailable for the current module configuration.</p>
        </CardBody>
      </Card>
    </AdminPageFrame>
  );
}

function BylineAdminApp() {
  const page = normalizeAdminPage(config?.page);
  const tab = normalizeAdminTab(page, config?.tab);
  const view = normalizeStudioView(config?.view);
  const [protocol, setProtocol] = useState<ProtocolManifest | null>(null);
  const [publication, setPublication] = useState<PublicationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const legacyHash = window.location.hash;
  const legacyDestination = page === ADMIN_PAGE_SLUGS.dashboard ? legacyHashDestination(legacyHash) : null;
  const legacyTarget = legacyDestination && config?.legacyRoutes
    ? config.legacyRoutes[normalizeAdminRoute(legacyHash)]
    : undefined;

  useEffect(() => {
    if (legacyTarget) {
      window.location.replace(legacyTarget);
    }
  }, [legacyTarget]);

  const load = () => {
    setLoading(true);
    setError("");

    return Promise.all([
      apiFetch<ProtocolManifest>({ path: config?.restPath || "/byline/v1/capabilities/protocol" }),
      apiFetch<PublicationConfig>({ path: config?.publicationPath || "/byline/v1/publication" })
    ])
      .then(([manifest, publicationConfig]) => {
        setProtocol(manifest);
        setPublication(publicationConfig);
      })
      .catch((requestError) => setError(safeRequestError(requestError, "Byline could not load its settings. Try again or open Diagnostics.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (legacyTarget) return;
    void load();
  }, [legacyTarget, page]);

  if (legacyTarget) {
    return <div className="byline-admin-app"><div className="byline-admin-main"><LoadingState label="Opening the compatible Byline screen…" /></div></div>;
  }

  if (loading) {
    return <div className="byline-admin-app"><div className="byline-admin-main"><LoadingState /></div></div>;
  }

  if (error || !protocol || !publication) {
    return (
      <div className="byline-admin-app">
        <AdminPageFrame title="Byline" error={error || "Byline could not load its configuration."}>
          <Card>
            <CardBody>
              <p>Try loading the screen again. If the problem continues, use Diagnostics to collect a support report.</p>
              <div className="byline-settings-actions">
                <Button variant="primary" onClick={() => void load()}>Retry</Button>
                {config?.urls.settings.diagnostics ? <Button variant="secondary" href={adminUrl(config.urls.settings.diagnostics)}>Open Diagnostics</Button> : null}
              </div>
            </CardBody>
          </Card>
        </AdminPageFrame>
      </div>
    );
  }

  return (
    <div className="byline-admin-app">
      <Screen
        page={page}
        tab={tab}
        view={view}
        protocol={protocol}
        publication={publication}
        error={error}
        onPublicationSaved={setPublication}
      />
    </div>
  );
}

const rootElement = document.getElementById("byline-admin-root");

if (rootElement) {
  createRoot(rootElement).render(
    <AdminErrorBoundary>
      <BylineAdminApp />
    </AdminErrorBoundary>
  );
}
