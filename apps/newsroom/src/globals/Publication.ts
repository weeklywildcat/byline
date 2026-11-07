import { WEEKLY_WILDCAT_PUBLICATION as DEFAULTS } from "@byline/theme-weekly-wildcat/publication";
import type { Field, GlobalConfig } from "payload";
import { administratorsOnly, atLeast, newsroomUser } from "../access/user";
import { isSlug } from "../domain/slug";
import { publicationGlobalSlice } from "../public/slices";
import { trackPublicGlobalChanges } from "../public/revision";

/**
 * The publication's public configuration (`BylinePublicationConfig`,
 * `@byline/core`): identity, location, locale, timezone, public URLs,
 * branding, appearance, sections, navigation, social profiles, feature
 * switches, licensing and SEO defaults. Administrators only; edited through
 * the raw System screen until a Byline Publication Settings screen exists.
 *
 * Versions and drafts let an administrator stage a change. Only the
 * published Global is public: the snapshot reads the main row, a draft never
 * advances the public revision, and publishing a different configuration
 * does. Before it is first published, Weekly Wildcat's canonical
 * configuration (`@byline/theme-weekly-wildcat/publication`) applies, and it is
 * also every field's default.
 *
 * There is no `revision` field: the snapshot sets `publication.revision` to
 * the snapshot's public revision. `urls.cms` is the publication's public CMS
 * fact, never the private newsroom's own address. No secret belongs here.
 */
export const PUBLICATION_GLOBAL = "publication";

const tracking = trackPublicGlobalChanges(PUBLICATION_GLOBAL, publicationGlobalSlice);

const text = (name: string, defaultValue: string, maxLength: number, extra: Record<string, unknown> = {}): Field => ({ name, type: "text", required: true, defaultValue, maxLength, ...extra }) as Field;

function validUrl(value: unknown, options: { relative?: boolean } = {}): true | string {
  if (typeof value !== "string" || !value.trim()) return "Required.";
  if (options.relative && value.startsWith("/") && !value.startsWith("//")) return true;
  return /^https?:\/\/[^\s]+$/i.test(value) ? true : options.relative ? "Use a path starting with / or an http(s) URL." : "Use an http(s) URL.";
}

function asset(name: string, label: string, value: { url: string; alt: string; width: number | null; height: number | null }): Field {
  return {
    name,
    label,
    type: "group",
    fields: [
      { name: "url", type: "text", required: true, defaultValue: value.url, validate: (input: unknown) => validUrl(input, { relative: true }) },
      { name: "alt", type: "text", defaultValue: value.alt, maxLength: 200 },
      { type: "row", fields: [
        { name: "width", type: "number", min: 1, defaultValue: value.width ?? undefined },
        { name: "height", type: "number", min: 1, defaultValue: value.height ?? undefined }
      ] }
    ]
  };
}

export const FEATURE_SWITCHES = ["sports", "events", "polls", "newsletter", "discord"] as const;

export const Publication: GlobalConfig = {
  slug: PUBLICATION_GLOBAL,
  label: "Publication",
  admin: { group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: { read: administratorsOnly, readVersions: administratorsOnly, update: administratorsOnly },
  versions: { max: 50, drafts: { autosave: false, validate: true } },
  hooks: { beforeChange: [tracking.beforeChange], afterChange: [tracking.afterChange] },
  fields: [
    {
      name: "identity",
      type: "group",
      fields: [
        text("name", DEFAULTS.identity.name, 120),
        text("shortName", DEFAULTS.identity.shortName, 50),
        { name: "description", type: "textarea", required: true, defaultValue: DEFAULTS.identity.description, maxLength: 320 },
        text("organizationName", DEFAULTS.identity.organizationName, 160),
        text("tagline", DEFAULTS.identity.tagline, 200)
      ]
    },
    {
      name: "location",
      type: "group",
      fields: [
        text("display", DEFAULTS.location.display, 120),
        text("city", DEFAULTS.location.city, 120),
        text("region", DEFAULTS.location.region, 120),
        text("country", DEFAULTS.location.country, 2, { admin: { description: "ISO 3166-1 alpha-2, e.g. US." } }),
        text("address", DEFAULTS.location.address, 240)
      ]
    },
    {
      type: "row",
      fields: [
        text("locale", DEFAULTS.locale, 35, { validate: (value: unknown) => { try { return typeof value === "string" && Intl.getCanonicalLocales(value).length === 1 ? true : "Use a BCP 47 locale, e.g. en-US."; } catch { return "Use a BCP 47 locale, e.g. en-US."; } } }),
        text("timezone", DEFAULTS.timezone, 60, {
          admin: { description: "IANA timezone. Article dates and URLs use it." },
          validate: (value: unknown) => { try { new Intl.DateTimeFormat("en", { timeZone: String(value) }); return true; } catch { return "Use an IANA timezone, e.g. America/New_York."; } }
        })
      ]
    },
    {
      name: "urls",
      label: "Public URLs",
      type: "group",
      fields: [
        { name: "publicSite", type: "text", required: true, defaultValue: DEFAULTS.urls.publicSite, validate: (value: unknown) => validUrl(value) },
        { name: "cms", label: "Public CMS URL", type: "text", required: true, defaultValue: DEFAULTS.urls.cms, validate: (value: unknown) => validUrl(value), admin: { description: "The publication's public CMS address as readers' tools know it. Not the private newsroom." } },
        { name: "contact", type: "text", required: true, defaultValue: DEFAULTS.urls.contact, validate: (value: unknown) => validUrl(value, { relative: true }) }
      ]
    },
    {
      name: "branding",
      type: "group",
      fields: [
        asset("masthead", "Masthead", DEFAULTS.branding.masthead),
        asset("logo", "Logo", DEFAULTS.branding.logo),
        asset("organizationLogo", "Organization logo", DEFAULTS.branding.organizationLogo),
        {
          name: "icons",
          type: "array",
          maxRows: 12,
          defaultValue: DEFAULTS.branding.icons.map((icon) => ({ ...icon, width: icon.width ?? undefined, height: icon.height ?? undefined })),
          fields: [
            { name: "url", type: "text", required: true, validate: (input: unknown) => validUrl(input, { relative: true }) },
            { name: "alt", type: "text", maxLength: 200 },
            { type: "row", fields: [{ name: "width", type: "number", min: 1 }, { name: "height", type: "number", min: 1 }] }
          ]
        },
        asset("defaultSocialImage", "Default social image", DEFAULTS.branding.defaultSocialImage)
      ]
    },
    {
      name: "appearance",
      type: "group",
      admin: { description: "Byline uses the Weekly Wildcat theme only; there are no generic themes or token overrides." },
      fields: [{ name: "theme", type: "select", required: true, defaultValue: "weekly-wildcat", options: [{ value: "weekly-wildcat", label: "Weekly Wildcat" }] }]
    },
    {
      name: "sections",
      label: "Section descriptions",
      type: "array",
      maxRows: 30,
      defaultValue: DEFAULTS.sections,
      fields: [
        { type: "row", fields: [
          { name: "name", type: "text", required: true, maxLength: 80 },
          { name: "slug", type: "text", required: true, validate: (value: unknown) => (isSlug(value) ? true : "Use lowercase letters, numbers and hyphens.") },
          { name: "active", type: "checkbox", defaultValue: true }
        ] },
        { name: "description", type: "textarea", maxLength: 240 }
      ]
    },
    {
      name: "navigation",
      type: "array",
      maxRows: 30,
      defaultValue: DEFAULTS.navigation,
      fields: [
        { type: "row", fields: [
          { name: "label", type: "text", required: true, maxLength: 60 },
          { name: "url", type: "text", required: true, validate: (value: unknown) => validUrl(value, { relative: true }) }
        ] },
        { type: "row", fields: [
          { name: "locations", type: "select", hasMany: true, required: true, options: [{ value: "header", label: "Header" }, { value: "footer", label: "Footer" }] },
          { name: "group", type: "text", maxLength: 40 },
          { name: "feature", type: "select", options: FEATURE_SWITCHES.map((value) => ({ value, label: value })), admin: { description: "Hidden when this feature is off." } }
        ] }
      ]
    },
    {
      name: "social",
      label: "Social profiles",
      type: "array",
      maxRows: 20,
      defaultValue: DEFAULTS.social,
      fields: [{ type: "row", fields: [
        { name: "service", type: "text", required: true, maxLength: 40 },
        { name: "label", type: "text", required: true, maxLength: 60 },
        { name: "url", type: "text", required: true, validate: (value: unknown) => validUrl(value) }
      ] }]
    },
    {
      name: "features",
      type: "group",
      fields: FEATURE_SWITCHES.map((name): Field => ({ name, type: "checkbox", defaultValue: DEFAULTS.features[name] ?? false }))
    },
    {
      name: "licensing",
      type: "group",
      fields: [
        text("copyrightNotice", DEFAULTS.licensing.copyrightNotice, 200),
        { name: "imageLicenseUrl", type: "text", required: true, defaultValue: DEFAULTS.licensing.imageLicenseUrl, validate: (value: unknown) => validUrl(value, { relative: true }) },
        { name: "acquireLicensePage", type: "text", required: true, defaultValue: DEFAULTS.licensing.acquireLicensePage, validate: (value: unknown) => validUrl(value, { relative: true }) }
      ]
    },
    {
      name: "seo",
      label: "SEO",
      type: "group",
      fields: [
        text("defaultTitle", DEFAULTS.seo.defaultTitle, 120),
        { name: "defaultDescription", type: "textarea", required: true, defaultValue: DEFAULTS.seo.defaultDescription, maxLength: 320 },
        { name: "organizationType", type: "select", required: true, defaultValue: DEFAULTS.seo.organizationType, options: [{ value: "NewsMediaOrganization", label: "News media organization" }, { value: "Organization", label: "Organization" }] }
      ]
    }
  ]
};
