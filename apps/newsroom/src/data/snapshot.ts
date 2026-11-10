import { dataProjectPath, normalizeSettings, projectBindingsSchema, type DataReleaseDescriptor, type PublicDataProject, type PublicDataSection } from "@byline/data";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { Payload, PayloadRequest } from "payload";
import { relationIds } from "../access/user";
import { authenticateBuildRequest, BUILD_NO_STORE, buildRefusal } from "../build/auth";
import { PublicSnapshotError } from "../public/snapshot/errors";
import { storedRelease } from "./collections";
import { dataPresentationDescriptor } from "./registry";
import { DataReleaseStore } from "./store";

/**
 * Byline Data's part of Snapshot v3: published Projects (main rows only,
 * never a draft) and the descriptors of exactly the releases they use, each
 * verified to exist in the release store. Row data stays in the releases.
 */
const publicRead = { depth: 0, pagination: false, overrideAccess: true } as const;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const iso = (value: unknown) => new Date(String(value)).toISOString();

export async function collectDataSection(payload: Payload, options: { publicStories: ReadonlySet<number>; store?: DataReleaseStore }): Promise<PublicDataSection> {
  const store = options.store ?? new DataReleaseStore();
  const { docs } = await payload.find({
    collection: "data-projects", draft: false, where: { _status: { equals: "published" } }, sort: "id", ...publicRead,
    select: { title: true, slug: true, deck: true, presentationKind: true, presentation: true, bindings: true, settings: true, source: true, methodology: true, indexing: true, relatedStories: true, publishedAt: true, updatedAt: true, createdAt: true }
  });
  if (!docs.length) return { projects: [], releases: [] };
  const parsed = docs.map((row) => {
    const bindings = projectBindingsSchema.safeParse(row.bindings);
    if (!bindings.success) throw new PublicSnapshotError("invalid-projection", `Data project ${row.id} has malformed bindings.`);
    return { row, bindings: bindings.data };
  });
  const keys = [...new Set(parsed.flatMap(({ bindings }) => bindings.map((binding) => binding.dataset)))];
  const datasets = keys.length ? (await payload.find({ collection: "data-datasets", where: { key: { in: keys } }, ...publicRead, select: { key: true, release: true } })).docs : [];
  const releaseByDataset = new Map<string, DataReleaseDescriptor>();
  for (const dataset of datasets) {
    const pointer = storedRelease(dataset.release);
    if (!pointer) continue;
    if (!(await store.verify(pointer.filename, pointer.descriptor.sha256, pointer.descriptor.bytes))) {
      throw new PublicSnapshotError("storage-failure", `The published release of ${dataset.key} (${pointer.descriptor.sha256.slice(0, 12)}…) is missing or damaged in the release store.`);
    }
    // An explicit allowlist: the stored pointer also names who released it, which never goes public.
    const { sha256, bytes, dataset: key, title, revision, releasedAt, records, fields } = pointer.descriptor;
    releaseByDataset.set(dataset.key, { sha256, bytes, dataset: key, title, revision, releasedAt, records, fields });
  }
  const used = new Map<string, DataReleaseDescriptor>();
  const projects: PublicDataProject[] = parsed.map(({ row, bindings }) => {
    const descriptor = dataPresentationDescriptor(String(row.presentation ?? ""));
    if (!descriptor) throw new PublicSnapshotError("invalid-projection", `Data project "${row.title}" uses the presentation "${row.presentation}", which this build doesn't have.`);
    const publicBindings = bindings.map((binding) => {
      const release = releaseByDataset.get(binding.dataset);
      if (!release) throw new PublicSnapshotError("invalid-projection", `Data project "${row.title}" uses ${binding.dataset}, which has no published release.`);
      used.set(release.sha256, release);
      return { ...binding, release: release.sha256 };
    });
    const releasedAt = publicBindings.map((binding) => used.get(binding.release)!.releasedAt).sort().at(-1)!;
    return {
      id: row.id,
      slug: row.slug,
      title: text(row.title),
      deck: text(row.deck),
      href: dataProjectPath(row.slug),
      presentation: { kind: row.presentationKind === "custom" ? "custom" : "template", key: String(row.presentation) },
      settings: normalizeSettings(descriptor, row.settings).settings,
      bindings: publicBindings,
      source: text(row.source),
      methodology: text(row.methodology),
      indexing: row.indexing === "noindex" ? "noindex" : "public",
      publishedAt: iso(row.publishedAt ?? row.createdAt),
      modifiedAt: iso(row.updatedAt),
      dataUpdatedAt: releasedAt,
      // A related Story that is no longer public is left out, never a broken link.
      relatedStories: [...new Set(relationIds(row.relatedStories).map(Number))].filter((id) => options.publicStories.has(id))
    };
  });
  return { projects, releases: [...used.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)) };
}

/* ----------------------------------------------------- build endpoint */

export const BUILD_DATA_RELEASE_PATH = "/byline/build/data/:sha256";

/**
 * `GET /api/byline/build/data/:sha256`: the exact bytes of a dataset's
 * CURRENT release, for the static build (bearer `BYLINE_BUILD_TOKEN`,
 * `private, no-store`). An obsolete or unknown release is 404: the build
 * only ever acquires what the current snapshot names.
 */
export async function serveDataRelease(req: PayloadRequest, store = new DataReleaseStore()): Promise<Response> {
  const refused = authenticateBuildRequest(req);
  if (refused) return refused;
  const sha256 = String(req.routeParams?.sha256 ?? "");
  if (!/^[0-9a-f]{64}$/.test(sha256)) return buildRefusal(400, { message: "Expected a SHA-256." });
  const { docs } = await req.payload.find({ collection: "data-datasets", ...publicRead, select: { release: true } });
  const current = docs.map((row) => storedRelease(row.release)).find((pointer) => pointer?.descriptor.sha256 === sha256);
  const file = current ? store.pathFor(current.filename) : null;
  const info = file ? await stat(file).catch(() => null) : null;
  if (!current || !file || !info?.isFile() || info.size !== current.descriptor.bytes) return buildRefusal(404, { code: "byline_data_release_missing", message: "No such current Data release." });
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers: { ...BUILD_NO_STORE, "Content-Type": "application/json; charset=utf-8", "Content-Length": String(info.size), "X-Byline-Sha256": sha256 } });
}
