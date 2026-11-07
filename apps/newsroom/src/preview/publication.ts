/**
 * The publication facts Live Preview's article needs (the "<Short name> Staff"
 * fallback byline, the tip line's contact link, the date locale and the
 * public site's origin for share links). The public site reads the same facts
 * from its publication config; until publication settings move into Payload,
 * the newsroom reads the same `BYLINE_PUBLICATION_JSON` when it is set and
 * Weekly Wildcat's values otherwise.
 */
export type PreviewPublication = {
  shortName: string;
  contactHref: string;
  locale: string;
  publicSite: string;
};

const WEEKLY_WILDCAT: PreviewPublication = {
  shortName: "Weekly Wildcat",
  contactHref: "/contact/",
  locale: "en-US",
  publicSite: "https://weeklywildcat.com"
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const string = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

export function previewPublication(env: Record<string, string | undefined> = process.env): PreviewPublication {
  let config: Record<string, unknown> = {};
  try {
    config = record(env.BYLINE_PUBLICATION_JSON ? JSON.parse(env.BYLINE_PUBLICATION_JSON) : {});
  } catch {
    config = {};
  }
  const identity = record(config.identity);
  const urls = record(config.urls);
  return {
    shortName: string(identity.shortName, WEEKLY_WILDCAT.shortName),
    contactHref: string(urls.contact, WEEKLY_WILDCAT.contactHref),
    locale: string(config.locale, WEEKLY_WILDCAT.locale),
    publicSite: string(env.BYLINE_PUBLIC_SITE_URL ?? urls.publicSite, WEEKLY_WILDCAT.publicSite).replace(/\/$/, "")
  };
}
