// Pages rendered by code (src/pages/<slug>.astro) instead of from the CMS page of
// the same slug. The catch-all route skips them and the route manifest lists them
// as fixed routes, so they are generated whether or not the CMS has a matching page.
export const CODE_ROUTED_PAGE_SLUGS: readonly string[] = ["about", "join", "diversity-inclusion"];

// Retired CMS pages that now live somewhere else. Each old URL stays up as a
// permanent redirect and is never a page, sitemap entry, or search result.
// /media-assets/ was two logo downloads that the Media Kit already offers.
export const REDIRECTED_PAGE_SLUGS: Readonly<Record<string, string>> = {
  "media-assets": "/media-kit/"
};
