import type { BylinePublicationConfig } from "@byline/core";
import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";
import type { Payload } from "payload";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";

/**
 * The publication facts Live Preview's article needs: the "<Short name>
 * Staff" fallback byline, the tip line's contact link, the date locale, the
 * public site's origin for share links, and the timezone that dates the
 * article URL. They come from the same published `publication` Global the
 * public snapshot projects (Weekly Wildcat's canonical configuration until
 * it is first published), so Preview and the public site agree.
 */
export type PreviewPublication = {
  shortName: string;
  contactHref: string;
  locale: string;
  publicSite: string;
  timeZone: string;
};

export function previewPublicationFrom(config: BylinePublicationConfig): PreviewPublication {
  return {
    shortName: config.identity.shortName,
    contactHref: config.urls.contact,
    locale: config.locale,
    publicSite: config.urls.publicSite.replace(/\/$/, ""),
    timeZone: config.timezone
  };
}

/** Weekly Wildcat's canonical facts (tests and the signed-out shell). */
export const DEFAULT_PREVIEW_PUBLICATION = previewPublicationFrom(WEEKLY_WILDCAT_PUBLICATION);

export async function loadPreviewPublication(payload: Payload): Promise<PreviewPublication> {
  return previewPublicationFrom(publicationConfigFromGlobal(await readPublishedPublication(payload), 0));
}
