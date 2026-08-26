export function normalizeAdminRoute(hash: string) {
  const route = hash.replace(/^#/, "");
  return route.startsWith("/") ? route : "/dashboard";
}

export function isNavigationItemVisible(feature: string | undefined, features: Record<string, boolean>) {
  return !feature || Boolean(features[feature]);
}

