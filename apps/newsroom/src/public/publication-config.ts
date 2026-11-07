import { normalizePublicationConfig, type BylinePublicationConfig } from "@byline/core";
import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";
import type { Payload, PayloadRequest } from "payload";
import { FEATURE_SWITCHES, PUBLICATION_GLOBAL } from "../globals/Publication";

type Row = Record<string, unknown>;

const record = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(record) : []);
const dimension = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null);
const asset = (value: unknown) => {
  const item = record(value);
  return { url: String(item.url ?? ""), alt: typeof item.alt === "string" ? item.alt : "", width: dimension(item.width), height: dimension(item.height) };
};

/**
 * The published Publication Global as `BylinePublicationConfig`, through the
 * shared normalizer (so anything unexpected falls back field by field to the
 * canonical Weekly Wildcat values). Until the Global is first published, the
 * canonical configuration is the published one. `revision` is the caller's
 * public revision; appearance is always the Weekly Wildcat theme.
 */
export function publicationConfigFromGlobal(row: Row | null | undefined, revision: number): BylinePublicationConfig {
  const published = row && row._status === "published" ? row : null;
  const candidate = published
    ? {
        schemaVersion: 1,
        revision,
        identity: record(published.identity),
        location: record(published.location),
        locale: published.locale,
        timezone: published.timezone,
        urls: record(published.urls),
        branding: {
          masthead: asset(record(published.branding).masthead),
          logo: asset(record(published.branding).logo),
          organizationLogo: asset(record(published.branding).organizationLogo),
          icons: list(record(published.branding).icons).map(asset),
          defaultSocialImage: asset(record(published.branding).defaultSocialImage)
        },
        appearance: { theme: "weekly-wildcat", tokenOverrides: {} },
        sections: list(published.sections).map((section) => ({ name: section.name, slug: section.slug, description: section.description ?? "", active: section.active !== false })),
        navigation: list(published.navigation).map((item) => ({
          label: item.label,
          url: item.url,
          locations: Array.isArray(item.locations) ? item.locations : [],
          ...(item.group ? { group: item.group } : {}),
          ...(item.feature ? { feature: item.feature } : {})
        })),
        social: list(published.social).map((item) => ({ service: item.service, label: item.label, url: item.url })),
        features: Object.fromEntries(FEATURE_SWITCHES.map((name) => [name, record(published.features)[name] === true])),
        licensing: record(published.licensing),
        seo: record(published.seo)
      }
    : { ...WEEKLY_WILDCAT_PUBLICATION, revision };
  const config = normalizePublicationConfig(candidate, { ...WEEKLY_WILDCAT_PUBLICATION, revision });
  return { ...config, revision, appearance: { theme: "weekly-wildcat", tokenOverrides: {} } };
}

/** The published (main) Global, never a newer draft. */
export async function readPublishedPublication(payload: Payload, req?: PayloadRequest): Promise<Row | null> {
  const row = (await payload.db.findGlobal({ slug: PUBLICATION_GLOBAL, ...(req ? { req } : {}) })) as Row | null;
  return row ?? null;
}
