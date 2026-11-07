import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "out");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** The export is static-only and its public configuration carries no private fields. */
export async function verifyExportBoundary(root) {
  for (const required of ["index.html", "_byline/manifest.json", "_byline/publication.json", "_byline/search-index.json"]) {
    if (!(await exists(path.join(root, required)))) throw new Error(`Static export is missing ${required}.`);
  }

  if (await exists(path.join(root, "api"))) {
    const apiStat = await stat(path.join(root, "api"));
    if (apiStat.isDirectory()) throw new Error("Static export unexpectedly contains a server API directory.");
  }

  const manifest = JSON.parse(await readFile(path.join(root, "_byline", "manifest.json"), "utf8"));
  if (manifest.protocolVersion !== 1 || manifest.publicationSchemaVersion !== 1) {
    throw new Error("Static export manifest uses unsupported Byline compatibility versions.");
  }

  const publication = JSON.parse(await readFile(path.join(root, "_byline", "publication.json"), "utf8"));
  const allowedPublicationKeys = [
    "schemaVersion", "revision", "identity", "location", "locale", "timezone", "urls", "branding",
    "appearance", "sections", "navigation", "social", "features", "licensing", "seo"
  ];
  for (const key of Object.keys(publication)) {
    if (!allowedPublicationKeys.includes(key)) throw new Error(`Public export contains unexpected publication field ${key}.`);
  }

  assertNoSecretKeys(publication);
}

function assertNoSecretKeys(value, pathParts = []) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    const isSafeSemanticTokenMap = nextPath.join(".") === "appearance.tokenOverrides";
    if (!isSafeSemanticTokenMap && /(?:secret|password|token|privateKey|deployHook|accessKey|apiKey)/i.test(key)) {
      throw new Error(`Public export contains secret-like field ${nextPath.join(".")}.`);
    }
    assertNoSecretKeys(child, nextPath);
  }
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * Prepared publication media (docs/publication-media.md): every file under
 * `_byline/media/` must be named by its own bytes (directory and fingerprint
 * from its SHA-256), fit Cloudflare's static file limit, and, for images,
 * carry no EXIF/XMP metadata: prepared outputs are re-encoded, so a camera
 * original copied there would fail. Acquisition staging must be gone.
 */
const MEDIA_FILE = /^_byline\/media\/(images|documents|audio)\/([0-9a-f]{2})\/[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--([0-9a-f]{16})\.(webp|jpg|pdf|mp3|m4a|wav)$/;
const STATIC_ASSET_MAX_BYTES = 25 * 1024 * 1024;

/** True when a JPEG has an EXIF/XMP APP1 segment or a WebP has an EXIF/XMP chunk. */
export function carriesImageMetadata(data, kind) {
  if (kind === "jpg") {
    let offset = 2;
    while (offset + 4 <= data.length && data[offset] === 0xff) {
      const marker = data[offset + 1];
      if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
      const length = data.readUInt16BE(offset + 2);
      if (marker === 0xe1) {
        const id = data.subarray(offset + 4, offset + 4 + 29).toString("latin1");
        if (id.startsWith("Exif\0") || id.startsWith("http://ns.adobe.com/xap/")) return true;
      }
      offset += 2 + length;
    }
    return false;
  }
  let offset = 12;
  while (offset + 8 <= data.length) {
    const fourcc = data.subarray(offset, offset + 4).toString("latin1");
    if (fourcc === "EXIF" || fourcc === "XMP ") return true;
    const size = data.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  return false;
}
export async function verifyPublicationMedia(root) {
  for (const entry of await readdir(path.join(root, "_byline")).catch(() => [])) {
    if (entry.startsWith(".media-staging")) throw new Error(`Static export contains publication media staging (${entry}).`);
  }
  const mediaRoot = path.join(root, "_byline", "media");
  if (!(await exists(mediaRoot))) return 0;
  let count = 0;
  for await (const file of walk(mediaRoot)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const match = MEDIA_FILE.exec(relative);
    if (!match) throw new Error(`Unexpected file in publication media: ${relative}`);
    const data = await readFile(file);
    if (data.length > STATIC_ASSET_MAX_BYTES) throw new Error(`${relative} is larger than the static asset limit.`);
    const sha = createHash("sha256").update(data).digest("hex");
    if (sha.slice(0, 2) !== match[2] || !sha.startsWith(match[3])) throw new Error(`${relative} does not match its content fingerprint.`);
    if ((match[4] === "jpg" || match[4] === "webp") && carriesImageMetadata(data, match[4])) {
      throw new Error(`${relative} carries camera metadata: only prepared publication files may be published.`);
    }
    count++;
  }
  return count;
}

/** The public output never contains the build credential, the build endpoint or a private newsroom file URL. */
export async function verifyNoPrivateNewsroomReferences(root, env = process.env) {
  const token = env.BYLINE_BUILD_TOKEN && env.BYLINE_BUILD_TOKEN.length >= 16 ? env.BYLINE_BUILD_TOKEN : null;
  const newsroom = env.BYLINE_NEWSROOM_URL ? env.BYLINE_NEWSROOM_URL.replace(/\/+$/, "") : null;
  let buildOrigin = null;
  try {
    buildOrigin = env.BYLINE_NEWSROOM_BUILD_URL ? new URL(env.BYLINE_NEWSROOM_BUILD_URL).origin : null;
  } catch {
    buildOrigin = null;
  }
  const forbidden = ["/api/byline/build/", "/api/media/file/", ...(newsroom ? [`${newsroom}/api/`, `${newsroom}/admin`] : []), ...(buildOrigin ? [`${buildOrigin}/api/`, `${buildOrigin}/admin`] : [])];
  for await (const file of walk(root)) {
    if (!/\.(html?|json|xml|txt|js|mjs|css|webmanifest|svg|rss|atom|map)$/i.test(file) && path.basename(file) !== "_headers" && path.basename(file) !== "_redirects") continue;
    const text = await readFile(file, "utf8");
    const relative = path.relative(root, file);
    if (token && text.includes(token)) throw new Error(`Static export leaks the build credential in ${relative}.`);
    for (const needle of forbidden) if (text.includes(needle)) throw new Error(`Static export references the private newsroom (${needle}) in ${relative}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyExportBoundary(output);
  const media = await verifyPublicationMedia(output);
  await verifyNoPrivateNewsroomReferences(output);
  console.log(`Verified static-only Byline export and public configuration boundary${media ? ` (${media} prepared media files)` : ""}.`);
}
