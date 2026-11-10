/**
 * The Byline newsroom's web app manifest, for Add to Home Screen (Safari,
 * iOS, iPadOS, macOS Add to Dock) and standalone launch. No service worker:
 * Safari no longer requires one, and offline app-shell support is a separate
 * project. The icons are the Weekly Wildcat's existing public icons, copied
 * to `public/app-icons` (a test keeps them identical to `apps/web/public`).
 */
export const WEB_APP_MANIFEST_PATH = "/admin/manifest.webmanifest";
export const WEB_APP_ICON_BASE = "/app-icons";
/** The light newsroom's page background (`--background` in packages/newsroom-ui/src/styles.css). */
export const WEB_APP_BACKGROUND = "#ffffff";

export function webAppManifest(adminRoute = "/admin") {
  return {
    id: adminRoute,
    name: "Byline — Weekly Wildcat",
    short_name: "Byline",
    description: "The Weekly Wildcat newsroom.",
    lang: "en-US",
    dir: "ltr",
    start_url: adminRoute,
    // The newsroom is the whole host: /admin screens, Field Mode, Live Preview and their /api calls.
    scope: "/",
    display: "standalone",
    background_color: WEB_APP_BACKGROUND,
    theme_color: WEB_APP_BACKGROUND,
    icons: [
      { src: `${WEB_APP_ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${WEB_APP_ICON_BASE}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  } as const;
}
