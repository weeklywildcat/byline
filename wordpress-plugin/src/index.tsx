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
import { Component, createRoot, useEffect, useState } from "@wordpress/element";
// Scoped publication styles used by shared admin presentation components.
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
  normalizeAdminTab
} from "./admin-routing";
import { createNavigationItem, moveItem, navigationConflictKey, sectionSlugForName } from "./settings-model";
import { PlanningApp, createPlanningFetchers, createWorkspaceUrlBuilder, type PlanningView } from "./planning";
import { NewsletterApp, NewsletterSettings, createNewsletterFetchers } from "./newsletters";
import type { NewsletterBranding } from "./newsletters/render";
import { stripMarkupForText } from "./safe-text";
import type { ReactNode } from "react";
import { storiesViewFromRoute } from "./home/navigation-model";
import { DoctorApp, type DoctorActionId, type DoctorActionResponse, type DoctorDiagnostics } from "./doctor";
import "./style.css";

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
  planningPath?: string;
  tasksPath?: string;
  readinessPath?: string;
  mediaPath?: string;
  coveragePath?: string;
  feedbackPath?: string;
  distributionPath?: string;
  newsletterPath?: string;
  analyticsPath?: string;
  mediaSettingsPath?: string;
  contentHealthPath?: string;
  currentUserId?: number;
  capabilities: {
    manage: boolean;
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

type SettingsTab = (typeof SETTINGS_TABS)[number];
type SettingsNavItem = {
  id: SettingsTab;
  label: string;
  description: string;
  capability: "manage" | "manageIntegrations";
  feature?: string;
};
type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    label: "Publication",
    items: [
      { id: "identity", label: "Publication", description: "Name, location, URLs, licensing, and search defaults.", capability: "manage" },
      { id: "branding", label: "Branding", description: "Masthead, logos, social image, and app icons.", capability: "manage" },
      { id: "navigation", label: "Navigation", description: "Sections and the links readers see around the site.", capability: "manage" },
      { id: "social", label: "Social", description: "Publication social profiles and reader-facing links.", capability: "manage" },
      { id: "features", label: "Features", description: "Turn optional newsroom and public modules on or off.", capability: "manage" }
    ]
  },
  {
    label: "Connections",
    items: [
      { id: "newsletter", label: "Newsletter", description: "Connect the provider used for newsletter signup and delivery.", capability: "manageIntegrations", feature: "newsletter" },
      { id: "analytics", label: "Analytics", description: "Connect Plausible or Cloudflare for newsroom performance data.", capability: "manageIntegrations" },
      { id: "discord", label: "Discord", description: "Connect the newsroom bot, server, channels, and workflow sync.", capability: "manageIntegrations", feature: "discord" },
      { id: "deployment", label: "Deployment", description: "Configure the private build hook used after content changes.", capability: "manageIntegrations" }
    ]
  },
  {
    label: "WordPress",
    items: [
      { id: "login", label: "Login screen", description: "Configure the Unsplash-powered WordPress login background.", capability: "manage" }
    ]
  },
  {
    label: "Advanced",
    items: [
      { id: "access", label: "Access", description: "See the capabilities that control Byline administration.", capability: "manage" },
      { id: "api", label: "API", description: "Inspect Byline's versioned REST and schema contracts.", capability: "manage" },
      { id: "compatibility", label: "Compatibility", description: "Review the legacy contracts retained for installed sites.", capability: "manage" },
      { id: "diagnostics", label: "Diagnostics", description: "Run Byline Doctor and collect a support report.", capability: "manage" }
    ]
  }
];

function settingsItemAvailable(item: SettingsNavItem): boolean {
  if (item.capability === "manage" && !config?.capabilities.manage) return false;
  if (item.capability === "manageIntegrations" && !config?.capabilities.manageIntegrations) return false;
  if (item.feature && !config?.features[item.feature]) return false;
  return true;
}

function settingsNavigationGroups(): SettingsNavGroup[] {
  return SETTINGS_NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(settingsItemAvailable) }))
    .filter((group) => group.items.length > 0);
}

function settingsItem(tab: string): SettingsNavItem | undefined {
  return SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === tab);
}

function firstAvailableSettingsTab(): SettingsTab {
  return settingsNavigationGroups()[0]?.items[0]?.id || "identity";
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

  if (route === "/publication/identity") {
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
      sports: "Show sports reporting and sports navigation. Historical records are preserved in archive Pages.",
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
                // Toggling a feature only edits an unsaved draft, and turning it
                // back on restores the surface, so this needs no confirmation:
                // the note above already explains that content is kept.
                onChange={(checked) => setDraft({ ...draft, features: { ...draft.features, [feature]: checked } })}
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
        <p>Byline sends an HTTPS POST after content changes. It works with Cloudflare, Netlify, Vercel, GitHub Actions, and any compatible build hook.</p>
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
  const content: Record<string, { title: string; body: string }> = {
    "/advanced/access": {
      title: "Capability-based access",
      body: `Manage publication: ${config?.capabilities.manage ? "allowed" : "not allowed"}; manage integrations: ${config?.capabilities.manageIntegrations ? "allowed" : "not allowed"}.`
    },
    "/advanced/api": {
      title: "Versioned API",
      body: protocol
        ? `REST namespace byline/v1 · protocol ${protocol.protocolVersion} · publication schema ${protocol.publicationSchemaVersion} · design schema ${protocol.designSchemaVersion} · theme API ${protocol.themeApiVersion}.`
        : "Byline exposes versioned public and capability-protected REST contracts under byline/v1."
    },
    "/advanced/compatibility": {
      title: "Legacy compatibility",
      body: "The installed plugin path, update source, release ZIP, CPTs, metadata, and weekly-wildcat/v1 aliases remain intact while canonical Byline contracts are adopted. Old Byline settings URLs redirect into this unified Settings workspace."
    }
  };
  const item = content[route];
  if (!item) return null;
  return (
    <Card>
      <CardBody>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
      </CardBody>
    </Card>
  );
}

function SettingsSectionHeader({ item }: { item?: SettingsNavItem }) {
  if (!item) return null;
  return (
    <header className="byline-settings-section-header">
      <h2>{item.label}</h2>
      <p>{item.description}</p>
    </header>
  );
}

function SettingsShell({ activeTab, children }: { activeTab: SettingsTab; children: ReactNode }) {
  const groups = settingsNavigationGroups();
  return (
    <div className="byline-settings-page">
      <header className="byline-settings-page-header">
        <p className="byline-eyebrow">Byline</p>
        <h1>Settings</h1>
        <p>Publication identity, connections, WordPress behavior, and advanced configuration in one place.</p>
      </header>
      <div className="byline-settings-layout">
        <aside className="byline-settings-rail" aria-label="Settings sections">
          {groups.map((group) => (
            <section key={group.label} className="byline-settings-rail-group">
              <h2>{group.label}</h2>
              <nav>
                {group.items.map((item) => (
                  <a
                    key={item.id}
                    href={adminUrl(config?.urls.settings[item.id])}
                    className={activeTab === item.id ? "is-active" : undefined}
                    aria-current={activeTab === item.id ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </section>
          ))}
        </aside>
        <section className="byline-settings-content">
          {children}
        </section>
      </div>
    </div>
  );
}

type AnalyticsProviderField = {
  id: string;
  label: string;
  type: string;
  secret?: boolean;
  configured?: boolean;
  value?: string;
};
type AnalyticsProvider = {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  maskedIdentifier: string;
  connectionStatus: string;
  fields: AnalyticsProviderField[];
};
type AnalyticsSettingsPayload = {
  provider: string;
  configured: boolean;
  providers: AnalyticsProvider[];
};

function analyticsValues(provider: AnalyticsProvider | undefined): Record<string, string> {
  return Object.fromEntries((provider?.fields || []).map((field) => [field.id, field.value || ""]));
}

function AnalyticsSettings() {
  const path = config?.analyticsPath || "/byline/v1/admin/analytics";
  const [payload, setPayload] = useState<AnalyticsSettingsPayload | null>(null);
  const [providerId, setProviderId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<"idle" | "saving" | "testing">("idle");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const applyPayload = (next: AnalyticsSettingsPayload, preferredProvider?: string) => {
    const selectedId = preferredProvider || next.provider || next.providers[0]?.id || "";
    const selected = next.providers.find((provider) => provider.id === selectedId) || next.providers[0];
    setPayload(next);
    setProviderId(selected?.id || "");
    setValues(analyticsValues(selected));
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch<AnalyticsSettingsPayload>({ path })
      .then((next) => {
        if (!cancelled) applyPayload(next);
      })
      .catch((requestError) => {
        if (!cancelled) setLoadError(safeRequestError(requestError, "Byline could not load analytics settings."));
      });
    return () => { cancelled = true; };
  }, [path]);

  if (!payload && !loadError) return <LoadingState label="Loading analytics settings…" />;

  const selected = payload?.providers.find((provider) => provider.id === providerId);
  const changeProvider = (nextId: string) => {
    setProviderId(nextId);
    setValues(analyticsValues(payload?.providers.find((provider) => provider.id === nextId)));
    setMessage("");
    setLoadError("");
  };

  const save = async () => {
    if (!providerId) return;
    setOperation("saving");
    setMessage("");
    setLoadError("");
    try {
      const next = await apiFetch<AnalyticsSettingsPayload>({
        path,
        method: "POST",
        data: { provider: providerId, settings: { [providerId]: values } }
      });
      applyPayload(next, providerId);
      setMessage("Analytics settings saved.");
    } catch (requestError) {
      setLoadError(safeRequestError(requestError, "Byline could not save analytics settings."));
    } finally {
      setOperation("idle");
    }
  };

  const test = async () => {
    if (!providerId || providerId === "none") return;
    setOperation("testing");
    setMessage("");
    setLoadError("");
    try {
      const result = await apiFetch<{ ok: boolean; error?: string }>({
        path: `${path}/test`,
        method: "POST",
        data: { provider: providerId }
      });
      setMessage(result.ok ? "Analytics provider connected." : (result.error || "The analytics provider could not be reached."));
      const refreshed = await apiFetch<AnalyticsSettingsPayload>({ path });
      applyPayload(refreshed, providerId);
    } catch (requestError) {
      setLoadError(safeRequestError(requestError, "The analytics connection test failed."));
    } finally {
      setOperation("idle");
    }
  };

  return (
    <>
      <SettingsSectionHeader item={settingsItem("analytics")} />
      {loadError ? <Notice status="error" isDismissible={false}>{loadError}</Notice> : null}
      {message ? <Notice status={message.includes("connected") || message.includes("saved") ? "success" : "warning"} isDismissible={false}>{message}</Notice> : null}
      <Card>
        <CardBody className="byline-settings-card">
          <SelectControl
            label="Analytics provider"
            value={providerId}
            options={(payload?.providers || []).map((provider) => ({ label: provider.label, value: provider.id }))}
            onChange={changeProvider}
          />
          {selected ? (
            <>
              <p className="byline-field-note">{selected.description}</p>
              <dl className="byline-diagnostics-list">
                <div><dt>Status</dt><dd>{selected.connectionStatus === "connected" ? "Connected" : selected.configured ? "Configured" : "Not configured"}</dd></div>
                {selected.maskedIdentifier ? <div><dt>Account</dt><dd>{selected.maskedIdentifier}</dd></div> : null}
              </dl>
              {selected.fields.length ? (
                <div className="byline-settings-grid">
                  {selected.fields.map((field) => (
                    <TextControl
                      key={field.id}
                      label={field.secret && field.configured ? `Replace ${field.label.toLowerCase()}` : field.label}
                      type={field.secret ? "password" : "text"}
                      value={values[field.id] || ""}
                      autoComplete={field.secret ? "new-password" : undefined}
                      help={field.secret && field.configured ? "Stored securely. Leave blank to keep the current value." : undefined}
                      onChange={(value) => {
                        setValues((current) => ({ ...current, [field.id]: value }));
                        setMessage("");
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div className="byline-settings-actions">
                <Button variant="primary" isBusy={operation === "saving"} disabled={operation !== "idle"} onClick={() => void save()}>Save analytics</Button>
                {providerId !== "none" ? <Button variant="secondary" isBusy={operation === "testing"} disabled={operation !== "idle" || !selected.configured} onClick={() => void test()}>Test saved connection</Button> : null}
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}

type MediaSettingsPayload = {
  provider: "unsplash";
  configured: boolean;
  savedKeyConfigured: boolean;
  managedExternally: boolean;
  source: "environment" | "wordpress" | "none";
};

function LoginSettings() {
  const path = config?.mediaSettingsPath || "/byline/v1/admin/media-settings";
  const [payload, setPayload] = useState<MediaSettingsPayload | null>(null);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<MediaSettingsPayload>({ path })
      .then((next) => { if (!cancelled) setPayload(next); })
      .catch((requestError) => { if (!cancelled) setLoadError(safeRequestError(requestError, "Byline could not load login-screen settings.")); });
    return () => { cancelled = true; };
  }, [path]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    setLoadError("");
    try {
      const next = await apiFetch<MediaSettingsPayload>({
        path,
        method: "POST",
        data: { unsplashKey: key, clearUnsplashKey: clearKey }
      });
      setPayload(next);
      setKey("");
      setClearKey(false);
      setMessage("Login-screen settings saved.");
    } catch (requestError) {
      setLoadError(safeRequestError(requestError, "Byline could not save login-screen settings."));
    } finally {
      setSaving(false);
    }
  };

  if (!payload && !loadError) return <LoadingState label="Loading login-screen settings…" />;

  return (
    <>
      <SettingsSectionHeader item={settingsItem("login")} />
      {loadError ? <Notice status="error" isDismissible={false}>{loadError}</Notice> : null}
      {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}
      <Card>
        <CardBody className="byline-settings-card">
          <h3>Unsplash login background</h3>
          <p>WordPress uses this key only to load rotating landscape photos for the sign-in screen.</p>
          {payload?.managedExternally ? (
            <Notice status="info" isDismissible={false}>An environment variable or constant supplies the active key. Change it in the server environment.</Notice>
          ) : (
            <>
              <TextControl
                label={payload?.savedKeyConfigured ? "Replace Unsplash access key" : "Unsplash access key"}
                type="password"
                value={key}
                autoComplete="new-password"
                help={payload?.savedKeyConfigured ? "A key is saved. Leave this blank to keep it unchanged." : "Create an Unsplash access key and paste it here."}
                onChange={(value) => { setKey(value); setMessage(""); }}
              />
              {payload?.savedKeyConfigured ? <ToggleControl label="Remove the saved Unsplash key" checked={clearKey} onChange={setClearKey} /> : null}
              <div className="byline-settings-actions">
                <Button variant="primary" isBusy={saving} disabled={saving || (!key && !clearKey)} onClick={() => void save()}>Save login settings</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/**
 * Byline's own screens sit inside WordPress admin chrome, which already owns
 * persistent navigation. The frame therefore renders a page heading, optional
 * local tabs for views of this page, and the page itself.
 */
function AdminPageFrame({
  title,
  heading = true,
  tabs,
  activeTab,
  error,
  children
}: {
  title: string;
  /** Screens that render their own page header opt out so the h1 is not duplicated. */
  heading?: boolean;
  tabs?: AdminTab[];
  activeTab?: string;
  error: string;
  children: ReactNode;
}) {
  return (
    <main className="byline-admin-main">
      {heading ? (
        <header className="byline-admin-header">
          <h1>{title}</h1>
        </header>
      ) : null}
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
  // Home has its own React/CSS entrypoint, enqueued only on its native route.
  if (page === ADMIN_PAGE_SLUGS.dashboard) return null;
  if (page === ADMIN_PAGE_SLUGS.planning) {
    const activeTab = normalizeAdminTab(page, tab);
    if (activeTab === "today") return null;
    return (
      <AdminPageFrame title="Planning" heading={false} error={error}>
        <PlanningApp
          fetchers={createPlanningFetchers(adminProtectedRequest)}
          initialView={planningViewForTab(activeTab, config?.view)}
          initialFilters={{ mine: new URLSearchParams(window.location.search).get("mine") === "1" }}
          rememberStoriesView={activeTab === "stories" && !storiesViewFromRoute(config?.view)}
          currentUserId={config?.currentUserId}
          workspaceUrl={createWorkspaceUrlBuilder(config?.urls.planning.stories)}
        />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.newsletters) {
    const activeTab = normalizeAdminTab(page, tab);
    return (
      <AdminPageFrame title="Newsletters" tabs={newsletterTabs()} activeTab={activeTab} error={error}>
        <NewsletterApp
          fetchers={createNewsletterFetchers(adminProtectedRequest)}
          initialView="list"
          branding={newsletterBranding(publication)}
          settingsUrl={adminUrl(config?.urls.settings.newsletter)}
        />
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.publication) {
    const activeTab = normalizeAdminTab(page, tab);
    return (
      <AdminPageFrame title="Publication" tabs={publicationTabs()} activeTab={activeTab} error={error}>
        <PublicationSettings route={adminScreenRoute(page, activeTab)} publication={publication} onSaved={onPublicationSaved} />
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
      <AdminPageFrame title="Integrations" tabs={integrationTabs()} activeTab={activeTab} error={error}>
        {route === "/integrations/deployment" ? <DeploymentSettings /> : <DiscordSettings />}
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.settings) {
    const requestedTab = normalizeAdminTab(page, tab) as SettingsTab;
    const activeTab = settingsItemAvailable(settingsItem(requestedTab) || SETTINGS_NAV_GROUPS[0].items[0])
      ? requestedTab
      : firstAvailableSettingsTab();
    const route = adminScreenRoute(page, activeTab);
    const activeItem = settingsItem(activeTab);
    let settingsContent: ReactNode;

    if (route.startsWith("/publication/")) {
      settingsContent = (
        <>
          <SettingsSectionHeader item={activeItem} />
          <PublicationSettings route={route} publication={publication} onSaved={onPublicationSaved} />
        </>
      );
    } else if (route === "/integrations/newsletter") {
      settingsContent = (
        <NewsletterSettings
          fetchers={createNewsletterFetchers(adminProtectedRequest)}
          title="Newsletter"
        />
      );
    } else if (route === "/integrations/analytics") {
      settingsContent = <AnalyticsSettings />;
    } else if (route === "/integrations/deployment") {
      settingsContent = (
        <>
          <SettingsSectionHeader item={activeItem} />
          <DeploymentSettings />
        </>
      );
    } else if (route === "/integrations/discord") {
      settingsContent = (
        <>
          <SettingsSectionHeader item={activeItem} />
          <DiscordSettings />
        </>
      );
    } else if (route === "/integrations/login") {
      settingsContent = <LoginSettings />;
    } else if (route === "/advanced/diagnostics") {
      settingsContent = (
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
            deployment: adminUrl(config?.urls.settings.deployment),
            publication: adminUrl(config?.urls.settings.identity),
            branding: adminUrl(config?.urls.settings.branding),
            theme: adminUrl(config?.urls.settings.branding),
            doctor: adminUrl(config?.urls.settings.diagnostics)
          }}
          canManageIntegrations={Boolean(config?.capabilities.manageIntegrations)}
        />
      );
    } else {
      settingsContent = (
        <>
          <SettingsSectionHeader item={activeItem} />
          <OperationalInfo route={route} protocol={protocol} />
        </>
      );
    }

    return (
      <AdminPageFrame title="Settings" heading={false} error={error}>
        <SettingsShell activeTab={activeTab}>{settingsContent}</SettingsShell>
      </AdminPageFrame>
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
  const view = config?.view || "";
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
