const DEFAULT_WP_API_URL = "https://cms.weeklywildcat.com/wp-json/wp/v2";
const BYLINE_API_NAMESPACE = "byline/v1";
const LEGACY_API_NAMESPACE = "weekly-wildcat/v1";

/**
 * Client-safe URL helpers for the public WordPress APIs.
 *
 * Keep this module free of build-time filesystem/media helpers: it is also
 * imported by browser-only telemetry and must remain safe in a static export.
 */
export function getWordPressApiUrl() {
  return (process.env.NEXT_PUBLIC_WP_API_URL || DEFAULT_WP_API_URL).replace(/\/$/, "");
}

export function getNamespaceApiUrl(namespace: string) {
  return getWordPressApiUrl().replace(/\/wp\/v2$/, `/${namespace}`);
}

export function getBylineRestUrl(path = "", legacy = false) {
  const suffix = path ? `/${path.replace(/^\//, "")}` : "";

  return `${getNamespaceApiUrl(legacy ? LEGACY_API_NAMESPACE : BYLINE_API_NAMESPACE)}${suffix}`;
}
