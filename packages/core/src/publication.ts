export const BYLINE_PUBLICATION_SCHEMA_VERSION = 1 as const;

export type BylinePublicationAsset = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

export type BylineNavigationItem = {
  label: string;
  url: string;
  locations: Array<"header" | "footer">;
  group?: string;
  feature?: string;
};

export type BylinePublicationConfig = {
  schemaVersion: typeof BYLINE_PUBLICATION_SCHEMA_VERSION;
  revision: number;
  identity: {
    name: string;
    shortName: string;
    description: string;
    organizationName: string;
    tagline: string;
  };
  location: {
    display: string;
    city: string;
    region: string;
    country: string;
    address: string;
  };
  locale: string;
  timezone: string;
  urls: {
    publicSite: string;
    cms: string;
    contact: string;
  };
  branding: {
    masthead: BylinePublicationAsset;
    logo: BylinePublicationAsset;
    organizationLogo: BylinePublicationAsset;
    icons: BylinePublicationAsset[];
    defaultSocialImage: BylinePublicationAsset;
  };
  appearance: {
    theme: string;
    tokenOverrides: Record<string, string>;
  };
  sections: Array<{
    name: string;
    slug: string;
    description: string;
    active: boolean;
  }>;
  navigation: BylineNavigationItem[];
  social: Array<{ service: string; label: string; url: string }>;
  features: Record<string, boolean>;
  licensing: {
    copyrightNotice: string;
    imageLicenseUrl: string;
    acquireLicensePage: string;
  };
  seo: {
    defaultTitle: string;
    defaultDescription: string;
    organizationType: "Organization" | "NewsMediaOrganization";
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function locale(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? fallback;
  } catch {
    return fallback;
  }
}

function timezone(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  try {
    new Intl.DateTimeFormat("und", { timeZone: value }).format();
    return value;
  } catch {
    return fallback;
  }
}

function publicTokenOverrides(value: unknown) {
  const source = record(value);
  const colors = new Set([
    "background", "surface", "text", "mutedText", "mutedTextSoft", "accent", "accentStrong", "link", "border", "borderStrong"
  ]);
  const fonts = new Set(["fontDisplay", "fontHeadline", "fontBody", "fontUI", "fontEditorial"]);
  const lengths = new Set(["contentWidth", "articleWidth", "radiusSmall", "radiusMedium"]);

  return Object.fromEntries(Object.entries(source).filter(([key, candidate]) => {
    if (typeof candidate !== "string") return false;
    if (colors.has(key)) return /^#[0-9a-f]{6}$/i.test(candidate);
    if (fonts.has(key)) return /^[A-Za-z0-9 '".,_-]{1,200}$/.test(candidate);
    if (lengths.has(key)) return /^\d+(?:\.\d+)?(?:px|rem|em|ch|vw|%)$/.test(candidate);
    return key === "density" && ["compact", "comfortable", "spacious"].includes(candidate);
  })) as Record<string, string>;
}

function asset(value: unknown, fallback: BylinePublicationAsset): BylinePublicationAsset {
  const candidate = record(value);
  const dimension = (size: unknown, defaultSize: number | null) =>
    typeof size === "number" && Number.isInteger(size) && size > 0 ? size : defaultSize;

  return {
    url: text(candidate.url, fallback.url),
    alt: typeof candidate.alt === "string" ? candidate.alt : fallback.alt,
    width: dimension(candidate.width, fallback.width),
    height: dimension(candidate.height, fallback.height)
  };
}

export function normalizePublicationConfig(value: unknown, fallback: BylinePublicationConfig): BylinePublicationConfig {
  const candidate = record(value);
  if (candidate.schemaVersion !== BYLINE_PUBLICATION_SCHEMA_VERSION) return fallback;

  const identity = record(candidate.identity);
  const location = record(candidate.location);
  const urls = record(candidate.urls);
  const branding = record(candidate.branding);
  const appearance = record(candidate.appearance);
  const licensing = record(candidate.licensing);
  const seo = record(candidate.seo);

  const navigation = Array.isArray(candidate.navigation)
    ? candidate.navigation.flatMap((entry): BylineNavigationItem[] => {
        const item = record(entry);
        if (typeof item.label !== "string" || typeof item.url !== "string") return [];
        const locations = Array.isArray(item.locations)
          ? item.locations.filter((location): location is "header" | "footer" => location === "header" || location === "footer")
          : [];
        return [{
          label: item.label,
          url: item.url,
          locations: [...new Set(locations)],
          ...(typeof item.group === "string" && item.group ? { group: item.group } : {}),
          ...(typeof item.feature === "string" && item.feature ? { feature: item.feature } : {})
        }];
      })
    : fallback.navigation;

  const sections = Array.isArray(candidate.sections)
    ? candidate.sections.flatMap((entry) => {
        const item = record(entry);
        return typeof item.name === "string" && typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)
          ? [{
              name: item.name,
              slug: item.slug,
              description: typeof item.description === "string" ? item.description : "",
              active: typeof item.active === "boolean" ? item.active : true
            }]
          : [];
      })
    : appearance.theme === "weekly-wildcat" ? fallback.sections : [];

  const social = Array.isArray(candidate.social)
    ? candidate.social.flatMap((entry) => {
        const item = record(entry);
        return typeof item.service === "string" && typeof item.label === "string" && typeof item.url === "string"
          ? [{ service: item.service, label: item.label, url: item.url }]
          : [];
      })
    : fallback.social;

  return {
    schemaVersion: BYLINE_PUBLICATION_SCHEMA_VERSION,
    revision: nonNegativeInteger(candidate.revision, fallback.revision),
    identity: {
      name: text(identity.name, fallback.identity.name),
      shortName: text(identity.shortName, fallback.identity.shortName),
      description: text(identity.description, fallback.identity.description),
      organizationName: text(identity.organizationName, fallback.identity.organizationName),
      tagline: text(identity.tagline, fallback.identity.tagline)
    },
    location: {
      display: text(location.display, fallback.location.display),
      city: text(location.city, fallback.location.city),
      region: text(location.region, fallback.location.region),
      country: text(location.country, fallback.location.country),
      address: text(location.address, fallback.location.address)
    },
    locale: locale(candidate.locale, fallback.locale),
    timezone: timezone(candidate.timezone, fallback.timezone),
    urls: {
      publicSite: text(urls.publicSite, fallback.urls.publicSite),
      cms: text(urls.cms, fallback.urls.cms),
      contact: text(urls.contact, fallback.urls.contact)
    },
    branding: {
      masthead: asset(branding.masthead, fallback.branding.masthead),
      logo: asset(branding.logo, fallback.branding.logo),
      organizationLogo: asset(branding.organizationLogo, fallback.branding.organizationLogo),
      icons: Array.isArray(branding.icons)
        ? branding.icons.map((icon, index) => asset(icon, fallback.branding.icons[index] ?? fallback.branding.logo))
        : fallback.branding.icons,
      defaultSocialImage: asset(branding.defaultSocialImage, fallback.branding.defaultSocialImage)
    },
    appearance: {
      theme: text(appearance.theme, fallback.appearance.theme),
      tokenOverrides: publicTokenOverrides(appearance.tokenOverrides)
    },
    sections,
    navigation,
    social,
    features: Object.fromEntries(
      Object.entries(record(candidate.features)).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
    ),
    licensing: {
      copyrightNotice: text(licensing.copyrightNotice, fallback.licensing.copyrightNotice),
      imageLicenseUrl: text(licensing.imageLicenseUrl, fallback.licensing.imageLicenseUrl),
      acquireLicensePage: text(licensing.acquireLicensePage, fallback.licensing.acquireLicensePage)
    },
    seo: {
      defaultTitle: text(seo.defaultTitle, fallback.seo.defaultTitle),
      defaultDescription: text(seo.defaultDescription, fallback.seo.defaultDescription),
      organizationType: seo.organizationType === "NewsMediaOrganization" ? "NewsMediaOrganization" : "Organization"
    }
  };
}

export function getPublicationNavigation(
  publication: BylinePublicationConfig,
  location: "header" | "footer"
) {
  return publication.navigation.filter(
    (item) => item.locations.includes(location) && (!item.feature || publication.features[item.feature] !== false)
  );
}
