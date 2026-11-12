import { getPublicationNavigation, type BylinePublicationConfig } from "@byline/core";
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
  /** The Minimal site navigation Live Preview draws for a story that asks for it, from the same configuration the public header reads. */
  siteNavigation: {
    name: string;
    /** Absolute: Preview runs on the newsroom's origin, the artwork lives on the public site. */
    homeHref: string;
    logoUrl: string;
    searchHref: string;
    sections: Array<{ label: string; url: string }>;
    secondary: Array<{ label: string; url: string }>;
  };
};

export function previewPublicationFrom(config: BylinePublicationConfig): PreviewPublication {
  const publicSite = config.urls.publicSite.replace(/\/$/, "");
  const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${publicSite}${path}`);
  const link = ({ label, url }: { label: string; url: string }) => ({ label, url: absolute(url) });
  return {
    siteNavigation: {
      name: config.identity.name,
      homeHref: `${publicSite}/`,
      logoUrl: absolute(config.branding.masthead.url),
      searchHref: `${publicSite}/search/`,
      sections: getPublicationNavigation(config, "header").map(link),
      secondary: getPublicationNavigation(config, "footer").filter((item) => item.group === "About").map(link)
    },
    shortName: config.identity.shortName,
    contactHref: config.urls.contact,
    locale: config.locale,
    publicSite,
    timeZone: config.timezone
  };
}

/** Weekly Wildcat's canonical facts (tests and the signed-out shell). */
export const DEFAULT_PREVIEW_PUBLICATION = previewPublicationFrom(WEEKLY_WILDCAT_PUBLICATION);

export async function loadPreviewPublication(payload: Payload): Promise<PreviewPublication> {
  return previewPublicationFrom(publicationConfigFromGlobal(await readPublishedPublication(payload), 0));
}
