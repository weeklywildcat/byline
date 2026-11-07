import { existsSync, readFileSync } from "node:fs";
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
 */
const DEFAULT_MEDIA_DIR = "media";
const DEFAULT_PUBLICATION_DIR = "publication-media";

function isNewsroomPackage(dir: string) {
  const file = path.join(dir, "package.json");
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name === "@byline/newsroom";
  } catch {
    return false;
  }
}

let cachedRoot: string | null = null;

/** The `apps/newsroom` directory: found from the working directory (up, or down from the repository root). */
export function newsroomAppRoot(cwd = process.cwd()): string {
  if (cwd === process.cwd() && cachedRoot) return cachedRoot;
  let found: string | null = null;
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (isNewsroomPackage(dir)) { found = dir; break; }
    const nested = path.join(dir, "apps", "newsroom");
    if (isNewsroomPackage(nested)) { found = nested; break; }
    if (path.dirname(dir) === dir) break;
  }
  const root = found ?? path.resolve(cwd);
  if (cwd === process.cwd()) cachedRoot = root;
  return root;
}

function resolveDir(value: string | undefined, fallback: string, cwd?: string) {
  const configured = value?.trim() || fallback;
  return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(newsroomAppRoot(cwd), configured);
}

/** Payload's private upload directory (Media `staticDir`). */
export function privateMediaDir(env: Record<string, string | undefined> = process.env, cwd?: string) {
  return resolveDir(env.BYLINE_MEDIA_LOCAL_DIR, DEFAULT_MEDIA_DIR, cwd);
}

/** The prepared publication store's root. */
export function publicationMediaDir(env: Record<string, string | undefined> = process.env, cwd?: string) {
  return resolveDir(env.BYLINE_PUBLICATION_MEDIA_DIR, DEFAULT_PUBLICATION_DIR, cwd);
}
