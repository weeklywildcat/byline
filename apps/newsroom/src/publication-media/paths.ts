import path from "node:path";

/**
 * The newsroom's two persistent storage roots, resolved one way for every
 * process: the Next server, the separate Jobs worker (`jobs:media`), the
 * Payload CLI and tests.
 *
 * - `BYLINE_MEDIA_LOCAL_DIR`: Payload's private uploads (originals and the
 *   Library preview). Never read by the build endpoint.
 * - `BYLINE_PUBLICATION_MEDIA_DIR`: prepared, public-safe publication files
 *   (`objects/<aa>/<sha256>`) and their staging area.
 *
 * Absolute paths are used as given (production mounts volumes). A relative
 * path is resolved from the newsroom app directory, never from whatever the
 * process's working directory happens to be, so a worker started from the
 * repository root still finds the same files as the web process.
 *
 * Keep this resolver purely lexical. This module is imported by Payload's
 * config, so probing the filesystem here makes Turbopack trace the directories
 * being probed into every server output.
 */
const DEFAULT_MEDIA_DIR = "media";
const DEFAULT_PUBLICATION_DIR = "publication-media";
const NEWSROOM_PATH = path.join("apps", "newsroom");

/**
 * The `apps/newsroom` directory.
 *
 * npm workspace scripts normally run with this directory as cwd. Commands can
 * also be started from the repository root (or a child of apps/newsroom), so
 * recover the same root from the path string without touching the filesystem.
 */
export function newsroomAppRoot(cwd = process.cwd()): string {
  const normalized = path.normalize(cwd);
  const marker = `${path.sep}${NEWSROOM_PATH}`;
  const markerIndex = normalized.lastIndexOf(marker);

  if (markerIndex >= 0) {
    const end = markerIndex + marker.length;
    if (end === normalized.length || normalized[end] === path.sep) {
      return normalized.slice(0, end);
    }
  }

  if (normalized === NEWSROOM_PATH) return normalized;
  return path.join(normalized, NEWSROOM_PATH);
}

function resolveDir(value: string | undefined, fallback: string, cwd?: string) {
  const configured = value?.trim() || fallback;
  return path.isAbsolute(configured) ? path.normalize(configured) : path.join(newsroomAppRoot(cwd), configured);
}

/** Payload's private upload directory (Media `staticDir`). */
export function privateMediaDir(env: Record<string, string | undefined> = process.env, cwd?: string) {
  return resolveDir(env.BYLINE_MEDIA_LOCAL_DIR, DEFAULT_MEDIA_DIR, cwd);
}

/** The prepared publication store's root. */
export function publicationMediaDir(env: Record<string, string | undefined> = process.env, cwd?: string) {
  return resolveDir(env.BYLINE_PUBLICATION_MEDIA_DIR, DEFAULT_PUBLICATION_DIR, cwd);
}
