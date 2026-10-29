import type { Env } from "./types";
export function configuration(env: Env) {
  const publicUrl = new URL(env.PUBLIC_URL);
  const wordpress = new URL(env.WORDPRESS_URL);
  for (const url of [publicUrl, wordpress]) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Configure canonical HTTPS URLs");
  }
  if (
    publicUrl.pathname !== "/" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      env.APPLICATION_ID,
    )
  )
    throw new Error("Invalid MCP configuration");
  const keys = JSON.parse(env.CREDENTIAL_KEYS) as Record<string, string>;
  const activeKey = keys[env.ACTIVE_KEY_ID];
  if (typeof activeKey !== "string" || atob(activeKey).length !== 32)
    throw new Error("Configure a valid active credential encryption key");
  const origins = env.ALLOWED_ORIGINS.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const origin of origins)
    if (new URL(origin).origin !== origin || !origin.startsWith("https://"))
      throw new Error("Configure exact HTTPS origins");
  return {
    issuer: publicUrl.origin,
    resource: `${publicUrl.origin}/mcp`,
    wordpress: wordpress.href.replace(/\/$/, ""),
    origins,
  };
}
