// Phase 0 spike of the site contract. Plain data and pure functions only:
// this module is loaded by plain Node (Payload CLI, scripts) as well as bundlers.

export const BYLINE_SITE_CONTRACT_VERSION = 1 as const;
/** The engine's own contract version, compared against a site's `requiresByline` range. */
export const BYLINE_ENGINE_CONTRACT_VERSION = 1 as const;

export type BylineSitePage = {
  /** Astro route pattern, e.g. "/join/". */
  pattern: string;
  /** Path to the page, relative to the site package root. */
  entry: string;
};

export type BylineSiteDescriptor = { id: string; kind: string; title: string };

export type BylineSiteConfig = {
  id: string;
  contractVersion: number;
  /** Inclusive range of engine contract versions this site supports. */
  requiresByline: { min: number; max: number };
  publication: { name: string; theme: string };
  /** Site-owned pages, injected into the public app. */
  pages: readonly BylineSitePage[];
  /** Engine routes a site turns off (to drop them, or to replace them with a page above). */
  routes: Readonly<Record<string, false>>;
  /** Directory of public assets, relative to the site package root. */
  assets?: string;
  /** Plain-data descriptors of everything `web` and `preview` register. */
  interactives: readonly BylineSiteDescriptor[];
};

export function defineSiteConfig<const T extends BylineSiteConfig>(config: T): T {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.id)) throw new Error(`Invalid Byline site id: ${config.id}`);
  return Object.freeze(config);
}

/** Every build calls this before doing work. */
export function assertSiteCompatible(config: BylineSiteConfig): void {
  if (config.contractVersion !== BYLINE_SITE_CONTRACT_VERSION) {
    throw new Error(`Site "${config.id}" uses site contract ${config.contractVersion}; this Byline supports ${BYLINE_SITE_CONTRACT_VERSION}.`);
  }
  const { min, max } = config.requiresByline;
  if (BYLINE_ENGINE_CONTRACT_VERSION < min || BYLINE_ENGINE_CONTRACT_VERSION > max) {
    throw new Error(`Site "${config.id}" requires Byline contract ${min} to ${max}; this is ${BYLINE_ENGINE_CONTRACT_VERSION}.`);
  }
}

/** A registry entry as a host loads it: the component plus lazy style and client loaders. */
export type BylineSiteEntry<Component> = {
  id: string;
  Component: Component;
  styles?: () => Promise<unknown>;
  client?: () => Promise<{ default: (root: HTMLElement) => void }>;
};
