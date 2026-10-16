// Pages rendered by code (src/pages/<slug>.astro) instead of from the CMS page of
// the same slug. The catch-all route skips them and the route manifest lists them
// as fixed routes, so they are generated whether or not the CMS has a matching page.
export const CODE_ROUTED_PAGE_SLUGS: readonly string[] = ["about", "join", "diversity-inclusion"];
