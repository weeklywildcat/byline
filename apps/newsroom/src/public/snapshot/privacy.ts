import { privateMediaDir, publicationMediaDir } from "../../publication-media/paths";
import { PublicSnapshotError } from "./errors";

/**
 * A sentinel layer AFTER the explicit projection (which is the real privacy
 * boundary): a snapshot may never name private newsroom infrastructure or
 * carry a known private field. (`socials.email` is the Person's explicit
 * public email; `urls.contact` is the public contact page.) It catches a projection bug before it can be
 * promoted; it is not a substitute for allowlisting.
 */
export const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "brief", "resources", "createdBy", "uploadedBy", "linkedPerson", "accounts", "googleSubject", "discordUserId",
  "sessions", "hash", "salt", "resetPasswordToken", "publicationAssets", "sourceHash", "failureMessage", "legacySource",
  "plan", "workflow", "deadline", "editor", "members", "lead", "interviews", "tasks", "phone",
  "folder", "previewSrc", "sourceNotes", "storagePath", "originalUrl", "previewUrl", "lexical", "blockType", "blockName", "root", "editorialNotes", "assignedEditor", "appointments", "sources", "storyPlan", "voterKey", "buildToken", "accountPreferences",
  // The private Google Analytics connection (docs/google-analytics.md): only `publication.analytics`' Measurement ID and tag behavior are public.
  "encryptedRefreshToken", "refreshToken", "accessToken", "grantedScopes", "googleAccountEmail", "accountResource", "accountDisplayName",
  "propertyResource", "propertyDisplayName", "propertyTimeZone", "propertyId", "streamResource", "streamDisplayName", "streamDefaultUri",
  "trackingMode", "connectedBy", "connectedAt", "lastVerifiedAt", "lastSuccessfulRequestAt", "lastErrorCode"
]);

const FORBIDDEN_TEXT = ["/api/media/file/", "/api/byline/", "/admin/collections/", "/preview/story"];

/** Throws `invalid-projection` naming the first private key or infrastructure reference found. */
export function assertPublicSafe(snapshot: unknown, json: string, env: Record<string, string | undefined> = process.env): void {
  const fail = (detail: string) => {
    throw new PublicSnapshotError("invalid-projection", `The public snapshot would expose private newsroom data: ${detail}.`);
  };
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) fail(`field "${key}" at ${path}`);
        visit(entry, `${path}.${key}`);
      }
    }
  };
  visit(snapshot, "$");
  const needles = [...FORBIDDEN_TEXT, privateMediaDir(env), publicationMediaDir(env)];
  const token = env.BYLINE_BUILD_TOKEN;
  if (token && token.length >= 16) needles.push(token);
  const deployHook = env.BYLINE_DEPLOY_HOOK_URL?.trim();
  if (deployHook) needles.push(deployHook);
  // Integration secrets: the encryption key and the Google OAuth client secret never belong in a snapshot.
  const integration = [env.BYLINE_INTEGRATIONS_SECRET?.trim(), env.BYLINE_GOOGLE_CLIENT_SECRET?.trim()].filter((value): value is string => Boolean(value && value.length >= 16));
  needles.push(...integration);
  for (const needle of needles) {
    if (!needle || !json.includes(needle)) continue;
    if (needle === token) fail("the build credential");
    if (needle === deployHook) fail("the deploy-hook credential");
    if (integration.includes(needle)) fail("an integration secret");
    fail(`a private reference (${needle.startsWith("/") && needle.length > 30 ? "a newsroom storage path" : needle})`);
  }
}
