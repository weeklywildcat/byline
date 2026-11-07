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
  "folder", "previewSrc", "sourceNotes", "storagePath", "originalUrl", "previewUrl", "lexical", "blockType", "blockName", "root", "editorialNotes", "assignedEditor", "appointments", "sources", "storyPlan", "voterKey", "buildToken", "accountPreferences"
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
  const newsroom = env.BYLINE_NEWSROOM_URL?.replace(/\/+$/, "");
  if (newsroom) needles.push(newsroom);
  for (const needle of needles) if (needle && json.includes(needle)) fail(needle === token ? "the build credential" : `a private reference (${needle.startsWith("/") && needle.length > 30 ? "a newsroom storage path" : needle})`);
}
