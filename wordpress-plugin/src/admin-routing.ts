export const ADMIN_PAGE_SLUGS = {
  dashboard: "byline",
  planning: "byline-planning",
  studio: "byline-studio",
  publication: "byline-publication",
  theme: "byline-theme",
  integrations: "byline-integrations",
  settings: "byline-settings",
  newsletters: "byline-newsletters",
  polls: "byline-polls"
} as const;

export type AdminPageSlug = (typeof ADMIN_PAGE_SLUGS)[keyof typeof ADMIN_PAGE_SLUGS];

export const PUBLICATION_TABS = ["identity", "branding", "navigation", "features", "social"] as const;
export const INTEGRATION_TABS = ["discord", "deployment"] as const;
export const SETTINGS_TABS = ["access", "api", "compatibility", "diagnostics"] as const;
export const PLANNING_TABS = ["stories", "calendar", "media", "coverage", "performance", "content-health", "feedback"] as const;
export const NEWSLETTER_TABS = ["issues", "settings"] as const;
export const STUDIO_VIEWS = ["editor", "revisions"] as const;

const knownPageSlugs = new Set<string>(Object.values(ADMIN_PAGE_SLUGS));

export function normalizeAdminPage(page: string | undefined) {
  return page && knownPageSlugs.has(page) ? page as AdminPageSlug : ADMIN_PAGE_SLUGS.dashboard;
}

export function normalizeAdminTab(page: string, tab: string | undefined) {
  const tabs = page === ADMIN_PAGE_SLUGS.publication
    ? PUBLICATION_TABS
    : page === ADMIN_PAGE_SLUGS.integrations
      ? INTEGRATION_TABS
      : page === ADMIN_PAGE_SLUGS.settings
        ? SETTINGS_TABS
        : page === ADMIN_PAGE_SLUGS.planning
          ? PLANNING_TABS
          : page === ADMIN_PAGE_SLUGS.newsletters
            ? NEWSLETTER_TABS
        : [];

  if (tabs.includes(tab as never)) return tab as string;
  return tabs[0] || "";
}

export function normalizeStudioView(view: string | undefined) {
  return STUDIO_VIEWS.includes(view as never) ? view as (typeof STUDIO_VIEWS)[number] : "editor";
}

export function adminScreenRoute(page: string, tab: string | undefined) {
  const normalizedPage = normalizeAdminPage(page);
  const normalizedTab = normalizeAdminTab(normalizedPage, tab);

  if (normalizedPage === ADMIN_PAGE_SLUGS.publication) return `/publication/${normalizedTab}`;
  if (normalizedPage === ADMIN_PAGE_SLUGS.theme) return "/design/theme";
  if (normalizedPage === ADMIN_PAGE_SLUGS.integrations) return `/integrations/${normalizedTab}`;
  if (normalizedPage === ADMIN_PAGE_SLUGS.settings) return `/advanced/${normalizedTab}`;
  if (normalizedPage === ADMIN_PAGE_SLUGS.planning) return `/planning/${normalizedTab}`;
  if (normalizedPage === ADMIN_PAGE_SLUGS.newsletters) return `/newsletters/${normalizedTab}`;
  if (normalizedPage === ADMIN_PAGE_SLUGS.polls) return "/content/polls";
  return "/dashboard";
}

/**
 * Keep this parser only for bookmarked links from the former hash-based SPA.
 * Native admin pages do not use hash state for primary navigation.
 */
export function normalizeAdminRoute(hash: string) {
  const route = hash.replace(/^#/, "");
  return route.startsWith("/") ? route : "/dashboard";
}

export type LegacyAdminDestination = {
  page: AdminPageSlug;
  tab?: string;
  view?: (typeof STUDIO_VIEWS)[number];
};

const legacyDestinations: Record<string, LegacyAdminDestination> = {
  "/dashboard": { page: ADMIN_PAGE_SLUGS.dashboard },
  "/planning/stories": { page: ADMIN_PAGE_SLUGS.planning, tab: "stories" },
  "/planning/calendar": { page: ADMIN_PAGE_SLUGS.planning, tab: "calendar" },
  "/planning/media": { page: ADMIN_PAGE_SLUGS.planning, tab: "media" },
  "/planning/coverage": { page: ADMIN_PAGE_SLUGS.planning, tab: "coverage" },
  "/planning/performance": { page: ADMIN_PAGE_SLUGS.planning, tab: "performance" },
  "/planning/content-health": { page: ADMIN_PAGE_SLUGS.planning, tab: "content-health" },
  "/planning/feedback": { page: ADMIN_PAGE_SLUGS.planning, tab: "feedback" },
  "/newsletters/issues": { page: ADMIN_PAGE_SLUGS.newsletters, tab: "issues" },
  "/newsletters/settings": { page: ADMIN_PAGE_SLUGS.newsletters, tab: "settings" },
  "/publication/identity": { page: ADMIN_PAGE_SLUGS.publication, tab: "identity" },
  "/publication/branding": { page: ADMIN_PAGE_SLUGS.publication, tab: "branding" },
  "/publication/navigation": { page: ADMIN_PAGE_SLUGS.publication, tab: "navigation" },
  "/publication/features": { page: ADMIN_PAGE_SLUGS.publication, tab: "features" },
  "/publication/social": { page: ADMIN_PAGE_SLUGS.publication, tab: "social" },
  "/design/theme": { page: ADMIN_PAGE_SLUGS.theme },
  "/design/studio": { page: ADMIN_PAGE_SLUGS.studio, view: "editor" },
  "/design/revisions": { page: ADMIN_PAGE_SLUGS.studio, view: "revisions" },
  "/content/polls": { page: ADMIN_PAGE_SLUGS.polls },
  "/integrations/discord": { page: ADMIN_PAGE_SLUGS.integrations, tab: "discord" },
  "/integrations/deployment": { page: ADMIN_PAGE_SLUGS.integrations, tab: "deployment" },
  "/advanced/access": { page: ADMIN_PAGE_SLUGS.settings, tab: "access" },
  "/advanced/api": { page: ADMIN_PAGE_SLUGS.settings, tab: "api" },
  "/advanced/compatibility": { page: ADMIN_PAGE_SLUGS.settings, tab: "compatibility" },
  "/advanced/diagnostics": { page: ADMIN_PAGE_SLUGS.settings, tab: "diagnostics" }
};

export function legacyHashDestination(hash: string): LegacyAdminDestination | null {
  if (!hash) return null;
  return legacyDestinations[normalizeAdminRoute(hash)] || legacyDestinations["/dashboard"];
}
