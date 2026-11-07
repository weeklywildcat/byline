/**
 * CLI seam for build-time publication media acquisition (docs/publication-media.md).
 *
 *   BYLINE_NEWSROOM_BUILD_MEDIA_URL=https://newsroom.example/api/byline/build/media \
 *   BYLINE_BUILD_TOKEN=... \
 *   node --import tsx scripts/materialize-publication-media.mts --descriptors <file.json> [--out out] [--concurrency 4]
 *
 * `<file.json>` is either an array of publication blob descriptors or
 * `{ "manifests": [...] }` (prepared-media manifests, as the Phase 7 Payload
 * snapshot will carry them). Not wired into the WordPress `postbuild`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closedDescriptorSet, descriptorsFromManifests, materializePublicationMedia } from "./publication-media.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const descriptorsFile = option("descriptors");
if (!descriptorsFile) {
  console.error("Usage: materialize-publication-media --descriptors <file.json> [--out <dir>] [--concurrency <n>]");
  process.exit(2);
}
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = JSON.parse(await readFile(descriptorsFile, "utf8")) as unknown;
const descriptors = closedDescriptorSet(Array.isArray(input) ? input : descriptorsFromManifests((input as { manifests?: unknown[] }).manifests ?? []));
try {
  const result = await materializePublicationMedia({
    descriptors,
    endpoint: process.env.BYLINE_NEWSROOM_BUILD_MEDIA_URL ?? "",
    token: process.env.BYLINE_BUILD_TOKEN ?? "",
    outDir: path.resolve(projectRoot, option("out") ?? "out"),
    concurrency: Number(option("concurrency") ?? 4)
  });
  console.log(`Publication media: ${result.written} written, ${result.unchanged} unchanged, ${(result.bytes / 1024 / 1024).toFixed(1)} MB in ${descriptors.length} files.`);
} catch (error) {
  console.error(`Publication media acquisition failed: ${(error as Error).message}`);
  process.exit(1);
}
