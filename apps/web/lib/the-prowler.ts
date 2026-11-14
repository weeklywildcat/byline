/**
 * The Prowler is the Weekly Wildcat's satire section. Editors file a story in
 * the newsroom section with this slug; the public site then gives it the
 * section's own page and keeps it out of general news lists, feeds and the
 * Google News sitemap so a joke is never read as reporting.
 */
export const THE_PROWLER = {
  slug: "the-prowler",
  pageSlug: "the-prowler",
  name: "The Prowler",
  path: "/the-prowler/",
  description: "Satire from the Weekly Wildcat. None of it is real, and that's the point.",
  logo: { src: "/brand/the-prowler-logo.svg", width: 1700, height: 287 }
} as const;

/** True for the section's category archive address in any form the site links. */
export function isProwlerHref(href: string) {
  return href === THE_PROWLER.path || href === `/category/${THE_PROWLER.slug}/`;
}
