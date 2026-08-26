// Next's `output: export` refuses to build a dynamic route whose
// generateStaticParams() returns an empty array. That is correct for a broken
// build, but wrong for a publication that legitimately has no sports teams, no
// authors, or no categories yet.
//
// For those genuinely-empty cases we emit a single reserved placeholder param so
// the route can be built. The page itself must call notFound() for the
// placeholder, so the emitted file is the 404 body rather than a real-looking
// page. The slug is prefixed to keep it from ever colliding with CMS content and
// to make it obvious in an export listing.
export const BYLINE_EMPTY_ROUTE_SLUG = "__byline-empty__";

export function isBylineEmptyRouteSlug(value: string | undefined | null) {
  return value === BYLINE_EMPTY_ROUTE_SLUG;
}

// Returns the resolved params, or a single reserved placeholder when the
// publication has no rows for this route. Never masks a fetch failure: callers
// resolve their data through requireBuildData() before calling this.
export function withEmptyRouteFallback<T extends Record<string, string>>(params: T[], placeholder: T): T[] {
  return params.length > 0 ? params : [placeholder];
}
