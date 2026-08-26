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
import { createRoot, useEffect, useMemo, useState } from "@wordpress/element";
import "@puckeditor/core/puck.css";
import { isNavigationItemVisible, normalizeAdminRoute } from "./admin-routing";
import { contrastRatio } from "./contrast";
import { BylineDesignRevisions, BylineStudio } from "./studio";
import "./style.css";

type BylineAdminConfig = {
  restPath: string;
  publicationPath: string;
  diagnosticsPath: string;
  deploymentPath: string;
  nonce: string;
  pluginVersion: string;
  capabilities: {
    manage: boolean;
    editDesign: boolean;
    publishDesign: boolean;
    manageIntegrations: boolean;
  };
  features: Record<string, boolean>;
  themeIds: string[];
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

type DiagnosticsPayload = {
  pluginVersion: string;
  protocolVersion: number;
  publicationSchemaVersion: number;
  designSchemaVersion: number;
  themeApiVersion: number;
  wordpressVersion: string;
  theme: { id: string; version: number; compatible: boolean };
  enabledModules: string[];
  deployment: { provider?: string; providerLabel?: string; configured: boolean; lastTriggeredAt: string; lastStatus: string; pending: boolean };
  publicManifest: { reachable: boolean; status: string; protocolVersion?: number; frontendVersion?: string; publicationRevision?: number };
  restHealth: boolean;
  designsNeedingMigration: number;
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

type NavigationItem = {
  label: string;
  route?: string;
  nativeUrl?: string;
  feature?: string;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigation: NavigationGroup[] = [
  { label: "", items: [{ label: "Dashboard", route: "/dashboard" }] },
  {
    label: "Publication",
    items: [
      { label: "Identity", route: "/publication/identity" },
      { label: "Branding", route: "/publication/branding" },
      { label: "Navigation", route: "/publication/navigation" },
      { label: "Social", route: "/publication/social" }
    ]
  },
  {
    label: "Design",
    items: [
      { label: "Theme", route: "/design/theme" },
      { label: "Studio", route: "/design/studio" },
      { label: "Revisions", route: "/design/revisions" }
    ]
  },
  {
    label: "Content",
    items: [
      { label: "Authors", nativeUrl: config?.nativeUrls.authors },
      { label: "Teams", nativeUrl: config?.nativeUrls.teams, feature: "sports" },
      { label: "Games", nativeUrl: config?.nativeUrls.games, feature: "sports" },
      { label: "Rosters", nativeUrl: config?.nativeUrls.rosters, feature: "sports" },
      { label: "Events", nativeUrl: config?.nativeUrls.events, feature: "events" },
      { label: "Polls", route: "/content/polls", feature: "polls" }
    ]
  },
  {
    label: "Integrations",
    items: [
      { label: "Discord", route: "/integrations/discord", feature: "discord" },
      { label: "Deployment", route: "/integrations/deployment" }
    ]
  },
  {
    label: "Advanced",
    items: [
      { label: "Access", route: "/advanced/access" },
      { label: "API", route: "/advanced/api" },
      { label: "Compatibility", route: "/advanced/compatibility" },
      { label: "Diagnostics", route: "/advanced/diagnostics" }
    ]
  }
];

function currentRoute() {
  return normalizeAdminRoute(window.location.hash);
}

function routeTitle(route: string) {
  for (const group of navigation) {
    const match = group.items.find((item) => item.route === route);
    if (match) return match.label;
  }
  return "Dashboard";
}

function AdminNavigation({ route, features }: { route: string; features: Record<string, boolean> }) {
  return (
    <nav className="byline-admin-nav" aria-label="Byline sections">
      {navigation.map((group) => {
        const visibleItems = group.items.filter((item) =>
          isNavigationItemVisible(item.feature, features)
        );

        if (visibleItems.length === 0) return null;

        return (
          <section key={group.label || "dashboard"} className="byline-admin-nav-group">
            {group.label ? <h2>{group.label}</h2> : null}
            <div>
              {visibleItems.map((item) =>
                item.nativeUrl ? (
                  <a key={item.label} href={item.nativeUrl}>
                    {item.label}
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <a
                    key={item.label}
                    href={`#${item.route}`}
                    aria-current={route === item.route ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                )
              )}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

function Dashboard({ protocol, publication }: { protocol: ProtocolManifest | null; publication: PublicationConfig | null }) {
  const checklist = [
    { label: "Publication identity", route: "/publication/identity", complete: Boolean(publication?.identity.name && publication?.identity.description) },
    { label: "Location, locale, and timezone", route: "/publication/identity", complete: Boolean(publication?.locale && publication?.timezone) },
    { label: "Branding", route: "/publication/branding", complete: Boolean(publication?.branding.masthead.url || publication?.branding.logo.url) },
    { label: "Choose a theme", route: "/design/theme", complete: Boolean(publication?.appearance.theme) },
    { label: "Sections and navigation", route: "/publication/navigation", complete: Boolean(publication?.navigation.length) },
    { label: "Optional modules", route: "/publication/navigation", complete: Boolean(publication) },
    { label: "Deployment", route: "/integrations/deployment", complete: false },
    { label: "Homepage design", route: "/design/studio", complete: false },
    { label: "Publish", route: "/design/studio", complete: false }
  ];

  return (
    <div className="byline-dashboard-grid">
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Setup checklist</p>
          <ol className="byline-checklist">
            {checklist.map((item) => (
              <li key={item.label} className={item.complete ? "is-complete" : undefined}>
                <span aria-hidden="true">{item.complete ? "✓" : "○"}</span>
                <a href={`#${item.route}`}>{item.label}</a>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="byline-eyebrow">Compatibility</p>
          {protocol ? (
            <dl className="byline-diagnostics-list">
              <div><dt>Plugin</dt><dd>{protocol.pluginVersion}</dd></div>
              <div><dt>Protocol</dt><dd>{protocol.protocolVersion}</dd></div>
              <div><dt>Publication schema</dt><dd>{protocol.publicationSchemaVersion}</dd></div>
              <div><dt>Design schema</dt><dd>{protocol.designSchemaVersion}</dd></div>
              <div><dt>Theme API</dt><dd>{protocol.themeApiVersion}</dd></div>
            </dl>
          ) : (
            <Spinner />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Diagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<DiagnosticsPayload>({ path: config?.diagnosticsPath || "/byline/v1/admin/diagnostics" })
      .then(setDiagnostics)
      .catch(() => setDiagnosticError("Byline could not collect diagnostics."));
  }, []);

  if (diagnosticError) return <Notice status="error" isDismissible={false}>{diagnosticError}</Notice>;
  if (!diagnostics) return <Spinner />;

  const rows = [
    ["Plugin", diagnostics.pluginVersion],
    ["WordPress", diagnostics.wordpressVersion],
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
    ["Designs needing migration", String(diagnostics.designsNeedingMigration)]
  ];

  return (
    <Card>
      <CardBody>
        <p>No secrets, hook URLs, tokens, or credentials are included below.</p>
        <dl className="byline-diagnostics-list">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="byline-diagnostics-copy">
          <Button variant="secondary" onClick={async () => {
            await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
            setCopied(true);
          }}>Copy safe diagnostics</Button>
          {copied ? <span>Copied</span> : null}
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

  useEffect(() => setDraft(publication), [publication]);

  if (!draft) return <Spinner />;

  const save = async () => {
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
      setMessage(`Saved publication revision ${saved.revision}.`);
    } catch {
      setSaveError("Byline could not save this publication configuration. Check your access and try again.");
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <div className="byline-settings-actions">
      <Button variant="primary" isBusy={saving} disabled={saving || !config?.capabilities.manage} onClick={save}>
        Save publication
      </Button>
      <span>Schema {draft.schemaVersion} · Revision {draft.revision}</span>
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
              value={draft.identity[key]}
              onChange={(value) => setDraft({ ...draft, identity: { ...draft.identity, [key]: value } })}
            />
          ))}
        </div>
        <TextareaControl
          label="Description"
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
                }} />
                <TextControl label="Slug" value={section.slug} onChange={(slug) => {
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
                <TextControl label="Label" value={item.label} onChange={(label) => {
                  const navigation = [...draft.navigation];
                  navigation[index] = { ...item, label };
                  setDraft({ ...draft, navigation });
                }} />
                <TextControl label="URL" value={item.url} onChange={(url) => {
                  const navigation = [...draft.navigation];
                  navigation[index] = { ...item, url };
                  setDraft({ ...draft, navigation });
                }} />
                <SelectControl
                  label="Placement"
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
                  <TextControl key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={item[key]} onChange={(value) => {
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

  const refresh = () => apiFetch<DeploymentStatus>({ path }).then(setStatus);
  useEffect(() => { refresh().catch(() => setError("Byline could not load deployment settings.")); }, []);

  const save = async () => {
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
    } catch {
      setError("Byline could not save the deploy hook. Enter a valid HTTPS URL and try again.");
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
    } catch {
      setError("The deploy-hook request failed. The saved URL remains private and unchanged.");
    } finally {
      setBusy(false);
    }
  };

  if (!status && !error) return <Spinner />;

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
          <Button variant="primary" isBusy={busy} disabled={busy || !config?.capabilities.manageIntegrations} onClick={save}>Save deployment</Button>
          <Button variant="secondary" isBusy={busy} disabled={busy || !status?.configured || !config?.capabilities.manageIntegrations} onClick={trigger}>Trigger now</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function OperationalInfo({ route, protocol }: { route: string; protocol: ProtocolManifest | null }) {
  const legacyUrl = config?.nativeUrls.legacySettings;
  const content: Record<string, { title: string; body: string; legacy?: boolean }> = {
    "/integrations/discord": {
      title: "Discord newsroom integration",
      body: "The optional signed bridge and bot use BYLINE_* environment variables, with legacy WWH_* aliases retained during rolling upgrades. Secrets remain outside public publication and design responses.",
      legacy: true
    },
    "/content/polls": {
      title: "Polls module",
      body: "Poll blocks are available only while the Polls module is enabled. The static publication calls a host-provided relative API and does not add a Next.js runtime requirement."
    },
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

function Screen({
  route,
  protocol,
  publication,
  onPublicationSaved
}: {
  route: string;
  protocol: ProtocolManifest | null;
  publication: PublicationConfig | null;
  onPublicationSaved: (publication: PublicationConfig) => void;
}) {
  if (route === "/dashboard") return <Dashboard protocol={protocol} publication={publication} />;

  if (route === "/advanced/diagnostics") return <Diagnostics />;

  if (route === "/integrations/deployment") return <DeploymentSettings />;

  if (route.startsWith("/publication/") || route === "/design/theme") {
    return <PublicationSettings route={route} publication={publication} onSaved={onPublicationSaved} />;
  }

  if (route === "/design/studio") {
    return (
      <BylineStudio
        canEdit={Boolean(config?.capabilities.editDesign)}
        canPublish={Boolean(config?.capabilities.publishDesign)}
        publicationTheme={publication?.appearance.theme || "weekly-wildcat"}
        tokenOverrides={publication?.appearance.tokenOverrides || {}}
      />
    );
  }

  if (route === "/design/revisions") {
    return <BylineDesignRevisions canEdit={Boolean(config?.capabilities.editDesign)} />;
  }

  if ([
    "/integrations/discord",
    "/content/polls",
    "/advanced/access",
    "/advanced/api",
    "/advanced/compatibility"
  ].includes(route)) {
    return <OperationalInfo route={route} protocol={protocol} />;
  }

  return (
    <Card>
      <CardBody>
        <p>This Byline section is unavailable for the current module configuration.</p>
      </CardBody>
    </Card>
  );
}

function BylineAdminApp() {
  const [route, setRoute] = useState(currentRoute);
  const [protocol, setProtocol] = useState<ProtocolManifest | null>(null);
  const [publication, setPublication] = useState<PublicationConfig | null>(null);
  const [error, setError] = useState("");
  const title = useMemo(() => routeTitle(route), [route]);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<ProtocolManifest>({ path: config?.restPath || "/byline/v1/capabilities/protocol" }),
      apiFetch<PublicationConfig>({ path: config?.publicationPath || "/byline/v1/publication" })
    ])
      .then(([manifest, publicationConfig]) => {
        setProtocol(manifest);
        setPublication(publicationConfig);
      })
      .catch(() => setError("Byline could not read its compatibility manifest."));
  }, []);

  return (
    <div className="byline-admin-app">
      <aside className="byline-admin-sidebar">
        <div className="byline-admin-brand">Byline</div>
        <AdminNavigation route={route} features={publication?.features || config?.features || {}} />
      </aside>
      <main className="byline-admin-main">
        <header className="byline-admin-header">
          <p>Byline publishing platform</p>
          <h1>{title}</h1>
        </header>
        {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
        <Screen route={route} protocol={protocol} publication={publication} onPublicationSaved={setPublication} />
      </main>
    </div>
  );
}

const rootElement = document.getElementById("byline-admin-root");

if (rootElement) {
  createRoot(rootElement).render(<BylineAdminApp />);
}
