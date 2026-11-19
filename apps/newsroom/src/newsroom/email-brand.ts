import type { Payload, PayloadRequest } from "payload";
import { DEFAULT_EMAIL_BRAND, EMAIL_LOGO, type EmailBrand } from "../domain/email-layout";
import { newsroomTimeZone } from "../domain/dates";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";

/** The newsroom's public origin (`BYLINE_NEWSROOM_URL`), without a trailing slash. */
export const newsroomOrigin = () => (process.env.BYLINE_NEWSROOM_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Who an email is from: the published Publication's name, site and
 * organization, and the logo the newsroom serves from `public/email`. Without
 * `BYLINE_NEWSROOM_URL` there is no absolute address for the logo, so the
 * masthead falls back to the name in type.
 */
export async function emailBrand(payload: Payload, req?: PayloadRequest): Promise<EmailBrand> {
  const origin = newsroomOrigin();
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload, req).catch(() => null), 0);
  return {
    name: publication.identity.name || DEFAULT_EMAIL_BRAND.name,
    homeUrl: origin ? `${origin}${payload.config.routes.admin}` : null,
    logo: origin ? { ...EMAIL_LOGO, light: `${origin}${EMAIL_LOGO.light}`, dark: `${origin}${EMAIL_LOGO.dark}` } : null,
    siteUrl: publication.urls.publicSite || null,
    organization: publication.identity.organizationName || null,
    // The newsroom serves the site's fonts at /fonts (public/fonts).
    fontUrl: origin ? `${origin}/fonts/mona-sans-latin.woff2` : null
  };
}

/** "Thursday, November 19" in the newsroom's timezone, for the masthead. */
export function emailDateline(now = new Date(), timeZone = newsroomTimeZone()): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(now);
}
