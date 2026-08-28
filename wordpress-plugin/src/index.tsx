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
import "@puckeditor/core/puck.css";
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
import { BylineDesignRevisions, BylineStudio } from "./studio";
import type { ReactNode } from "react";
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
  previewStylesheetUrl: string;
  capabilities: {
    manage: boolean;
    editDesign: boolean;
    publishDesign: boolean;
    manageIntegrations: boolean;
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

type AdminUrls = {
  dashboard: string;
  studio: string;
  studioRevisions: string;
  theme: string;
  publication: Record<(typeof PUBLICATION_TABS)[number], string>;
  integrations: Record<(typeof INTEGRATION_TABS)[number], string>;
  settings: Record<(typeof SETTINGS_TABS)[number], string>;
  polls: string;
  teams: string;
};

type DiagnosticsPayload = {
  pluginVersion: string;
  protocolVersion: number;
  publicationSchemaVersion: number;
  designSchemaVersion: number;
  themeApiVersion: number;
  wordpressVersion: string;
  phpVersion?: string;
  siteUrl?: string;
  homeUrl?: string;
  theme: { id: string; version: number; compatible: boolean };
  enabledModules: string[];
  deployment: { provider?: string; providerLabel?: string; configured: boolean; lastTriggeredAt: string; lastStatus: string; pending: boolean };
  publicManifest: { reachable: boolean; status: string; protocolVersion?: number; frontendVersion?: string; publicationRevision?: number };
  restHealth: boolean;
  designsNeedingMigration: number;
  schemaVersions?: Record<string, number | null>;
  pageMigration?: {
    legacyPages?: Array<{ id: number; title: string; editLink?: string }>;
    correctionFailures?: Array<{ id: number; title: string; editLink?: string; reason?: string }>;
  };
  assetPresence?: Record<string, boolean>;
  tablePresence?: Record<string, boolean>;
  routePresence?: Record<string, boolean | null>;
  cronAvailable?: boolean;
  healthSummary?: HealthSummary;
  healthChecks?: HealthCheck[];
  sports?: SportsDiagnostics;
  supportReport?: string;
};

type SportsDiagnostics = {
  status: string;
  healthy: boolean;
  currentSeason: string;
  teamCount: number;
  activeTeamCount: number;
  counts?: Record<string, number>;
  issues?: Array<{ code?: string; severity?: string; message?: string }>;
};

type HealthCheck = {
  id: string;
  label: string;
  status: "good" | "recommended" | "critical";
  severity: string;
  summary: string;
  description: string;
  remediationUrl?: string;
  technicalDetail?: string;
};

type HealthSummary = {
  status: "good" | "recommended" | "critical" | string;
  good: number;
  recommended: number;
  critical: number;
};

type HealthPayload = {
  summary: HealthSummary;
  checks: HealthCheck[];
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

  const message = candidate.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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

function statusLabel(status: HealthCheck["status"]): string {
  return status === "good" ? "Good" : status === "recommended" ? "Recommended" : "Critical";
}

function StatusMark({ status }: { status: HealthCheck["status"] }) {
  return (
    <span className={`byline-status-mark byline-status-${status}`} aria-label={statusLabel(status)}>
      {status === "good" ? "✓" : status === "recommended" ? "!" : "×"}
    </span>
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
    const key = `${item.label.trim().toLowerCase()}|${item.url.trim()}|${item.locations.join(",")}`;
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

function Dashboard({ protocol, publication, health }: { protocol: ProtocolManifest | null; publication: PublicationConfig | null; health: HealthPayload | null }) {
  const checks = health?.checks || [];
  const checkById = Object.fromEntries(checks.map((check) => [check.id, check]));
  const checklist = [
    { id: "publication_identity", label: "Publication identity", href: config?.urls.publication.identity },
    { id: "publication_urls", label: "Public and CMS URLs", href: config?.urls.publication.identity },
    { id: "branding", label: "Branding", href: config?.urls.publication.branding },
    { id: "theme", label: "Choose a theme", href: config?.urls.theme },
    { id: "homepage_design", label: "Homepage", href: config?.urls.studio }
  ].filter((item) => checkById[item.id]?.status !== undefined && checkById[item.id]?.status !== "good");
  const overallStatus = health?.summary.status || "recommended";
  const statusText = overallStatus === "good"
    ? "Byline is ready."
    : overallStatus === "critical"
      ? "Byline needs attention before it is ready."
      : "Byline is usable, with a few recommended setup steps.";
  const featureEntries = Object.entries(publication?.features || {});

  return (
    <div className="byline-dashboard-grid byline-overview-grid">
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Publication</p>
          <h2>{publication?.identity.name || "Publication not configured"}</h2>
          <p>{publication?.identity.description || "Add the publication identity before publishing."}</p>
          <dl className="byline-diagnostics-list">
            <div><dt>Short name</dt><dd>{publication?.identity.shortName || "—"}</dd></div>
            <div><dt>Public URL</dt><dd className="byline-breakable">{publication?.urls.publicSite || "—"}</dd></div>
            <div><dt>CMS URL</dt><dd className="byline-breakable">{publication?.urls.cms || "—"}</dd></div>
            <div><dt>Active theme</dt><dd>{publication?.appearance.theme || "—"}</dd></div>
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Status</p>
          <h2 className={`byline-overview-status byline-status-${overallStatus}`}>{statusText}</h2>
          {health ? (
            <ul className="byline-health-list">
              {checks.map((check) => (
                <li key={check.id}>
                  <StatusMark status={check.status} />
                  <span><strong>{check.label}</strong><small>{check.summary}</small></span>
                  {check.status !== "good" && check.remediationUrl ? <a href={adminUrl(check.remediationUrl)}>Fix</a> : null}
                </li>
              ))}
            </ul>
          ) : <LoadingState label="Checking Byline health…" />}
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Setup checklist</p>
          {checklist.length ? (
            <ol className="byline-checklist">
              {checklist.map((item) => (
                <li key={item.id}>
                  <StatusMark status={checkById[item.id]?.status || "recommended"} />
                  <a href={adminUrl(item.href)}>{item.label}</a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="byline-empty-state">No required setup steps remain.</p>
          )}
          {overallStatus === "good" ? <p className="byline-status-ok">Everything required for Byline is ready.</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Features</p>
          <ul className="byline-feature-list">
            {featureEntries.length ? featureEntries.map(([feature, enabled]) => (
              <li key={feature}>
                <span>{feature.charAt(0).toUpperCase() + feature.slice(1)}</span>
                <strong className={enabled ? "byline-status-ok" : "byline-status-off"}>{enabled ? "Enabled" : "Disabled"}</strong>
              </li>
            )) : <li>No optional modules configured.</li>}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="byline-eyebrow">System information</p>
          {protocol ? (
            <dl className="byline-diagnostics-list">
              <div><dt>Plugin</dt><dd>{protocol.pluginVersion}</dd></div>
              <div><dt>Schema</dt><dd>{protocol.publicationSchemaVersion}</dd></div>
              <div><dt>Theme API</dt><dd>{protocol.themeApiVersion}</dd></div>
            </dl>
          ) : <LoadingState label="Loading system information…" />}
        </CardBody>
      </Card>
    </div>
  );
}

function Diagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    setDiagnosticError("");
    setDiagnostics(null);
    return apiFetch<DiagnosticsPayload>({ path: config?.diagnosticsPath || "/byline/v1/admin/diagnostics" })
      .then(setDiagnostics)
      .catch((error) => setDiagnosticError(safeRequestError(error, "Byline could not collect diagnostics. Try again or contact support.")));
  };

  useEffect(() => { void load(); }, []);

  if (diagnosticError) {
    return (
      <Card>
        <CardBody>
          <Notice status="error" isDismissible={false}>{diagnosticError}</Notice>
          <Button variant="secondary" onClick={() => void load()}>Retry</Button>
        </CardBody>
      </Card>
    );
  }
  if (!diagnostics) return <LoadingState label="Collecting diagnostics…" />;

  const rows = [
    ["Plugin", diagnostics.pluginVersion],
    ["WordPress", diagnostics.wordpressVersion],
    ["PHP", diagnostics.phpVersion || "Unknown"],
    ["Site URL", diagnostics.siteUrl || "Unknown"],
    ["Home URL", diagnostics.homeUrl || "Unknown"],
    ["Protocol", String(diagnostics.protocolVersion)],
    ["Publication schema", String(diagnostics.publicationSchemaVersion)],
    ["Design schema", String(diagnostics.designSchemaVersion)],
    ["Theme API", String(diagnostics.themeApiVersion)],
    ["Theme", `${diagnostics.theme.id} v${diagnostics.theme.version} (${diagnostics.theme.compatible ? "compatible" : "incompatible"})`],
    ["Enabled modules", diagnostics.enabledModules.join(", ") || "None"],
    ["Deployment", diagnostics.deployment.configured ? "Configured" : "Not configured"],
    ["Last deployment", `${diagnostics.deployment.lastTriggeredAt} · ${diagnostics.deployment.lastStatus}`],
    ["Deployment pending", diagnostics.deployment.pending ? "Yes" : "No"],
    ["Public manifest", `${diagnostics.publicManifest.reachable ? "Reachable" : "Unavailable"} · ${diagnostics.publicManifest.status}`],
    ["REST health", diagnostics.restHealth ? "Healthy" : "Unavailable"],
    ["Designs needing migration", String(diagnostics.designsNeedingMigration)],
    ...(diagnostics.pageMigration ? [["Page migration", `${diagnostics.pageMigration.correctionFailures?.length || 0} correction failures · ${diagnostics.pageMigration.legacyPages?.length || 0} legacy pages`]] : []),
    ...(diagnostics.sports ? [["Sports integrity", `${diagnostics.sports.healthy ? "Healthy" : "Attention"} · ${diagnostics.sports.currentSeason}`]] : [])
  ];

  return (
    <Card>
      <CardBody>
        <p>No secrets, hook URLs, tokens, or credentials are included below.</p>
        <dl className="byline-diagnostics-list">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {diagnostics.sports ? (
          <div className="byline-diagnostics-sports">
            <h2>Sports integrity</h2>
            <p>{diagnostics.sports.teamCount} configured teams ({diagnostics.sports.activeTeamCount} active) · {diagnostics.sports.currentSeason}</p>
            <p>{diagnostics.sports.counts?.error || 0} errors · {diagnostics.sports.counts?.recommended || 0} recommendations</p>
            {diagnostics.sports.issues?.length ? <Button variant="secondary" href={adminUrl(config?.urls.teams)}>Open Sports Teams</Button> : null}
          </div>
        ) : null}
        {diagnostics.healthChecks?.length ? (
          <>
            <h2>Health checks</h2>
            <ul className="byline-health-list">
              {diagnostics.healthChecks.map((check) => (
                <li key={check.id}>
                  <StatusMark status={check.status} />
                  <span><strong>{check.label}</strong><small>{check.summary}</small></span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <label className="byline-support-report-label" htmlFor="byline-support-report">Support report</label>
        <textarea id="byline-support-report" className="byline-support-report" readOnly value={diagnostics.supportReport || ""} rows={14} />
        <div className="byline-diagnostics-copy">
          <Button variant="secondary" onClick={async () => {
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(diagnostics.supportReport || "");
              } else {
                const report = document.getElementById("byline-support-report") as HTMLTextAreaElement | null;
                report?.focus();
                report?.select();
                document.execCommand("copy");
              }
              setCopied(true);
            } catch {
              setDiagnosticError("Diagnostics are ready below, but the browser could not copy them automatically.");
            }
          }}>Copy diagnostics</Button>
          {copied ? <span role="status">Diagnostics copied.</span> : null}
        </div>
      </CardBody>
    </Card>
  );
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
      <TextControl label="Image URL" value={asset.url} onChange={(url) => onChange({ ...asset, url })} />
      <TextControl label="Alternative text" value={asset.alt} onChange={(alt) => onChange({ ...asset, alt })} />
      <div className="byline-settings-actions">
        <Button variant="secondary" onClick={chooseImage}>Choose from Media Library</Button>
        {asset.url ? <Button variant="link" isDestructive onClick={() => onChange({ url: "", alt: "", width: null, height: null })}>Clear</Button> : null}
      </div>
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

  useEffect(() => setDraft(publication), [publication]);

  const dirty = Boolean(draft && publication && JSON.stringify(draft) !== JSON.stringify(publication));
  useUnsavedChangesPrompt(dirty);

  if (!draft) return <LoadingState label="Loading publication settings…" />;

  const save = async () => {
    const nextValidationErrors = publicationDraftErrors(draft);
    setValidationErrors(nextValidationErrors);
    if (Object.keys(nextValidationErrors).length) {
      setSaveError("Fix the highlighted fields before saving publication settings.");
      setMessage("");
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
      <span aria-live="polite">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"} · Schema {draft.schemaVersion} · Revision {draft.revision}</span>
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
        <h3>Optional token overrides</h3>
        <p>Use six-digit hex colors. Leave a field empty to use the theme default.</p>
        <div className="byline-settings-grid">
          {colorTokens.map(([key, label]) => (
            <TextControl
              key={key}
              label={label}
              help={fieldHelp(validationErrors[`appearance.tokenOverrides.${key}`])}
              value={draft.appearance.tokenOverrides[key] || ""}
              placeholder="#000000"
              onChange={(value) => {
                const tokenOverrides = { ...draft.appearance.tokenOverrides };
                if (value) tokenOverrides[key] = value;
                else delete tokenOverrides[key];
                setDraft({ ...draft, appearance: { ...draft.appearance, tokenOverrides } });
              }}
            />
          ))}
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
                  sections[index] = { ...section, name };
                  setDraft({ ...draft, sections });
                }} help={fieldHelp(validationErrors[`sections.${index}.name`])} />
                <TextControl label="Slug" help={fieldHelp(validationErrors[`sections.${index}.slug`])} value={section.slug} onChange={(slug) => {
                  const sections = [...draft.sections];
                  sections[index] = { ...section, slug };
                  setDraft({ ...draft, sections });
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
              <Button variant="link" isDestructive onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, sectionIndex) => sectionIndex !== index) })}>Remove section</Button>
            </fieldset>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { name: "", slug: "", description: "", active: true }] })}>Add section</Button>
        <h3>Navigation</h3>
        <div className="byline-repeat-list">
          {draft.navigation.map((item, index) => (
            <fieldset key={`${index}-${item.label}`}>
              <legend>Navigation item {index + 1}</legend>
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
                <TextControl label="Footer group" value={item.group || ""} onChange={(group) => {
                  const navigation = [...draft.navigation];
                  navigation[index] = { ...item, group };
                  setDraft({ ...draft, navigation });
                }} />
              </div>
              <Button variant="link" isDestructive onClick={() => setDraft({
                ...draft,
                navigation: draft.navigation.filter((_, itemIndex) => itemIndex !== index)
              })}>Remove item</Button>
            </fieldset>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setDraft({
          ...draft,
          navigation: [...draft.navigation, { label: "", url: "/", locations: ["header"] }]
        })}>Add navigation item</Button>
        <h3>Optional modules</h3>
        <div className="byline-toggle-grid">
          {Object.entries(draft.features).map(([feature, enabled]) => (
            <ToggleControl
              key={feature}
              label={feature.charAt(0).toUpperCase() + feature.slice(1)}
              checked={enabled}
              onChange={(checked) => setDraft({ ...draft, features: { ...draft.features, [feature]: checked } })}
            />
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
  const [busy, setBusy] = useState(false);
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

    setBusy(true);
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
      setBusy(false);
    }
  };

  const trigger = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await apiFetch<DeploymentStatus>({ path: `${path}/trigger`, method: "POST" });
      setStatus(next);
      setMessage(next.lastStatus.startsWith("HTTP 2") ? "Deployment hook accepted the request." : `Deployment completed with status: ${next.lastStatus}.`);
    } catch (requestError) {
      setError(safeRequestError(requestError, "The deploy-hook request failed. The saved URL remains private and unchanged."));
    } finally {
      setBusy(false);
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
          <Button variant="primary" isBusy={busy} disabled={busy || !config?.capabilities.manageIntegrations || !dirty} onClick={save}>Save deployment</Button>
          <Button variant="secondary" isBusy={busy} disabled={busy || !status?.configured || !config?.capabilities.manageIntegrations} onClick={trigger}>Trigger now</Button>
          <span aria-live="polite">{busy ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = Boolean(config?.capabilities.manageIntegrations);

  const apply = (next: DiscordPayload) => {
    setPayload(next);
    setDraft(next.settings.values);
    setBotToken("");
    setClientSecret("");
    setClearBotToken(false);
    setClearClientSecret(false);
  };

  useEffect(() => {
    apiFetch<DiscordPayload>({ path })
      .then(apply)
      .catch(() => setError("Byline could not load the Discord settings."));
  }, []);

  const update = (patch: Partial<DiscordDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const run = async (label: string, request: () => Promise<DiscordPayload>, success: (next: DiscordPayload) => string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await request();
      apply(next);
      setMessage(success(next));
    } catch (requestError) {
      setError(safeRequestError(requestError, `Byline could not ${label}.`));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      "save the Discord settings",
      () =>
        apiFetch<DiscordPayload>({
          path,
          method: "PUT",
          data: { ...draft, botToken, clientSecret, clearBotToken, clearClientSecret }
        }),
      () => "Discord settings saved. Secrets are stored in WordPress and are never returned to the browser."
    );

  const test = () =>
    run(
      "reach Discord",
      () => apiFetch<DiscordPayload>({ path: `${path}/test`, method: "POST" }),
      (next) => (next.status.discordConnected ? "Discord answered. The status below is current." : `Discord could not be reached: ${next.status.message}`)
    );

  const syncNow = () =>
    run(
      "ask the bot to reconcile",
      () => apiFetch<DiscordPayload>({ path: `${path}/sync`, method: "POST" }),
      (next) => (next.sync?.ok ? "The bot reconciled every active story." : `The bot did not run: ${next.sync?.error || "no response"}`)
    );

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
            <Button variant="secondary" isBusy={busy} disabled={busy || !editable} onClick={test}>Test connection</Button>
            <Button variant="secondary" isBusy={busy} disabled={busy || !editable || !draft.botUrl} onClick={syncNow}>Sync now</Button>
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
              onChange={setBotToken}
            />
            <TextControl
              type="password"
              autoComplete="new-password"
              label={settings.secrets.clientSecret ? "Replace client secret" : "Client secret"}
              help={settings.secrets.clientSecret ? "Stored. Leave blank to keep it." : environmentHelp(sources.clientSecret)}
              value={clientSecret}
              onChange={setClientSecret}
            />
          </div>
          {settings.secrets.botToken ? <ToggleControl label="Remove the saved bot token" checked={clearBotToken} onChange={setClearBotToken} /> : null}
          {settings.secrets.clientSecret ? <ToggleControl label="Remove the saved client secret" checked={clearClientSecret} onChange={setClearClientSecret} /> : null}
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
          <Button variant="primary" isBusy={busy} disabled={busy || !editable} onClick={save}>Save Discord settings</Button>
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
  error,
  children
}: {
  title: string;
  tabs?: AdminTab[];
  activeTab?: string;
  error: string;
  children: ReactNode;
}) {
  return (
    <main className="byline-admin-main">
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
  health,
  error,
  onPublicationSaved
}: {
  page: string;
  tab: string;
  view: string;
  protocol: ProtocolManifest | null;
  publication: PublicationConfig | null;
  health: HealthPayload | null;
  error: string;
  onPublicationSaved: (publication: PublicationConfig) => void;
}) {
  if (page === ADMIN_PAGE_SLUGS.dashboard) {
    return (
      <AdminPageFrame title="Overview" error={error}>
        <Dashboard protocol={protocol} publication={publication} health={health} />
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

  if (page === ADMIN_PAGE_SLUGS.theme) {
    return (
      <AdminPageFrame title="Theme" error={error}>
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
      <AdminPageFrame title="Integrations" tabs={integrationTabs()} activeTab={activeTab} error={error}>
        {route === "/integrations/deployment" ? <DeploymentSettings /> : <DiscordSettings />}
      </AdminPageFrame>
    );
  }

  if (page === ADMIN_PAGE_SLUGS.settings) {
    const activeTab = normalizeAdminTab(page, tab);
    const route = adminScreenRoute(page, activeTab);
    return (
      <AdminPageFrame title="Settings" tabs={settingsTabs()} activeTab={activeTab} error={error}>
        {route === "/advanced/diagnostics" ? <Diagnostics /> : <OperationalInfo route={route} protocol={protocol} />}
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
          <BylineDesignRevisions canEdit={Boolean(config?.capabilities.editDesign)} backUrl={adminUrl(config?.urls.dashboard)} />
        </AdminPageFrame>
      );
    }

    // The editor is deliberately not wrapped in the admin page frame. A visual
    // page builder needs the whole viewport, and the frame's heading, tab bar
    // and wp-admin padding are exactly what was squeezing the canvas into a
    // narrow column. Studio provides its own toolbar and its own way out.
    return (
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
      />
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
  const [health, setHealth] = useState<HealthPayload | null>(null);
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
    setHealth(null);
    const unavailableHealth: HealthPayload = {
      summary: { status: "recommended", good: 0, recommended: 1, critical: 0 },
      checks: [{
        id: "health_endpoint",
        label: "Byline health checks",
        status: "recommended",
        severity: "recommended",
        summary: "Health checks are temporarily unavailable.",
        description: "Open Diagnostics to retry the health report.",
        remediationUrl: config?.urls.settings.diagnostics || ""
      }]
    };
    const healthRequest: Promise<HealthPayload | null> = page === ADMIN_PAGE_SLUGS.dashboard && config?.capabilities.manage
      ? apiFetch<HealthPayload>({ path: config.healthPath || "/byline/v1/admin/health" }).catch(() => unavailableHealth)
      : Promise.resolve(null);

    return Promise.all([
      apiFetch<ProtocolManifest>({ path: config?.restPath || "/byline/v1/capabilities/protocol" }),
      apiFetch<PublicationConfig>({ path: config?.publicationPath || "/byline/v1/publication" }),
      healthRequest
    ])
      .then(([manifest, publicationConfig, healthPayload]) => {
        setProtocol(manifest);
        setPublication(publicationConfig);
        setHealth(healthPayload);
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
        health={health}
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
