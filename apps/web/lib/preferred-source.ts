/**
 * Google's "Preferred sources" deeplink: a plain link that opens Google's
 * source-preference screen for a domain, with no script involved. See
 * https://developers.google.com/search/docs/appearance/preferred-sources
 *
 * Google only accepts a domain or subdomain here, never a path.
 */
export function getPreferredSourceUrl(siteUrl: string) {
  return `https://www.google.com/preferences/source?q=${encodeURIComponent(new URL(siteUrl).host)}`;
}
