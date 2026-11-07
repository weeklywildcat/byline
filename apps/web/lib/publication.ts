import { getPublicationNavigation, normalizePublicationConfig } from "@byline/core";
import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";

export { WEEKLY_WILDCAT_PUBLICATION };

function configuredPublication(): unknown {
  const serialized = process.env.BYLINE_PUBLICATION_JSON;
  if (!serialized) return WEEKLY_WILDCAT_PUBLICATION;

  try {
    return JSON.parse(serialized);
  } catch {
    return WEEKLY_WILDCAT_PUBLICATION;
  }
}

const publication = normalizePublicationConfig(configuredPublication(), WEEKLY_WILDCAT_PUBLICATION);
publication.appearance = { theme: "weekly-wildcat", tokenOverrides: {} };
// /sports/ only redirects to the fixed sports archive. Navigation saved before
// the archive retirement still points there, so send it to current coverage.
publication.navigation = publication.navigation.map((item) =>
  item.url === "/sports/" ? { ...item, url: "/category/sports/" } : item
);

export function getPublicationConfig() {
  return publication;
}

export function getNavigation(location: "header" | "footer") {
  return getPublicationNavigation(publication, location);
}
