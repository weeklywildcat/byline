import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseReleaseBytes, releaseMatchesDescriptor, validatePublicDataSection, type DataReleaseDescriptor, type PublicDataSection } from "@byline/data";
import { dataPresentationRegistry } from "@byline/data-presentations/registry";

/**
 * Byline Data in the static build (docs/byline-data.md#the-build). Astro
 * renders a project's presentation from its release rows, so the build
 * materializes exactly the releases the snapshot names BEFORE rendering:
 *
 *   snapshot data.releases (descriptors)
 *     → GET <BYLINE_NEWSROOM_BUILD_URL>/data/<sha256>   (bearer token)
 *       or the fixture directory in a fixture build
 *     → verify byte length, SHA-256, canonical bytes, release schema and
 *       that the content is what the descriptor says
 *     → .byline-build/data/<sha256>.json   (atomic, the only local copy)
 *
 * Rendering reads only those files (lib/public-data.ts) and never the
 * newsroom. After Astro, the same exact files are copied to
 * out/_byline/data/<sha256>.json for presentations' optional client code.
 * Anything wrong is a hard failure: never a page with missing data.
 */

export class DataAcquisitionError extends Error {
  constructor(message: string) {
    super(`Byline Data acquisition failed: ${message}`);
    this.name = "DataAcquisitionError";
  }
}

export type DataSource =
  | { kind: "newsroom"; endpoint: string; token: string; fetch?: typeof fetch; timeoutMs?: number }
  | { kind: "fixture"; directory: string };

export type MaterializedData = { files: number; bytes: number; requests: number };

/** The build API's Data release endpoint for the configured newsroom (same origin and credential as the snapshot). */
export function buildDataEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/data`;
}

async function bytesFor(descriptor: DataReleaseDescriptor, source: DataSource, count: () => void): Promise<Buffer> {
  if (source.kind === "fixture") {
    return readFile(path.join(source.directory, `${descriptor.sha256}.json`)).catch(() => {
      throw new DataAcquisitionError(`the fixture release ${descriptor.sha256.slice(0, 12)}… of ${descriptor.dataset} is missing.`);
    });
  }
  count();
  let response: Response;
  try {
    response = await (source.fetch ?? fetch)(`${source.endpoint}/${descriptor.sha256}`, {
      headers: { Authorization: `Bearer ${source.token}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(source.timeoutMs ?? 60_000)
    });
  } catch (error) {
    throw new DataAcquisitionError(`the newsroom could not be reached for release ${descriptor.sha256.slice(0, 12)}… (${(error as Error).message}).`);
  }
  if (response.status === 401 || response.status === 403) throw new DataAcquisitionError(`the newsroom refused the build credential (HTTP ${response.status}).`);
  if (response.status !== 200) throw new DataAcquisitionError(`release ${descriptor.sha256.slice(0, 12)}… of ${descriptor.dataset} answered HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

/** Verifies one release's exact bytes against its descriptor. Returns the canonical text. */
export function verifyReleaseBytes(bytes: Buffer, descriptor: DataReleaseDescriptor): string {
  const name = `${descriptor.dataset} release ${descriptor.sha256.slice(0, 12)}…`;
  if (bytes.byteLength !== descriptor.bytes) throw new DataAcquisitionError(`${name} is ${bytes.byteLength} bytes, not ${descriptor.bytes}.`);
  if (createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) throw new DataAcquisitionError(`${name} does not match its SHA-256.`);
  const text = bytes.toString("utf8");
  let release;
  try {
    release = parseReleaseBytes(text);
  } catch (error) {
    throw new DataAcquisitionError(`${name} is invalid: ${(error as Error).message}`);
  }
  if (!releaseMatchesDescriptor(release, descriptor)) throw new DataAcquisitionError(`${name} does not contain what the snapshot describes.`);
  return text;
}

/**
 * Materializes every release a validated data section names into
 * `directory`, with bounded concurrency. Only those releases: never a
 * listing of the newsroom's store.
 */
export async function materializeDataReleases(section: PublicDataSection, source: DataSource, directory: string, concurrency = 4): Promise<MaterializedData> {
  await mkdir(directory, { recursive: true });
  let requests = 0;
  let total = 0;
  const queue = [...section.releases];
  const worker = async () => {
    for (let descriptor = queue.shift(); descriptor; descriptor = queue.shift()) {
      const bytes = await bytesFor(descriptor, source, () => requests++);
      verifyReleaseBytes(bytes, descriptor);
      const final = path.join(directory, `${descriptor.sha256}.json`);
      const temp = path.join(directory, `.tmp-${randomUUID()}`);
      await writeFile(temp, bytes);
      await rename(temp, final);
      total += bytes.byteLength;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));
  return { files: section.releases.length, bytes: total, requests };
}

/** The fixture build's Data: a committed section and its releases, validated against the fixture registry. */
export async function loadFixtureDataSection(projectRoot: string): Promise<{ section: PublicDataSection; directory: string }> {
  const root = path.join(projectRoot, "tests/fixtures/data");
  const registry = dataPresentationRegistry({ fixtures: true });
  const section = validatePublicDataSection(JSON.parse(await readFile(path.join(root, "public-data.json"), "utf8")), {
    presentation: (key) => (Object.hasOwn(registry, key) ? registry[key].descriptor : undefined)
  });
  return { section, directory: path.join(root, "releases") };
}
